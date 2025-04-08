// ======= 📁 variables.js (globales communes) =======
let score = 0;
let clickValue = 1;
let ytPlayer = null;
let youtubeReady = false;
let victoryAudio = null;
let codeGameActive = false;
let secretCode = "";
let gameSolved = false;
let activeIntervals = [];
let roundInProgress = false;

const cpsDisplay = document.getElementById("cps");
const scoreDisplay = document.getElementById("score");
const clickButton = document.getElementById("clickButton");
const milestones = [50, 100, 500, 1000, 2000, 5000];
const unlockedMilestones = [];
const clickTimes = [];

const successContainer = document.createElement("div");
successContainer.id = "success-container";
document.body.appendChild(successContainer);
