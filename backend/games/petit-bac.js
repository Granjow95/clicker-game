const crypto = require("crypto");
const { createRoomRegistry } = require("../lib/rooms");
const { recordRanking } = require("../lib/results");
const { clean, clampInt, createRateLimiter, normalizeWord } = require("../lib/util");
const { MAX_PETITBAC_PLAYERS } = require("../config");

// Catégories intégrées. L'hôte en choisit autant qu'il veut (1 à 20, dans l'ordre voulu) parmi celles-ci et ses
// catégories perso ; le client envoie des noms (ou, ancien format, des index de cette liste).
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
const MAX_SELECTED = 20;
const MAX_CUSTOM = 10;
const CUSTOM_MIN = 2;
const CUSTOM_MAX = 30;
const LETTERS = "ABCDEFGHIJLMNOPRSTUV".split(""); // A-Z privé de K Q W X Y Z
const DEFAULT_OPTIONS = { rounds: 5, duration: 90, categories: CATEGORIES.slice(0, 6), custom: [] };
// Nettoyage large (100) puis contrôle de longueur exact (CUSTOM_MIN à CUSTOM_MAX) par l'appelant : pas de troncature muette.
const cleanName = (v) => (typeof v === "string" ? clean(v, 100).replace(/\s+/g, " ").trim() : "");
const COLLECT_MS = 3000;
const ANSWER_MAX = 30;
const MIN_LEN = 2;

const ERRORS = {
  invalid: "Requête invalide.",
  not_host: "Seul l'hôte peut faire cela.",
  bad_phase: "Action impossible à cette étape de la partie.",
  not_enough_players: "Il faut au moins 2 joueurs connectés.",
  rate_limited: "Doucement : réessaie dans un instant.",
  bad_categories: "Catégories invalides : 1 à 20 choisies, 10 perso au plus, 2 à 30 caractères, sans doublon.",
};

// Catégories perso et sélection envoyées par l'hôte : { custom, categories } validés, ou null.
// Tableaux bornés avant toute boucle ; perso dédoublonnées par normalizeWord, y compris contre les intégrées.
function parseCategories(d, prev) {
  const custom = d.custom === undefined ? prev.custom : d.custom;
  const cats = d.categories;
  if (!Array.isArray(custom) || custom.length > MAX_CUSTOM) return null;
  if (!Array.isArray(cats) || cats.length < 1 || cats.length > MAX_SELECTED) return null;
  const seen = new Set(CATEGORIES.map(normalizeWord));
  const cleaned = [];
  for (const c of custom) {
    const name = cleanName(c);
    const norm = normalizeWord(name);
    if (name.length < CUSTOM_MIN || name.length > CUSTOM_MAX || !norm || seen.has(norm)) return null;
    seen.add(norm);
    cleaned.push(name);
  }
  const allowed = new Set([...CATEGORIES, ...cleaned]);
  const names = cats.map((c) => (Number.isInteger(c) ? CATEGORIES[c] : cleanName(c)));
  if (!names.every((n) => n && allowed.has(n)) || new Set(names).size !== names.length) return null;
  return { custom: cleaned, categories: names };
}

