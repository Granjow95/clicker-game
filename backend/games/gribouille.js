const { createRoomRegistry } = require("../lib/rooms");
const { clean, clampInt, createRateLimiter, normalizeWord } = require("../lib/util");
const { MAX_GRIBOUILLE_PLAYERS } = require("../config");
const { GRIBOUILLE_WORDS } = require("./gribouille-mots");

const DEFAULT_OPTIONS = { rounds: 3, drawTime: 80 };
const CHOOSE_MS = 15000;
const TURN_END_MS = 5000;
const MAX_SEGMENTS = 1500;
const MAX_VALUES = 40000;
const GLOBAL_VALUES = 8000000; // budget de valeurs de traits pour tout le processus
const SNAPSHOT_GAP_MS = 2000; // un snapshot lourd (traits) par socket toutes les 2 s
let globalValues = 0;
const LETTER = /[\p{L}\p{N}]/u;

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Segment valide : { id 0-65535, c 0-11, w 0-3, p plat d'entiers 0-1000, longueur paire 2-128 }.
function parseSegment(d) {
  if (!d || typeof d !== "object") return null;
  const { id, c, w, p } = d;
  if (!isInt(id, 0, 65535) || !isInt(c, 0, 11) || !isInt(w, 0, 3)) return null;
  if (!Array.isArray(p) || p.length < 2 || p.length > 128 || p.length % 2 !== 0) return null;
  for (const v of p) if (!isInt(v, 0, 1000)) return null;
  return { id, c, w, p: p.slice() };
}

// Distance de Levenshtein exactement 1 (une substitution, insertion ou suppression).
function withinOne(a, b) {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const roundTo10 = (n) => Math.round(n / 10) * 10;
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// opts (tests) : { graceMs, timings: { choosingMs, turnEndMs }, words }
function createGribouille(io, results, opts = {}) {
  const chooseMs = (opts.timings && opts.timings.choosingMs) || CHOOSE_MS;
  const turnEndMs = (opts.timings && opts.timings.turnEndMs) || TURN_END_MS;
  const words = Array.isArray(opts.words) && opts.words.length >= 3 ? opts.words : GRIBOUILLE_WORDS;
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
      st.used = new Set();
      st.guessLimiters = Object.create(null);
      resetTurn(st);
    }
    return st;
  };

  function resetTurn(st) {
    st.drawerPid = null;
    st.choices = [];
    st.word = null;
    st.wordNorm = "";
    st.revealed = new Set();
    st.segments = [];
    setValues(st, 0);
    st.found = Object.create(null);
    st.gained = Object.create(null);
    st.drawLimiter = null;
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
    st.used = new Set();
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

  function pickChoices(st) {
    let pool = words.filter((w) => !st.used.has(w));
    if (pool.length < 3) {
      st.used.clear();
      pool = words.slice();
    }
    return shuffle(pool).slice(0, 3);
  }

  function beginChoosing(room, st, drawer) {
    resetTurn(st);
    st.phase = "choosing";
    st.drawerPid = drawer.pid;
    st.choices = pickChoices(st);
    st.durationMs = chooseMs;
    st.startedAt = Date.now();
    st.endsAt = st.startedAt + chooseMs;
    st.drawLimiter = createRateLimiter({ capacity: 20, perSecond: 12 });
    reg.toRoom(room, "choosing", { drawerId: drawer.pid, round: st.round, totalRounds: st.options.rounds, durationMs: chooseMs });
    reg.toPlayer(drawer, "choices", { words: st.choices });
    later(st, chooseMs, () => chooseWord(room, st, Math.floor(Math.random() * st.choices.length)));
  }

  function chooseWord(room, st, index) {
    if (st.phase !== "choosing") return;
    clearTimers(st);
    st.word = st.choices[index];
    st.wordNorm = normalizeWord(st.word);
    st.used.add(st.word);
    st.choices = [];
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
    st.phase = "over";
    resetTurn(st);
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
      options: { ...st.options },
      round: st.round,
      totalRounds: st.options.rounds,
      scores: scoresOf(room, st),
    };
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
      if (player.pid === st.drawerPid) snap.choices = st.choices.slice();
      return snap;
    }
    snap.mask = maskOf(st);
    snap.segments = st.segments.map((s) => ({ id: s.id, c: s.c, w: s.w, p: s.p.slice() }));
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
      };
      reg.toRoom(cur.room, "options", { ...st.options });
    });

    socket.on("gri:start", () => {
      const cur = reg.bySocket(socket);
      if (!cur) return;
      const st = getSt(cur.room);
      if (cur.room.hostPid !== cur.player.pid) return fail(cur.player, "Réservé à l'hôte.");
      if (st.phase !== "lobby" && st.phase !== "over") return;
      if (reg.connected(cur.room).length < 2) return fail(cur.player, "Il faut au moins 2 joueurs connectés.");
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
      st.segments.push(seg);
      setValues(st, st.values + seg.p.length);
      socket.to(channel(room)).emit("gri:draw", seg);
    });

    socket.on("gri:undo", (data) => {
      const ctx = drawerCtx("drawing");
      if (!ctx || !ctx.st.drawLimiter()) return;
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
      if (!ctx || !ctx.st.drawLimiter()) return;
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

module.exports = { createGribouille, _globalValues: () => globalValues };
