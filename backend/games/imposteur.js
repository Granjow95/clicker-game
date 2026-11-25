const crypto = require("crypto");
const { clean, clampInt, normalizeWord } = require("../lib/util");
const { createRoomRegistry } = require("../lib/rooms");
const { MAX_IMPOSTEUR_PLAYERS } = require("../config");
const { WORD_PAIRS } = require("./imposteur-mots");

const MIN_PLAYERS = 3;
const MIN_PLAYERS_WHITE = 4;
const HINT_DELAY_MS = 400; // laisse le temps d'afficher un indice avant le tour suivant
const TURN_MARGIN_MS = 3000;
const MAX_HINT_TURNS = 3; // tours d'indices avant le passage automatique au vote
// Surcharges réservées aux tests (durée de la devinette de Mr White, durée totale d'un tour).
const WHITE_GUESS_MS = Number.parseInt(process.env.IMP_WHITE_GUESS_MS, 10) || 30000;
const TURN_TIMER_OVERRIDE_MS = Number.parseInt(process.env.IMP_TURN_TIMER_MS, 10) || 0;

// ── Logique pure (testable sans serveur) ──

function randomInt(max) {
  return crypto.randomInt(max);
}

function pickWordPair(rand = randomInt) {
  return WORD_PAIRS[rand(WORD_PAIRS.length)];
}

function sanitizeOptions(options) {
  return {
    rounds: clampInt(options?.rounds, 1, 10, 3),
    timer: clampInt(options?.timer, 10, 120, 60),
    mrWhite: options?.mrWhite === true,
  };
}

// Joueur le plus voté ; égalité en tête ou aucun vote : null (personne n'est éliminé).
function mostVotedOf(votes) {
  const counts = new Map();
  for (const v of Object.values(votes)) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestN = 0;
  let tie = false;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
      tie = false;
    } else if (n === bestN) tie = true;
  }
  return tie ? null : best;
}

// Points d'une manche (ADR 0003 §6). `votes` : { voterId: votedId }. Modifie `points`.
// `roles` : { impostorId, whiteId?, whiteGuessCorrect? } ; une chaîne vaut { impostorId }.
function scoreVotes(votes, roles, points) {
  const r = typeof roles === "string" ? { impostorId: roles } : roles || {};
  const { impostorId, whiteId = null, whiteGuessCorrect = false } = r;
  const mostVoted = mostVotedOf(votes);

  for (const voter in votes) {
    if (!points[voter]) points[voter] = 0;
    if (votes[voter] === impostorId) points[voter] += 100;
    else if (whiteId && votes[voter] === whiteId) points[voter] += 50;
  }
  if (mostVoted !== impostorId) points[impostorId] = (points[impostorId] || 0) + 100;
  if (whiteId) {
    if (mostVoted !== whiteId) points[whiteId] = (points[whiteId] || 0) + 100;
    else if (whiteGuessCorrect) points[whiteId] = (points[whiteId] || 0) + 150;
  }
  return { mostVoted, points };
}

function buildRanking(points, players) {
  return Object.entries(points)
    .map(([id, score]) => {
      const player = players.find((p) => p.id === id);
      return { id, username: player?.username || "inconnu", score };
    })
    .sort((a, b) => b.score - a.score);
}

// ── Câblage Socket.io ──

const dict = () => Object.create(null);
const pickOne = (arr) => arr[randomInt(arr.length)];
const ACTIVE_PHASES = ["hints", "voting", "white_guess"];

