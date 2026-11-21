const globals = require("globals");

// Contrat entre scripts classiques (tous chargés dans index.html, mêmes globales).
// Défini dans config.js / imposteur.js / lyrics.js / karaoke.js : voir l'ordre des <script>.
const SHARED_GLOBALS = {
  io: "readonly", YT: "readonly",
  GRAN_BACKEND: "readonly", GRAN_SUPABASE_URL: "readonly", GRAN_SUPABASE_KEY: "readonly",
  socket: "readonly", granAuth: "readonly", granAccount: "readonly", granUI: "readonly", granRouter: "readonly", esc: "readonly", kk: "readonly", kkCleanup: "readonly",
  joinImpostorRoom: "readonly", resetImposteur: "readonly", onRoomUpdate: "readonly", onRoomCreated: "readonly", showToast: "readonly",
  topSongsWithCache: "readonly", searchWithCache: "readonly", getLyricsWithCache: "readonly",
  getSyncedLyrics: "readonly", _tryLyricsOvh: "readonly", _tryLrclibDirect: "readonly",
  _cacheStoreLyrics: "readonly", karaokeAdvance: "readonly", karaokeToggleAutoPlay: "readonly",
  // Données fictives (demo-data.js) pour Plus ou Moins et Course de frappe
  DEMO_POM_THEMES: "readonly", DEMO_POM_RECORD: "readonly", DEMO_POM_SOURCE: "readonly",
  DEMO_FRAPPE_CODE: "readonly", DEMO_FRAPPE_PHRASES: "readonly", DEMO_FRAPPE_JOUEURS: "readonly",
  // État du jeu de l'imposteur, réinitialisé par le leave() d'imposteur dans app.js
  currentRoomId: "writable", currentPlayers: "writable", currentUsername: "writable",
  currentTurn: "writable", currentRound: "writable", impostorIndex: "writable",
  votes: "writable", hasVoted: "writable", hasVotedFor: "writable", allHints: "writable",
  gameOptions: "writable", turnTimer: "writable", countdownInterval: "writable",
};

module.exports = [
  { ignores: ["**/node_modules/**", "gran-games-design/**", "design/**"] },
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
