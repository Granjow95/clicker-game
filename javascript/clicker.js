// ==========================
// 🎮 INITIALISATION DU CLICKER GAME
// ==========================
function initClickerGame() {
    clickButton.addEventListener("click", () => {
      if (codeGameActive) return;
      score += clickValue;
      updateScore();
      checkMilestones(); // 👈 ajout ici
      updateCPS();
      clickTimes.push(Date.now());
    });
  
    activeIntervals.push(setInterval(updateCPS, 10));
  }
  
  
  function updateScore() {
    scoreDisplay.textContent = score;
  }
  
  function updateCPS() {
    const now = Date.now();
    while (clickTimes.length > 0 && now - clickTimes[0] > 1000) {
      clickTimes.shift();
    }
    cpsDisplay.textContent = `${clickTimes.length} clic${clickTimes.length > 1 ? "s" : ""}/s`;
  }
  
  // ==========================
  // 🏆 AFFICHAGE DES BONUS
  // ==========================
  function showSuccess(message, emoji = "✅") {
    const success = document.createElement("div");
    success.className = "success-message";
    success.innerHTML = `<span>${emoji}</span> ${message}`;
    successContainer.appendChild(success);
    setTimeout(() => success.remove(), 3000);
  }
  
  // ==========================
  // 🧩 PALIER & BONUS DÉBLOQUÉS
  // ==========================
  function checkMilestones() {
    milestones.forEach((milestone) => {
      if (score >= milestone && !unlockedMilestones.includes(milestone)) {
        unlockedMilestones.push(milestone);
        activateBonus(milestone);
      }
    });
  }
  
  function activateBonus(milestone) {
    if (milestone >= 500) {
      activeIntervals.push(setInterval(() => {
        if (!codeGameActive) {
          score += 10;
          updateScore();
          checkMilestones();
        }
      }, 1000));
    }
  
    switch (milestone) {
      case 50:
        showSuccess("Bonus débloqué : +5 clics toutes les secondes ! ⚡");
        break;
      case 100:
        activeIntervals.push(setInterval(() => {
          if (!codeGameActive) {
            document.body.style.backgroundColor = getRandomColor();
          }
        }, 100));
        showSuccess("Bonus débloqué : Couleur de fond changeante ! 🌈");
        break;
      case 500:
        if (youtubeReady) {
          playCustomBackgroundVideo();
          showSuccess("Bonus : ASMR en fond ! 🍜");
        } else {
          showSuccess("⏳ ASMR en chargement...");
        }
        break;
      case 1000:
        playFartCompilation();
        showSuccess("Bonus débloqué : bruits de prout ! 💨");
        break;
      case 2000:
        showSuccess("Mini-jeu : Trouve le code ! 🧠");
        launchCodeGame();
        break;
      case 5000:
        triggerMacronExplosion();
        break;
    }
  }
  
  function getRandomColor() {
    const letters = "0123456789ABCDEF";
    return (
      "#" +
      Array.from({ length: 6 })
        .map(() => letters[Math.floor(Math.random() * 16)]).join("")
    );
  }
  
  // ==========================
  // 📺 VIDÉO & AUDIO BONUS
  // ==========================
  function onYouTubeIframeAPIReady() {
    youtubeReady = true;
  }
  
  function playCustomBackgroundVideo() {
    const videoIds = ["xo6K-WaZ14A", "pQQet1JCtI0", "FTk-CG1m3ns"];
    const randomId = videoIds[Math.floor(Math.random() * videoIds.length)];
  
    const container = document.getElementById("bg-video");
    container.innerHTML = "";
  
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${randomId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${randomId}`;
    iframe.allow = "autoplay";
    Object.assign(iframe.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "-1",
      pointerEvents: "none",
      opacity: "0.4",
    });
  
    container.appendChild(iframe);
  }
  
  function playFartCompilation() {
    const fartAudio = new Audio("https://www.myinstants.com/media/sounds/fart-with-reverb.mp3");
    fartAudio.playbackRate = 2;
    fartAudio.volume = 1;
    fartAudio.loop = true;
    fartAudio.play();
  }
  
  // ==========================
  // 🔐 MINI-JEU : CODE À 4 CHIFFRES
  // ==========================
  function launchCodeGame() {
    codeGameActive = true;
    secretCode = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join("");
    gameSolved = false;
  
    document.getElementById("code-game").style.display = "block";
    document.getElementById("code-feedback").innerHTML = "";
    const input = document.getElementById("code-attempt");
    input.value = "";
    input.focus();
  }
  
  const inputField = document.getElementById("code-attempt");
  if (inputField) {
    inputField.addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "");
    });
  
    inputField.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        submitCodeAttempt();
      }
    });
  }
  
  function submitCodeAttempt() {
    const input = document.getElementById("code-attempt");
    const feedback = document.getElementById("code-feedback");
    const inputValue = input.value;
  
    if (!/^\d{4}$/.test(inputValue)) {
      feedback.innerHTML = "❌ Entrez exactement 4 chiffres.";
      return;
    }
  
    const inputArray = inputValue.split("");
    const codeArray = secretCode.split("");
    const result = ["", "", "", ""];
    const matchedCodeIndexes = [];
    const matchedInputIndexes = [];
  
    for (let i = 0; i < 4; i++) {
      if (inputArray[i] === codeArray[i]) {
        result[i] = `<span style="color: red;">${inputArray[i]}</span>`;
        matchedCodeIndexes.push(i);
        matchedInputIndexes.push(i);
      }
    }
  
    for (let i = 0; i < 4; i++) {
      if (matchedInputIndexes.includes(i)) continue;
      for (let j = 0; j < 4; j++) {
        if (!matchedCodeIndexes.includes(j) && inputArray[i] === codeArray[j]) {
          result[i] = `<span style="color: yellow;">${inputArray[i]}</span>`;
          matchedCodeIndexes.push(j);
          matchedInputIndexes.push(i);
          break;
        }
      }
      if (!matchedInputIndexes.includes(i)) {
        result[i] = `<span>${inputArray[i]}</span>`;
      }
    }
  
    feedback.innerHTML = result.join("");
    input.value = "";
  
    if (inputValue === secretCode && !gameSolved) {
      gameSolved = true;
      feedback.innerHTML = `<span style="color:red; font-weight:bold;">${secretCode}</span>`;
      launchConfetti();
      showDancers();
      playVictorySound();
      document.getElementById("code-game").style.display = "none";
      codeGameActive = false;
  
      activeIntervals.push(setInterval(() => {
        if (!codeGameActive) {
          score += 100;
          updateScore();
          checkMilestones();
        }
      }, 500));
    }
  }
  
  // ==========================
  // 🎉 EFFETS : CONFETTIS + DANSEURS
  // ==========================
  function launchConfetti() {
    for (let i = 0; i < 150; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confetti.style.left = Math.random() * 100 + "vw";
      confetti.style.top = Math.random() * 100 + "vh";
      confetti.style.background = `hsl(${Math.random() * 360}, 100%, 50%)`;
      confetti.style.animationDelay = `${Math.random()}s`;
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 2000);
    }
  }
  
  function showDancers() {
    const left = document.createElement("img");
    left.src = "https://uploads.dailydot.com/2024/09/12-chicken-nugget-roblox-shufflin-meme.gif";
    left.className = "dancer left";
  
    const right = document.createElement("img");
    right.src = "https://media.tenor.com/rTvi_qpa2pQAAAAM/skibidi-arizona.gif";
    right.className = "dancer right";
  
    document.body.appendChild(left);
    document.body.appendChild(right);
  }
  
  function playVictorySound() {
    if (victoryAudio) return;
    victoryAudio = new Audio("audio/nugget_song.mp3");
    victoryAudio.loop = true;
    victoryAudio.volume = 1;
    victoryAudio.play();
  }
  