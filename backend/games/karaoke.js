const { createRoomRegistry } = require("../lib/rooms");
const { clean, clampInt, createKeyedLimiter, clientIp } = require("../lib/util");
const { hasDistinctAccounts } = require("../lib/results");
const { parseLrc } = require("../lib/lrc");
const { searchVideoIds } = require("../lib/ytSearch");
const { MAX_KARAOKE_PLAYERS } = require("../config");

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const COVER_HOSTS = ["dzcdn.net", "mzstatic.com"];
const MODES = ["full", "instrumental"];
const MIN_SYNCED_LINES = 5;
const VIDEO_CANDIDATES = 5;
const VIDEO_ID = /^[\w-]{11}$/;
const PARTICIPATION_GAP_MS = 60000;
const END_TAIL_MS = 6000; // la chanson se termine 6 s après la dernière ligne si sa durée est inconnue ou trop courte
const RESUME_LEAD_MS = 800; // reprise après pause : laisse les lecteurs se caler
const SEEK_LEAD_MS = 500; // saut de ligne en lecture
const LINE_TOLERANCE_MS = 50;

// Pochette : https uniquement, sur les domaines réellement utilisés par le client (Deezer, iTunes).
function safeCover(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  let u;
  try { u = new URL(value); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  return COVER_HOSTS.some((d) => host === d || host.endsWith("." + d)) ? u.href : null;
}

// Ne garde que les champs attendus de la chanson, avec des longueurs bornées.
function sanitizeSong(song) {
  if (!song || typeof song !== "object") return null;
  const title = clean(song.title, 150);
  const artist = clean(song.artist, 150);
  if (!title || !artist) return null;
  const out = { title, artist };
  if (typeof song.lyrics === "string") out.lyrics = song.lyrics.slice(0, 20000).replace(CONTROL_CHARS, "");
  if (typeof song.syncedLyrics === "string") out.syncedLyrics = song.syncedLyrics.slice(0, 30000).replace(CONTROL_CHARS, "");
  const cover = safeCover(song.cover);
  if (cover) out.cover = cover;
  if (Number.isFinite(song.duration)) out.duration = clampInt(song.duration, 0, 3600, 0);
  if (Number.isFinite(song.year)) out.year = clampInt(song.year, 1900, 2100, 0) || undefined;
  return out;
}

// Seau à jetons par clé (salle) : `burst` en rafale, puis 1 appel par `intervalMs`.
function createKeyedLimiterBurst(intervalMs, burst) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const b = buckets.get(key) || { tokens: burst, last: now };
    b.tokens = Math.min(burst, b.tokens + (now - b.last) / intervalMs);
    b.last = now;
    buckets.set(key, b);
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.last > intervalMs * burst) buckets.delete(k);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };
}

// Position de lecture (ms) d'une horloge à l'instant serveur `now`. Avant `baseAt`, l'horloge est figée sur `baseMs`.
function clockPos(clock, now) {
  if (!clock) return 0;
  return clock.playing && now >= clock.baseAt ? clock.baseMs + (now - clock.baseAt) : clock.baseMs;
}

// Indice de la ligne affichée à la position `pos` (-1 pendant l'intro).
function lineAt(lines, pos) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= pos + LINE_TOLERANCE_MS) idx = i; else break;
  }
  return idx;
}

const publicSong = (s) => {
  const out = { title: s.title, artist: s.artist };
  if (s.cover) out.cover = s.cover;
  if (s.duration) out.duration = s.duration;
  if (s.year) out.year = s.year;
  return out;
};

