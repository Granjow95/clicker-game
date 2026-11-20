const { clean } = require("../lib/util");
const { MAX_ROOMS, MAX_KARAOKE_PLAYERS } = require("../config");

// Ne garde que les champs attendus de la chanson, avec des longueurs bornées.
function sanitizeSong(song) {
  if (!song || typeof song !== "object") return null;
  const title = clean(song.title, 150);
  const artist = clean(song.artist, 150);
  if (!title || !artist) return null;
  const out = { title, artist };
  if (typeof song.lyrics === "string") out.lyrics = song.lyrics.slice(0, 30000);
  if (typeof song.syncedLyrics === "string") out.syncedLyrics = song.syncedLyrics.slice(0, 60000);
  if (typeof song.cover === "string" && /^https?:\/\//.test(song.cover)) out.cover = song.cover.slice(0, 500);
  if (Number.isFinite(song.duration)) out.duration = song.duration;
  if (Number.isFinite(song.year)) out.year = song.year;
  return out;
}

const ns = (roomId) => `kk:${roomId}`;
const cid = (v) => clean(v, 30);
const MAX_LINE = 5000;

function createKaraoke(io, results = { record() {} }) {
  const rooms = Object.create(null); // sans prototype : « constructor » est un nom de salle valide

  const snapshot = (room) => ({
    players: room.players,
    host: room.host,
    song: room.song,
    currentLine: room.currentLine,
    started: room.started,
  });

  function removePlayer(socket, roomId) {
    const room = rooms[roomId];
    if (!room) return;
    const before = room.players.length;
    room.players = room.players.filter((p) => p.id !== socket.id);
    if (room.players.length === 0) { delete rooms[roomId]; return; }
    if (room.players.length === before) return;
    if (room.host === socket.id) room.host = room.players[0].id;
    io.to(ns(roomId)).emit("karaoke_room_update", snapshot(room));
  }

  function leaveRoom(socket) {
    const roomId = socket.data.kkRoom;
    if (!roomId) return;
    socket.data.kkRoom = undefined;
    socket.leave(ns(roomId));
    removePlayer(socket, roomId);
  }

  function register(socket) {
    socket.on("karaoke_join", (data) => {
      const roomId = cid(data?.roomId);
      const username = clean(data?.username, 20);
      if (!roomId || !username) return;
      if (socket.data.kkRoom === roomId && rooms[roomId]?.players.some((p) => p.id === socket.id)) return;
      leaveRoom(socket); // un socket = une salle à la fois

      const creating = !rooms[roomId];
      if (creating) {
        if (Object.keys(rooms).length >= MAX_ROOMS) {
          socket.emit("karaoke_error", "Serveur plein, réessaie plus tard.");
          return;
        }
        rooms[roomId] = { host: socket.id, players: [], song: null, currentLine: 0, started: false };
      } else if (rooms[roomId].players.length >= MAX_KARAOKE_PLAYERS) {
        socket.emit("karaoke_error", "Salle pleine (max 10 joueurs).");
        return;
      }

      socket.join(ns(roomId));
      socket.data.kkRoom = roomId;
      const room = rooms[roomId];
      const player = { id: socket.id, username };
      Object.defineProperty(player, "userId", { value: socket.data.userId || null, enumerable: false, writable: true });
      room.players.push(player);

      socket.emit("karaoke_joined", { roomId, isHost: creating, ...snapshot(room) });
      io.to(ns(roomId)).emit("karaoke_room_update", snapshot(room));
    });

    socket.on("karaoke_select_song", (data) => {
      const roomId = cid(data?.roomId);
      const room = rooms[roomId];
      if (!room || room.host !== socket.id) return;
      const song = sanitizeSong(data.song);
      if (!song) {
        socket.emit("karaoke_error", "Chanson invalide.");
        return;
      }
      room.song = song;
      room.currentLine = 0;
      room.started = false;
      io.to(ns(roomId)).emit("karaoke_song_selected", { song });
    });

    socket.on("karaoke_start", (rawRoomId) => {
      const roomId = cid(rawRoomId);
      const room = rooms[roomId];
      if (!room || room.host !== socket.id || !room.song) return;
      room.started = true;
      room.currentLine = 0;
      // Participation enregistrée au plus une fois par minute et par salle (anti-spam de lignes).
      if (!room.lastRecorded || Date.now() - room.lastRecorded > 60000) {
        room.lastRecorded = Date.now();
        const seen = new Set();
        room.players.forEach((p) => {
          if (!p.userId || seen.has(p.userId)) return;
          seen.add(p.userId);
          results.record({ userId: p.userId, game: "karaoke", score: 0, won: false, rounds: 1, meta: { participation: true } });
        });
      }
      io.to(ns(roomId)).emit("karaoke_started", { currentLine: 0 });
    });

    socket.on("karaoke_advance", (data) => {
      const roomId = cid(data?.roomId);
      const room = rooms[roomId];
      if (!room || room.host !== socket.id) return;
      if (data.direction === "next" && room.currentLine < MAX_LINE) room.currentLine++;
      else if (data.direction === "prev" && room.currentLine > 0) room.currentLine--;
      io.to(ns(roomId)).emit("karaoke_line_changed", { currentLine: room.currentLine });
    });

    socket.on("karaoke_leave", () => leaveRoom(socket));
  }

  function onDisconnect(socket) {
    leaveRoom(socket);
  }

  function forgetUser(uid) {
    for (const id in rooms) for (const p of rooms[id].players) if (p.userId === uid) p.userId = null;
  }

  return { register, onDisconnect, forgetUser, _rooms: rooms };
}

module.exports = { createKaraoke, sanitizeSong };
