const socket = io("https://granjow.onrender.com");
let currentPlayerId = "";
socket.on("connect", () => {
  currentPlayerId = socket.id;
});

let currentPlayers = [];
let currentUsername = "";
let currentRoomId = "";
let currentTurn = 0;
let turnTimer = null;
let turnCountdown = 60;
let countdownInterval = null;
let votes = {};
let hasVoted = {};
let hasVotedFor = null;
let impostorIndex = 0;
let allHints = {};
let gameOptions = {
  totalRounds: 3,
  timer: 60,
};
let currentRound = 1;
let scores = {};

document.getElementById("lobby-options").classList.add("hidden");
document.getElementById("lobby-players").style.display = "none";

function updateLobbyDisplay() {
  if (currentPlayers.length >= 8) {
    document.getElementById("room-id")?.setAttribute("disabled", true);
    document.getElementById("username")?.setAttribute("disabled", true);
    document
      .querySelector("#lobby-setup button")
      ?.setAttribute("disabled", true);
  }

  const lobbyDiv = document.getElementById("lobby-players");
  if (!lobbyDiv) return;

  const list = document.createElement("ul");
  currentPlayers.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.username || "Anonyme";
    list.appendChild(li);
  });

  lobbyDiv.innerHTML = `<p><strong>👥 Joueurs dans la salle (${currentPlayers.length}/8) :</strong></p>`;
  lobbyDiv.appendChild(list);

  const btn = document.getElementById("new-game");
  if (btn) {
    const isCreator =
      currentPlayers.length > 0 && currentPlayers[0].id === currentPlayerId;
    if (isCreator && !gameOptions._created) {
      btn.style.display = "block";
      btn.textContent = "Démarrer la partie";
    } else {
      btn.style.display = "none";
    }
  }
  lockLobbyOptionsForNonMaster();
}

socket.on("room_update", (room) => {
  currentPlayers = room.players;
  updateLobbyDisplay();
});

socket.on("room-created", (room) => {
  currentPlayers = room.players;

  // Affiche les joueurs
  document.getElementById("lobby-players").style.display = "block";

  // Affiche les options de lobby
  document.getElementById("lobby-options").classList.remove("hidden");

  // Cache les champs de base
  document.getElementById("room-id").classList.add("hidden");
  document.getElementById("username").classList.add("hidden");
  document.querySelector("#lobby-setup button").classList.add("hidden");

  // Verrouille les inputs si ce n'est pas le créateur
  lockLobbyOptionsForNonMaster();

  updateLobbyDisplay();
});

function joinImpostorRoom() {
  const roomId = document.getElementById("room-id").value.trim();
  const username = document.getElementById("username").value.trim();

  if (!roomId || !username) return alert("Remplis les champs.");
  currentUsername = username;
  currentRoomId = roomId;
  if (currentPlayers.length >= 8) return alert("La salle est pleine !");

  socket.emit("join_or_create_room", { roomId, username });

  document.querySelector("#lobby-setup button").classList.add("hidden");
  document.getElementById("room-id").classList.add("hidden");
  document.getElementById("username").classList.add("hidden");
}

// Mettre à jour les paramètres pour tout le monde
document.addEventListener("DOMContentLoaded", () => {
  const roundsInput = document.getElementById("round-count");
  const timerInput = document.getElementById("round-timer");

  [roundsInput, timerInput].forEach((input) => {
    input?.addEventListener("input", () => {
      const isCreator = currentPlayers[0]?.id === currentPlayerId;
      if (!isCreator || !currentRoomId) return;

      const rounds = parseInt(roundsInput.value || "3");
      const timer = parseInt(timerInput.value || "60");

      gameOptions.totalRounds = rounds;
      gameOptions.timer = timer;

      socket.emit("update_lobby_options", {
        roomId: currentRoomId,
        options: { rounds, timer },
      });
    });
  });
});

function lockLobbyOptionsForNonMaster() {
  const isCreator = currentPlayers[0].id === currentPlayerId;
  document.querySelectorAll("#lobby-options input").forEach((input) => {
    input.disabled = !isCreator;
  });
}

function startImpostorGame() {
  if (!currentRoomId) return alert("Aucune salle !");
  if (!currentPlayers.length) return alert("Aucun joueur détecté.");

  const isCreator = currentPlayers[0].id === currentPlayerId;
  const rounds = parseInt(document.getElementById("round-count")?.value || "3");
  const timer = parseInt(document.getElementById("round-timer")?.value || "60");

  gameOptions.totalRounds = rounds;
  gameOptions.timer = timer;

  if (isCreator && !gameOptions._created) {
    gameOptions._created = true;

    socket.emit("update_lobby_options", {
      roomId: currentRoomId,
      options: { rounds, timer },
    });

    socket.emit("start_round", currentRoomId);
  } else {
    socket.emit("start_round", currentRoomId);
  }
}

