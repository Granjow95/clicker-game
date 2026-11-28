const { createRoomRegistry } = require("../lib/rooms");
const { clean, clampInt, createRateLimiter, normalizeWord } = require("../lib/util");
const { recordRanking } = require("../lib/results");
const { MAX_GRIBOUILLE_PLAYERS } = require("../config");
const { GRIBOUILLE_WORDS, GRIBOUILLE_HARD_WORDS } = require("./gribouille-mots");

const DIFFICULTIES = ["facile", "mixte", "difficile"];
const DEFAULT_OPTIONS = { rounds: 3, drawTime: 80, difficulty: "mixte", customOnly: false };
// Réserve d'où vient chaque mot proposé, selon la difficulté (un emplacement facile laisse sa place à un mot perso).
const SLOTS = { facile: ["facile", "facile", "facile"], mixte: ["facile", "facile", "difficile"], difficile: ["difficile", "difficile", "difficile"] };
const MAX_CUSTOM = 100;
const MAX_CUSTOM_LEN = 30;
// Mot perso : lettres, espaces, tirets et apostrophes (la ponctuation s'afficherait en clair dans le masque).
const CUSTOM_WORD = /^\p{L}[\p{L} '’-]*$/u;
const CHOOSE_MS = 15000;
const TURN_END_MS = 5000;
const MAX_SEGMENTS = 1500;
const MAX_VALUES = 40000;
const GLOBAL_VALUES = 8000000; // budget de valeurs de traits pour tout le processus
const SNAPSHOT_GAP_MS = 2000; // un snapshot lourd (traits) par socket toutes les 2 s
const NB_COULEURS = 80; // 16 teintes × 5 nuances (javascript/gribouille-outils.js)
const MAX_FILLS = 30; // pots de peinture par tour : coûteux à rejouer chez chaque client
let globalValues = 0;
const LETTER = /[\p{L}\p{N}]/u;

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Segment valide :
// - trait : { id 0-65535, c 0-79, w 0-3, p plat d'entiers 0-1000, longueur paire 2-128 } ;
// - pot de peinture : { id, c, f: 1, p: [x, y] } (w forcé à 0).
function parseSegment(d) {
  if (!d || typeof d !== "object") return null;
  const { id, c, w, p, f } = d;
  if (!isInt(id, 0, 65535) || !isInt(c, 0, NB_COULEURS - 1)) return null;
  if (f !== undefined && f !== 1) return null;
  if (!Array.isArray(p)) return null;
  if (f === 1) {
    if (p.length !== 2 || !p.every((v) => isInt(v, 0, 1000))) return null;
    return { id, c, w: 0, f: 1, p: p.slice() };
  }
  if (!isInt(w, 0, 3)) return null;
  if (p.length < 2 || p.length > 128 || p.length % 2 !== 0) return null;
  for (const v of p) if (!isInt(v, 0, 1000)) return null;
  return { id, c, w, p: p.slice() };
}
const copieSegment = (s) => (s.f ? { id: s.id, c: s.c, w: 0, f: 1, p: s.p.slice() } : { id: s.id, c: s.c, w: s.w, p: s.p.slice() });

// Distance de Levenshtein exactement 1 (une substitution, insertion ou suppression).
function withinOne(a, b) {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Liste de mots perso envoyée par l'hôte : bornée, nettoyée, dédoublonnée par normalizeWord. null si ce n'est pas un tableau.
function parseCustomWords(list) {
  if (!Array.isArray(list)) return null;
  const words = [];
  const seen = new Set();
  let rejected = 0;
  for (const v of list.slice(0, MAX_CUSTOM * 2)) {
    if (typeof v !== "string") { rejected++; continue; }
    const w = clean(v.normalize("NFC"), 200).replace(/\s+/g, " ").trim();
    if (!w) continue;
    const norm = normalizeWord(w);
    if (w.length > MAX_CUSTOM_LEN || norm.length < 2 || !CUSTOM_WORD.test(w)) { rejected++; continue; }
    if (seen.has(norm)) continue;
    if (words.length >= MAX_CUSTOM) { rejected++; continue; }
    seen.add(norm);
    words.push(w);
  }
  return { words, rejected };
}

const roundTo10 = (n) => Math.round(n / 10) * 10;
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// opts (tests) : { graceMs, timings: { choosingMs, turnEndMs }, words, hardWords }
function createGribouille(io, results, opts = {}) {
  const chooseMs = (opts.timings && opts.timings.choosingMs) || CHOOSE_MS;
  const turnEndMs = (opts.timings && opts.timings.turnEndMs) || TURN_END_MS;
  const words = Array.isArray(opts.words) && opts.words.length >= 3 ? opts.words : GRIBOUILLE_WORDS;
  const hardWords = Array.isArray(opts.hardWords) && opts.hardWords.length >= 3 ? opts.hardWords : GRIBOUILLE_HARD_WORDS;
  const valueBudget = Number.isInteger(opts.valueBudget) ? opts.valueBudget : GLOBAL_VALUES;
  let reg;

  // Met à jour st.values en répercutant la variation sur le budget global.
  function setValues(st, n) {
    globalValues += n - (st.values || 0);
    st.values = n;
  }

  const getSt = (room) => {
    const st = room.state;
    if (!st.phase) {
      st.phase = "lobby";
      st.options = { ...DEFAULT_OPTIONS };
      st.scores = Object.create(null);
      st.timers = [];
      st.round = 0;
      st.order = [];
      st.orderIdx = 0;
      st.custom = []; // mots perso : jamais envoyés à un autre joueur que leur auteur
      st.customOwner = null; // pid de l'hôte qui les a saisis
      st.persoPlayed = 0; // mots perso joués dans la partie (leur auteur connaît la réponse)
      st.played = new Set(); // mots joués dans la partie (normalisés), toutes réserves confondues
      st.wordLimiters = Object.create(null);
      st.used = newUsed();
      st.guessLimiters = Object.create(null);
      resetTurn(st);
    }
    return st;
  };

  // Mots déjà joués, une réserve par liste (réinitialisée quand elle est épuisée).
  const newUsed = () => ({ facile: new Set(), difficile: new Set(), perso: new Set() });
  const optionsOf = (st) => ({ ...st.options, customCount: st.custom.length });

  function resetTurn(st) {
    st.drawerPid = null;
    st.choices = [];
    st.choiceTags = [];
    st.word = null;
    st.wordNorm = "";
    st.revealed = new Set();
    st.segments = [];
    st.fills = 0; // cumulatif sur le tour : ni l'annulation ni l'effacement ne le font baisser
    setValues(st, 0);
    st.found = Object.create(null);
    st.gained = Object.create(null);
    st.drawLimiter = null;
    st.undoLimiter = null;
    st.durationMs = 0;
    st.startedAt = 0;
    st.endsAt = 0;
    st.lastTurn = null;
  }

  const inGame = (room) => {
    const ph = getSt(room).phase;
    return ph === "choosing" || ph === "drawing" || ph === "turn_end";
  };

  // ── Minuteurs (unref, purgés) ──
  function clearTimers(st) {
    for (const t of st.timers) clearTimeout(t);
    st.timers = [];
  }
  function later(st, ms, fn) {
    const t = setTimeout(fn, ms);
    t.unref();
    st.timers.push(t);
  }

  const playerOf = (room, pid) => room.players.find((p) => p.pid === pid) || null;

  function scoresOf(room, st) {
    const out = Object.create(null);
    for (const p of room.players) out[p.pid] = st.scores[p.pid] || 0;
    return out;
  }
  const ranking = (room, st) =>
    room.players
      .map((p) => ({ id: p.pid, username: p.username, score: st.scores[p.pid] || 0 }))
      .sort((a, b) => b.score - a.score);

  function maskOf(st) {
    if (!st.word) return "";
    return Array.from(st.word).map((ch, i) => (LETTER.test(ch) && !st.revealed.has(i) ? "_" : ch)).join("");
  }

  const remainingMs = (st) => Math.max(0, st.endsAt - Date.now());

  // ── Cycle de jeu ──
  function startGame(room) {
    const st = getSt(room);
    clearTimers(st);
    st.scores = Object.create(null);
    for (const p of room.players) st.scores[p.pid] = 0;
    st.used = newUsed();
    st.played = new Set();
    st.persoPlayed = 0;
    st.round = 1;
    st.order = reg.connected(room).map((p) => p.pid);
    st.orderIdx = 0;
    resetTurn(st);
    advance(room);
  }

  function nextDrawer(room, st) {
    for (;;) {
      while (st.orderIdx < st.order.length) {
        const p = playerOf(room, st.order[st.orderIdx++]);
        if (p && p.connected) return p;
      }
      if (st.round >= st.options.rounds) return null;
      st.round++;
      st.order = reg.connected(room).map((p) => p.pid);
      st.orderIdx = 0;
      if (st.order.length === 0) return null;
    }
  }

  function advance(room) {
    const st = getSt(room);
    clearTimers(st);
    st.pendingAdvance = false;
    const nConn = reg.connected(room).length;
    if (nConn < 2 && room.players.length > nConn && st.phase === "turn_end") {
      // Joueurs en grâce : on attend leur reprise ou l'expiration de la grâce.
      st.pendingAdvance = true;
      return;
    }
    const drawer = nConn >= 2 ? nextDrawer(room, st) : null;
    if (!drawer) return gameOver(room);
    beginChoosing(room, st, drawer);
  }

  // Un mot de la réserve `tag`, ni équivalent (normalizeWord) à un mot déjà proposé dans ce choix, ni déjà joué
  // dans la partie, toutes réserves confondues (un mot perso « chat » ne ressort pas en facile).
  function draw(st, tag, list, norms) {
    const libre = (w) => !norms.has(normalizeWord(w));
    const neuf = (w) => !st.played.has(normalizeWord(w));
    let pool = list.filter((w) => !st.used[tag].has(w) && libre(w) && neuf(w));
    if (!pool.length) {
      st.used[tag].clear(); // réserve épuisée : on recommence
      pool = list.filter((w) => libre(w) && neuf(w));
      if (!pool.length) pool = list.filter(libre);
    }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  // Trois mots proposés au dessinateur et leur réserve d'origine (facile / difficile / perso).
  function pickChoices(st) {
    const lists = { facile: words, difficile: hardWords, perso: st.custom };
    let slots;
    if (st.options.customOnly && st.custom.length >= 3) slots = ["perso", "perso", "perso"];
    else {
      slots = SLOTS[st.options.difficulty] ? SLOTS[st.options.difficulty].slice() : SLOTS.mixte.slice();
      // Tant qu'il reste des mots perso jamais joués, l'un d'eux est proposé à chaque tour.
      if (st.custom.some((w) => !st.used.perso.has(w))) {
        const i = slots.indexOf("facile");
        slots[i === -1 ? 0 : i] = "perso";
      }
    }
    const picks = [];
    const norms = new Set();
    const take = (tag) => {
      const w = draw(st, tag, lists[tag], norms);
      if (!w) return false;
      picks.push({ word: w, tag });
      norms.add(normalizeWord(w));
      return true;
    };
    for (const tag of slots) take(tag);
    while (picks.length < 3 && take("facile")); // réserve trop petite : on complète avec des mots faciles
    shuffle(picks);
    return { words: picks.map((p) => p.word), tags: picks.map((p) => p.tag) };
  }

  function beginChoosing(room, st, drawer) {
    resetTurn(st);
    st.phase = "choosing";
    st.drawerPid = drawer.pid;
    const picked = pickChoices(st);
    st.choices = picked.words;
    st.choiceTags = picked.tags;
    st.durationMs = chooseMs;
    st.startedAt = Date.now();
    st.endsAt = st.startedAt + chooseMs;
    st.drawLimiter = createRateLimiter({ capacity: 20, perSecond: 12 });
    // Annuler / tout effacer font rejouer tout le dessin chez chaque devineur (remplissages compris) : débit à part, plus bas.
    st.undoLimiter = createRateLimiter({ capacity: 4, perSecond: 2 });
    reg.toRoom(room, "choosing", { drawerId: drawer.pid, round: st.round, totalRounds: st.options.rounds, durationMs: chooseMs });
    reg.toPlayer(drawer, "choices", { words: st.choices, tags: st.choiceTags });
    later(st, chooseMs, () => chooseWord(room, st, Math.floor(Math.random() * st.choices.length)));
  }

  function chooseWord(room, st, index) {
    if (st.phase !== "choosing") return;
    clearTimers(st);
    st.word = st.choices[index];
    st.wordNorm = normalizeWord(st.word);
    const tag = st.choiceTags[index];
    if (st.used[tag]) st.used[tag].add(st.word);
    st.played.add(st.wordNorm);
    if (tag === "perso") st.persoPlayed++;
    st.choices = [];
    st.choiceTags = [];
    st.phase = "drawing";
    const total = st.options.drawTime * 1000;
    st.durationMs = total;
    st.startedAt = Date.now();
    st.endsAt = st.startedAt + total;
    const drawer = playerOf(room, st.drawerPid);
    reg.toRoom(room, "turn_start", { drawerId: st.drawerPid, mask: maskOf(st), durationMs: total });
    if (drawer) reg.toPlayer(drawer, "word", { word: st.word });
    later(st, total, () => endTurn(room, "time"));
    const letters = [];
    Array.from(st.word).forEach((ch, i) => { if (LETTER.test(ch)) letters.push(i); });
    if (letters.length >= 4) {
      for (const frac of [0.5, 0.75]) {
        later(st, total * frac, () => {
          if (st.phase !== "drawing") return;
          const hidden = letters.filter((i) => !st.revealed.has(i));
          if (hidden.length <= 1) return;
          st.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
          reg.toRoom(room, "hint", { mask: maskOf(st) });
        });
      }
    }
  }

  function endTurn(room, reason) {
    const st = getSt(room);
    if (st.phase !== "choosing" && st.phase !== "drawing") return;
    clearTimers(st);
    const word = st.word;
    st.phase = "turn_end";
    st.startedAt = Date.now();
    st.durationMs = turnEndMs;
    st.endsAt = st.startedAt + turnEndMs;
    st.lastTurn = { word, reason };
    reg.toRoom(room, "turn_end", { word, reason, gained: st.gained, scores: scoresOf(room, st) });
    later(st, turnEndMs, () => advance(room));
  }

  function gameOver(room) {
    const st = getSt(room);
    clearTimers(st);
    const already = st.phase === "over";
    st.phase = "over";
    resetTurn(st);
    // Mots perso joués : leur auteur connaissait la réponse, le classement n'est pas enregistré dans l'historique.
    if (!already && st.persoPlayed === 0) recordRanking(results, { game: "gribouille", players: room.players, scoreOf: (pid) => st.scores[pid], rounds: st.round });
    reg.toRoom(room, "game_over", { ranking: ranking(room, st) });
  }

  // Tous les connectés non dessinateurs ont trouvé (au moins un devineur).
  function checkAllFound(room, st) {
    if (st.phase !== "drawing") return;
    const guessers = reg.connected(room).filter((p) => p.pid !== st.drawerPid);
    if (guessers.length > 0 && guessers.every((p) => st.found[p.pid])) endTurn(room, "all_found");
  }

  // ── Crochets du registre ──
  function snapshotFor(room, player) {
    const st = getSt(room);
    const snap = {
      phase: st.phase,
      options: optionsOf(st),
      round: st.round,
      totalRounds: st.options.rounds,
      scores: scoresOf(room, st),
    };
    if (player.pid === room.hostPid && player.pid === st.customOwner) snap.customWords = st.custom.slice(); // leur auteur seul
    if (st.phase === "lobby") return snap;
    if (st.phase === "over") {
      snap.ranking = ranking(room, st);
      return snap;
    }
    snap.drawerId = st.drawerPid;
    snap.durationMs = st.durationMs;
    snap.remainingMs = remainingMs(st);
    snap.youFound = !!st.found[player.pid];
    snap.found = Object.keys(st.found);
    if (st.phase === "choosing") {
      if (player.pid === st.drawerPid) {
        snap.choices = st.choices.slice();
        snap.choiceTags = st.choiceTags.slice();
      }
      return snap;
    }
    snap.mask = maskOf(st);
    snap.segments = st.segments.map(copieSegment);
    snap.fills = st.fills; // pots déjà versés ce tour (cumulatif, l'annulation ne le fait pas baisser)
    if (st.phase === "drawing" && player.pid === st.drawerPid) snap.word = st.word;
    if (st.phase === "turn_end") snap.turnEnd = { word: st.lastTurn.word, reason: st.lastTurn.reason, gained: { ...st.gained } };
    return snap;
  }

  // Snapshot lourd (traits) : au plus un par socket toutes les 2 s.
  function canAttach(socket, room, kind) {
    if (kind !== "join") return null;
    const st = getSt(room);
    if (st.segments.length === 0) return null;
    const now = Date.now();
    if (socket.data.griSnapAt && now - socket.data.griSnapAt < SNAPSHOT_GAP_MS) return "rate_limited";
    socket.data.griSnapAt = now;
    return null;
  }

  function onJoin(room, player) {
    const st = getSt(room);
    if (st.scores[player.pid] === undefined) st.scores[player.pid] = 0;
    if (st.phase === "choosing" || st.phase === "drawing" || st.phase === "turn_end") {
      if (!st.order.includes(player.pid)) st.order.push(player.pid);
    }
  }

  function onDisconnect(room, player) {
    const st = getSt(room);
    if (st.phase !== "choosing" && st.phase !== "drawing") return;
    if (player.pid === st.drawerPid) endTurn(room, "drawer_left");
    else checkAllFound(room, st);
  }

  function retryAdvance(room) {
    const st = getSt(room);
    if (st.pendingAdvance && st.phase === "turn_end") advance(room);
  }

  function onResume(room) {
    retryAdvance(room);
  }

  function onRemove(room, player) {
    const st = getSt(room);
    delete st.guessLimiters[player.pid];
    delete st.wordLimiters[player.pid];
    const oi = st.order.indexOf(player.pid);
    if (oi !== -1) {
      st.order.splice(oi, 1);
      if (oi < st.orderIdx) st.orderIdx--; // garde « qui dessine ensuite » correct
    }
    if (room.players.length === 0) return;
    if (st.pendingAdvance) return retryAdvance(room);
    if (st.phase !== "choosing" && st.phase !== "drawing") return;
    if (player.pid === st.drawerPid) endTurn(room, "drawer_left");
    else checkAllFound(room, st);
  }

  // Nouvel hôte : il ne reçoit JAMAIS les mots perso d'un autre (il pourrait deviner). En partie, ils restent dans la
  // pioche sans être montrés ; hors partie, ils sont retirés (le nouvel hôte saisira les siens).
  function onHostChange(room, next) {
    const st = getSt(room);
    if (inGame(room) || !st.custom.length || next.pid === st.customOwner) return;
    st.custom = [];
    st.customOwner = null;
    st.used.perso.clear();
    st.options = { ...st.options, customOnly: false };
    reg.toRoom(room, "options", optionsOf(st));
    reg.toPlayer(next, "words_saved", { words: [], rejected: 0 });
  }

  function onEmpty(room) {
    clearTimers(getSt(room));
    setValues(getSt(room), 0);
  }

  reg = createRoomRegistry(io, {
    prefix: "gri",
    maxPlayers: MAX_GRIBOUILLE_PLAYERS,
    graceMs: opts.graceMs,
    inGame,
    snapshotFor,
    canAttach,
    onJoin,
    onDisconnect,
    onResume,
    onRemove,
    onHostChange,
    onEmpty,
  });

  const fail = (player, message) => reg.toPlayer(player, "error", { code: "invalid", message });

  // ── Événements du jeu ──
  function register(socket) {
    reg.register(socket);
    const channel = (room) => `gri:${room.code}`;
    const drawerCtx = (phase) => {
      const cur = reg.bySocket(socket);
      if (!cur) return null;
      const st = getSt(cur.room);
      if (st.phase !== phase || st.drawerPid !== cur.player.pid) return null;
      return { ...cur, st };
    };

    socket.on("gri:options", (data) => {
      const cur = reg.bySocket(socket);
      if (!cur || !data || typeof data !== "object") return;
      const st = getSt(cur.room);
      if (cur.room.hostPid !== cur.player.pid) return fail(cur.player, "Réservé à l'hôte.");
      if (st.phase !== "lobby") return;
      st.options = {
        rounds: clampInt(data.rounds, 1, 5, st.options.rounds),
        drawTime: clampInt(data.drawTime, 30, 120, st.options.drawTime),
        difficulty: DIFFICULTIES.includes(data.difficulty) ? data.difficulty : st.options.difficulty,
        customOnly: typeof data.customOnly === "boolean" ? data.customOnly : st.options.customOnly,
      };
      reg.toRoom(cur.room, "options", optionsOf(st));
    });

    // Mots perso (hôte, salon) : la liste revient à l'hôte seul, la salle ne reçoit que leur nombre.
    // Limiteur par joueur de la salle (survit à une reconnexion).
    socket.on("gri:words", (data) => {
      const cur = reg.bySocket(socket);
      if (!cur || !data || typeof data !== "object") return;
      const st = getSt(cur.room);
      if (cur.room.hostPid !== cur.player.pid) return fail(cur.player, "Réservé à l'hôte.");
      if (st.phase !== "lobby") return;
      const pid = cur.player.pid;
      const allowWords = st.wordLimiters[pid] || (st.wordLimiters[pid] = createRateLimiter({ capacity: 3, perSecond: 0.5 }));
      if (!allowWords()) return fail(cur.player, "Doucement : réessaie dans un instant.");
      const parsed = parseCustomWords(data.words);
      if (!parsed) return fail(cur.player, "Liste de mots invalide.");
      st.custom = parsed.words;
      st.customOwner = pid;
      st.used.perso.clear();
      reg.toPlayer(cur.player, "words_saved", { words: st.custom.slice(), rejected: parsed.rejected });
      reg.toRoom(cur.room, "options", optionsOf(st));
    });

    socket.on("gri:start", () => {
      const cur = reg.bySocket(socket);
      if (!cur) return;
      const st = getSt(cur.room);
      if (cur.room.hostPid !== cur.player.pid) return fail(cur.player, "Réservé à l'hôte.");
      if (st.phase !== "lobby" && st.phase !== "over") return;
      if (reg.connected(cur.room).length < 2) return fail(cur.player, "Il faut au moins 2 joueurs connectés.");
      if (st.options.customOnly && st.custom.length < 3) return fail(cur.player, "Ajoute au moins 3 mots personnalisés, ou décoche « Seulement mes mots ».");
      startGame(cur.room);
    });

    socket.on("gri:choose", (data) => {
      const ctx = drawerCtx("choosing");
      if (!ctx || !data || typeof data !== "object" || !isInt(data.index, 0, 2)) return;
      if (data.index >= ctx.st.choices.length) return;
      chooseWord(ctx.room, ctx.st, data.index);
    });

    socket.on("gri:draw", (data) => {
      const ctx = drawerCtx("drawing");
      if (!ctx) return;
      const { st, room } = ctx;
      if (!st.drawLimiter()) return;
      const seg = parseSegment(data);
      if (!seg) return;
      if (st.segments.length >= MAX_SEGMENTS || st.values + seg.p.length > MAX_VALUES) return;
      if (globalValues + seg.p.length > valueBudget) return;
      if (seg.f) {
        if (st.fills >= MAX_FILLS) return;
        st.fills++;
      }
      st.segments.push(seg);
      setValues(st, st.values + seg.p.length);
      socket.to(channel(room)).emit("gri:draw", seg);
    });

    socket.on("gri:undo", (data) => {
      const ctx = drawerCtx("drawing");
      if (!ctx || !ctx.st.undoLimiter()) return;
      if (!data || typeof data !== "object" || !isInt(data.id, 0, 65535)) return;
      const { st, room } = ctx;
      const kept = st.segments.filter((s) => s.id !== data.id);
      if (kept.length === st.segments.length) return;
      st.segments = kept;
      setValues(st, kept.reduce((n, s) => n + s.p.length, 0));
      socket.to(channel(room)).emit("gri:undo", { id: data.id });
    });

    socket.on("gri:clear", () => {
      const ctx = drawerCtx("drawing");
      if (!ctx || !ctx.st.undoLimiter()) return;
      ctx.st.segments = [];
      setValues(ctx.st, 0);
      socket.to(channel(ctx.room)).emit("gri:clear", {});
    });

    socket.on("gri:guess", (data) => {
      const cur = reg.bySocket(socket);
      if (!cur || !data || typeof data !== "object") return;
      const { room, player } = cur;
      const st = getSt(room);
      if (st.phase !== "drawing" || player.pid === st.drawerPid) return;
      const text = clean(data.text, 40);
      const norm = normalizeWord(text);
      if (!text || !norm) return;
      const limiter = st.guessLimiters[player.pid] || (st.guessLimiters[player.pid] = createRateLimiter({ capacity: 4, perSecond: 2 }));
      if (!limiter()) return;

      if (st.found[player.pid]) {
        // Chat réservé aux trouveurs et au dessinateur ; le mot lui-même n'est jamais relayé.
        if (norm === st.wordNorm) return;
        for (const p of reg.connected(room)) {
          if (p.pid === st.drawerPid || st.found[p.pid]) reg.toPlayer(p, "chat", { playerId: player.pid, text, found: true });
        }
        return;
      }
      if (norm === st.wordNorm) {
        const points = roundTo10(50 + 450 * (remainingMs(st) / st.durationMs));
        st.found[player.pid] = true;
        st.gained[player.pid] = (st.gained[player.pid] || 0) + points;
        st.scores[player.pid] = (st.scores[player.pid] || 0) + points;
        st.gained[st.drawerPid] = (st.gained[st.drawerPid] || 0) + 50;
        st.scores[st.drawerPid] = (st.scores[st.drawerPid] || 0) + 50;
        reg.toRoom(room, "correct", { playerId: player.pid, points });
        checkAllFound(room, st);
        return;
      }
      if (st.wordNorm.length >= 4 && withinOne(norm, st.wordNorm)) return reg.toPlayer(player, "close", {});
      reg.toRoom(room, "chat", { playerId: player.pid, text });
    });
  }

  function dispose() {
    for (const room of reg._rooms.values()) {
      clearTimers(getSt(room));
      setValues(getSt(room), 0);
    }
    reg.dispose();
  }

  return {
    register,
    onDisconnect: reg.onSocketDisconnect,
    forgetUser: reg.forgetUser,
    dispose,
    reg,
  };
}

module.exports = { createGribouille, parseSegment, parseCustomWords, MAX_FILLS, NB_COULEURS, MAX_CUSTOM, _globalValues: () => globalValues };
