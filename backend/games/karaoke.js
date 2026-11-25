const { createRoomRegistry } = require("../lib/rooms");
const { clean, clampInt } = require("../lib/util");
const { hasDistinctAccounts } = require("../lib/results");
const { MAX_KARAOKE_PLAYERS } = require("../config");

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const COVER_HOSTS = ["dzcdn.net", "mzstatic.com"];

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

const MAX_LINE = 5000;
const PARTICIPATION_GAP_MS = 60000;

// opts (tests) : { graceMs, ipLimiter, maxRoomsPerIp }
function createKaraoke(io, results = { record() {} }, opts = {}) {
  let reg;
  const allowSelect = createKeyedLimiterBurst(opts.selectIntervalMs ?? 2000, 2);

  const getSt = (room) => {
    const st = room.state;
    if (st.song === undefined) {
      st.song = null;
      st.currentLine = 0;
      st.started = false;
      st.lastRecorded = 0;
    }
    return st;
  };

  const inGame = (room) => getSt(room).started;

  // État de reprise : chanson, ligne courante, lecture en cours, heure serveur pour resynchroniser.
  function snapshotFor(room) {
    const st = getSt(room);
    return { song: st.song, started: st.started, currentLine: st.currentLine, serverTime: Date.now() };
  }

  reg = createRoomRegistry(io, {
    prefix: "kk",
    ipLimiter: opts.ipLimiter,
    maxRoomsPerIp: opts.maxRoomsPerIp,
    maxPlayers: MAX_KARAOKE_PLAYERS,
    graceMs: opts.graceMs,
    inGame,
    snapshotFor,
  });

  function register(socket) {
    reg.register(socket);

    const asHost = (handler) => (data) => {
      const cur = reg.bySocket(socket);
      if (!cur) return;
      if (cur.room.hostPid !== cur.player.pid) {
        return reg.toPlayer(cur.player, "error", { code: "not_host", message: "Réservé à l'hôte." });
      }
      handler(cur.room, cur.player, data && typeof data === "object" ? data : {});
    };

    socket.on("kk:select_song", asHost((room, player, d) => {
      if (!allowSelect(room.code)) return reg.toPlayer(player, "error", { code: "rate_limited", message: "Trop de changements de chanson." });
      const song = sanitizeSong(d.song);
      if (!song) return reg.toPlayer(player, "error", { code: "invalid", message: "Chanson invalide." });
      const st = getSt(room);
      st.song = song;
      st.currentLine = 0;
      st.started = false;
      reg.toRoom(room, "song_selected", { song });
    }));

    socket.on("kk:start", asHost((room) => {
      const st = getSt(room);
      if (!st.song) return;
      st.started = true;
      st.currentLine = 0;
      // Participation enregistrée au plus une fois par minute et par salle (anti-spam).
      if (Date.now() - st.lastRecorded > PARTICIPATION_GAP_MS) {
        st.lastRecorded = Date.now();
        const seen = new Set();
        const online = room.players.filter((p) => p.connected);
        for (const p of hasDistinctAccounts(online) ? online : []) {
          if (!p.userId || seen.has(p.userId)) continue;
          seen.add(p.userId);
          results.record({ userId: p.userId, game: "karaoke", score: 0, won: false, rounds: 1, meta: { participation: true } });
        }
      }
      reg.toRoom(room, "started", { currentLine: 0 });
    }));

    socket.on("kk:advance", asHost((room, player, d) => {
      const st = getSt(room);
      if (!st.started) return;
      if (d.direction === "next" && st.currentLine < MAX_LINE) st.currentLine++;
      else if (d.direction === "prev" && st.currentLine > 0) st.currentLine--;
      reg.toRoom(room, "line_changed", { currentLine: st.currentLine });
    }));

    // Fin de la chanson : retour au lobby (la salle n'est plus « en partie »).
    socket.on("kk:stop", asHost((room) => {
      const st = getSt(room);
      if (!st.started) return;
      st.started = false;
      st.currentLine = 0;
      reg.toRoom(room, "stopped", {});
    }));
  }

  return {
    register,
    onDisconnect: reg.onSocketDisconnect,
    forgetUser: reg.forgetUser,
    dispose: reg.dispose,
    reg,
  };
}

module.exports = { createKaraoke, sanitizeSong };