function startImpostorRound(_, displayedWord) {
  currentTurn = 0;
  votes = {};
  hasVotedFor = null;
  hasVoted = {};
  allHints = {};
  clearInterval(turnTimer);
  clearInterval(countdownInterval);

  document.getElementById("impostor-title").classList.add("hidden");
  document.getElementById("lobby-setup").classList.add("hidden");
  document.getElementById("lobby-players").classList.add("hidden");
  document.getElementById("new-game").classList.add("hidden");

  const wordBar = document.getElementById("word-bar");
  wordBar.textContent = `🧠 Mot secret : ${displayedWord} | 📅 Manche ${currentRound}/${gameOptions.totalRounds}`;

  const playersContainer = document.getElementById("players-inputs");
  playersContainer.innerHTML = "";

  const template = document.getElementById("player-template");

  currentPlayers.forEach((player, index) => {
    allHints[player.id] = [];

    const clone = template.content.cloneNode(true);
    const playerDiv = clone.querySelector(".player-line");
    playerDiv.id = `player-${index}`;

    clone.querySelector(".player-name").textContent = player.username;
    clone.querySelector(".player-timer").id = `timer-${index}`;
    clone.querySelector(".hints").id = `hints-${index}`;

    playersContainer.appendChild(clone);
  });

  document.getElementById("hint-phase").innerHTML = "";
  document.getElementById("reveal-phase").innerHTML = "";

  const endBtn = document.getElementById("end-round");
  if (endBtn) {
    if (currentPlayers[0].id === currentPlayerId) {
      endBtn.classList.remove("hidden");
      endBtn.onclick = () => {
        socket.emit("force_vote", currentRoomId);
        endBtn.classList.add("hidden");
      };
    } else {
      endBtn.classList.add("hidden");
    }
  }
}

function launchTurn() {
  turnCountdown = gameOptions.timer;
  const player = currentPlayers[currentTurn];
  const line = document.getElementById(`player-${currentTurn}`);
  if (!line) return;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Écris ton indice...";
  input.id = "hint-input";
  input.classList.add("hint-input");

  const validateBtn = document.createElement("button");
  validateBtn.textContent = "Valider";

  const timerDisplay = document.getElementById(`timer-${currentTurn}`);
  if (timerDisplay) {
    timerDisplay.classList.remove("hidden");
    timerDisplay.textContent = `⏳ ${turnCountdown}s`;

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      turnCountdown--;
      timerDisplay.textContent = `⏳ ${turnCountdown}s`;
      if (turnCountdown <= 0) {
        clearInterval(countdownInterval);
        if (document.body.contains(input)) validateBtn.click();
      }
    }, 1000);
  }

  validateBtn.onclick = () => {
    const value = input.value.trim() || "(aucun mot)";
    socket.emit("submit_hint", {
      roomId: currentRoomId,
      playerId: currentPlayerId,
      hint: value,
    });

    clearInterval(countdownInterval);
    timerDisplay.classList.add("hidden");
  };

  line.appendChild(input);
  line.appendChild(validateBtn);

  if (turnTimer) clearTimeout(turnTimer);
  turnTimer = setTimeout(() => {
    if (document.body.contains(input)) validateBtn.click();
  }, gameOptions.timer * 1000);
}

function clearTurnUI() {
  const input = document.getElementById("hint-input");
  if (input) input.remove();
  const buttons = document.querySelectorAll(`#player-${currentTurn} button`);
  buttons.forEach((b) => b.remove());
}

function showVotingPhase() {
  document.getElementById("players-inputs").innerHTML = "";

  const revealPhase = document.getElementById("reveal-phase");
  revealPhase.innerHTML =
    "<h3 class='vote-title'>🗳️ Votez pour l'imposteur :</h3>";

  const grid = document.createElement("div");
  grid.className = "vote-grid";

  const template = document.getElementById("vote-button-template");

  currentPlayers.forEach((player) => {
    const btn = template.content.cloneNode(true).querySelector("button");
    btn.textContent = player.username;

    btn.onclick = () => {
      if (hasVotedFor) return;
      hasVotedFor = player.id;
      hasVoted[currentPlayerId] = true;

      socket.emit("vote", {
        roomId: currentRoomId,
        voterId: currentPlayerId,
        votedId: player.id,
      });

      btn.disabled = true;
      btn.classList.add("voted");
      btn.textContent += " ✅";

      const voteInfo = document.createElement("p");
      voteInfo.className = "vote-info";
      voteInfo.innerHTML = `<strong>Tu as voté pour :</strong> ${player.username}`;
      revealPhase.appendChild(voteInfo);

      if (Object.keys(hasVoted).length === currentPlayers.length) {
        setTimeout(() => {
          revealImpostorAndHints();
        }, 800);
      }
    };

    grid.appendChild(btn);
  });

  revealPhase.appendChild(grid);
}

