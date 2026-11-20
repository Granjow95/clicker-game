const { clean, createRateLimiter, createKeyedLimiter } = require("./util");
const { getSupabase } = require("./supabase");

const MAX_TOKEN = 4096;
const AUTH_TIMEOUT_MS = 5000;

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms).unref())]);

// 20 handshakes avec jeton par minute et par IP : évite de saturer getUser.
const allowTokenIp = createKeyedLimiter({ max: 20, windowMs: 60 * 1000 });
// Limite de suppression par compte (tous sockets confondus).
const allowDeleteUser = createKeyedLimiter({ max: 3, windowMs: 3600 * 1000 });

// Middleware io.use : fixe l'identité au handshake. Ne refuse jamais la connexion (invité par défaut).
// Seul le jeton vérifié par Supabase donne un userId ; aucun userId n'est lu depuis un payload.
function authMiddleware(getClient = getSupabase) {
  return async (socket, next) => {
    socket.data.userId = null;
    const raw = socket.handshake.auth?.token;
    if (raw === undefined || raw === null || raw === "") return next(); // invité
    const token = typeof raw === "string" && raw.length <= MAX_TOKEN ? raw : "";
    const supabase = getClient();
    if (!supabase) return next(); // comptes désactivés : invité
    if (!token) {
      socket.data.authError = true;
      return next();
    }
    // Derrière le proxy Render (trust proxy = 1) : dernière entrée de X-Forwarded-For = IP vue par le proxy.
    const xff = String(socket.handshake.headers?.["x-forwarded-for"] || "").split(",").pop().trim();
    if (!allowTokenIp(xff || socket.handshake.address || "?")) {
      socket.data.authError = true;
      return next();
    }
    try {
      const { data, error } = await withTimeout(supabase.auth.getUser(token), AUTH_TIMEOUT_MS);
      const id = data?.user?.id;
      if (error || typeof id !== "string") socket.data.authError = true;
      else socket.data.userId = id;
    } catch {
      socket.data.authError = true;
    }
    next();
  };
}

// À appeler dans « connection » : l'événement ne peut partir qu'une fois le socket connecté.
function announceAuth(socket) {
  if (!socket.data.authError) return;
  socket.data.authError = undefined;
  socket.emit("auth_error", { message: "Session invalide, connexion en invité." });
}

// Événement account_delete : supprime le compte du socket authentifié (jamais un id du client).
function registerAccount(socket, getClient = getSupabase, onDeleted = () => {}) {
  const allow = createRateLimiter({ capacity: 2, perSecond: 0.02 });
  let busy = false;
  socket.on("account_delete", async () => {
    if (!allow() || busy) return;
    const userId = socket.data.userId;
    const supabase = getClient();
    if (!userId || !supabase) {
      socket.emit("account_delete_error", { message: "Action indisponible." });
      return;
    }
    if (!allowDeleteUser(userId)) return;
    busy = true;
    try {
      const { error } = await withTimeout(supabase.auth.admin.deleteUser(userId), AUTH_TIMEOUT_MS);
      if (error) throw error;
      onDeleted(userId);
      socket.data.userId = null;
      socket.emit("account_deleted");
    } catch (err) {
      console.error("account_delete :", clean(String(err?.message), 200));
      socket.emit("account_delete_error", { message: "Suppression impossible, réessaie plus tard." });
    } finally {
      busy = false;
    }
  });
}

module.exports = { authMiddleware, announceAuth, registerAccount };
