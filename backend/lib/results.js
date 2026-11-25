const { clean, createRateLimiter, createKeyedLimiter } = require("./util");
const { getSupabase } = require("./supabase");

const GAMES = new Set(["imposteur", "lyrics", "karaoke", "gribouille", "petit-bac"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_SCORE = 1000; // plafond réaliste, toutes parties confondues

const num = (v, min, max, fallback) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : fallback;

// Ne garde que des valeurs simples et courtes dans meta.
function cleanMeta(meta) {
  const out = {};
  if (!meta || typeof meta !== "object") return out;
  for (const k of Object.keys(meta).slice(0, 8)) {
    const key = clean(k, 30);
    const v = meta[k];
    if (!key || key === "__proto__") continue;
    if (typeof v === "string") out[key] = clean(v, 60);
    else if (typeof v === "boolean") out[key] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

function createResults(getClient = getSupabase) {
  // Plafonds par compte (indépendants du nombre de sockets) : 30 lignes / 10 min, lyrics 100 / jour.
  const allowRecord = createKeyedLimiter({ max: 30, windowMs: 10 * 60 * 1000 });
  const allowLyricsMin = createKeyedLimiter({ max: 3, windowMs: 60 * 1000 });
  const allowLyricsDay = createKeyedLimiter({ max: 100, windowMs: 24 * 3600 * 1000 });
  // Insertion sans attente : un échec Supabase ne bloque jamais la partie.
  function record({ userId, game, score, won, rounds, durationS, meta }) {
    if (typeof userId !== "string" || !UUID.test(userId)) return;
    if (!GAMES.has(game)) return;
    if (!allowRecord(userId)) return;
    const supabase = getClient();
    if (!supabase) return;
    const row = {
      user_id: userId,
      game,
      score: num(score, 0, MAX_SCORE, 0),
      won: won === true,
      rounds: num(rounds, 1, 100, 1),
      duration_s: durationS == null ? null : num(durationS, 0, 86400, null),
      meta: cleanMeta(meta),
    };
    try {
      Promise.resolve(supabase.from("game_results").insert(row))
        .then(({ error }) => { if (error) console.error("game_results :", clean(String(error.message), 200)); })
        .catch((err) => console.error("game_results :", clean(String(err?.message), 200)));
    } catch (err) {
      console.error("game_results :", clean(String(err?.message), 200));
    }
  }

  // lyrics tourne côté client : score non vérifiable, marqué meta.unverified. Invités refusés.
  function registerLyrics(socket) {
    const allow = createRateLimiter({ capacity: 3, perSecond: 0.1 });
    socket.on("lyrics_result", (data) => {
      if (!allow()) return;
      const userId = socket.data.userId;
      if (!userId || !data || typeof data !== "object") return;
      if (!allowLyricsMin(userId) || !allowLyricsDay(userId)) return;
      record({
        userId,
        game: "lyrics",
        score: data.score,
        won: data.won,
        rounds: data.rounds,
        durationS: data.durationS,
        meta: { unverified: true },
      });
    });
  }

  return { record, registerLyrics };
}

// Au moins 2 comptes (userId) distincts parmi les joueurs : un compte + des invités ne suffit pas.
function hasDistinctAccounts(players) {
  const ids = new Set();
  for (const p of players) if (p && p.userId) ids.add(p.userId);
  return ids.size >= 2;
}

// Fin de partie classée (Gribouille, Petit Bac) : une ligne par compte, rien sous 2 identités distinctes.
// players : { pid, userId } ; scoreOf(pid) -> score final. Gagnant = meilleur score (ex æquo compris).
function recordRanking(results, { game, players, scoreOf, rounds }) {
  if (!results || typeof results.record !== "function") return;
  if (!hasDistinctAccounts(players)) return;
  const identities = new Set(players.map((p) => p.userId || p.pid));
  const score = (p) => scoreOf(p.pid) || 0;
  const best = Math.max(...players.map(score));
  const byUser = new Map(); // un seul enregistrement par compte : le meilleur score
  for (const p of players) {
    if (!p.userId) continue;
    const cur = byUser.get(p.userId);
    if (!cur || score(p) > score(cur)) byUser.set(p.userId, p);
  }
  for (const [userId, p] of byUser) {
    const sc = score(p);
    results.record({
      userId,
      game,
      score: sc,
      won: best > 0 && sc === best,
      rounds,
      meta: { place: 1 + players.filter((q) => score(q) > sc).length, players: identities.size },
    });
  }
}

module.exports = { createResults, cleanMeta, recordRanking, hasDistinctAccounts };
