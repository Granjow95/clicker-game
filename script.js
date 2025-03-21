let score = 0;
let clickValue = 1;
let ytPlayer = null;
let youtubeReady = false;
let victoryAudio = null;
let codeGameActive = false;
let secretCode = "";
let gameSolved = false;

const cpsDisplay = document.getElementById("cps");
const scoreDisplay = document.getElementById("score");
const clickButton = document.getElementById("clickButton");
const milestones = [50, 100, 500, 1000, 2000, 5000];
const unlockedMilestones = [];
const clickTimes = [];

const successContainer = document.createElement("div");
successContainer.id = "success-container";
document.body.appendChild(successContainer);

function showSuccess(message, emoji = "✅") {
  const success = document.createElement("div");
  success.className = "success-message";
  success.innerHTML = `<span>${emoji}</span> ${message}`;
  successContainer.appendChild(success);

  setTimeout(() => {
    success.remove();
  }, 3000);
}


clickButton.addEventListener("click", () => {
  if (codeGameActive) return;
  score += clickValue;
  updateScore();
  checkMilestones();
  clickTimes.push(Date.now());
});

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
setInterval(updateCPS, 10);

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
      setInterval(() => {
        if (!codeGameActive) {
          score += 10;
          updateScore();
          checkMilestones();
        }
      }, 1000);
    }
  
    switch (milestone) {
      case 50:
        showSuccess("Bonus débloqué : +5 clics toutes les secondes ! ⚡");
        break;
      case 100:
        setInterval(() => {
          if (!codeGameActive) {
            document.body.style.backgroundColor = getRandomColor();
          }
        }, 100);
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
  return "#" + Array.from({ length: 6 }).map(() => letters[Math.floor(Math.random() * 16)]).join("");
}

function onYouTubeIframeAPIReady() {
  youtubeReady = true;
}

function playCustomBackgroundVideo() {
  const videoIds = ["xo6K-WaZ14A", "pQQet1JCtI0", "FTk-CG1m3ns"];
  const randomId = videoIds[Math.floor(Math.random() * videoIds.length)];

  const container = document.getElementById("bg-video");
  container.innerHTML = ""; // nettoie avant d’ajouter

  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube.com/embed/${randomId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${randomId}`;
  iframe.allow = "autoplay";
  iframe.style.position = "fixed";
  iframe.style.top = "0";
  iframe.style.left = "0";
  iframe.style.width = "100vw";
  iframe.style.height = "100vh";
  iframe.style.zIndex = "-1";
  iframe.style.pointerEvents = "none";
  iframe.style.opacity = "0.4";

  container.appendChild(iframe);
}

function playFartCompilation() {
  const fartAudio = new Audio("https://www.myinstants.com/media/sounds/fart-with-reverb.mp3");
  fartAudio.playbackRate = 2;
  fartAudio.volume = 1;
  fartAudio.loop = true;
  fartAudio.play();
}

// =================== MINI JEU CODE SECRET ===================
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
    this.value = this.value.replace(/\D/g, ""); // bloque les lettres
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

    setInterval(() => {
      if (!codeGameActive) {
        score += 100;
        updateScore();
        checkMilestones();
      }
    }, 500);
  }
}

// =============== CONFETTI, DANSEURS, SONS ===============

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

// =============== EXPLOSION MACRON ===============

function triggerMacronExplosion() {
  document.body.classList.add("shake");

  document.querySelectorAll("body *").forEach(el => {
    el.style.transition = "transform 0.4s ease-in";
    el.style.transform = `translateY(600px) rotate(${Math.random() * 360}deg)`;
  });

  const explosionMessage = document.createElement("div");
  explosionMessage.innerText = "💥 MACRON EXPLOSION 💥";
  Object.assign(explosionMessage.style, {
    position: "fixed",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "4rem",
    color: "red",
    fontWeight: "bold",
    textShadow: "0 0 20px yellow, 0 0 40px red",
    zIndex: "9999",
  });
  document.body.appendChild(explosionMessage);

  const alarm = new Audio("audio/alarm.mp3");
  alarm.volume = 1;
  alarm.loop = true;
  alarm.play();

  const army = document.createElement("img");
  army.src = "image/bonhommes_fight.gif";
  Object.assign(army.style, {
    position: "fixed",
    bottom: "0",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "9998",
    height: "200px",
  });
  document.body.appendChild(army);

  setTimeout(() => {
    const choiceBox = document.createElement("div");
    choiceBox.id = "team-choice";
    Object.assign(choiceBox.style, {
      position: "fixed",
      top: "60%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "10000",
      textAlign: "center",
    });
    choiceBox.innerHTML = `
      <p style="color: white; font-size: 2rem;">Choisis ton camp :</p>
      <button onclick="chooseTeam('skibidi')" style="padding: 10px 20px; font-size: 1.2rem; margin-right: 20px;">Team Skibidi</button>
      <button onclick="chooseTeam('gooner')" style="padding: 10px 20px; font-size: 1.2rem;">Team Gooner</button>
    `;
    document.body.appendChild(choiceBox);
  }, 2000);
}

function chooseTeam(team) {
  document.body.classList.remove("shake");

  document.querySelectorAll("body *").forEach(el => {
    el.style.transform = "none";
    el.style.transition = "transform 0.3s ease-out";
  });

  document.querySelectorAll("img, div").forEach(el => {
    if (
      el.innerText === "💥 MACRON EXPLOSION 💥" ||
      el.src?.includes("bonhommes_fight")
    ) {
      el.remove();
    }
  });

  const choiceBox = document.getElementById("team-choice");
  if (choiceBox) choiceBox.remove();
}
