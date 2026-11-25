const crypto = require("crypto");
const { createRoomRegistry } = require("../lib/rooms");
const { clean, clampInt, createRateLimiter, normalizeWord } = require("../lib/util");
const { MAX_PETITBAC_PLAYERS } = require("../config");

// Liste serveur : le client n'envoie que des index (ADR 0003 §8).
const CATEGORIES = [
  "Prénom",
  "Pays ou ville",
  "Animal",
  "Métier",
  "Fruit ou légume",
  "Objet",
  "Marque",
  "Sport",
  "Personnage célèbre",
  "Film ou série",
  "Plat",
  "Couleur",
];
const CATEGORY_COUNT = 6;
const LETTERS = "ABCDEFGHIJLMNOPRSTUV".split(""); // A-Z privé de K Q W X Y Z
const DEFAULT_OPTIONS = { rounds: 5, duration: 90, categories: [0, 1, 2, 3, 4, 5] };
const COLLECT_MS = 3000;
const ANSWER_MAX = 30;
const MIN_LEN = 2;

const ERRORS = {
  invalid: "Requête invalide.",
  not_host: "Seul l'hôte peut faire cela.",
  bad_phase: "Action impossible à cette étape de la partie.",
  not_enough_players: "Il faut au moins 2 joueurs connectés.",
};

