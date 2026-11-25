/* global module, require */
// Mot Caché : logique pure (globale granMotCache, ou module.exports sous Node pour les tests).
// Aucune dépendance au DOM. Listes : mot-cache-mots.js (globales côté navigateur, require côté Node).
const granMotCache = (() => {
  const LONGUEUR = 5;
  const ESSAIS = 6;

  let listes = null;
  function lire() {
    if (listes) return listes;
    let s = typeof MOT_CACHE_SOLUTIONS !== 'undefined' ? MOT_CACHE_SOLUTIONS : null;
    let a = typeof MOT_CACHE_ACCEPTES !== 'undefined' ? MOT_CACHE_ACCEPTES : null;
    if (!s && typeof module !== 'undefined' && typeof require === 'function') {
      const m = require('./mot-cache-mots.js');
      s = m.MOT_CACHE_SOLUTIONS;
      a = m.MOT_CACHE_ACCEPTES;
    }
    s = s || [];
    a = a || [];
    listes = { solutions: s, valides: new Set([...s, ...a]) };
    return listes;
  }

  /* Coloration en deux passes : exacts d'abord, puis présents dans la limite des occurrences restantes.
     Retourne un tableau de 'exact' | 'present' | 'absent'. */
  function evaluer(essai, solution) {
    const res = Array(essai.length).fill('absent');
    const restant = Object.create(null);
    for (let i = 0; i < solution.length; i += 1) {
      if (essai[i] === solution[i]) res[i] = 'exact';
      else restant[solution[i]] = (restant[solution[i]] || 0) + 1;
    }
    for (let i = 0; i < essai.length; i += 1) {
      if (res[i] === 'exact') continue;
      if (restant[essai[i]] > 0) { res[i] = 'present'; restant[essai[i]] -= 1; }
    }
    return res;
  }

  /* Retire les accents, met en majuscules, ne garde que A-Z. */
  function normaliser(saisie) {
    return String(saisie ?? '')
      .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z]/g, '');
  }

  function estValide(mot) {
    return typeof mot === 'string' && mot.length === LONGUEUR && lire().valides.has(mot);
  }

  /* Clé de jour locale « AAAA-MM-JJ ». */
  function cleDuJour(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }

  /* Mot du jour : même mot pour tout le monde le même jour (calendrier local), ordre non alphabétique. */
  function motDuJour(date = new Date()) {
    const { solutions } = lire();
    const jours = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    return solutions[(((jours * 7919 + 13) % solutions.length) + solutions.length) % solutions.length];
  }

  function motAleatoire(rnd = Math.random) {
    const { solutions } = lire();
    return solutions[Math.floor(rnd() * solutions.length)];
  }

  return { LONGUEUR, ESSAIS, evaluer, normaliser, estValide, cleDuJour, motDuJour, motAleatoire };
})();
if (typeof module !== 'undefined') module.exports = granMotCache;
