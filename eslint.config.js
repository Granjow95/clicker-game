const globals = require("globals");

// Contrat entre scripts classiques (tous chargés dans index.html, mêmes globales).
// Défini dans config.js / imposteur.js / lyrics.js / karaoke.js : voir l'ordre des <script>.
const SHARED_GLOBALS = {
  io: "readonly", YT: "readonly",
  GRAN_BACKEND: "readonly", socket: "readonly",
  joinImpostorRoom: "readonly", showToast: "readonly",
  topSongsWithCache: "readonly", searchWithCache: "readonly", getLyricsWithCache: "readonly",
  getSyncedLyrics: "readonly", _tryLyricsOvh: "readonly", _tryLrclibDirect: "readonly",
  _cacheStoreLyrics: "readonly", karaokeAdvance: "readonly", karaokeToggleAutoPlay: "readonly",
  // État du jeu de l'imposteur, réinitialisé depuis navigation.js
  currentRoomId: "writable", currentPlayers: "writable", currentUsername: "writable",
  currentTurn: "writable", currentRound: "writable", impostorIndex: "writable",
  votes: "writable", hasVoted: "writable", hasVotedFor: "writable", allHints: "writable",
  gameOptions: "writable", turnTimer: "writable", countdownInterval: "writable",
};

module.exports = [
  { ignores: ["**/node_modules/**"] },
  {
    // Client : scripts classiques partageant des globales (voir config.js)
    files: ["javascript/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, ...SHARED_GLOBALS },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "off", // les fonctions sont appelées depuis index.html (onclick)
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
  },
  {
    files: ["backend/**/*.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: globals.node },
    rules: { "no-undef": "error", "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] },
  },
];
