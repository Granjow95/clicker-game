const { createKeyedLimiter } = require("./util");
const { isOriginAllowed } = require("../config");

const VIDEO_ID = /^[\w-]{11}$/;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_CONCURRENT = 4;
const CACHE_MAX = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map(); // requête -> { at, ids } (ordre d'insertion = ancienneté)
const inFlight = new Map(); // requête -> Promise<ids>
// Budget de requêtes sortantes vers YouTube (le cache n'en consomme pas) : par IP (salles et route HTTP confondues) et global.
const ipBudget = createKeyedLimiter({ max: 30, windowMs: 60_000 });
const globalBudget = createKeyedLimiter({ max: 60, windowMs: 60_000 });
let running = 0;

// Corps de réponse lu au plus jusqu'à `max` octets.
async function readCapped(r, max) {
  if (!r.body || !r.body.getReader) return (await r.text()).slice(0, max);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (size >= max) { reader.cancel().catch(() => {}); break; }
  }
  return out;
}

async function fetchIds(q) {
  // sp=EgIQAQ%3D%3D → filtre « Vidéos » uniquement (exclut chaînes / playlists)
  const url = "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(q) + "&sp=EgIQAQ%253D%253D";
  const r = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await readCapped(r, MAX_HTML_BYTES);
  // Plusieurs candidats : certaines vidéos refusent l'intégration (erreur 101/150),
  // le front essaie la suivante jusqu'à en trouver une lisible.
  const ids = [];
  const re = /"videoId":"([\w-]{11})"/g;
  let m;
  while ((m = re.exec(html)) !== null && ids.length < 10) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

// IDs des premières vidéos YouTube pour `query` (au plus `limit`). Cache mémoire et requêtes identiques partagées.
// Ne lève jamais : liste vide en cas d'échec (non mis en cache), null si le budget est épuisé (à distinguer :
// « aucune vidéo » et « réessaie plus tard » n'appellent pas la même réponse). `ip` : client à l'origine (budget par IP).
async function searchVideoIds(query, limit = 10, { ip } = {}) {
  const q = String(query || "").slice(0, 200).trim();
  if (!q) return [];
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ids.slice(0, limit);
  let p = inFlight.get(key);
  if (!p) {
    if (running >= MAX_CONCURRENT || (ip && !ipBudget(ip)) || !globalBudget("all")) return null;
    running++;
    p = fetchIds(q)
      .then((ids) => {
        const valid = ids.filter((id) => VIDEO_ID.test(id));
        if (valid.length) {
          cache.delete(key);
          cache.set(key, { at: Date.now(), ids: valid });
          while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
        }
        return valid;
      })
      .catch((e) => {
        console.error("yt-search error:", e.message);
        return [];
      })
      .finally(() => { running--; inFlight.delete(key); });
    inFlight.set(key, p);
  }
  return (await p).slice(0, limit);
}

// Recherche audio YouTube (karaoké solo) : renvoie les IDs des premières vidéos trouvées.
function ytSearchHandler() {
  const allow = createKeyedLimiter({ max: 30, windowMs: 60_000 }); // 30 recherches / minute / IP
  return async (req, res) => {
    // Réservée au site (mêmes origines que Socket.io) : un autre site ne peut pas se servir du serveur comme relais.
    // Sans en-tête Origin (curl), la requête passe mais reste limitée par IP.
    const origin = req.headers.origin;
    res.header("Vary", "Origin");
    if (!isOriginAllowed(origin)) return res.status(403).json({ videoIds: [], videoId: null, error: "forbidden" });
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Methods", "GET");
    }

    if (!allow(req.ip)) return res.status(429).json({ videoIds: [], videoId: null, error: "rate_limited" });

    const q = (req.query.q || "").toString().slice(0, 200).trim();
    if (!q) return res.json({ videoIds: [], videoId: null });

    const ids = await searchVideoIds(q, 10, { ip: req.ip });
    if (!ids) return res.status(429).json({ videoIds: [], videoId: null, error: "rate_limited" });
    return res.json({ videoIds: ids, videoId: ids[0] || null });
  };
}

module.exports = { ytSearchHandler, searchVideoIds };
