const crypto = require("crypto");
const { clean, clampInt } = require("../lib/util");
const { MAX_ROOMS, MAX_IMPOSTEUR_PLAYERS } = require("../config");

const WORD_PAIRS = [
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

// ── Logique pure (testable sans serveur) ──

function randomInt(max) {
  return crypto.randomInt(max);
}

function pickWordPair(rand = randomInt) {
  return WORD_PAIRS[rand(WORD_PAIRS.length)];
}

function sanitizeOptions(options) {
  return {
    rounds: clampInt(options?.rounds, 1, 10, 3),
    timer: clampInt(options?.timer, 10, 300, 60),
  };
}

// Calcule les points d'une manche. `votes` : { voterId: votedId }. Modifie `points`.
function scoreVotes(votes, impostorId, points) {
  const counts = {};
  Object.values(votes).forEach((v) => {
    counts[v] = (counts[v] || 0) + 1;
  });
  const mostVoted = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];

  for (const voter in votes) {
    if (!points[voter]) points[voter] = 0;
    if (votes[voter] === impostorId) points[voter] += 100;
  }
  if (mostVoted !== impostorId) {
    points[impostorId] = (points[impostorId] || 0) + 100;
  }
  return { mostVoted, points };
}

function buildRanking(points, players) {
  return Object.entries(points)
    .map(([id, score]) => {
      const player = players.find((p) => p.id === id);
      return { username: player?.username || "inconnu", score };
    })
    .sort((a, b) => b.score - a.score);
}

// ── Câblage Socket.io ──

