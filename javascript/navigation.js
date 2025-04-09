// ======= 📁 navigation.js =======

function startGame(game) {
  document.getElementById("menu").style.display = "none";
  document.getElementById(`${game}-game`).style.display = "block";
  console.log("🎮 Jeu démarré :", game);

  // 🎨 Changement dynamique de CSS selon le jeu
  const styleLink = document.getElementById("dynamic-style");
  switch (game) {
    case "clicker":
      styleLink.href = "styles/clicker.css";
      initClickerGame();
      break;
    case "impostor":
      styleLink.href = "styles/imposteur.css";
      break;
    default:
      styleLink.href = "styles/main-menu.css";
  }
}

function goBack() {
  // Cacher tous les jeux
  document.querySelectorAll(".game-container").forEach((game) => {
    game.style.display = "none";
  });

  // Quitter la room côté serveur
  if (currentRoomId) {
    socket.emit("leave_room", currentRoomId);
  }

  // ❌ Retirer les listeners liés à l’ancienne room
  socket.off("room_update");
  socket.off("room-created");

  // Réinitialiser les champs et l’état
  document.getElementById("room-id").value = "";
  document.getElementById("username").value = "";
  const createButton = document.querySelector("#lobby-setup button");
  createButton.disabled = false;
  createButton.classList.remove("hidden");
  createButton.onclick = () => joinImpostorRoom();

  // 🎨 Revenir au style du menu
  const styleLink = document.getElementById("dynamic-style");
  styleLink.href = "styles/main-menu.css";

  // Afficher le menu principal
  document.getElementById("menu").style.display = "block";

  // CLICKER RESET
  activeIntervals.forEach(clearInterval);
  activeIntervals = [];
  score = 0;
  clickValue = 1;
  unlockedMilestones.length = 0;
  document.getElementById("score").textContent = "0";
  document.getElementById("cps").textContent = "0 clic/s";
  document.body.style.backgroundColor = "#dbeafe";
  document.getElementById("bg-video").innerHTML = "";
  document.querySelectorAll(".dancer, .confetti").forEach((el) => el.remove());
  document.getElementById("code-game").style.display = "none";
  codeGameActive = false;
  gameSolved = false;
  if (victoryAudio) {
    victoryAudio.pause();
    victoryAudio = null;
  }

  // IMPOSTOR RESET
  document.getElementById("impostor-title").classList.remove("hidden");
  document.getElementById("word-bar").textContent = "";
  document.getElementById("players-inputs").innerHTML = "";
  document.getElementById("hint-phase").innerHTML = "";
  document.getElementById("reveal-phase").innerHTML = "";
  document.getElementById("lobby-players").style.display = "none";
  document.getElementById("lobby-options").classList.add("hidden");
  document.getElementById("lobby-setup").classList.remove("hidden");
  document.getElementById("room-id").classList.remove("hidden");
  document.getElementById("username").classList.remove("hidden");
  document.getElementById("new-game").style.display = "none";
  document.getElementById("end-round").classList.add("hidden");

  // Réinitialiser les états
  currentPlayers = [];
  currentRoomId = "";
  currentUsername = "";
  currentTurn = 0;
  currentRound = 1;
  impostorIndex = 0;
  votes = {};
  hasVoted = {};
  hasVotedFor = null;
  allHints = {};
  gameOptions = {
    totalRounds: 3,
    timer: 60,
  };
  clearInterval(turnTimer);
  clearInterval(countdownInterval);
}