// opts (tests) : { graceMs, ipLimiter, maxRoomsPerIp, selectIntervalMs, controlIntervalMs, searchVideos, leadMs, endTailMs }
function createKaraoke(io, results = { record() {} }, opts = {}) {
  const allowSelect = createKeyedLimiterBurst(opts.selectIntervalMs ?? 2000, 2);
  const allowControl = createKeyedLimiterBurst(opts.controlIntervalMs ?? 400, 4);
  const allowTime = createKeyedLimiter({ max: 30, windowMs: 60 * 1000 });
  const searchVideos = opts.searchVideos || searchVideoIds;
  const LEAD_MS = opts.leadMs ?? 3000;
  const TAIL_MS = opts.endTailMs ?? END_TAIL_MS;

  const getSt = (room) => {
    const st = room.state;
    if (st.song === undefined) {
      st.song = null;
      st.mode = "full";
      st.lines = [];
      st.videoIds = [];
      st.endMs = 0;
      st.started = false;
      st.ended = false;
      st.clock = null;
      st.seq = 0;
      st.selectSeq = 0;
      st.lastRecorded = 0;
      st.endTimer = null;
    }
    return st;
  };

  const inGame = (room) => { const st = getSt(room); return st.started && !st.ended; };

  function clearEnd(st) {
    if (st.endTimer) clearTimeout(st.endTimer);
    st.endTimer = null;
  }

  // État de reprise et d'arrivée en cours de chanson.
  function snapshotFor(room) {
    const st = getSt(room);
    return {
      song: st.song,
      mode: st.mode,
      lines: st.lines,
      videoIds: st.videoIds,
      endMs: st.endMs,
      started: st.started,
      ended: st.ended,
      clock: st.clock,
      serverNow: Date.now(),
    };
  }

  const reg = createRoomRegistry(io, {
    prefix: "kk",
    ipLimiter: opts.ipLimiter,
    maxRoomsPerIp: opts.maxRoomsPerIp,
    maxPlayers: MAX_KARAOKE_PLAYERS,
    graceMs: opts.graceMs,
    inGame,
    snapshotFor,
    onEmpty: (room) => clearEnd(getSt(room)),
  });

  const alive = (room) => reg._rooms.get(room.code) === room;

  // Fin de chanson décidée par le serveur seul : minuteur replanifié à chaque changement d'horloge.
  function scheduleEnd(room) {
    const st = getSt(room);
    clearEnd(st);
    if (!st.started || st.ended || !st.clock || !st.clock.playing) return;
    const now = Date.now();
    const wait = Math.max(0, st.clock.baseAt - now) + Math.max(0, st.endMs - clockPos(st.clock, now));
    const timer = setTimeout(() => {
      st.endTimer = null;
      if (!alive(room) || !st.started || st.ended) return;
      st.ended = true;
      setClock(room, { playing: false, baseMs: st.endMs, baseAt: Date.now() }, "ended");
    }, wait);
    timer.unref();
    st.endTimer = timer;
  }

  function setClock(room, clock, ev = "clock", extra = {}) {
    const st = getSt(room);
    st.seq++;
    st.clock = { ...clock, seq: st.seq };
    scheduleEnd(room);
    reg.toRoom(room, ev, { ...extra, clock: st.clock, serverNow: Date.now() });
  }

  function recordParticipation(room) {
    const st = getSt(room);
    // Participation enregistrée au plus une fois par minute et par salle (anti-spam).
    if (Date.now() - st.lastRecorded <= PARTICIPATION_GAP_MS) return;
    st.lastRecorded = Date.now();
    const seen = new Set();
    const online = room.players.filter((p) => p.connected);
    for (const p of hasDistinctAccounts(online) ? online : []) {
      if (!p.userId || seen.has(p.userId)) continue;
      seen.add(p.userId);
      results.record({ userId: p.userId, game: "karaoke", score: 0, won: false, rounds: 1, meta: { participation: true } });
    }
  }

  function register(socket) {
    reg.register(socket);

    const asHost = (handler) => (data) => {
      const cur = reg.bySocket(socket);
      if (!cur) return;
      if (cur.room.hostPid !== cur.player.pid) {
        return reg.toPlayer(cur.player, "error", { code: "not_host", message: "Réservé à l'hôte." });
      }
      return handler(cur.room, cur.player, data && typeof data === "object" ? data : {});
    };
    // Contrôles de lecture : limités par salle. Les excès de pause / lecture / saut sont ignorés sans message (touche maintenue) ;
    // lancer, recommencer et arrêter le signalent, un clic ne doit pas disparaître en silence.
    const control = (handler, { notify = false } = {}) => asHost((room, player, d) => {
      if (!allowControl(room.code)) {
        if (notify) fail(player, "rate_limited", "Doucement : réessaie dans un instant.");
        return;
      }
      handler(room, player, d);
    });
    const fail = (player, code, message) => reg.toPlayer(player, "error", { code, message });

    socket.on("kk:select_song", asHost(async (room, player, d) => {
      try {
        if (!allowSelect(room.code)) return fail(player, "rate_limited", "Trop de changements de chanson.");
        const st = getSt(room);
        if (st.started) return fail(player, "invalid", "Arrête la chanson en cours avant d'en choisir une autre.");
        const mode = d.mode === undefined ? "full" : d.mode;
        if (!MODES.includes(mode)) return fail(player, "invalid", "Mode invalide.");
        const song = sanitizeSong(d.song);
        if (!song) return fail(player, "invalid", "Chanson invalide.");
        const lines = parseLrc(song.syncedLyrics);
        if (lines.length < MIN_SYNCED_LINES) return fail(player, "no_sync", "Cette chanson n'a pas de paroles synchronisées.");
        const seq = ++st.selectSeq;
        const query = `${song.artist} ${song.title} ${mode === "instrumental" ? "instrumental" : "audio"}`;
        let ids = [];
        try { ids = await searchVideos(query, VIDEO_CANDIDATES, { ip: clientIp(socket) }); } catch { ids = []; }
        // Pendant la recherche : salle fermée, hôte changé, chanson lancée ou sélection plus récente → on abandonne.
        if (!alive(room) || st.selectSeq !== seq || st.started || room.hostPid !== player.pid) return;
        st.song = publicSong(song); // paroles brutes inutiles une fois les lignes extraites
        st.mode = mode;
        st.lines = lines;
        st.videoIds = (Array.isArray(ids) ? ids : []).filter((v) => typeof v === "string" && VIDEO_ID.test(v)).slice(0, VIDEO_CANDIDATES);
        st.endMs = Math.max((song.duration || 0) * 1000, lines[lines.length - 1].t + TAIL_MS);
        st.ended = false;
        st.clock = null;
        reg.toRoom(room, "song_selected", { song: publicSong(song), mode, lines, videoIds: st.videoIds, endMs: st.endMs });
      } catch (err) {
        console.error("kk:select_song :", clean(String(err && err.message), 200));
        fail(player, "invalid", "Chanson invalide.");
      }
    }));

    // Lancer ou recommencer : tout le monde repart du début après un compte à rebours.
    const start = control((room) => {
      const st = getSt(room);
      if (!st.song || !st.lines.length) return;
      st.started = true;
      st.ended = false;
      recordParticipation(room);
      setClock(room, { playing: true, baseMs: 0, baseAt: Date.now() + LEAD_MS }, "started");
    }, { notify: true });
    socket.on("kk:start", start);
    socket.on("kk:restart", start);

    socket.on("kk:pause", control((room) => {
      const st = getSt(room);
      if (!st.started || st.ended || !st.clock || !st.clock.playing) return;
      const now = Date.now();
      setClock(room, { playing: false, baseMs: Math.max(0, clockPos(st.clock, now)), baseAt: now });
    }));

    socket.on("kk:play", control((room) => {
      const st = getSt(room);
      if (!st.started || st.ended || !st.clock || st.clock.playing) return;
      setClock(room, { playing: true, baseMs: st.clock.baseMs, baseAt: Date.now() + RESUME_LEAD_MS });
    }));

    // Ligne suivante / précédente : l'horloge (donc la musique) saute à l'horaire de la ligne visée.
    socket.on("kk:advance", control((room, player, d) => {
      const st = getSt(room);
      if (!st.started || st.ended || !st.clock) return;
      if (d.direction !== "next" && d.direction !== "prev") return;
      const now = Date.now();
      let cur = lineAt(st.lines, clockPos(st.clock, now));
      // À une frontière de ligne, l'hôte peut voir la ligne voisine : on part de la sienne si l'écart est d'au plus 1.
      if (Number.isInteger(d.from) && d.from >= -1 && d.from < st.lines.length && Math.abs(d.from - cur) <= 1) cur = d.from;
      const target = d.direction === "next" ? cur + 1 : cur - 1;
      if (target >= st.lines.length) return;
      if (target < -1 || (target === -1 && cur === -1)) return;
      const baseMs = target === -1 ? 0 : st.lines[target].t;
      const playing = st.clock.playing;
      setClock(room, { playing, baseMs, baseAt: playing ? now + SEEK_LEAD_MS : now });
    }));

    // Fin de la chanson : retour au lobby (la salle n'est plus « en partie »).
    socket.on("kk:stop", control((room) => {
      const st = getSt(room);
      if (!st.started) return;
      st.started = false;
      st.ended = false;
      st.clock = null;
      clearEnd(st);
      reg.toRoom(room, "stopped", {});
    }, { notify: true }));

    // Synchro d'horloge : le client mesure l'aller-retour et le décalage avec l'heure serveur.
    socket.on("kk:time", (data, ack) => {
      if (typeof ack !== "function") return;
      if (!allowTime(socket.id)) return;
      const c = data && typeof data === "object" && Number.isFinite(data.c) ? data.c : 0;
      ack({ c, s: Date.now() });
    });
  }

  function onDisconnect(socket) {
    allowTime.delete(socket.id);
    reg.onSocketDisconnect(socket);
  }

  function dispose() {
    for (const room of reg._rooms.values()) clearEnd(getSt(room));
    reg.dispose();
  }

  return { register, onDisconnect, forgetUser: reg.forgetUser, dispose, reg };
}

module.exports = { createKaraoke, sanitizeSong, clockPos, lineAt };