function revealImpostorAndHints() {
  const revealPhase = document.getElementById("reveal-phase");
  const impostor = currentPlayers?.[impostorIndex];
  const impostorName = impostor?.username || "inconnu";

  const h3 = document.createElement("h3");
  h3.className = "impostor-reveal";
  h3.innerHTML = `🕵️ L’imposteur était <strong>${impostorName}</strong>`;
  revealPhase.appendChild(h3);

  const list = document.createElement("ul");
  currentPlayers.forEach((p) => {
    const li = document.createElement("li");
    const hintList = allHints[p.id] || [];
    li.innerHTML = `<strong>${p.username} :</strong> ${hintList.join(", ") || "(aucun mot)"}`;
    list.appendChild(li);
  });
  revealPhase.appendChild(list);
}

socket.on("hint_submitted", ({ playerId, hint, players }) => {
  if (players) currentPlayers = players;
  const index = currentPlayers.findIndex((p) => p.id === playerId);
  if (index === -1) return;

  const hintZone = document.getElementById(`hints-${index}`);
  const span = document.createElement("span");
  span.textContent = hint;
  hintZone.appendChild(span);

  if (playerId === currentPlayerId) clearTurnUI();
});

socket.on("next_turn", (turnNumber) => {
  clearTurnUI();
  currentTurn = turnNumber;

  const currentPlayer = currentPlayers[currentTurn];
  if (currentPlayer?.id === currentPlayerId) launchTurn();
});

socket.on("all_hints_done", showVotingPhase);

socket.on(
  "round_started",
  ({ word, players, impostorIndex: index, round, totalRounds, timer }) => {
    currentPlayers = players;
    impostorIndex = index;
    currentRound = round;
    turnCountdown = timer;
    gameOptions.totalRounds = totalRounds;
    gameOptions.timer = timer;
    startImpostorRound(true, word);
  }
);

window.joinImpostorRoom = joinImpostorRoom;

socket.on(
  "reveal_results",
  ({
    impostorIndex,
    players,
    wordPair,
    points,
    scores: updatedScores,
    isLastRound,
  }) => {
    scores = updatedScores;
    const revealPhase = document.getElementById("reveal-phase");

    revealPhase.innerHTML = `
    <h3 class="impostor-reveal">🕵️ L’imposteur était <strong>${players?.[impostorIndex]?.username || "???"}</strong></h3>
    <p class="word-reveal">🟥 Mot de l’imposteur : <strong>${wordPair?.impostor || "(inconnu)"}</strong></p>
    <p class="word-reveal">🟩 Mot des autres joueurs : <strong>${wordPair?.normal || "(inconnu)"}</strong></p>
  `;

    const gainSection = document.createElement("div");
    gainSection.className = "score-gain";
    gainSection.innerHTML = "<h4>🏅 Points gagnés cette manche :</h4><ul>";
    for (const id in points) {
      const player = players.find((p) => p.id === id);
      if (player) {
        gainSection.innerHTML += `<li>${player.username} : +${points[id]} pts</li>`;
      }
    }
    gainSection.innerHTML += "</ul>";
    revealPhase.appendChild(gainSection);

    if (isLastRound) {
      const classement = Object.entries(scores)
        .map(([id, score]) => {
          const user = players.find((p) => p.id === id);
          return { username: user?.username || "???", score };
        })
        .sort((a, b) => b.score - a.score);

      const classementHTML = classement
        .map((e, i) => `<li>#${i + 1} - ${e.username} : ${e.score} pts</li>`)
        .join("");

      revealPhase.innerHTML += `
        <div class="final-ranking">
          <h3>📊 Classement final :</h3>
          <ul>${classementHTML}</ul>
        </div>
      `;
    }

    if (!isLastRound && currentPlayers[0].id === currentPlayerId) {
      const btn = document.createElement("button");
      btn.textContent = "🔁 Manche suivante";
      btn.className = "next-round-button";
      btn.onclick = () => {
        socket.emit("start_next_round", currentRoomId);
      };
      revealPhase.appendChild(btn);
    }
  }
);

socket.on("lobby_options_updated", ({ options }) => {
  gameOptions.totalRounds = options.rounds;
  gameOptions.timer = options.timer;

  // Met à jour visuellement les inputs si l'utilisateur n'est pas le maître
  const isCreator = currentPlayers[0].id === currentPlayerId;
  if (!isCreator) {
    const roundsInput = document.getElementById("round-count");
    const timerInput = document.getElementById("round-timer");

    if (roundsInput) roundsInput.value = options.rounds;
    if (timerInput) timerInput.value = options.timer;
  }
});

socket.on("error_message", (msg) => {
  alert(msg);
});
