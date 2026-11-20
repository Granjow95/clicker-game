// Nettoie une entrée texte venant d'un client : type, caractères de contrôle, longueur.
function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max);
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

module.exports = { clean, clampInt, createRateLimiter };
