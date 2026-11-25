// Registre des jeux : LA seule liste à mettre à jour quand on ajoute ou retire un jeu côté client
// (profil, fiche d'accueil, « jeu au hasard », reprise). Côté serveur : GAMES / SOLO_GAMES dans backend/lib/results.js
// et la contrainte SQL game_results_game_check (docs/sql). Chargé avant router.js et account.js.
// Champs : id, nom, route, mode ('multi' | 'solo'), unite (libellé du score), couleur (pastille), reprise (préfixe de salle).
const GRAN_JEUX = [
  { id: 'imposteur', nom: 'Imposteur', route: '/imposteur', mode: 'multi', unite: 'points', couleur: '#1E4D3B', reprise: 'imp' },
  { id: 'gribouille', nom: 'Gribouille', route: '/gribouille', mode: 'multi', unite: 'points', couleur: '#E0A100', reprise: 'gri' },
  { id: 'petit-bac', nom: 'Petit Bac', route: '/petit-bac', mode: 'multi', unite: 'points', couleur: '#2E7D6B', reprise: 'pb' },
  { id: 'karaoke', nom: 'Karaoké', route: '/karaoke', mode: 'multi', unite: 'points', couleur: '#6E1A1F', reprise: 'kk' },
  { id: 'lyrics', nom: 'Lyrics', route: '/lyrics', mode: 'solo', unite: 'mots', couleur: '#2E63B8' },
  { id: 'mot-cache', nom: 'Mot Caché', route: '/mot-cache', mode: 'solo', unite: 'points', couleur: '#5B8C3A' },
  { id: 'echo', nom: 'Écho', route: '/echo', mode: 'solo', unite: 'niveau', couleur: '#7A4FB0' },
  { id: 'potager', nom: 'Potager', route: '/potager', mode: 'solo', unite: 'niveau', couleur: '#4F8A2B' },
  { id: 'frappe', nom: 'Course de frappe', route: '/frappe', mode: 'solo', unite: 'mots/min', couleur: '#2F3134' },
];

const granStats = (() => {
  const CLE = 'granGames:stats:';
  const MAX_RECENTES = 20;
  const entier = (v, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.trunc(v))) : 0);
  const vide = () => ({ parties: 0, victoires: 0, meilleur: 0, total: 0, derniere: null, recentes: [] });

  function local(id) {
    const s = vide();
    try {
      const o = JSON.parse(localStorage.getItem(CLE + id));
      if (!o || typeof o !== 'object') return s;
      s.parties = entier(o.parties); s.victoires = entier(o.victoires); s.meilleur = entier(o.meilleur); s.total = entier(o.total);
      s.derniere = typeof o.derniere === 'string' ? o.derniere.slice(0, 40) : null;
      if (Array.isArray(o.recentes)) {
        s.recentes = o.recentes.slice(0, MAX_RECENTES).map((r) => ({ score: entier(r && r.score), gagne: !!(r && r.gagne), date: r && typeof r.date === 'string' ? r.date.slice(0, 40) : '' }));
      }
    } catch { /* stockage indisponible ou corrompu */ }
    return s;
  }

  // Option serveur:false : ne pas émettre solo_result (Lyrics a déjà son événement lyrics_result).
  function enregistrer(id, { score = 0, gagne = false, manches = 1, meta = {}, serveur = true } = {}) {
    const sc = entier(score, 1e6);
    const s = local(id);
    const date = new Date().toISOString();
    s.parties += 1;
    if (gagne) s.victoires += 1;
    s.total += sc;
    if (sc > s.meilleur) s.meilleur = sc;
    s.derniere = date;
    s.recentes.unshift({ score: sc, gagne: !!gagne, date });
    s.recentes.length = Math.min(s.recentes.length, MAX_RECENTES);
    try { localStorage.setItem(CLE + id, JSON.stringify(s)); } catch { /* stockage indisponible */ }
    try {
      if (serveur && typeof granAuth !== 'undefined' && granAuth.user() && typeof socket !== 'undefined' && socket.connected) {
        socket.emit('solo_result', { game: id, score: sc, won: !!gagne, rounds: entier(manches, 100) || 1, meta });
      }
    } catch { /* l'envoi ne doit jamais gêner la partie */ }
    try { window.dispatchEvent(new CustomEvent('gran:stats', { detail: { id } })); } catch { /* ignoré */ }
  }

  return { enregistrer, local };
})();
