const crypto = require("crypto");
const { clean, createKeyedLimiter, clientIp, normalizeCode } = require("./util");
const {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RESUME_GRACE_MS,
  MAX_ROOMS,
  ROOM_IP_ACTIONS_PER_MIN,
  ROOM_IP_MAX_ROOMS,
} = require("../config");

const MAX_CODE_TRIES = 50;

// Limiteur par IP partagé par tous les registres de jeux (create/join/resume, tous jeux confondus).
const sharedIpLimiter = createKeyedLimiter({ max: ROOM_IP_ACTIONS_PER_MIN, windowMs: 60 * 1000 });

const ERRORS = {
  bad_code: "Code invalide : 4 lettres attendues.",
  room_not_found: "Aucune salle avec ce code. Vérifie-le ou crée une salle.",
  room_full: "La salle est pleine.",
  server_full: "Le serveur est plein, réessaie plus tard.",
  game_in_progress: "Une partie est en cours dans cette salle.",
  resume_failed: "Impossible de reprendre la partie.",
  rate_limited: "Trop de tentatives, patiente un instant.",
  invalid: "Requête invalide.",
};

const sha256 = (s) => crypto.createHash("sha256").update(s).digest();

function generateCode(taken) {
  for (let i = 0; i < MAX_CODE_TRIES; i++) {
    let code = "";
    for (let j = 0; j < ROOM_CODE_LENGTH; j++) code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    if (!taken.has(code)) return code;
  }
  return null;
}

function hidden(obj, name, value) {
  Object.defineProperty(obj, name, { value, enumerable: false, writable: true, configurable: true });
}

