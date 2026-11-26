// Nettoie une entrée texte venant d'un client : type, caractères de contrôle et invisibles
// (largeur nulle, marques et contrôles de direction, BOM), longueur.
function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f<>\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, "").trim().slice(0, max);
}

// Entier borné ; renvoie `fallback` si la valeur n'est pas un nombre.
function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Limiteur par socket (seau à jetons) : `capacity` messages en rafale, `perSecond` en continu.
function createRateLimiter({ capacity = 30, perSecond = 15 } = {}) {
  let tokens = capacity;
  let last = Date.now();
  return function allow() {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

// Limiteur à fenêtre fixe par clé (ex. IP) : `max` appels par `windowMs`.
// Balayage des entrées expirées au plus une fois par fenêtre (coût amorti borné). `allow.delete(key)` oublie une clé.
function createKeyedLimiter({ max, windowMs }) {
  const hits = new Map();
  let lastSweep = Date.now();
  function allow(key) {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      lastSweep = now;
      for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    }
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    h.count++;
    return h.count <= max;
  }
  allow.delete = (key) => hits.delete(key);
  allow.size = () => hits.size;
  return allow;
}

// IP du client : derrière le proxy Render (trust proxy = 1), dernière entrée de X-Forwarded-For ; sinon l'adresse du handshake.
function clientIp(socket) {
  const xff = String(socket.handshake?.headers?.["x-forwarded-for"] || "").split(",").pop().trim();
  return xff || socket.handshake?.address || "?";
}

// Code de salle : majuscules, uniquement A-Z, 4 consonnes autorisées ; sinon null.
function normalizeCode(value) {
  const { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } = require("../config");
  const code = clean(value, 10).toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

// Comparaison de mots : sans accents ni casse, ponctuation réduite, article initial retiré.
function normalizeWord(value) {
  if (typeof value !== "string") return "";
  let s = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2019\u2018`\u00b4]/g, "'")
    .replace(/[-\u2010-\u2015_]/g, " ")
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = s.replace(/^(?:l'|(?:le|la|les|un|une|des) )/, "").trim();
  return stripped || s;
}

module.exports = { clean, clampInt, createRateLimiter, createKeyedLimiter, clientIp, normalizeCode, normalizeWord };
