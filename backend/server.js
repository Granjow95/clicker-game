const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://granjow.netlify.app",
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send("Backend is alive!");
});


const PORT = process.env.PORT || 3000;
const rooms = {};
const gameStates = {};
const votesState = {};
const lobbyOptions = {}; // { roomId: { rounds: 3, timer: 30 } }
const playerPoints = {}; // { roomId: { playerId: score } }
const roundCount = {}; // { roomId: currentRound }

function getRandomWordPair() {
  const pairs = [
    { normal: "chat", impostor: "chien" },
    { normal: "hôpital", impostor: "clinique" },
    { normal: "voiture", impostor: "camion" },
    { normal: "plage", impostor: "désert" },
    { normal: "piano", impostor: "guitare" },
    { normal: "forêt", impostor: "jungle" },
    { normal: "bibliothèque", impostor: "librairie" },
    { normal: "avion", impostor: "hélicoptère" },
    { normal: "stylo", impostor: "crayon" },
    { normal: "banane", impostor: "plantain" },
    { normal: "fromage", impostor: "yaourt" },
    { normal: "montagne", impostor: "colline" },
    { normal: "cuisine", impostor: "restaurant" },
    { normal: "ordinateur", impostor: "tablette" },
    { normal: "café", impostor: "thé" },
    { normal: "maison", impostor: "appartement" },
    { normal: "train", impostor: "tramway" },
    { normal: "mer", impostor: "lac" },
    { normal: "ballon", impostor: "balle" },
    { normal: "école", impostor: "université" },
  ];
  return pairs[Math.floor(Math.random() * pairs.length)];
}

function startRound(roomId) {
  const players = rooms[roomId];
  if (!players) return;

  const wordPair = getRandomWordPair();
  const impostorIndex = Math.floor(Math.random() * players.length);
  gameStates[roomId] = { turn: 0, hints: {}, impostorIndex, wordPair };

  const playerData = players.map((p) => ({ id: p.id, username: p.username }));

  players.forEach((player, index) => {
    const word = index === impostorIndex ? wordPair.impostor : wordPair.normal;
    io.to(player.id).emit("round_started", {
      word,
      players: playerData,
      impostorIndex,
      timer: lobbyOptions[roomId]?.timer || 60,
      round: roundCount[roomId],
      totalRounds: lobbyOptions[roomId].rounds,
    });
  });

  io.to(players[0].id).emit("next_turn", 0);
}