// Registre de salles générique (ADR 0003 §2-§5). Ne connaît aucune règle de jeu : le jeu fournit des crochets.
function createRoomRegistry(io, opts = {}) {
  const {
    prefix,
    maxPlayers = 8,
    graceMs = RESUME_GRACE_MS,
    maxRooms = MAX_ROOMS,
    ipLimiter = sharedIpLimiter,
    maxRoomsPerIp = ROOM_IP_MAX_ROOMS,
    inGame = () => false,
    canJoin = () => null,
    canAttach = () => null, // (socket, room, kind) -> code d'erreur ou null (join/resume)
    snapshotFor = () => ({}),
    onJoin = () => {},
    onDisconnect = () => {},
    onResume = () => {},
    onRemove = () => {},
    onHostChange = () => {},
    onEmpty = () => {},
  } = opts;
  if (!prefix || typeof prefix !== "string") throw new Error("createRoomRegistry: prefix requis");

  const rooms = new Map(); // code -> room (Map : insensible à __proto__)
  const allowAuth = createKeyedLimiter({ max: 10, windowMs: 60 * 1000 });
  const channel = (room) => `${prefix}:${room.code}`;
  const evName = (ev) => (ev.includes(":") ? ev : `${prefix}:${ev}`);

  // ── Aides publiques ──
  function bySocket(socket) {
    const code = socket.data && socket.data.rooms && socket.data.rooms[prefix];
    if (!code) return null;
    const room = rooms.get(code);
    if (!room) return null;
    const player = room.players.find((p) => p.socketId === socket.id && p.connected);
    return player ? { room, player } : null;
  }
  const connected = (room) => room.players.filter((p) => p.connected);
  const hostOf = (room) => room.players.find((p) => p.pid === room.hostPid) || null;
  const toPlayer = (player, ev, data) => {
    if (player.connected && player.socketId) io.to(player.socketId).emit(evName(ev), data);
  };
  const toRoom = (room, ev, data) => io.to(channel(room)).emit(evName(ev), data);

  const publicPlayers = (room) => room.players.map((p) => ({ id: p.pid, username: p.username, connected: p.connected }));
  const roomPayload = (room) => ({ code: room.code, hostId: room.hostPid, players: publicPlayers(room) });
  const emitRoom = (room) => toRoom(room, "room", roomPayload(room));
  const sendError = (socket, code, message) => socket.emit(`${prefix}:error`, { code, message: message || ERRORS[code] || ERRORS.invalid });

  function clearGrace(player) {
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = null;
  }

  function detachSocket(player) {
    const s = player.socketId && io.sockets.sockets.get(player.socketId);
    if (s) {
      s.leave(`${prefix}:${s.data.rooms && s.data.rooms[prefix]}`);
      if (s.data.rooms) delete s.data.rooms[prefix];
    }
  }

  // Garantit un hôte connecté quand c'est possible (ordre d'arrivée). Pas de bascule inverse.
  function ensureHost(room) {
    const host = hostOf(room);
    if (host && host.connected) return;
    const next = connected(room)[0];
    if (!next || next === host) return;
    room.hostPid = next.pid;
    onHostChange(room, next);
  }

  function removePlayer(room, player, reason) {
    const i = room.players.indexOf(player);
    if (i === -1) return;
    clearGrace(player);
    if (player.connected) detachSocket(player);
    room.players.splice(i, 1);
    player.connected = false;
    if (room.players.length === 0) {
      rooms.delete(room.code);
      onRemove(room, player, reason);
      onEmpty(room);
      return;
    }
    if (room.hostPid === player.pid) {
      const next = connected(room)[0] || room.players[0];
      room.hostPid = next.pid;
      onRemove(room, player, reason);
      onHostChange(room, next);
    } else {
      onRemove(room, player, reason);
    }
    emitRoom(room);
  }

  function markDisconnected(room, player) {
    if (!player.connected) return;
    detachSocket(player);
    player.connected = false;
    player.socketId = null;
    clearGrace(player);
    const timer = setTimeout(() => {
      player.graceTimer = null;
      if (rooms.get(room.code) === room && !player.connected) removePlayer(room, player, "expired");
    }, graceMs);
    timer.unref();
    player.graceTimer = timer;
    ensureHost(room);
    onDisconnect(room, player);
    emitRoom(room);
  }

  function newToken(player) {
    const token = crypto.randomBytes(32).toString("base64url");
    hidden(player, "tokenHash", sha256(token));
    return token;
  }

  function attach(socket, room, player) {
    player.connected = true;
    player.socketId = socket.id;
    socket.data.rooms = socket.data.rooms || Object.create(null);
    socket.data.rooms[prefix] = room.code;
    socket.join(channel(room));
    const token = newToken(player);
    return token;
  }

  function sendJoined(socket, room, player, token, resumed) {
    socket.emit(`${prefix}:joined`, {
      code: room.code,
      you: player.pid,
      token,
      hostId: room.hostPid,
      players: publicPlayers(room),
      resumed,
      state: snapshotFor(room, player) || {},
    });
  }

  // Un socket = une salle par jeu : quitter la précédente (départ définitif).
  function leaveCurrent(socket) {
    const cur = bySocket(socket);
    if (cur) removePlayer(cur.room, cur.player, "left");
    else if (socket.data.rooms) delete socket.data.rooms[prefix];
  }

  function newPlayer(socket, username) {
    const player = { pid: crypto.randomBytes(9).toString("base64url"), username, connected: false, socketId: null };
    hidden(player, "userId", socket.data.userId || null);
    hidden(player, "tokenHash", null);
    hidden(player, "graceTimer", null);
    return player;
  }

  function register(socket) {
    const guard = (data) => {
      if (!allowAuth(socket.id) || !ipLimiter(clientIp(socket))) {
        sendError(socket, "rate_limited");
        return null;
      }
      return data && typeof data === "object" ? data : {};
    };

    socket.on(`${prefix}:create`, (data) => {
      const d = guard(data);
      if (!d) return;
      const username = clean(d.username, 20);
      if (!username) return sendError(socket, "invalid", "Pseudo requis.");
      if (rooms.size >= maxRooms) return sendError(socket, "server_full");
      const ip = clientIp(socket);
      let mine = 0;
      for (const r of rooms.values()) if (r.creatorIp === ip && !(r.players.length === 1 && r.players[0].socketId === socket.id)) mine++;
      if (mine >= maxRoomsPerIp) return sendError(socket, "rate_limited");
      const code = generateCode(rooms);
      if (!code) return sendError(socket, "server_full");
      leaveCurrent(socket);
      const room = { code, players: [], hostPid: null, state: Object.create(null), createdAt: Date.now() };
      hidden(room, "creatorIp", ip);
      const player = newPlayer(socket, username);
      room.players.push(player);
      room.hostPid = player.pid;
      rooms.set(code, room);
      const token = attach(socket, room, player);
      sendJoined(socket, room, player, token, false);
      emitRoom(room);
      onJoin(room, player);
    });

    socket.on(`${prefix}:join`, (data) => {
      const d = guard(data);
      if (!d) return;
      const code = normalizeCode(d.code);
      if (!code) return sendError(socket, "bad_code");
      const username = clean(d.username, 20);
      if (!username) return sendError(socket, "invalid", "Pseudo requis.");
      const room = rooms.get(code);
      if (!room) return sendError(socket, "room_not_found");
      const current = bySocket(socket);
      const already = current && current.room === room;
      if (!already) {
        if (room.players.length >= maxPlayers) return sendError(socket, "room_full");
        const refusal = canJoin(room);
        if (refusal) return sendError(socket, refusal.code || "game_in_progress", refusal.message);
      }
      const denied = canAttach(socket, room, "join");
      if (denied) return sendError(socket, denied);
      if (already) {
        // Déjà joueur de cette salle : simple renvoi du snapshot (ni départ ni nouvelle entrée).
        const token = attach(socket, room, current.player);
        sendJoined(socket, room, current.player, token, false);
        return;
      }
      leaveCurrent(socket);
      // leaveCurrent peut avoir supprimé la salle (dernier joueur) : on revérifie.
      if (rooms.get(code) !== room) return sendError(socket, "room_not_found");
      const player = newPlayer(socket, username);
      room.players.push(player);
      const token = attach(socket, room, player);
      ensureHost(room);
      sendJoined(socket, room, player, token, false);
      emitRoom(room);
      onJoin(room, player);
    });

    socket.on(`${prefix}:resume`, (data) => {
      const d = guard(data);
      if (!d) return;
      const fail = () => sendError(socket, "resume_failed");
      const code = normalizeCode(d.code);
      const token = clean(d.token, 64);
      if (!code || !token) return fail();
      const room = rooms.get(code);
      if (!room) return fail();
      const hash = sha256(token);
      let player = null;
      for (const p of room.players) {
        if (p.tokenHash && crypto.timingSafeEqual(p.tokenHash, hash) && !player) player = p;
      }
      if (!player) return fail();
      // Une salle reprise avec un autre compte (ou en s'élevant d'invité à compte) est refusée.
      if (player.userId && player.userId !== socket.data.userId) return fail();
      const denied = canAttach(socket, room, "resume");
      if (denied) return sendError(socket, denied);

      const current = bySocket(socket);
      if (current && current.player !== player) leaveCurrent(socket);
      if (rooms.get(code) !== room) return fail();

      // Ancien socket encore marqué connecté : il est remplacé.
      if (player.connected && player.socketId !== socket.id) {
        const old = io.sockets.sockets.get(player.socketId);
        if (old) {
          old.emit(`${prefix}:replaced`, {});
          old.leave(channel(room));
          if (old.data.rooms) delete old.data.rooms[prefix];
        }
      }
      clearGrace(player);
      const wasConnected = player.connected && player.socketId === socket.id;
      const newTok = attach(socket, room, player);
      ensureHost(room);
      sendJoined(socket, room, player, newTok, true);
      if (!wasConnected) emitRoom(room);
      onResume(room, player);
    });

    socket.on(`${prefix}:leave`, (data) => {
      const cur = bySocket(socket);
      if (!cur) return;
      const forfeit = !!(data && typeof data === "object" && data.forfeit === true);
      if (!forfeit && inGame(cur.room)) markDisconnected(cur.room, cur.player);
      else removePlayer(cur.room, cur.player, forfeit ? "forfeit" : "left");
    });
  }

  function onSocketDisconnect(socket) {
    allowAuth.delete(socket.id);
    // socket.data.rooms existe encore à ce stade ; bySocket exige player.connected.
    const cur = bySocket(socket);
    if (!cur) return;
    if (inGame(cur.room)) markDisconnected(cur.room, cur.player);
    else removePlayer(cur.room, cur.player, "left");
  }

  function forgetUser(uid) {
    for (const room of rooms.values()) for (const p of room.players) if (p.userId === uid) p.userId = null;
  }

  function dispose() {
    for (const room of rooms.values()) for (const p of room.players) clearGrace(p);
    rooms.clear();
  }

  return {
    register,
    onSocketDisconnect,
    bySocket,
    hostOf,
    connected,
    toPlayer,
    toRoom,
    forgetUser,
    dispose,
    _rooms: rooms,
  };
}

module.exports = { createRoomRegistry, sharedIpLimiter };