function createImposteur(io, results = { record() {} }) {
  const reg = createRoomRegistry(io, {
    prefix: "imp",
    maxPlayers: MAX_IMPOSTEUR_PLAYERS,
    inGame: (room) => {
      const s = room.state;
      return !!s.game && !s.over && (ACTIVE_PHASES.includes(s.game.phase) || s.game.phase === "revealed");
    },
    canJoin: (room) => {
      const g = room.state.game;
      if (g && !room.state.over && ACTIVE_PHASES.includes(g.phase)) {
        return { code: "game_in_progress", message: "Une manche est en cours, rejoins la salle à la fin de la manche." };
      }
      return null;
    },
    snapshotFor: (room, player) => snapshotFor(room, player),
    onJoin: (room, player) => {
      const s = S(room);
      if (s.scores[player.pid] === undefined) s.scores[player.pid] = 0;
    },
    onDisconnect: (room, player) => onPlayerDisconnect(room, player),
    onResume: (room) => onPlayerResume(room),
    onRemove: (room, player) => onPlayerRemove(room, player),
    onHostChange: (room, host) => {
      const s = S(room);
      toPlayer(host, "host_changed", {
        phase: s.game ? s.game.phase : "lobby",
        isLastRound: isLastRound(room),
        over: s.over,
      });
    },
    onEmpty: (room) => clearAllTimers(room),
  });

  // Événements de jeu : noms inchangés (sans préfixe), sauf ceux déjà préfixés `imp:`.
  const toRoom = (room, ev, data) => io.to(`imp:${room.code}`).emit(ev, data);
  const toPlayer = (player, ev, data) => {
    if (player.connected && player.socketId) io.to(player.socketId).emit(ev, data);
  };

  // État par salle (room.state) : créé à la demande.
  function S(room) {
    const s = room.state;
    if (!s.options) {
      s.options = { rounds: 3, timer: 60, mrWhite: false };
      s.round = 1;
      s.scores = dict();
      s.over = false;
      s.game = null; // manche courante
      s.timers = dict();
    }
    return s;
  }

  const isLastRound = (room) => S(room).round >= S(room).options.rounds;
  const isHost = (room, player) => room.hostPid === player.pid;
  const pubPlayers = (room) => room.players.map((p) => ({ id: p.pid, username: p.username }));
  const playerOf = (room, pid) => room.players.find((p) => p.pid === pid) || null;

  // ── Minuteurs (tous unref, nommés, purgés à la fin de la manche / à la fermeture) ──
  function clearT(room, key) {
    const t = room.state.timers && room.state.timers[key];
    if (t) clearTimeout(t);
    if (room.state.timers) delete room.state.timers[key];
  }
  function setT(room, key, fn, ms) {
    clearT(room, key);
    const t = setTimeout(() => {
      delete room.state.timers[key];
      if (reg._rooms.get(room.code) === room) fn();
    }, ms);
    t.unref();
    room.state.timers[key] = t;
  }
  function clearAllTimers(room) {
    const t = room.state.timers;
    if (!t) return;
    for (const k of Object.keys(t)) clearT(room, k);
  }

  // ── Manche ──
  const wordFor = (g, pid) => (pid === g.whiteId ? null : pid === g.impostorId ? g.wordPair.impostor : g.wordPair.normal);

  function startRound(room) {
    const s = S(room);
    clearAllTimers(room);
    const conn = reg.connected(room);
    const wordPair = pickWordPair();
    const impostor = pickOne(conn);
    const useWhite = s.options.mrWhite && conn.length >= MIN_PLAYERS_WHITE;
    const white = useWhite ? pickOne(conn.filter((p) => p !== impostor)) : null;
    const first = pickOne(conn.filter((p) => p !== white));
    const start = room.players.indexOf(first);
    const order = [...room.players.slice(start), ...room.players.slice(0, start)].map((p) => p.pid);

    const g = {
      phase: "hints",
      turn: 0,
      hints: { 0: [] },
      current: null,
      turnEndsAt: 0,
      order,
      impostorId: impostor.pid,
      impostorName: impostor.username,
      whiteId: white ? white.pid : null,
      whiteName: white ? white.username : null,
      wordPair,
      votes: dict(),
      finalVotes: null,
      whiteGuess: null,
      whiteGuessCorrect: false,
      guessEndsAt: 0,
      reveal: null,
    };
    s.game = g;

    const players = pubPlayers(room);
    for (const p of room.players) {
      toPlayer(p, "round_started", {
        word: wordFor(g, p.pid),
        role: p.pid === g.whiteId ? "white" : "player", // l'imposteur ne sait pas qu'il l'est
        mrWhite: !!white,
        players,
        order,
        timer: s.options.timer,
        round: s.round,
        totalRounds: s.options.rounds,
      });
    }
    advance(room);
  }

  function recordSkip(room, pid) {
    const g = S(room).game;
    g.hints[g.turn].push({ playerId: pid, hint: null, skipped: true });
    toRoom(room, "hint_submitted", { playerId: pid, hint: null, skipped: true });
  }

  // Passe au prochain joueur à parler : saute les déconnectés, ouvre un nouveau tour si besoin.
  function advance(room) {
    const s = S(room);
    const g = s.game;
    if (!g || g.phase !== "hints") return;
    clearT(room, "turn");
    clearT(room, "advance");
    g.current = null;
    for (let guard = 0; guard < 200; guard++) {
      if (!g.hints[g.turn]) g.hints[g.turn] = [];
      const done = g.hints[g.turn];
      const pid = g.order.find((id) => playerOf(room, id) && !done.some((h) => h.playerId === id));
      if (!pid) {
        if (reg.connected(room).length === 0) return; // personne : on attend une reprise
        // Tours bornés : au bout de MAX_HINT_TURNS tours complets, le vote démarre seul (pas de manche sans fin).
        if (g.turn + 1 >= MAX_HINT_TURNS) { startVoting(room); return; }
        g.turn++;
        g.hints[g.turn] = [];
        continue;
      }
      const p = playerOf(room, pid);
      if (!p.connected) {
        recordSkip(room, pid);
        continue;
      }
      g.current = pid;
      const ms = TURN_TIMER_OVERRIDE_MS || s.options.timer * 1000 + TURN_MARGIN_MS;
      g.turnEndsAt = Date.now() + ms;
      toRoom(room, "next_turn", { index: room.players.indexOf(p), playerId: pid });
      setT(room, "turn", () => {
        if (g.phase !== "hints" || g.current !== pid) return;
        recordSkip(room, pid);
        advance(room);
      }, ms);
      return;
    }
  }

  function startVoting(room) {
    const g = S(room).game;
    if (!g || g.phase !== "hints") return;
    clearT(room, "turn");
    clearT(room, "advance");
    g.phase = "voting";
    g.current = null;
    toRoom(room, "all_hints_done", {});
    tryFinalizeVotes(room);
  }

  function validVotes(room) {
    const g = S(room).game;
    const valid = {};
    for (const voter of Object.keys(g.votes)) {
      if (playerOf(room, voter) && playerOf(room, g.votes[voter])) valid[voter] = g.votes[voter];
    }
    return valid;
  }

  // Finalise le vote quand au moins 2 connectés ont tous voté ; `force` : hôte.
  function tryFinalizeVotes(room, force = false) {
    const g = S(room).game;
    if (!g || g.phase !== "voting") return;
    const conn = reg.connected(room);
    if (conn.length === 0) return;
    // Tant que des joueurs sont en grâce, il faut au moins 2 votants connectés ; une fois les grâces expirées, on finalise.
    const someoneMayReturn = room.players.some((p) => !p.connected);
    if (!force && ((someoneMayReturn && conn.length < 2) || !conn.every((p) => g.votes[p.pid]))) return;
    g.finalVotes = validVotes(room);
    const eliminated = mostVotedOf(g.finalVotes);
    if (g.whiteId && eliminated === g.whiteId && playerOf(room, g.whiteId)) startWhiteGuess(room);
    else reveal(room);
  }

  function startWhiteGuess(room) {
    const g = S(room).game;
    g.phase = "white_guess";
    g.guessEndsAt = Date.now() + WHITE_GUESS_MS;
    toRoom(room, "imp:white_guess_start", { whiteId: g.whiteId, durationMs: WHITE_GUESS_MS });
    setT(room, "guess", () => reveal(room), WHITE_GUESS_MS);
  }

  function reveal(room, aborted = false) {
    const s = S(room);
    const g = s.game;
    if (!g || g.phase === "revealed") return;
    clearAllTimers(room);
    g.phase = "revealed";
    g.current = null;
    const votes = g.finalVotes || validVotes(room);
    const before = { ...s.scores };
    let mostVoted = null;
    if (!aborted) {
      ({ mostVoted } = scoreVotes(
        votes,
        { impostorId: g.impostorId, whiteId: g.whiteId, whiteGuessCorrect: g.whiteGuessCorrect },
        s.scores
      ));
    }
    const caught = !aborted && mostVoted === g.impostorId;
    const gained = {};
    for (const p of room.players) gained[p.pid] = (s.scores[p.pid] || 0) - (before[p.pid] || 0);

    // Historique : une ligne par joueur connecté, points de cette manche. Pas de stats sous 3 identités.
    if (!aborted) {
      const identities = new Set(room.players.map((p) => p.userId || p.pid));
      const seen = new Set();
      for (const p of room.players) {
        if (identities.size < 3 || !p.userId || seen.has(p.userId)) continue;
        seen.add(p.userId);
        const isImp = p.pid === g.impostorId;
        const isWhite = p.pid === g.whiteId;
        let won;
        if (isImp) won = !caught;
        else if (isWhite) won = mostVoted !== g.whiteId || g.whiteGuessCorrect;
        else won = votes[p.pid] === g.impostorId;
        results.record({
          userId: p.userId,
          game: "imposteur",
          score: gained[p.pid] || 0,
          won,
          rounds: 1,
          meta: { role: isImp ? "impostor" : isWhite ? "white" : "player", round: s.round },
        });
      }
    }

    // Un joueur retiré en cours de manche reste affiché à la révélation.
    const players = pubPlayers(room);
    const extra = (pid, username) => {
      if (pid && !players.some((p) => p.id === pid)) players.push({ id: pid, username });
    };
    extra(g.impostorId, g.impostorName);
    extra(g.whiteId, g.whiteName);

    const last = isLastRound(room);
    g.reveal = {
      votes,
      impostorId: g.impostorId,
      impostorIndex: players.findIndex((p) => p.id === g.impostorId),
      whiteId: g.whiteId,
      whiteGuess: g.whiteGuess,
      whiteGuessCorrect: g.whiteGuessCorrect,
      caught,
      eliminatedId: mostVoted,
      aborted,
      hints: g.hints,
      players,
      wordPair: g.wordPair,
      scores: { ...s.scores },
      gained,
      isLastRound: last,
      round: s.round,
      totalRounds: s.options.rounds,
    };
    if (last) s.over = true;
    toRoom(room, "reveal_results", g.reveal);
    if (last) toRoom(room, "game_over", { ranking: ranking(room) });
  }

  function ranking(room) {
    const s = S(room);
    const pts = {};
    for (const p of room.players) pts[p.pid] = s.scores[p.pid] || 0;
    return buildRanking(pts, pubPlayers(room));
  }

  // ── Crochets du registre ──
  function snapshotFor(room, player) {
    const s = S(room);
    const g = s.game;
    const snap = {
      phase: g ? g.phase : "lobby",
      options: s.options,
      round: s.round,
      totalRounds: s.options.rounds,
      scores: { ...s.scores },
      over: s.over,
      isLastRound: isLastRound(room),
    };
    if (!g) return snap;
    snap.word = wordFor(g, player.pid);
    snap.role = player.pid === g.whiteId ? "white" : "player";
    snap.mrWhite = !!g.whiteId;
    snap.order = g.order;
    snap.turn = g.turn;
    snap.hints = g.hints;
    snap.timer = s.options.timer;
    snap.currentId = g.current;
    snap.currentIndex = g.current ? room.players.findIndex((p) => p.pid === g.current) : -1;
    snap.turnLeftMs = g.current ? Math.max(0, g.turnEndsAt - Date.now()) : 0;
    snap.myVote = g.votes[player.pid] || null;
    if (g.phase === "white_guess") {
      snap.whiteId = g.whiteId;
      snap.guessLeftMs = Math.max(0, g.guessEndsAt - Date.now());
    }
    if (g.phase === "revealed") {
      snap.reveal = g.reveal;
      if (s.over) snap.ranking = ranking(room);
    }
    return snap;
  }

  function onPlayerDisconnect(room, player) {
    const g = S(room).game;
    if (!g) return;
    if (g.phase === "hints") {
      if (g.current === player.pid) {
        recordSkip(room, player.pid);
        advance(room);
      }
    } else if (g.phase === "voting") tryFinalizeVotes(room);
  }

  function onPlayerResume(room) {
    const g = S(room).game;
    if (g && g.phase === "hints" && !g.current && !room.state.timers.advance) advance(room);
  }

  function onPlayerRemove(room, player) {
    const s = S(room);
    const g = s.game;
    if (!g || !ACTIVE_PHASES.includes(g.phase)) return;
    delete g.votes[player.pid];
    if (player.pid === g.impostorId || (player.pid === g.whiteId && g.phase !== "white_guess")) {
      // Pas de points gratuits : la manche est révélée sans score.
      reveal(room, true);
      return;
    }
    if (g.phase === "white_guess") {
      if (player.pid === g.whiteId) reveal(room);
    } else if (g.phase === "hints") {
      if (g.current === player.pid) advance(room);
    } else tryFinalizeVotes(room);
  }

  // ── Événements de jeu ──
  const err = (socket, code, message) => socket.emit("imp:error", { code, message });

  function register(socket) {
    reg.register(socket);

    const withRoom = (handler) => (data) => {
      const cur = reg.bySocket(socket);
      if (!cur) return;
      handler(cur.room, cur.player, data && typeof data === "object" ? data : {});
    };

    socket.on("update_lobby_options", withRoom((room, player, d) => {
      const s = S(room);
      if (!isHost(room, player) || (s.game && !s.over)) return; // pas de changement en pleine partie
      s.options = sanitizeOptions(d.options);
      toRoom(room, "lobby_options_updated", { options: s.options });
    }));

    socket.on("start_round", withRoom((room, player) => {
      const s = S(room);
      if (!isHost(room, player) || (s.game && !s.over)) return;
      if (reg.connected(room).length < MIN_PLAYERS) {
        return err(socket, "not_enough_players", `Il faut au moins ${MIN_PLAYERS} joueurs pour lancer la partie.`);
      }
      s.round = 1;
      s.over = false;
      s.scores = dict();
      for (const p of room.players) s.scores[p.pid] = 0;
      startRound(room);
    }));

    socket.on("start_next_round", withRoom((room, player) => {
      const s = S(room);
      if (!isHost(room, player) || !s.game || s.game.phase !== "revealed" || s.over) return;
      if (reg.connected(room).length < MIN_PLAYERS) {
        return err(socket, "not_enough_players", `Il faut au moins ${MIN_PLAYERS} joueurs pour continuer.`);
      }
      s.round++;
      startRound(room);
    }));

    socket.on("submit_hint", withRoom((room, player, d) => {
      const g = S(room).game;
      if (!g || g.phase !== "hints" || g.current !== player.pid) return; // identité = socket, jamais le client
      const hint = clean(d.hint, 40);
      g.hints[g.turn].push({ playerId: player.pid, hint });
      g.current = null;
      clearT(room, "turn");
      toRoom(room, "hint_submitted", { playerId: player.pid, hint });
      setT(room, "advance", () => advance(room), HINT_DELAY_MS);
    }));

    socket.on("force_vote", withRoom((room, player) => {
      const g = S(room).game;
      if (!g || g.phase !== "hints" || !isHost(room, player)) return;
      startVoting(room);
    }));

    socket.on("vote", withRoom((room, player, d) => {
      const g = S(room).game;
      if (!g || g.phase !== "voting") return;
      const votedId = clean(d.votedId, 30);
      if (!votedId || votedId === player.pid || !playerOf(room, votedId)) return;
      if (g.votes[player.pid]) return; // un seul vote par joueur
      g.votes[player.pid] = votedId;
      toPlayer(player, "vote_accepted", { votedId });
      tryFinalizeVotes(room);
    }));

    socket.on("force_reveal", withRoom((room, player) => {
      const g = S(room).game;
      if (!g || !isHost(room, player)) return;
      if (g.phase === "voting") {
        if (Object.keys(g.votes).length === 0) return; // au moins un vote reçu
        tryFinalizeVotes(room, true);
      } else if (g.phase === "white_guess") reveal(room); // échec de la devinette
    }));

    socket.on("imp:white_guess", withRoom((room, player, d) => {
      const g = S(room).game;
      if (!g || g.phase !== "white_guess" || player.pid !== g.whiteId || g.whiteGuess !== null) return;
      g.whiteGuess = clean(d.guess, 40);
      g.whiteGuessCorrect = normalizeWord(g.whiteGuess) !== "" && normalizeWord(g.whiteGuess) === normalizeWord(g.wordPair.normal);
      reveal(room);
    }));
  }

  function dispose() {
    for (const room of reg._rooms.values()) clearAllTimers(room);
    reg.dispose();
  }

  return {
    register,
    onDisconnect: (socket) => reg.onSocketDisconnect(socket),
    forgetUser: (uid) => reg.forgetUser(uid),
    dispose,
    _state: { rooms: reg._rooms },
  };
}

module.exports = {
  createImposteur, pickWordPair, sanitizeOptions, scoreVotes, buildRanking, WORD_PAIRS,
};
