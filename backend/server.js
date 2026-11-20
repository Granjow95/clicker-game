const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { PORT, isOriginAllowed, MAX_BUFFER_BYTES } = require("./config");
const { createRateLimiter } = require("./lib/util");
const { ytSearchHandler } = require("./lib/ytSearch");
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

const imposteur = createImposteur(io);
const karaoke = createKaraoke(io);

io.on("connection", (socket) => {
  console.log("✅ Un joueur s'est connecté :", socket.id);

  // Anti-flood : au-delà du quota, les messages du socket sont ignorés.
  const allow = createRateLimiter({ capacity: 30, perSecond: 15 });
  socket.on("error", () => {}); // évite le log « Missing error handler » sur rate_limited
  socket.use((packet, next) => (allow() ? next() : next(new Error("rate_limited"))));

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

module.exports = { server, io };