function createImposteur(io) {
  const rooms = {};
  const gameStates = {};
  const votesState = {};
  const lobbyOptions = {};
  const playerPoints = {};
  const roundCount = {};

  const isHost = (roomId, socket) => rooms[roomId]?.[0]?.id === socket.id;
  const isMember = (roomId, socket) => !!rooms[roomId]?.some((p) => p.id === socket.id);

  function deleteRoom(roomId) {
    delete rooms[roomId];
    delete gameStates[roomId];
    delete votesState[roomId];
    delete lobbyOptions[roomId];
    delete playerPoints[roomId];
    delete roundCount[roomId];
  }

  function roomUpdate(roomId) {
    io.to(roomId).emit("room_update", {
      id: roomId,
      players: rooms[roomId],
      options: lobbyOptions[roomId],
    });
  }

  function startRound(roomId) {
    const players = rooms[roomId];
    if (!players || players.length === 0) return;

    const wordPair = pickWordPair();
    const impostorIndex = randomInt(players.length);
    gameStates[roomId] = { turn: 0, hints: {}, impostorIndex, wordPair };
    delete votesState[roomId];

    const playerData = players.map((p) => ({ id: p.id, username: p.username }));
    players.forEach((player, index) => {
      io.to(player.id).emit("round_started", {
        word: index === impostorIndex ? wordPair.impostor : wordPair.normal,
        players: playerData,
        impostorIndex,
        timer: lobbyOptions[roomId].timer,
        round: roundCount[roomId],
        totalRounds: lobbyOptions[roomId].rounds,
      });
    });
    io.to(players[0].id).emit("next_turn", 0);
  }

  function register(socket) {
    socket.on("join_or_create_room", (data) => {
      const roomId = clean(data?.roomId, 30);
      const username = clean(data?.username, 20);
      if (!roomId || !username) return;
      if (isMember(roomId, socket)) return; // déjà dans la salle

      let isCreator = false;
      if (!rooms[roomId]) {
        if (Object.keys(rooms).length >= MAX_ROOMS) {
          socket.emit("error_message", "Serveur plein, réessaie plus tard.");
          return;
        }
        rooms[roomId] = [];
        lobbyOptions[roomId] = { rounds: 3, timer: 60 };
        roundCount[roomId] = 1;
        playerPoints[roomId] = {};
        isCreator = true;
      } else if (rooms[roomId].length >= MAX_IMPOSTEUR_PLAYERS) {
        socket.emit("error_message", "La salle est pleine (max 8 joueurs).");
        return;
      }

      socket.join(roomId);
      rooms[roomId].push({ id: socket.id, username });
      socket.emit("room-created", { id: roomId, players: rooms[roomId], isCreator });
      roomUpdate(roomId);
    });

    socket.on("update_lobby_options", (data) => {
      const roomId = data?.roomId;
      if (!lobbyOptions[roomId] || !isHost(roomId, socket)) return;
      lobbyOptions[roomId] = sanitizeOptions(data.options);
      io.to(roomId).emit("lobby_options_updated", { options: lobbyOptions[roomId] });
    });

    socket.on("vote", (data) => {
      const roomId = data?.roomId;
      const votedId = data?.votedId;
      const room = rooms[roomId];
      if (!room || !gameStates[roomId] || !isMember(roomId, socket)) return;
      if (!room.some((p) => p.id === votedId)) return;

      if (!votesState[roomId]) votesState[roomId] = {};
      if (votesState[roomId][socket.id]) return; // un seul vote par joueur
      votesState[roomId][socket.id] = votedId;

      if (Object.keys(votesState[roomId]).length < room.length) return;

      const { impostorIndex, wordPair, hints } = gameStates[roomId];
      const impostorId = room[impostorIndex]?.id;
      scoreVotes(votesState[roomId], impostorId, playerPoints[roomId]);

      io.to(roomId).emit("reveal_results", {
        votes: votesState[roomId],
        impostorIndex,
        hints,
        players: room,
        wordPair,
        points: playerPoints[roomId],
        scores: playerPoints[roomId],
        isLastRound: roundCount[roomId] >= lobbyOptions[roomId].rounds,
        round: roundCount[roomId],
        totalRounds: lobbyOptions[roomId].rounds,
      });
      delete votesState[roomId];
    });

    socket.on("submit_hint", (data) => {
      const roomId = data?.roomId;
      const hint = clean(data?.hint, 40);
      const room = rooms[roomId];
      if (!room || !gameStates[roomId]) return;

      const state = gameStates[roomId];
      if (!state.hints[state.turn]) state.hints[state.turn] = [];
      const currentHints = state.hints[state.turn];

      // C'est à ce joueur de jouer ? (identité = socket, jamais l'id envoyé par le client)
      if (room[currentHints.length]?.id !== socket.id) return;

      currentHints.push({ playerId: socket.id, hint });
      io.to(roomId).emit("hint_submitted", { playerId: socket.id, hint, players: room });

      if (currentHints.length < room.length) {
        const nextPlayer = room[currentHints.length];
        setTimeout(() => io.to(nextPlayer.id).emit("next_turn", currentHints.length), 500);
      } else {
        state.turn++;
        state.hints[state.turn] = [];
        setTimeout(() => {
          if (rooms[roomId]?.[0]) io.to(rooms[roomId][0].id).emit("next_turn", 0);
        }, 500);
      }
    });

    socket.on("force_vote", (roomId) => {
      if (!gameStates[roomId] || !isHost(roomId, socket)) return;
      io.to(roomId).emit("all_hints_done");
    });

    socket.on("start_next_round", (roomId) => {
      if (!roundCount[roomId] || !lobbyOptions[roomId] || !isHost(roomId, socket)) return;
      roundCount[roomId]++;
      if (roundCount[roomId] > lobbyOptions[roomId].rounds) {
        io.to(roomId).emit("game_over", buildRanking(playerPoints[roomId], rooms[roomId]));
      } else {
        startRound(roomId);
      }
    });

    socket.on("start_round", (roomId) => {
      if (!rooms[roomId] || !isHost(roomId, socket)) return;
      roundCount[roomId] = 1;
      playerPoints[roomId] = {};
      startRound(roomId);
    });

    socket.on("leave_room", (roomId) => {
      socket.leave(roomId);
      removePlayer(socket, roomId);
    });
  }

  function removePlayer(socket, roomId) {
    if (!rooms[roomId]) return;
    const before = rooms[roomId].length;
    rooms[roomId] = rooms[roomId].filter((p) => p.id !== socket.id);
    if (rooms[roomId].length === 0) deleteRoom(roomId);
    else if (rooms[roomId].length !== before) roomUpdate(roomId);
  }

  function onDisconnect(socket) {
    for (const roomId of Object.keys(rooms)) removePlayer(socket, roomId);
  }

  return { register, onDisconnect, _state: { rooms, gameStates, votesState } };
}

module.exports = {
  createImposteur, pickWordPair, sanitizeOptions, scoreVotes, buildRanking, WORD_PAIRS,
};
