const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { PORT, isOriginAllowed, MAX_BUFFER_BYTES } = require("./config");
const { createRateLimiter, createKeyedLimiter } = require("./lib/util");
const { ytSearchHandler } = require("./lib/ytSearch");
const { getSupabase } = require("./lib/supabase");
const { authMiddleware, announceAuth, registerAccount } = require("./lib/auth");
const { createResults } = require("./lib/results");
const { createImposteur } = require("./games/imposteur");
const { createKaraoke } = require("./games/karaoke");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Render est derrière un proxy : req.ip = vraie IP du client
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: MAX_BUFFER_BYTES,
  // Filtre aussi le transport websocket (l'option cors ne couvre que les requêtes HTTP).
  allowRequest: (req, cb) => cb(null, isOriginAllowed(req.headers.origin)),
  cors: {
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => res.send("Backend is alive!"));
app.get("/yt-search", ytSearchHandler());

// Vérifie vraiment Supabase (utile au keep-alive). Résultat mis en cache 30 s, limite par IP.
const allowHealth = createKeyedLimiter({ max: 30, windowMs: 60 * 1000 });
let healthCache = null; // { at, status, body }
app.get("/health", async (req, res) => {
  if (!allowHealth(req.ip)) return res.status(429).json({ ok: false });
  if (healthCache && Date.now() - healthCache.at < 30000) return res.status(healthCache.status).json(healthCache.body);
  const done = (status, body) => {
    healthCache = { at: Date.now(), status, body };
    res.status(status).json(body);
  };
  const supabase = getSupabase();
  if (!supabase) return done(503, { ok: false });
  try {
    const { error } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .limit(1)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw error;
    done(200, { ok: true });
  } catch {
    done(503, { ok: false });
  }
});

io.use(authMiddleware());

const results = createResults();
const imposteur = createImposteur(io, results);
const karaoke = createKaraoke(io, results);

io.on("connection", (socket) => {
  console.log("✅ Un joueur s'est connecté :", socket.id);

  // Anti-flood : au-delà du quota, les messages du socket sont ignorés.
  const allow = createRateLimiter({ capacity: 30, perSecond: 15 });
  socket.on("error", () => {}); // évite le log « Missing error handler » sur rate_limited
  socket.use((packet, next) => (allow() ? next() : next(new Error("rate_limited"))));

  announceAuth(socket);
  registerAccount(socket, undefined, (uid) => {
    // Compte supprimé : plus aucun socket du compte ne garde l'identité (ni les joueurs en salle).
    for (const s of io.sockets.sockets.values()) if (s.data.userId === uid) s.data.userId = null;
    imposteur.forgetUser(uid);
    karaoke.forgetUser(uid);
  });
  results.registerLyrics(socket);
  imposteur.register(socket);
  karaoke.register(socket);

  socket.on("disconnect", () => {
    imposteur.onDisconnect(socket);
    karaoke.onDisconnect(socket);
    console.log("❌ Un joueur s'est déconnecté :", socket.id);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 Serveur WebSocket lancé sur http://localhost:${PORT}`);
  });
}

module.exports = { server, io, resetHealthCache: () => { healthCache = null; } };
