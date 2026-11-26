// Pseudos réservés aux comptes (table profiles, index unique sur lower(username)). ADR 0004.
// - Socket connecté à un compte : il joue sous le pseudo de son profil (le pseudo envoyé par le client est ignoré).
// - Invité : il ne peut pas prendre le pseudo d'un compte (ni un sosie : accents, pleine chasse, lettres cyrilliques ou grecques).
// Supabase absent, en erreur ou trop lent : on laisse passer le pseudo demandé (la partie n'est jamais bloquée).
const { clean } = require("./util");
const { getSupabase } = require("./supabase");

const PROFILE_RE = /^[a-zA-Z0-9_]{3,20}$/; // même règle que la contrainte profiles_username_check
const TIMEOUT_MS = 3000;
const TTL_MS = 60 * 1000; // pseudo -> compte
const FREE_TTL_MS = 10 * 1000; // pseudo libre : court, un compte peut être créé ou renommé entre-temps
const OWN_TTL_MS = 15 * 1000; // compte -> son pseudo : court, le renommage passe directement du client à Supabase
const MAX_CACHE = 2000;

const ERR_TAKEN = "Ce pseudo appartient à un compte. Connecte-toi ou choisis-en un autre.";

// Cache borné : expiration par entrée, éviction de la plus ancienne entrée quand il est plein.
function createCache(defaultTtl) {
  const map = new Map();
  return {
    get(key) {
      const e = map.get(key);
      if (!e) return undefined;
      if (Date.now() > e.until) { map.delete(key); return undefined; }
      return e.value;
    },
    set(key, value, ttl = defaultTtl) {
      map.delete(key);
      if (map.size >= MAX_CACHE) map.delete(map.keys().next().value);
      map.set(key, { until: Date.now() + ttl, value });
    },
    clear: () => map.clear(),
  };
}

// Sosies courants (cyrillique, grec) ramenés à leur lettre latine.
const LOOKALIKES = {
  "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s",
  "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
};
// Forme comparable d'un pseudo : compatibilité Unicode (NFKD), sans accents, minuscules, sosies latinisés.
function skeleton(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/./gu, (ch) => LOOKALIKES[ch] || ch);
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms).unref())]);

function createPseudos(getClient = getSupabase) {
  const ownerByName = createCache(TTL_MS); // squelette du pseudo -> id du compte ou null (libre)
  const nameByUser = createCache(OWN_TTL_MS); // userId -> username du profil ou null

  // id du compte qui possède ce pseudo, null s'il est libre, undefined si on ne sait pas (erreur).
  async function ownerOf(name) {
    const key = skeleton(name);
    if (!PROFILE_RE.test(key)) return null; // un pseudo de compte respecte toujours ce format
    const cached = ownerByName.get(key);
    if (cached !== undefined) return cached;
    const supabase = getClient();
    if (!supabase) return undefined;
    try {
      // ilike sans joker : PROFILE_RE exclut % et *, seul « _ » est possible et il est échappé.
      // (pas d'index sur ilike, mais la table profiles reste petite et le résultat est mis en cache)
      const { data, error } = await withTimeout(
        Promise.resolve(supabase.from("profiles").select("id").ilike("username", key.replace(/_/g, "\\_")).limit(1)),
        TIMEOUT_MS
      );
      if (error || !Array.isArray(data)) return undefined;
      const owner = data[0] && typeof data[0].id === "string" ? data[0].id : null;
      ownerByName.set(key, owner, owner ? TTL_MS : FREE_TTL_MS);
      return owner;
    } catch {
      return undefined;
    }
  }

  async function profileName(userId) {
    const cached = nameByUser.get(userId);
    if (cached !== undefined) return cached;
    const supabase = getClient();
    if (!supabase) return null;
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(supabase.from("profiles").select("username").eq("id", userId).maybeSingle()),
        TIMEOUT_MS
      );
      if (error) return null;
      const name = data && typeof data.username === "string" ? clean(data.username, 20) : "";
      const value = PROFILE_RE.test(name) ? name : null;
      nameByUser.set(userId, value);
      if (value) ownerByName.set(value.toLowerCase(), userId);
      return value;
    } catch {
      return null;
    }
  }

  // -> { username } ou { error } ; `requested` est déjà passé par clean().
  async function resolve(socket, requested) {
    const userId = socket.data && socket.data.userId;
    if (userId) {
      const own = await profileName(userId);
      if (own) return { username: own };
    }
    const owner = await ownerOf(requested);
    if (owner && owner !== userId) return { error: ERR_TAKEN };
    return { username: requested };
  }

  // Compte supprimé ou pseudo modifié : on oublie ce qu'on savait.
  function forget() {
    ownerByName.clear();
    nameByUser.clear();
  }

  return { resolve, forget };
}

const shared = createPseudos();

module.exports = { createPseudos, resolveUsername: shared.resolve, forgetPseudos: shared.forget, ERR_TAKEN };
