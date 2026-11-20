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

function createKaraoke(io) {
  const rooms = {};

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
    io.to(roomId).emit("karaoke_room_update", snapshot(room));
  }

  function register(socket) {
    socket.on("karaoke_join", (data) => {
      const roomId = clean(data?.roomId, 30);
      const username = clean(data?.username, 20);
      if (!roomId || !username) return;
      if (rooms[roomId]?.players.some((p) => p.id === socket.id)) return;

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

      socket.join(roomId);
      const room = rooms[roomId];
      room.players.push({ id: socket.id, username });

      socket.emit("karaoke_joined", { roomId, isHost: creating, ...snapshot(room) });
      io.to(roomId).emit("karaoke_room_update", snapshot(room));
    });

    socket.on("karaoke_select_song", (data) => {
      const room = rooms[data?.roomId];
      if (!room || room.host !== socket.id) return;
      const song = sanitizeSong(data.song);
      if (!song) return;
      room.song = song;
      room.currentLine = 0;
      room.started = false;
      io.to(data.roomId).emit("karaoke_song_selected", { song });
    });

    socket.on("karaoke_start", (roomId) => {
      const room = rooms[roomId];
      if (!room || room.host !== socket.id || !room.song) return;
      room.started = true;
      room.currentLine = 0;
      io.to(roomId).emit("karaoke_started", { currentLine: 0 });
    });

    socket.on("karaoke_advance", (data) => {
      const room = rooms[data?.roomId];
      if (!room || room.host !== socket.id) return;
      if (data.direction === "next") room.currentLine++;
      else if (data.direction === "prev" && room.currentLine > 0) room.currentLine--;
      io.to(data.roomId).emit("karaoke_line_changed", { currentLine: room.currentLine });
    });

    socket.on("karaoke_leave", (roomId) => {
      socket.leave(roomId);
      removePlayer(socket, roomId);
    });
  }

  function onDisconnect(socket) {
    for (const roomId of Object.keys(rooms)) removePlayer(socket, roomId);
  }

  return { register, onDisconnect, _rooms: rooms };
}

module.exports = { createKaraoke, sanitizeSong };
