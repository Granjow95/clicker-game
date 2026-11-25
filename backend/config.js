const PORT = process.env.PORT || 3000;
// Render définit RENDER=true : même sans NODE_ENV, on est considéré en production.
const IS_PROD = process.env.NODE_ENV === "production" || !!process.env.RENDER;

// Origines autorisées : ALLOWED_ORIGINS="https://a.com,https://b.com" (séparées par des virgules).
const DEFAULT_ORIGINS = ["https://granjow.netlify.app"];
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;

// Supabase (comptes et historique). Si l'une des deux variables manque, ces fonctions sont désactivées.
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

// Hors production, on accepte aussi localhost pour le développement.
function isOriginAllowed(origin) {
  if (!origin) return true; // requêtes sans en-tête Origin (curl, serveur à serveur)
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return !IS_PROD && (origin === "null" || LOCAL_ORIGIN.test(origin)); // "null" = fichier ouvert en local
}

module.exports = {
  PORT,
  IS_PROD,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ENABLED,
  isOriginAllowed,
  MAX_BUFFER_BYTES: 200 * 1024, // une chanson (paroles) tient largement dedans
  MAX_ROOMS: 500,
  // Plafonds par IP (surchargeables par env ; en test tout vient de 127.0.0.1).
  ROOM_IP_ACTIONS_PER_MIN: Number.parseInt(process.env.ROOM_IP_ACTIONS_PER_MIN, 10) || 60,
  ROOM_IP_MAX_ROOMS: Number.parseInt(process.env.ROOM_IP_MAX_ROOMS, 10) || 5,
  MAX_IMPOSTEUR_PLAYERS: 8,
  MAX_KARAOKE_PLAYERS: 10,
  MAX_GRIBOUILLE_PLAYERS: 8,
  MAX_PETITBAC_PLAYERS: 10,
  ROOM_CODE_ALPHABET: "BCDFGHJKLMNPQRSTVWXZ",
  ROOM_CODE_LENGTH: 4,
  // Période de grâce avant retrait d'un joueur déconnecté en partie (surchargeable pour les tests).
  RESUME_GRACE_MS: Number.parseInt(process.env.RESUME_GRACE_MS, 10) || 120000,
};
