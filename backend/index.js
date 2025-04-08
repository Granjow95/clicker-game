const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // à restreindre en prod
  },
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("🟢 Nouveau client connecté :", socket.id);

  socket.on("create-room", (roomId) => {
    if (rooms[roomId]) {
      socket.emit("error", "Room déjà existante.");
      return;
    }
  
    rooms[roomId] = {
      players: [{ id: socket.id, username: null }],
      creator: socket.id,
    };
  
    socket.join(roomId);
    socket.emit("room-created", { roomId, players: rooms[roomId].players });
    console.log(`🆕 Room ${roomId} créée par ${socket.id}`);
  });
  

    socket.emit("room-created", { roomId, players: rooms[roomId].players });
    console.log(`🆕 Room ${roomId} créée par ${socket.id}`);
  });

  socket.on("set-username", ({ roomId, username }) => {
    const room = rooms[roomId];
    if (room) {
      const player = room.players.find((p) => p.id === socket.id);
      if (player) {
        player.username = username;
        io.to(roomId).emit("room-updated", room.players);
      }
    }
  });

  socket.on("join-room", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].players.push({ id: socket.id, username: null });
      socket.join(roomId);
      io.to(roomId).emit("room-updated", rooms[roomId].players);
      console.log(`➕ ${socket.id} a rejoint la room ${roomId}`);
    } else {
      socket.emit("error", "Room non trouvée");
    }
  });

  socket.on("send-hint", ({ roomId, playerName, hint }) => {
    io.to(roomId).emit("receive-hint", { playerName, hint });
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client déconnecté :", socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter((p) => p.id !== socket.id);
  
      if (room.players.length === 0) {
        delete rooms[roomId];
        console.log(`🗑️ Room ${roomId} supprimée car vide`);
      } else {
        io.to(roomId).emit("room-updated", room.players);
      }
    }
  });
  

server.listen(3000, () => {
  console.log("✅ Serveur Socket.io prêt sur le port 3000");
});