function createPetitBac(io, results, opts = {}) {
  const collectMs = opts.collectMs || COLLECT_MS;

  const isPlaying = (st) => st.phase === "writing" || st.phase === "collecting";

  function initState(room) {
    const st = room.state;
    if (!st.phase) {
      st.phase = "lobby";
      st.options = { ...DEFAULT_OPTIONS, categories: DEFAULT_OPTIONS.categories.slice() };
      st.scores = Object.create(null);
      st.answers = Object.create(null); // pid -> 6 chaînes (dernière version)
      st.usedLetters = [];
      st.round = 0;
      st.letter = null;
      st.categories = [];
      st.endsAt = 0;
      st.stoppedBy = null;
      st.results = null;
      st.timer = null;
    }
    return st;
  }

  function clearTimer(st) {
    if (st.timer) clearTimeout(st.timer);
    st.timer = null;
  }
  function setTimer(st, ms, fn) {
    clearTimer(st);
    st.endsAt = Date.now() + ms;
    st.timer = setTimeout(() => {
      st.timer = null;
      fn();
    }, ms);
    st.timer.unref();
  }

  const reg = createRoomRegistry(io, {
    prefix: "pb",
    maxPlayers: MAX_PETITBAC_PLAYERS,
    inGame: (room) => {
      const p = room.state.phase;
      return p === "writing" || p === "collecting" || p === "results";
    },
    canJoin: (room) => (isPlaying(initState(room)) ? { code: "game_in_progress" } : null),
    onJoin: (room) => {
      initState(room);
    },
    onEmpty: (room) => clearTimer(room.state),
    // Plus personne de connecté : la manche est suspendue (reprise = minuteur réarmé).
    onDisconnect: (room) => {
      if (reg.connected(room).length === 0) clearTimer(room.state);
    },
    onRemove: (room) => {
      if (room.players.length === 0 || reg.connected(room).length === 0) clearTimer(room.state);
    },
    onResume: (room) => {
      const st = room.state;
      if (st.timer || (st.phase !== "writing" && st.phase !== "collecting")) return;
      const ms = Math.max(1000, st.endsAt - Date.now());
      setTimer(st, ms, () => (st.phase === "writing" ? beginCollect(room, null) : finishRound(room)));
    },
    snapshotFor: (room, player) => {
      const st = initState(room);
      const snap = {
        phase: st.phase,
        options: st.options,
        allCategories: CATEGORIES,
        scores: st.scores,
        round: st.round,
        totalRounds: st.options.rounds,
      };
      if (st.phase !== "lobby") {
        snap.letter = st.letter;
        snap.categories = st.categories;
        snap.myAnswers = st.answers[player.pid] || null;
      }
      if (isPlaying(st)) {
        snap.remainingMs = Math.max(0, st.endsAt - Date.now());
        snap.durationMs = st.phase === "writing" ? st.options.duration * 1000 : collectMs;
        snap.stoppedBy = st.stoppedBy;
      }
      if (st.phase === "results") snap.results = st.results;
      if (st.phase === "over") snap.ranking = ranking(room);
      return snap;
    },
  });

  function ranking(room) {
    const sc = room.state.scores;
    return room.players
      .map((p) => ({ id: p.pid, username: p.username, score: sc[p.pid] || 0 }))
      .sort((a, b) => b.score - a.score);
  }

  function pickLetter(st) {
    let pool = LETTERS.filter((l) => !st.usedLetters.includes(l));
    if (!pool.length) {
      st.usedLetters = [];
      pool = LETTERS;
    }
    const l = pool[crypto.randomInt(pool.length)];
    st.usedLetters.push(l);
    return l;
  }

  function startRound(room) {
    const st = room.state;
    st.round += 1;
    st.letter = pickLetter(st);
    st.categories = st.options.categories.map((i) => CATEGORIES[i]);
    st.answers = Object.create(null);
    st.stoppedBy = null;
    st.results = null;
    st.phase = "writing";
    setTimer(st, st.options.duration * 1000, () => beginCollect(room, null));
    reg.toRoom(room, "round_start", {
      round: st.round,
      totalRounds: st.options.rounds,
      letter: st.letter,
      categories: st.categories,
      durationMs: st.options.duration * 1000,
    });
  }

  function beginCollect(room, byPid) {
    const st = room.state;
    if (st.phase !== "writing") return;
    st.phase = "collecting";
    st.stoppedBy = byPid;
    setTimer(st, collectMs, () => finishRound(room));
    reg.toRoom(room, "stopped", { by: byPid, graceMs: collectMs });
  }

  const isValid = (text, letter) => {
    const n = normalizeWord(text);
    return n.length >= MIN_LEN && n[0] === letter.toLowerCase();
  };

  function finishRound(room) {
    const st = room.state;
    if (st.phase !== "collecting") return;
    clearTimer(st);
    const letter = st.letter;
    const table = Object.create(null);
    const gained = Object.create(null);
    for (const p of room.players) {
      const given = st.answers[p.pid] || [];
      table[p.pid] = st.categories.map((_, i) => {
        const text = typeof given[i] === "string" ? given[i] : "";
        return { text, valid: isValid(text, letter), points: 0 };
      });
      gained[p.pid] = 0;
    }
    for (let c = 0; c < st.categories.length; c++) {
      const counts = new Map();
      for (const p of room.players) {
        const cell = table[p.pid][c];
        if (!cell.valid) continue;
        const key = normalizeWord(cell.text);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      for (const p of room.players) {
        const cell = table[p.pid][c];
        if (!cell.valid) continue;
        cell.points = counts.get(normalizeWord(cell.text)) === 1 ? 10 : 5;
        gained[p.pid] += cell.points;
      }
    }
    for (const p of room.players) st.scores[p.pid] = (st.scores[p.pid] || 0) + gained[p.pid];
    st.phase = "results";
    st.results = {
      letter,
      categories: st.categories,
      table,
      gained,
      scores: st.scores,
      isLastRound: st.round >= st.options.rounds,
    };
    reg.toRoom(room, "results", st.results);
  }

  function gameOver(room) {
    const st = room.state;
    st.phase = "over";
    reg.toRoom(room, "game_over", { ranking: ranking(room) });
  }

  // Tableau de 6 chaînes nettoyées, ou null.
  function parseAnswers(raw) {
    if (!Array.isArray(raw) || raw.length !== CATEGORY_COUNT) return null;
    return raw.map((a) => clean(a, ANSWER_MAX));
  }

  function register(socket) {
    reg.register(socket);
    const allowAnswers = createRateLimiter({ capacity: 3, perSecond: 2 });
    const fail = (code) => socket.emit("pb:error", { code, message: ERRORS[code] });

    // Contexte commun : salle du socket, état initialisé, hôte éventuellement exigé.
    const ctx = (needHost) => {
      const cur = reg.bySocket(socket);
      if (!cur) return null;
      const st = initState(cur.room);
      if (needHost && cur.room.hostPid !== cur.player.pid) {
        fail("not_host");
        return null;
      }
      return { room: cur.room, player: cur.player, st };
    };

    socket.on("pb:options", (data) => {
      const c = ctx(true);
      if (!c) return;
      if (c.st.phase !== "lobby" && c.st.phase !== "over") return fail("bad_phase");
      const d = data && typeof data === "object" ? data : null;
      if (!d) return fail("invalid");
      const cats = d.categories;
      if (
        !Array.isArray(cats) ||
        cats.length !== CATEGORY_COUNT ||
        !cats.every((i) => Number.isInteger(i) && i >= 0 && i < CATEGORIES.length) ||
        new Set(cats).size !== CATEGORY_COUNT
      ) {
        return fail("invalid");
      }
      c.st.options = {
        rounds: clampInt(d.rounds, 1, 10, c.st.options.rounds),
        duration: clampInt(d.duration, 60, 180, c.st.options.duration),
        categories: cats.slice(),
      };
      reg.toRoom(c.room, "options", c.st.options);
    });

    socket.on("pb:start", () => {
      const c = ctx(true);
      if (!c) return;
      if (c.st.phase !== "lobby" && c.st.phase !== "over") return fail("bad_phase");
      if (reg.connected(c.room).length < 2) return fail("not_enough_players");
      c.st.scores = Object.create(null);
      c.st.usedLetters = [];
      c.st.round = 0;
      startRound(c.room);
    });

    socket.on("pb:next", () => {
      const c = ctx(true);
      if (!c) return;
      if (c.st.phase !== "results") return fail("bad_phase");
      if (c.st.round >= c.st.options.rounds) gameOver(c.room);
      else startRound(c.room);
    });

    socket.on("pb:answers", (data) => {
      const c = ctx(false);
      if (!c || !isPlaying(c.st)) return;
      // Limiteur seulement en writing : le dernier envoi (collecting) est toujours accepté.
      if (c.st.phase === "writing" && !allowAnswers()) return;
      const answers = parseAnswers(data && data.answers);
      if (!answers) return fail("invalid");
      c.st.answers[c.player.pid] = answers;
    });

    socket.on("pb:stop", (data) => {
      const c = ctx(false);
      if (!c) return;
      if (c.st.phase !== "writing") return fail("bad_phase");
      const answers = parseAnswers(data && data.answers);
      if (!answers || !answers.every((a) => isValid(a, c.st.letter))) return fail("invalid");
      c.st.answers[c.player.pid] = answers;
      beginCollect(c.room, c.player.pid);
    });
  }

  return {
    register,
    onDisconnect: reg.onSocketDisconnect,
    forgetUser: reg.forgetUser,
    dispose: () => {
      for (const room of reg._rooms.values()) clearTimer(room.state);
      reg.dispose();
    },
    reg,
  };
}

module.exports = { createPetitBac, CATEGORIES };