io.on("connection", (socket) => {
  console.log("✅ Un joueur s'est connecté :", socket.id);

  // ✅ Remplace les anciens create_room / join_room / check_room
  socket.on("join_or_create_room", ({ roomId, username }) => {
    if (!roomId || !username) return;
    socket.join(roomId);

    if (!rooms[roomId]) {
      // 🔧 Création
      rooms[roomId] = [{ id: socket.id, username }];
      lobbyOptions[roomId] = { rounds: 3, timer: 60 };
      roundCount[roomId] = 1;
      playerPoints[roomId] = {};

      socket.emit("room-created", {
        id: roomId,
        players: rooms[roomId],
        isCreator: true,
      });
    } else {
      // 👥 Rejoindre
      if (rooms[roomId].length >= 8) {
        socket.emit("error_message", "La salle est pleine (max 8 joueurs).");
        return;
      }
      rooms[roomId].push({ id: socket.id, username });
      socket.emit("room-created", {
        id: roomId,
        players: rooms[roomId],
        isCreator: false,
      });
    }

    io.to(roomId).emit("room_update", {
      id: roomId,
      players: rooms[roomId],
      options: lobbyOptions[roomId],
    });
  });

  socket.on("update_lobby_options", ({ roomId, options }) => {
    if (!lobbyOptions[roomId]) return;
    lobbyOptions[roomId] = options;

    io.to(roomId).emit("lobby_options_updated", {
      options: lobbyOptions[roomId],
    });
  });

  socket.on("vote", ({ roomId, voterId, votedId }) => {
    if (!votesState[roomId]) votesState[roomId] = {};
    votesState[roomId][voterId] = votedId;

    const totalVotes = Object.keys(votesState[roomId]).length;
    const totalPlayers = rooms[roomId]?.length || 0;

    if (totalVotes === totalPlayers) {
      const impostorIndex = gameStates[roomId]?.impostorIndex;
      const impostorId = rooms[roomId][impostorIndex]?.id;
      const votedCounts = {};

      Object.values(votesState[roomId]).forEach((v) => {
        votedCounts[v] = (votedCounts[v] || 0) + 1;
      });

      const mostVoted = Object.entries(votedCounts).sort(
        (a, b) => b[1] - a[1]
      )[0][0];

      for (const voter in votesState[roomId]) {
        const voted = votesState[roomId][voter];
        if (!playerPoints[roomId][voter]) playerPoints[roomId][voter] = 0;
        if (voted === impostorId) {
          playerPoints[roomId][voter] += 100;
        }
      }

      if (mostVoted !== impostorId) {
        if (!playerPoints[roomId][impostorId])
          playerPoints[roomId][impostorId] = 0;
        playerPoints[roomId][impostorId] += 100;
      }

      io.to(roomId).emit("reveal_results", {
        votes: votesState[roomId],
        impostorIndex,
        hints: gameStates[roomId]?.hints,
        players: rooms[roomId],
        wordPair: gameStates[roomId]?.wordPair,
        points: playerPoints[roomId],
        scores: playerPoints[roomId],
        isLastRound: roundCount[roomId] >= lobbyOptions[roomId].rounds,
        round: roundCount[roomId],
        totalRounds: lobbyOptions[roomId].rounds,
      });

      delete votesState[roomId];
    }
  });

  socket.on("submit_hint", ({ roomId, playerId, hint }) => {
    const room = rooms[roomId];
    if (!room || !gameStates[roomId]) return;

    const turn = gameStates[roomId].turn;
    if (!gameStates[roomId].hints[turn]) gameStates[roomId].hints[turn] = [];

    const currentHints = gameStates[roomId].hints[turn];
    const expectedIndex = currentHints.length;
    const expectedPlayer = room[expectedIndex];

    if (!expectedPlayer || expectedPlayer.id !== playerId) return;

    currentHints.push({ playerId, hint });
    io.to(roomId).emit("hint_submitted", { playerId, hint, players: room });

    if (currentHints.length < room.length) {
      const nextPlayer = room[currentHints.length];
      setTimeout(() => {
        io.to(nextPlayer.id).emit("next_turn", currentHints.length);
      }, 500);
    } else {
      gameStates[roomId].turn++;
      const nextTurn = gameStates[roomId].turn;
      gameStates[roomId].hints[nextTurn] = [];

      setTimeout(() => {
        io.to(room[0].id).emit("next_turn", 0);
      }, 500);
    }
  });

  socket.on("force_vote", (roomId) => {
    io.to(roomId).emit("all_hints_done");
  });

  socket.on("start_next_round", (roomId) => {
    if (!roundCount[roomId] || !lobbyOptions[roomId]) return;
    roundCount[roomId]++;
    if (roundCount[roomId] > lobbyOptions[roomId].rounds) {
      const ranking = Object.entries(playerPoints[roomId])
        .map(([id, score]) => {
          const player = rooms[roomId].find((p) => p.id === id);
          return { username: player?.username || "inconnu", score };
        })
        .sort((a, b) => b.score - a.score);

      io.to(roomId).emit("game_over", ranking);
    } else {
      startRound(roomId);
    }
  });

  socket.on("start_round", (roomId) => {
    roundCount[roomId] = 1;
    playerPoints[roomId] = {};
    startRound(roomId);
  });

  socket.on("leave_room", (roomId) => {
    socket.leave(roomId);
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter((p) => p.id !== socket.id);
      io.to(roomId).emit("room_update", {
        id: roomId,
        players: rooms[roomId],
        options: lobbyOptions[roomId],
      });

      // Supprimer la room si vide
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
        delete gameStates[roomId];
        delete votesState[roomId];
        delete lobbyOptions[roomId];
        delete playerPoints[roomId];
        delete roundCount[roomId];
      }
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const before = rooms[roomId].length;
      rooms[roomId] = rooms[roomId].filter((p) => p.id !== socket.id);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
        delete gameStates[roomId];
        delete votesState[roomId];
        delete lobbyOptions[roomId];
        delete playerPoints[roomId];
        delete roundCount[roomId];
      } else if (rooms[roomId].length !== before) {
        io.to(roomId).emit("room_update", {
          id: roomId,
          players: rooms[roomId],
          options: lobbyOptions[roomId],
        });
      }
    }
    console.log("❌ Un joueur s'est déconnecté :", socket.id);
  });
});


server.listen(PORT, () => {
  console.log(`🚀 Serveur WebSocket lancé sur http://localhost:${PORT}`);
});
