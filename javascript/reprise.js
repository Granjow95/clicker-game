// Reprise de partie : mémorise dans localStorage la place du joueur dans une salle (ADR 0003 §4).
// Globale : granReprise. Aucune socket ici : chaque jeu appelle save/touch/clear.
// Clé : granGames:reprise:<prefix> (imp, gri, pb, kk) = { code, pid, token, username, exp, max }.
// exp = fin de la période de grâce (repoussée par touch), max = plafond absolu (jointure + 6 h).
const granReprise = (() => {
  const PREFIX_CLE = 'granGames:reprise:';
  const PLAFOND_MS = 6 * 60 * 60 * 1000;
  const PREFIXES = ['imp', 'gri', 'pb', 'kk'];

  const cle = (prefix) => PREFIX_CLE + prefix;
  const lire = (prefix) => {
    try {
      const brut = localStorage.getItem(cle(prefix));
      return brut ? JSON.parse(brut) : null;
    } catch { return null; }
  };
  const ecrire = (prefix, valeur) => {
    try { localStorage.setItem(cle(prefix), JSON.stringify(valeur)); } catch { /* stockage indisponible */ }
  };
  const valide = (e) => !!e && typeof e === 'object'
    && typeof e.code === 'string' && typeof e.pid === 'string' && typeof e.token === 'string'
    && typeof e.exp === 'number' && typeof e.max === 'number'
    && Date.now() < Math.min(e.exp, e.max);

  function clear(prefix) {
    try { localStorage.removeItem(cle(prefix)); } catch { /* stockage indisponible */ }
  }

  return {
    // data : { code, pid, token, username } ; une nouvelle jointure repart d'un plafond de 6 h,
    // un renouvellement de jeton (reprise) conserve le plafond d'origine si le code est inchangé.
    save(prefix, data) {
      if (!data) return;
      const ancien = lire(prefix);
      const now = Date.now();
      const max = ancien && ancien.code === data.code && typeof ancien.max === 'number' ? ancien.max : now + PLAFOND_MS;
      ecrire(prefix, {
        code: String(data.code), pid: String(data.pid), token: String(data.token),
        username: String(data.username || ''),
        exp: typeof data.exp === 'number' ? data.exp : max, // valide tant que la partie est ouverte ; touch() resserre à la sortie
        max,
      });
    },
    // Repousse exp à now + graceMs, sans dépasser max. Sans entrée : ne fait rien.
    touch(prefix, graceMs) {
      const e = lire(prefix);
      if (!e || typeof e.max !== 'number') return;
      e.exp = Math.min(Date.now() + graceMs, e.max);
      ecrire(prefix, e);
    },
    // Entrée valide ou null (purge l'entrée expirée ou corrompue).
    get(prefix) {
      const e = lire(prefix);
      if (valide(e)) return e;
      if (e !== null) clear(prefix);
      return null;
    },
    clear,
    // Toutes les entrées valides : [{ prefix, ...entrée }]
    all() {
      return PREFIXES.map((p) => { const e = this.get(p); return e ? { prefix: p, ...e } : null; }).filter(Boolean);
    },
  };
})();