function createPetitBac(io, results, opts = {}) {
  const collectMs = opts.collectMs || COLLECT_MS;

  const isPlaying = (st) => st.phase === "writing" || st.phase === "collecting";

  function initState(room) {
    const st = room.state;
    if (!st.phase) {
      st.phase = "lobby";
      st.options = { ...DEFAULT_OPTIONS, categories: DEFAULT_OPTIONS.categories.slice(), custom: [] };
      st.scores = Object.create(null);
      st.answers = Object.create(null); // pid -> une chaîne par catégorie (dernière version)
      st.usedLetters = [];
      st.round = 0;
      st.letter = null;
      st.categories = [];
      st.endsAt = 0;
      st.stoppedBy = null;
      st.results = null;
      st.review = null; // { order:[pid], sheets:{pid:[{text,status}]}, index, currentPid, visited:Set }
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
    ipLimiter: opts.ipLimiter, // tests : limiteurs par IP surchargeables
    maxRoomsPerIp: opts.maxRoomsPerIp,
    inGame: (room) => {
      const p = room.state.phase;
      return p === "writing" || p === "collecting" || p === "review" || p === "results";
    },
    canJoin: (room) => {
      const st = initState(room);
      return isPlaying(st) || st.phase === "review" ? { code: "game_in_progress" } : null;
    },
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
      else if (room.state.phase === "review") emitReview(room);
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
      if (st.phase === "review") snap.review = reviewPayload(room);
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
    st.categories = st.options.categories.slice();
    st.answers = Object.create(null);
    st.stoppedBy = null;
    st.results = null;
    st.review = null;
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

  const startsWithLetter = (text, letter) => normalizeWord(text)[0] === letter.toLowerCase();
  const isValid = (text, letter) => normalizeWord(text).length >= MIN_LEN && startsWithLetter(text, letter);
  const STATUSES = ["unique", "partage", "refuse"];
  const POINTS = { unique: 10, partage: 5, refuse: 0 };

  // Fiches avec suggestion automatique (l'hôte tranche ensuite).
  function buildSheets(room) {
    const st = room.state;
    const order = [];
    const sheets = Object.create(null);
    for (const p of room.players) {
      const given = st.answers[p.pid];
      if (!p.connected && !given) continue;
      order.push(p.pid);
      sheets[p.pid] = st.categories.map((_, i) => {
        const text = given && typeof given[i] === "string" ? given[i] : "";
        return { text, status: isValid(text, st.letter) ? "unique" : "refuse" };
      });
    }
    for (let c = 0; c < st.categories.length; c++) {
      const counts = new Map();
      for (const pid of order) {
        const cell = sheets[pid][c];
        if (cell.status === "refuse") continue;
        const k = normalizeWord(cell.text);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      for (const pid of order) {
        const cell = sheets[pid][c];
        if (cell.status !== "refuse" && counts.get(normalizeWord(cell.text)) > 1) cell.status = "partage";
      }
    }
    return { order, sheets, index: 0, currentPid: order[0] || null, visited: new Set() };
  }

  // Ordre courant : les joueurs retirés pendant la revue disparaissent.
  const reviewOrder = (room) => room.state.review.order.filter((pid) => room.players.some((p) => p.pid === pid));

  // Index de la fiche courante dans l'ordre actuel, suivie par pid. Si son joueur a été retiré :
  // fiche suivante (dans l'ordre d'origine) ou dernière, sans la marquer vue.
  function currentIndex(room, order) {
    const rv = room.state.review;
    if (!order.length) return 0;
    let idx = order.indexOf(rv.currentPid);
    if (idx < 0) {
      const full = rv.order;
      const from = full.indexOf(rv.currentPid);
      const next = from < 0 ? undefined : full.slice(from + 1).find((pid) => order.includes(pid));
      idx = next ? order.indexOf(next) : order.length - 1;
      rv.currentPid = order[idx];
    }
    rv.index = idx;
    return idx;
  }

  function reviewPayload(room) {
    const st = room.state;
    const order = reviewOrder(room);
    const index = currentIndex(room, order);
    const pid = order[index] || null;
    const player = room.players.find((p) => p.pid === pid);
    const sheet = pid ? st.review.sheets[pid].map((c) => ({ text: c.text, status: c.status })) : [];
    const doublons = sheet.map((c, i) => {
      const k = normalizeWord(c.text);
      if (!k) return [];
      return order.filter((o) => o !== pid && normalizeWord(st.review.sheets[o][i].text) === k);
    });
    return {
      index,
      total: order.length,
      playerId: pid,
      username: player ? player.username : "",
      letter: st.letter,
      categories: st.categories,
      sheet,
      decided: order.filter((o) => st.review.visited.has(o)),
      doublons,
    };
  }

  function emitReview(room) {
    if (room.state.phase === "review") reg.toRoom(room, "review", reviewPayload(room));
  }

  // Marque la fiche affichée comme vue par l'hôte.
  function markVisited(room) {
    const p = reviewPayload(room);
    if (p.playerId) room.state.review.visited.add(p.playerId);
  }

  function finishRound(room) {
    const st = room.state;
    if (st.phase !== "collecting") return;
    clearTimer(st);
    st.review = buildSheets(room);
    st.phase = "review";
    emitReview(room);
  }

  function finishReview(room) {
    const st = room.state;
    const table = Object.create(null);
    const gained = Object.create(null);
    for (const p of room.players) {
      const sheet = st.review.sheets[p.pid];
      gained[p.pid] = 0;
      table[p.pid] = st.categories.map((_, i) => {
        const cell = sheet ? sheet[i] : { text: "", status: "refuse" };
        const status = normalizeWord(cell.text) ? cell.status : "refuse"; // case vide : toujours refusée
        const points = POINTS[status];
        gained[p.pid] += points;
        return { text: cell.text, status, valid: status !== "refuse", points };
      });
    }
    for (const p of room.players) st.scores[p.pid] = (st.scores[p.pid] || 0) + gained[p.pid];
    st.phase = "results";
    st.review = null;
    st.results = {
      letter: st.letter,
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
    const already = st.phase === "over";
    st.phase = "over";
    if (!already) recordRanking(results, { game: "petit-bac", players: room.players, scoreOf: (pid) => st.scores[pid], rounds: st.round });
    reg.toRoom(room, "game_over", { ranking: ranking(room) });
  }

  // Une chaîne nettoyée par catégorie de la manche (longueur exacte), ou null.
  function parseAnswers(raw, n) {
    if (!Array.isArray(raw) || raw.length !== n) return null;
    return raw.map((a) => clean(a, ANSWER_MAX));
  }

  function register(socket) {
    reg.register(socket);
    const allowAnswers = createRateLimiter({ capacity: 3, perSecond: 2 });
    const allowOptions = createRateLimiter({ capacity: 20, perSecond: 5 }); // rediffusées à toute la salle
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
      if (!allowOptions()) return fail("rate_limited");
      const d = data && typeof data === "object" ? data : null;
      if (!d) return fail("invalid");
      const parsed = parseCategories(d, c.st.options);
      if (!parsed) return fail("bad_categories");
      c.st.options = {
        rounds: clampInt(d.rounds, 1, 10, c.st.options.rounds),
        duration: clampInt(d.duration, 60, 300, c.st.options.duration),
        categories: parsed.categories,
        custom: parsed.custom,
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

    socket.on("pb:verdict", (data) => {
      const c = ctx(true);
      if (!c) return;
      if (c.st.phase !== "review") return fail("bad_phase");
      const d = data && typeof data === "object" ? data : null;
      const sheet = d && typeof d.playerId === "string" ? c.st.review.sheets[d.playerId] : null;
      if (!sheet || !Number.isInteger(d.cat) || d.cat < 0 || d.cat >= sheet.length || !STATUSES.includes(d.status)) {
        return fail("invalid");
      }
      if (d.status !== "refuse" && !normalizeWord(sheet[d.cat].text)) return fail("invalid");
      sheet[d.cat].status = d.status;
      c.st.review.visited.add(d.playerId);
      emitReview(c.room);
    });

    socket.on("pb:review_goto", (data) => {
      const c = ctx(true);
      if (!c) return;
      if (c.st.phase !== "review") return fail("bad_phase");
      const order = reviewOrder(c.room);
      const idx = data && data.index;
      if (!Number.isInteger(idx) || idx < 0 || idx >= order.length) return fail("invalid");
      markVisited(c.room);
      c.st.review.currentPid = order[idx];
      c.st.review.index = idx;
      emitReview(c.room);
    });

    socket.on("pb:review_done", () => {
      const c = ctx(true);
      if (!c) return;
      if (c.st.phase !== "review") return fail("bad_phase");
      finishReview(c.room);
    });

    socket.on("pb:answers", (data) => {
      const c = ctx(false);
      if (!c || !isPlaying(c.st)) return;
      // Limiteur seulement en writing : le dernier envoi (collecting) est toujours accepté.
      if (c.st.phase === "writing" && !allowAnswers()) return;
      const answers = parseAnswers(data && data.answers, c.st.categories.length);
      if (!answers) return fail("invalid");
      c.st.answers[c.player.pid] = answers;
    });

    socket.on("pb:stop", (data) => {
      const c = ctx(false);
      if (!c) return;
      if (c.st.phase !== "writing") return fail("bad_phase");
      const answers = parseAnswers(data && data.answers, c.st.categories.length);
      if (!answers || !answers.every((a) => startsWithLetter(a, c.st.letter))) return fail("invalid");
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

module.exports = { createPetitBac, CATEGORIES, MAX_SELECTED, MAX_CUSTOM };
