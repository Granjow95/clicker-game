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
    timer: clampInt(options?.timer, 10, 120, 60),
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

// Salles Socket.io préfixées par jeu : pas de collision avec le karaoké, et impossible de
// rejoindre « à la main » la salle privée d'un autre via un identifiant deviné.
const ns = (roomId) => `imp:${roomId}`;
// Dictionnaires sans prototype : « constructor » ou « __proto__ » sont des noms de salle comme les autres.
const dict = () => Object.create(null);
const cid = (v) => clean(v, 30);

function createImposteur(io) {
  const rooms = dict();
  const gameStates = dict(); // { turn, hints, impostorId, impostorName, wordPair, phase }
  const votesState = dict();
  const lobbyOptions = dict();
  const playerPoints = dict();
  const roundCount = dict();

  const isHost = (roomId, socket) => rooms[roomId]?.[0]?.id === socket.id;
  const isMember = (roomId, socket) => !!rooms[roomId]?.some((p) => p.id === socket.id);
  const isLastRound = (roomId) => roundCount[roomId] >= lobbyOptions[roomId].rounds;

  function deleteRoom(roomId) {
    delete rooms[roomId];
    delete gameStates[roomId];
    delete votesState[roomId];
    delete lobbyOptions[roomId];
    delete playerPoints[roomId];
    delete roundCount[roomId];
  }

  function roomUpdate(roomId) {
    io.to(ns(roomId)).emit("room_update", {
      id: roomId,
      players: rooms[roomId],
      options: lobbyOptions[roomId],
    });
  }

  function startRound(roomId) {
    const players = rooms[roomId];
    if (!players || players.length === 0) return;

    const wordPair = pickWordPair();
    const impostor = players[randomInt(players.length)];
    gameStates[roomId] = {
      turn: 0,
      hints: { 0: [] },
      impostorId: impostor.id,
      impostorName: impostor.username,
      wordPair,
      phase: "hints",
    };
    delete votesState[roomId];

    const playerData = players.map((p) => ({ id: p.id, username: p.username }));
    players.forEach((player) => {
      // L'identité de l'imposteur n'est révélée qu'à la fin (reveal_results).
      io.to(player.id).emit("round_started", {
        word: player.id === impostor.id ? wordPair.impostor : wordPair.normal,
        players: playerData,
        timer: lobbyOptions[roomId].timer,
        round: roundCount[roomId],
        totalRounds: lobbyOptions[roomId].rounds,
      });
    });
    io.to(players[0].id).emit("next_turn", 0);
  }

  // Prochain joueur qui n'a pas encore donné d'indice ce tour-ci (robuste aux départs).
  function nextPlayerToHint(roomId) {
    const st = gameStates[roomId];
    const done = st?.hints[st.turn] || [];
    return rooms[roomId]?.find((p) => !done.some((h) => h.playerId === p.id));
  }

  function promptNext(roomId) {
    const st = gameStates[roomId];
    const room = rooms[roomId];
    if (!st || !room || room.length === 0 || st.phase !== "hints") return;
    if (!st.hints[st.turn]) st.hints[st.turn] = [];

    const next = nextPlayerToHint(roomId);
    if (next) {
      io.to(next.id).emit("next_turn", st.hints[st.turn].length);
      return;
    }
    st.turn++;
    st.hints[st.turn] = [];
    io.to(room[0].id).emit("next_turn", 0);
  }

  // Termine la manche quand tous les joueurs présents ont voté.
  function tryFinalizeVotes(roomId) {
    const st = gameStates[roomId];
    const room = rooms[roomId];
    const votes = votesState[roomId];
    if (!st || !room || !votes || st.phase !== "voting") return;
    if (room.length === 0 || !room.every((p) => votes[p.id])) return;

    // Seuls les votes des joueurs présents comptent (un joueur parti ne vote plus).
    const valid = {};
    room.forEach((p) => (valid[p.id] = votes[p.id]));
    scoreVotes(valid, st.impostorId, playerPoints[roomId]);

    // Si l'imposteur est parti, on l'ajoute à la liste de révélation pour afficher son nom.
    let revealPlayers = room;
    let impostorIndex = room.findIndex((p) => p.id === st.impostorId);
    if (impostorIndex < 0) {
      revealPlayers = [...room, { id: st.impostorId, username: st.impostorName }];
      impostorIndex = room.length;
    }

    st.phase = "revealed";
    io.to(ns(roomId)).emit("reveal_results", {
      votes: valid,
      impostorIndex,
      hints: st.hints,
      players: revealPlayers,
      wordPair: st.wordPair,
      points: playerPoints[roomId],
      scores: playerPoints[roomId],
      isLastRound: isLastRound(roomId),
      round: roundCount[roomId],
      totalRounds: lobbyOptions[roomId].rounds,
    });
    delete votesState[roomId];
  }

  function removePlayer(socket, roomId) {
    const room = rooms[roomId];
    if (!room) return;
    const idx = room.findIndex((p) => p.id === socket.id);
    if (idx < 0) return;

    const st = gameStates[roomId];
    const wasHost = idx === 0;
    const wasNext = !!st && st.phase === "hints" && nextPlayerToHint(roomId)?.id === socket.id;

    rooms[roomId] = room.filter((p) => p.id !== socket.id);
    if (rooms[roomId].length === 0) {
      deleteRoom(roomId);
      return;
    }
    if (votesState[roomId]) delete votesState[roomId][socket.id];
    roomUpdate(roomId);

    if (!st) return;
    if (wasNext) promptNext(roomId);
    if (st.phase === "voting") tryFinalizeVotes(roomId);
    if (wasHost) {
      // Le nouvel hôte récupère les boutons de contrôle de la phase en cours.
      io.to(rooms[roomId][0].id).emit("host_changed", {
        phase: st.phase,
        isLastRound: isLastRound(roomId),
      });
    }
  }

  function leaveRoom(socket) {
    const roomId = socket.data.impRoom;
    if (!roomId) return;
    socket.data.impRoom = undefined;
    socket.leave(ns(roomId));
    removePlayer(socket, roomId);
  }

  function register(socket) {
    socket.on("join_or_create_room", (data) => {
      const roomId = cid(data?.roomId);
      const username = clean(data?.username, 20);
      if (!roomId || !username) return;
      if (socket.data.impRoom === roomId && isMember(roomId, socket)) return;
      leaveRoom(socket); // un socket = une salle à la fois

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

      socket.join(ns(roomId));
      socket.data.impRoom = roomId;
      rooms[roomId].push({ id: socket.id, username });
      socket.emit("room-created", { id: roomId, players: rooms[roomId], isCreator });
      roomUpdate(roomId);
    });

    socket.on("update_lobby_options", (data) => {
      const roomId = cid(data?.roomId);
      if (!lobbyOptions[roomId] || !isHost(roomId, socket)) return;
      lobbyOptions[roomId] = sanitizeOptions(data.options);
      io.to(ns(roomId)).emit("lobby_options_updated", { options: lobbyOptions[roomId] });
    });

    socket.on("vote", (data) => {
      const roomId = cid(data?.roomId);
      const votedId = data?.votedId;
      const room = rooms[roomId];
      const st = gameStates[roomId];
      if (!room || !st || st.phase !== "voting" || !isMember(roomId, socket)) return;
      if (typeof votedId !== "string" || !room.some((p) => p.id === votedId)) return;

      if (!votesState[roomId]) votesState[roomId] = {};
      if (votesState[roomId][socket.id]) return; // un seul vote par joueur
      votesState[roomId][socket.id] = votedId;
      tryFinalizeVotes(roomId);
    });

    socket.on("submit_hint", (data) => {
      const roomId = cid(data?.roomId);
      const hint = clean(data?.hint, 40);
      const st = gameStates[roomId];
      if (!rooms[roomId] || !st || st.phase !== "hints") return;
      if (!st.hints[st.turn]) st.hints[st.turn] = [];

      // C'est à ce joueur de jouer ? (identité = socket, jamais l'id envoyé par le client)
      if (nextPlayerToHint(roomId)?.id !== socket.id) return;

      st.hints[st.turn].push({ playerId: socket.id, hint });
      io.to(ns(roomId)).emit("hint_submitted", {
        playerId: socket.id,
        hint,
        players: rooms[roomId],
      });
      setTimeout(() => promptNext(roomId), 500);
    });

    socket.on("force_vote", (rawRoomId) => {
      const roomId = cid(rawRoomId);
      const st = gameStates[roomId];
      if (!st || st.phase !== "hints" || !isHost(roomId, socket)) return;
      st.phase = "voting";
      io.to(ns(roomId)).emit("all_hints_done");
    });

    socket.on("start_next_round", (rawRoomId) => {
      const roomId = cid(rawRoomId);
      if (!roundCount[roomId] || !lobbyOptions[roomId] || !isHost(roomId, socket)) return;
      if (gameStates[roomId]?.phase !== "revealed") return; // pas de saut de manche
      roundCount[roomId]++;
      if (roundCount[roomId] > lobbyOptions[roomId].rounds) {
        const present = Object.fromEntries(
          Object.entries(playerPoints[roomId]).filter(([id]) => rooms[roomId].some((p) => p.id === id))
        );
        io.to(ns(roomId)).emit("game_over", buildRanking(present, rooms[roomId]));
      } else {
        startRound(roomId);
      }
    });

    socket.on("start_round", (rawRoomId) => {
      const roomId = cid(rawRoomId);
      if (!rooms[roomId] || !isHost(roomId, socket)) return;
      roundCount[roomId] = 1;
      playerPoints[roomId] = {};
      startRound(roomId);
    });

    socket.on("leave_room", () => leaveRoom(socket));
  }

  function onDisconnect(socket) {
    leaveRoom(socket);
  }

  return { register, onDisconnect, _state: { rooms, gameStates, votesState } };
}

module.exports = {
  createImposteur, pickWordPair, sanitizeOptions, scoreVotes, buildRanking, WORD_PAIRS,
};
