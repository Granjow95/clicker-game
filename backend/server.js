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

// ── Recherche audio YouTube (pour le karaoké) ──
// Autorise les requêtes du front et renvoie l'ID de la première vidéo trouvée.
app.get("/yt-search", async (req, res) => {
  // Recherche publique sans authentification → CORS ouvert (aucun cookie/credential)
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET");

  const q = (req.query.q || "").toString().slice(0, 200).trim();
  if (!q) return res.json({ videoId: null });

  try {
    // sp=EgIQAQ%3D%3D → filtre « Vidéos » uniquement (exclut chaînes / playlists)
    const url = "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(q) + "&sp=EgIQAQ%253D%253D";
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await r.text();
    // On renvoie plusieurs candidats : certaines vidéos refusent l'intégration (erreur 101/150),
    // le front essaiera la suivante jusqu'à en trouver une lisible.
    const ids = [];
    const re = /"videoId":"([\w-]{11})"/g;
    let m;
    while ((m = re.exec(html)) !== null && ids.length < 10) {
      if (!ids.includes(m[1])) ids.push(m[1]);
    }
    return res.json({ videoIds: ids, videoId: ids[0] || null });
  } catch (e) {
    console.error("yt-search error:", e.message);
    return res.json({ videoIds: [], videoId: null });
  }
});


const PORT = process.env.PORT || 3000;
const rooms = {};
const gameStates = {};
const votesState = {};
const lobbyOptions = {};
const playerPoints = {};
const roundCount = {};

// ── Karaoké rooms ──
const karaokeRooms = {};

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

  socket.on("join_or_create_room", ({ roomId, username }) => {
    if (!roomId || !username) return;
    socket.join(roomId);

    if (!rooms[roomId]) {
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

  // ── Karaoké events ──

  socket.on("karaoke_join", ({ roomId, username }) => {
    if (!roomId || !username) return;
    socket.join(roomId);

    const creating = !karaokeRooms[roomId];
    if (creating) {
      karaokeRooms[roomId] = { host: socket.id, players: [], song: null, currentLine: 0, started: false };
    } else if (karaokeRooms[roomId].players.length >= 10) {
      socket.emit("karaoke_error", "Salle pleine (max 10 joueurs).");
      return;
    }

    karaokeRooms[roomId].players.push({ id: socket.id, username });
    const room = karaokeRooms[roomId];

    socket.emit("karaoke_joined", {
      roomId,
      players: room.players,
      host: room.host,
      isHost: creating,
      song: room.song,
      currentLine: room.currentLine,
      started: room.started,
    });

    io.to(roomId).emit("karaoke_room_update", {
      players: room.players,
      host: room.host,
      song: room.song,
      currentLine: room.currentLine,
      started: room.started,
    });
  });

  socket.on("karaoke_select_song", ({ roomId, song }) => {
    const room = karaokeRooms[roomId];
    if (!room || room.host !== socket.id) return;
    room.song = song;
    room.currentLine = 0;
    room.started = false;
    io.to(roomId).emit("karaoke_song_selected", { song });
  });

  socket.on("karaoke_start", (roomId) => {
    const room = karaokeRooms[roomId];
    if (!room || room.host !== socket.id || !room.song) return;
    room.started = true;
    room.currentLine = 0;
    io.to(roomId).emit("karaoke_started", { currentLine: 0 });
  });

  socket.on("karaoke_advance", ({ roomId, direction }) => {
    const room = karaokeRooms[roomId];
    if (!room || room.host !== socket.id) return;
    if (direction === "next") room.currentLine++;
    else if (direction === "prev" && room.currentLine > 0) room.currentLine--;
    io.to(roomId).emit("karaoke_line_changed", { currentLine: room.currentLine });
  });

  socket.on("karaoke_leave", (roomId) => {
    socket.leave(roomId);
    const room = karaokeRooms[roomId];
    if (!room) return;
    room.players = room.players.filter((p) => p.id !== socket.id);
    if (room.players.length === 0) { delete karaokeRooms[roomId]; return; }
    if (room.host === socket.id) room.host = room.players[0].id;
    io.to(roomId).emit("karaoke_room_update", {
      players: room.players, host: room.host,
      song: room.song, currentLine: room.currentLine, started: room.started,
    });
  });

  socket.on("disconnect", () => {
    // Impostor cleanup
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
    // Karaoké cleanup
    for (const roomId in karaokeRooms) {
      const room = karaokeRooms[roomId];
      const before = room.players.length;
      room.players = room.players.filter((p) => p.id !== socket.id);
      if (room.players.length === 0) { delete karaokeRooms[roomId]; }
      else if (room.players.length !== before) {
        if (room.host === socket.id) room.host = room.players[0].id;
        io.to(roomId).emit("karaoke_room_update", {
          players: room.players, host: room.host,
          song: room.song, currentLine: room.currentLine, started: room.started,
        });
      }
    }
    console.log("❌ Un joueur s'est déconnecté :", socket.id);
  });
});


server.listen(PORT, () => {
  console.log(`🚀 Serveur WebSocket lancé sur http://localhost:${PORT}`);
});
