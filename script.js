let score = 0;
let clickValue = 1;
let ytPlayer = null;
let youtubeReady = false;

const scoreDisplay = document.getElementById("score");
const clickButton = document.getElementById("clickButton");

const milestones = [50, 100, 500, 1000, 2000, 5000, 10000, 50000, 100000, 500000];
const unlockedMilestones = [];

clickButton.addEventListener("click", () => {
  score += clickValue;
  updateScore();
  checkMilestones();
});

function updateScore() {
  scoreDisplay.textContent = score;
}

function checkMilestones() {
  milestones.forEach((milestone) => {
    if (score >= milestone && !unlockedMilestones.includes(milestone)) {
      unlockedMilestones.push(milestone);
      activateBonus(milestone);
    }
  });
}

function activateBonus(milestone) {
  switch (milestone) {
    case 50:
      setInterval(() => {
        score += 3;
        updateScore();
        checkMilestones();
      }, 1000);
      alert("⚡️ Bonus débloqué : +3 clics toutes les secondes !");
      break;

    case 100:
      setInterval(() => {
        document.body.style.backgroundColor = getRandomColor();
      }, 100);
      alert("🌈 Bonus débloqué : Couleur de fond changeante toutes les 0.5s !");
      break;

    case 500:
      if (youtubeReady) {
        playCustomBackgroundVideo();
        alert("🍜 Bonus débloqué : ASMR vidéo en fond de page !");
      } else {
        alert("⏳ La vidéo YouTube est encore en chargement... Réessaie dans quelques secondes.");
      }
      break;

    case 1000:
      playFartCompilation();
      alert("💨 Bonus débloqué : Compilation de bruits de prout !");
      break;

      case 2000:
        launchCodeGame();
        alert("🧠 Bonus spécial : devine le code secret !");
        break;
      
  }
}

// YouTube API globale (appelée automatiquement)
function onYouTubeIframeAPIReady() {
  youtubeReady = true;
}

// 🎥 Joue une vidéo YouTube en fond
function playCustomBackgroundVideo() {
  const videoIds = ["xo6K-WaZ14A", "pQQet1JCtI0", "FTk-CG1m3ns"];
  const randomId = videoIds[Math.floor(Math.random() * videoIds.length)];

  // Crée le conteneur s’il n’existe pas
  let container = document.getElementById("bg-video");
  if (!container) {
    container = document.createElement("div");
    container.id = "bg-video";
    document.body.appendChild(container);
  }

  ytPlayer = new YT.Player("bg-video", {
    videoId: randomId,
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      loop: 1,
      playlist: randomId,
      fs: 0,
      rel: 0,
      showinfo: 0,
    },
    events: {
      onReady: (event) => {
        event.target.setVolume(100);
        event.target.setPlaybackRate(1.5);
        event.target.playVideo();

        const iframe = container.querySelector("iframe");
        if (iframe) {
          iframe.style.position = "fixed";
          iframe.style.top = "0";
          iframe.style.left = "0";
          iframe.style.width = "100vw";
          iframe.style.height = "100vh";
          iframe.style.zIndex = "-1";
          iframe.style.pointerEvents = "none";
          iframe.style.border = "none";
        }
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.PAUSED) {
          ytPlayer.playVideo();
        }
      },
    },
  });
}

// 💩 FART SOUND COMPILATION
function playFartCompilation() {
    const fartAudio = new Audio("https://www.myinstants.com/media/sounds/fart-with-reverb.mp3");
    fartAudio.playbackRate = 2;
  fartAudio.volume = 1;
  fartAudio.loop = true;
  fartAudio.play();
}

// Couleurs aléatoires
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  return "#" + Array.from({ length: 6 }).map(() => letters[Math.floor(Math.random() * 16)]).join("");
}

let secretCode = "";
let gameSolved = false;

function launchCodeGame() {
  // Génère un code aléatoire à 4 chiffres
  secretCode = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join("");
  gameSolved = false;
  document.getElementById("code-game").style.display = "block";
  document.getElementById("code-feedback").innerHTML = "";
  document.getElementById("code-attempt").value = "";
}

function submitCodeAttempt() {
    const input = document.getElementById("code-attempt").value;
    const feedback = document.getElementById("code-feedback");
  
    if (!/^\d{4}$/.test(input)) {
      feedback.innerHTML = "❌ Entrez exactement 4 chiffres.";
      return;
    }
  
    const inputArray = input.split("");
    const codeArray = secretCode.split("");
    const result = ["", "", "", ""];
    const matchedCodeIndexes = [];
    const matchedInputIndexes = [];
  
    // Étape 1 : Rouge (bon chiffre, bonne position)
    for (let i = 0; i < 4; i++) {
      if (inputArray[i] === codeArray[i]) {
        result[i] = `<span style="color: red;">${inputArray[i]}</span>`;
        matchedCodeIndexes.push(i);
        matchedInputIndexes.push(i);
      }
    }
  
    // Étape 2 : Jaune (bon chiffre, mauvaise position)
    for (let i = 0; i < 4; i++) {
      if (matchedInputIndexes.includes(i)) continue;
  
      for (let j = 0; j < 4; j++) {
        if (
          !matchedCodeIndexes.includes(j) &&
          inputArray[i] === codeArray[j]
        ) {
          result[i] = `<span style="color: yellow;">${inputArray[i]}</span>`;
          matchedCodeIndexes.push(j);
          matchedInputIndexes.push(i);
          break;
        }
      }
  
      // Si rien trouvé
      if (!matchedInputIndexes.includes(i)) {
        result[i] = `<span>${inputArray[i]}</span>`;
      }
    }
  
    feedback.innerHTML = result.join("");
  
    if (input === secretCode && !gameSolved) {
      gameSolved = true;
      document.getElementById("code-feedback").innerHTML =
        `<span style="color:red; font-weight:bold;">${secretCode}</span>`;
      launchConfetti();
      showDancers();
      document.getElementById("code-game").style.display = "none";
  
      setInterval(() => {
        score += 100;
        updateScore();
        checkMilestones();
      }, 500);
    }
  }
  

  function launchConfetti() {
    for (let i = 0; i < 150; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confetti.style.left = Math.random() * 100 + "vw";
      confetti.style.top = Math.random() * 100 + "vh";
      confetti.style.background = `hsl(${Math.random() * 360}, 100%, 50%)`;
      confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
      confetti.style.animationDelay = `${Math.random()}s`;
  
      const angle = Math.random() * 360;
      const distance = Math.random() * 300 + 100;
  
      confetti.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
      confetti.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
  
      document.body.appendChild(confetti);
  
      setTimeout(() => confetti.remove(), 2000);
    }
  }
  

function showDancers() {
  const left = document.createElement("img");
  left.src = "https://uploads.dailydot.com/2024/09/12-chicken-nugget-roblox-shufflin-meme.gif?auto=compress&fm=gif"; // danseur gauche
  left.className = "dancer left";

  const right = document.createElement("img");
  right.src = "https://media.tenor.com/rTvi_qpa2pQAAAAM/skibidi-arizona.gif"; // danseur droit
  right.className = "dancer right";

  document.body.appendChild(left);
  document.body.appendChild(right);
}
