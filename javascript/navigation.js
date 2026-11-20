// ======= 📁 navigation.js =======

function startGame(game) {
  if (!document.getElementById(`${game}-game`)) return; // jeu pas encore disponible (ex. runner)
  document.getElementById("menu").style.display = "none";
  document.getElementById(`${game}-game`).style.display = "block";
  console.log("🎮 Jeu démarré :", game);

  // 🎨 Changement dynamique de CSS selon le jeu
  // Dans startGame(game)
  const styleLink = document.getElementById("dynamic-style");
  switch (game) {
    case "impostor":
      styleLink.href = "styles/imposteur.css";
      break;
    case "lyrics":
      document.getElementById("menu").style.display = "none";
      document.getElementById("lyrics-select").style.display = "block";
      document.getElementById("lyrics-game").style.display = "none";
      document.getElementById("dynamic-style").href = "styles/lyrics.css";
      if (window.renderLyricsSelection) window.renderLyricsSelection();
      break;
    case "karaoke":
      document.getElementById("karaoke-game").style.display = "none";
      document.getElementById("menu").style.display = "none";
      document.getElementById("karaoke-mode").style.display = "block";
      document.getElementById("dynamic-style").href = "styles/karaoke.css";
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

  // cacher les vues lyrics
  document.getElementById("lyrics-select").style.display = "none";
  document.getElementById("lyrics-game").style.display = "none";

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
  document.getElementById("menu").style.display = "";

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

  // Applique un changement de compte reporté pendant la partie
  if (typeof granAuth !== "undefined") granAuth.flushReconnect();
}

// Accessibilité : les cartes du menu se activent aussi au clavier (Entrée / Espace).
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".game-card[role='button']")) {
    e.preventDefault();
    e.target.click();
  }
});
