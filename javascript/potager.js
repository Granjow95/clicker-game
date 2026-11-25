/* global POTAGER_DONNEES, granStats */
// Potager : jeu solo de farming incrémental (idle). Aucun réseau.
// Markup injecté au premier enter() dans `[data-vue="potager"] .jeu-montage` ; boucle 250 ms active seulement quand la vue l'est.
// Sauvegarde : localStorage `granGames:potager` (format versionné), code d'export `GP1.<somme>.<base64 du JSON>`.
(() => {
  const D = POTAGER_DONNEES;
  const CLE = 'granGames:potager';
  const VERSION = 1;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CULT = Object.fromEntries(D.CULTURES.map((c) => [c.id, c]));
  const AMEL = Object.fromEntries(D.AMELIORATIONS.map((a) => [a.id, a]));
  const QUETE = Object.fromEntries(D.QUETES.map((q) => [q.id, q]));
  const MAX_PIECES = 1e15;

  let racine = null;
  let monte = false;
  let etat = null;
  let boucle = null;
  let dernierTick = 0;
  let dernierAuto = 0;
  let onglet = 'boutique';
  let sorties = []; // minuteurs d'animation en vol
  const refs = {};
  let cases = []; // une entrée par parcelle : { btn, svg, barre, cle, fill }

  /* ---------- Calculs ---------- */
  const niveauDe = (xp) => { let n = 1; while (n < D.NIVEAU_MAX && xp >= D.SEUILS_XP[n]) n++; return n; };
  const niv = () => niveauDe(etat.xp);
  const lvl = (id) => etat.amelio[id] || 0;
  const vitesse = (c) => (1 + 0.15 * lvl('arrosoir')) * (c.rare ? 1 + 0.1 * lvl('serre') : 1);
  const valeur = (c) => Math.max(1, Math.round(c.vente * (1 + 0.2 * lvl('engrais')) * (1 + 0.1 * lvl('etal'))));
  const gainRecolte = (c) => valeur(c) * (Math.random() < 0.05 * lvl('epouvantail') ? 2 : 1);
  const dispo = (c) => niv() >= c.niveau && (!c.rare || lvl('serre') > 0);
  const coutAmelio = (a) => Math.round(a.base * Math.pow(a.croissance, lvl(a.id)));
  const coutParcelle = () => Math.round(D.PARCELLES.base * Math.pow(D.PARCELLES.croissance, etat.parcelles.length - D.PARCELLES.depart));
  const niveauParcelle = () => 1 + Math.floor((etat.parcelles.length - D.PARCELLES.depart) * 0.75);
  const fmtN = new Intl.NumberFormat('fr-FR');
  const fmtC = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (n) => (n >= 1e7 ? fmtC.format(n) : fmtN.format(Math.floor(n)));
  const duree = (s) => {
    s = Math.round(s);
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
    return `${Math.floor(s / 3600)} h${Math.floor((s % 3600) / 60) ? ` ${Math.floor((s % 3600) / 60)} min` : ''}`;
  };
  const reduit = () => granUI.reducedMotion();

  function progres(q) {
    const s = etat.stats;
    switch (q.type) {
      case 'recolte': return q.cible ? s.recoltes[q.cible] || 0 : s.total;
      case 'plante': return s.plantes;
      case 'gagner': return s.gagne;
      case 'amelio': return s.achats;
      case 'parcelles': return etat.parcelles.length;
      default: return niv();
    }
  }
  const libelleQuete = (q) => {
    const nom = q.cible ? CULT[q.cible].nom.toLowerCase() : '';
    switch (q.type) {
      case 'recolte': return q.cible ? `Récolte ${q.n} × ${nom}` : `Récolte ${q.n} cultures`;
      case 'plante': return `Plante ${q.n} graines`;
      case 'gagner': return `Gagne ${fmt(q.n)} pièces au total`;
      case 'amelio': return `Achète ${q.n} amélioration${q.n > 1 ? 's' : ''}`;
      case 'parcelles': return `Possède ${q.n} parcelles`;
      default: return `Atteins le niveau ${q.n}`;
    }
  };

  /* ---------- État, sauvegarde, validation ---------- */
  function defaut() {
    return {
      v: VERSION, pieces: 15, xp: 0,
      parcelles: Array.from({ length: D.PARCELLES.depart }, () => ({ c: null, p: 0 })),
      amelio: {}, stats: { recoltes: {}, total: 0, gagne: 0, plantes: 0, achats: 0 },
      quetes: [], graine: 'radis', niveauStat: 1, dernier: Date.now(),
    };
  }
  const nombre = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
  const entier = (v, min, max) => { const n = nombre(v, min, max); return n !== null && Number.isInteger(n) ? n : null; };
  const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

  // Validation : strict (import d'un code) ou tolérant (sauvegarde locale : on borne/répare au lieu de tout rejeter).
  function valider(o, tolerant) {
    if (!objet(o) || o.v !== VERSION || !Array.isArray(o.parcelles)) return null;
    const rep = (v, min, max, ent) => {
      if (tolerant) {
        const x = typeof v === 'number' && !Number.isNaN(v) ? Math.min(max, Math.max(min, v)) : 0;
        return ent ? Math.floor(x) : x;
      }
      return ent ? entier(v, min, max) : nombre(v, min, max);
    };
    const pieces = rep(o.pieces, 0, MAX_PIECES, false);
    const xp = rep(o.xp, 0, 1e12, false);
    if (pieces === null || xp === null) return null;
    if (!tolerant && (o.parcelles.length < D.PARCELLES.depart || o.parcelles.length > D.PARCELLES.max)) return null;
    const parcelles = [];
    for (const pc of o.parcelles.slice(0, D.PARCELLES.max)) {
      if (!objet(pc) || pc.c === null) {
        if (!tolerant && !objet(pc)) return null;
        parcelles.push({ c: null, p: 0 });
        continue;
      }
      const p = rep(pc.p, 0, 1, false);
      if (typeof pc.c !== 'string' || !Object.hasOwn(CULT, pc.c) || p === null) {
        if (!tolerant) return null;
        parcelles.push({ c: null, p: 0 });
        continue;
      }
      parcelles.push({ c: pc.c, p });
    }
    while (tolerant && parcelles.length < D.PARCELLES.depart) parcelles.push({ c: null, p: 0 });
    const amelio = {};
    const ao = objet(o.amelio);
    if (!ao && !tolerant) return null;
    for (const [k, v] of Object.entries(ao || {})) {
      if (!Object.hasOwn(AMEL, k)) { if (tolerant) continue; return null; }
      const n = rep(v, 0, AMEL[k].max, true);
      if (n === null) return null;
      if (n > 0) amelio[k] = n;
    }
    const so = objet(o.stats);
    const ro = so && objet(so.recoltes);
    if (!tolerant && !ro) return null;
    const recoltes = {};
    for (const [k, v] of Object.entries(ro || {})) {
      if (!Object.hasOwn(CULT, k)) { if (tolerant) continue; return null; }
      const n = rep(v, 0, 1e12, true);
      if (n === null) return null;
      recoltes[k] = n;
    }
    const sx = so || {};
    const total = rep(sx.total, 0, 1e12, true);
    const gagne = rep(sx.gagne, 0, 1e15, false);
    const plantes = rep(sx.plantes, 0, 1e12, true);
    const achats = rep(sx.achats, 0, 1e6, true);
    if ([total, gagne, plantes, achats].includes(null)) return null;
    const qs = Array.isArray(o.quetes) ? o.quetes : null;
    if (!qs && !tolerant) return null;
    if (qs && qs.length > D.QUETES.length && !tolerant) return null;
    const quetes = [];
    for (const id of (qs || []).slice(0, D.QUETES.length)) {
      if (typeof id !== 'string' || !Object.hasOwn(QUETE, id) || quetes.includes(id)) { if (tolerant) continue; return null; }
      quetes.push(id);
    }
    let graine = o.graine;
    if (typeof graine !== 'string' || !Object.hasOwn(CULT, graine)) { if (!tolerant) return null; graine = 'radis'; }
    const niveauStat = tolerant ? Math.max(1, rep(o.niveauStat, 1, D.NIVEAU_MAX, true)) : entier(o.niveauStat, 1, D.NIVEAU_MAX);
    const dernier = tolerant && typeof o.dernier !== 'number' ? Date.now() : rep(o.dernier, 0, 1e15, false);
    if (niveauStat === null || dernier === null) return null;
    return {
      v: VERSION, pieces, xp, parcelles, amelio, stats: { recoltes, total, gagne, plantes, achats },
      quetes, graine, niveauStat: Math.min(niveauStat, niveauDe(xp)), dernier: Math.min(dernier, Date.now()),
    };
  }

  const CLE_SECOURS = 'granGames:potager:secours';
  const CLE_NIVEAU_MAX = 'granGames:potager:niveau-max';
  function niveauStatMax() {
    try { const n = parseInt(localStorage.getItem(CLE_NIVEAU_MAX), 10); return Number.isFinite(n) ? n : 0; } catch { return 0; }
  }
  function charger() {
    let brut = null;
    try {
      brut = localStorage.getItem(CLE);
      if (!brut) return defaut();
      const ok = valider(JSON.parse(brut), true);
      if (ok) return ok;
    } catch { /* JSON illisible : on garde une copie ci-dessous */ }
    // Structure inutilisable : copie de secours avant que la sauvegarde suivante n'écrase quoi que ce soit.
    try { if (brut && !localStorage.getItem(CLE_SECOURS)) localStorage.setItem(CLE_SECOURS, brut); } catch { /* stockage indisponible */ }
    return defaut();
  }
  function sauver() {
    if (!etat) return;
    etat.dernier = Date.now();
    try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch { /* stockage indisponible */ }
  }

  const fnv = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };
  function exporter() {
    const json = JSON.stringify({ ...etat, dernier: Date.now() });
    return `GP1.${fnv(json)}.${btoa(json)}`;
  }
  function decoder(code) {
    try {
      const txt = String(code).trim();
      if (txt.length > 20000) return null;
      const [pre, somme, b64, reste] = txt.split('.');
      if (pre !== 'GP1' || reste !== undefined || !/^[0-9a-f]{8}$/.test(somme || '') || !/^[A-Za-z0-9+/=]+$/.test(b64 || '')) return null;
      const json = atob(b64);
      if (fnv(json) !== somme) return null;
      return valider(JSON.parse(json));
    } catch { return null; }
  }

  /* ---------- Règles du jeu ---------- */
  function ajouterXp(n) {
    const avant = niv();
    etat.xp = Math.min(1e12, etat.xp + n);
    const apres = niv();
    if (apres > avant) niveauAtteint(apres);
  }
  function niveauAtteint(n) {
    annoncer(`Niveau de ferme ${n}`);
    granUI.toast(D.CULTURES.some((c) => c.niveau === n && !c.rare) ? 'Une nouvelle culture est disponible.' : 'Ta ferme grandit.', { titre: `Niveau ${n} !` });
    if (n > etat.niveauStat) etat.niveauStat = n;
    if (n > niveauStatMax()) {
      try { localStorage.setItem(CLE_NIVEAU_MAX, String(n)); } catch { /* stockage indisponible */ }
      if (typeof granStats !== 'undefined') granStats.enregistrer('potager', { score: Math.min(1000, Math.floor(etat.stats.gagne)), gagne: true, manches: n, meta: { niveau: n } });
    }
  }
  function crediter(g) {
    etat.pieces = Math.min(MAX_PIECES, etat.pieces + g);
    etat.stats.gagne = Math.min(1e15, etat.stats.gagne + g);
  }

  // Fait avancer la ferme de dt secondes (en ligne comme hors ligne). Avec le panier : récolte et replante en boucle.
  function avancer(dt) {
    const res = { gain: 0, cout: 0, recoltes: 0, evts: [] };
    const panier = lvl('panier') > 0;
    etat.parcelles.forEach((pc, i) => {
      if (!pc.c) return;
      const c = CULT[pc.c];
      const tEff = c.temps / vitesse(c);
      const reste = (1 - pc.p) * tEff;
      if (dt < reste || !panier) { pc.p = Math.min(1, pc.p + dt / tEff); return; }
      const apres = dt - reste;
      const extra = Math.floor(apres / tEff);
      const cycles = 1 + extra;
      pc.p = (apres - extra * tEff) / tEff;
      let g = 0;
      if (cycles <= 40) for (let k = 0; k < cycles; k++) g += gainRecolte(c);
      else g = Math.round(cycles * valeur(c) * (1 + 0.05 * lvl('epouvantail')));
      etat.pieces = Math.max(0, Math.min(MAX_PIECES, etat.pieces - cycles * c.cout));
      crediter(g);
      etat.stats.recoltes[c.id] = Math.min(1e12, (etat.stats.recoltes[c.id] || 0) + cycles);
      etat.stats.total = Math.min(1e12, etat.stats.total + cycles);
      etat.stats.plantes = Math.min(1e12, etat.stats.plantes + cycles);
      res.gain += g; res.cout += cycles * c.cout; res.recoltes += cycles;
      res.evts.push({ i, g });
      ajouterXp(cycles * c.xp);
    });
    return res;
  }

  function planter(i, silencieux) {
    const pc = etat.parcelles[i];
    const c = CULT[etat.graine];
    if (pc.c || !dispo(c)) return false;
    if (etat.pieces < c.cout) { if (!silencieux) refuser(`Il manque des pièces pour planter ${c.nom.toLowerCase()}.`); return false; }
    etat.pieces -= c.cout;
    pc.c = c.id; pc.p = 0;
    etat.stats.plantes = Math.min(1e12, etat.stats.plantes + 1);
    return true;
  }
  function recolter(i) {
    const pc = etat.parcelles[i];
    if (!pc.c || pc.p < 1) return 0;
    const c = CULT[pc.c];
    const g = gainRecolte(c);
    crediter(g);
    etat.stats.recoltes[c.id] = Math.min(1e12, (etat.stats.recoltes[c.id] || 0) + 1);
    etat.stats.total = Math.min(1e12, etat.stats.total + 1);
    pc.c = null; pc.p = 0;
    flotter(i, g);
    ajouterXp(c.xp);
    return g;
  }
  function cliquerParcelle(i) {
    const pc = etat.parcelles[i];
    if (!pc.c) { if (planter(i)) sauverApresAction(); } else if (pc.p >= 1) { recolter(i); sauverApresAction(); }
    majTout();
  }
  function toutRecolter() {
    let n = 0;
    etat.parcelles.forEach((pc, i) => { if (pc.c && pc.p >= 1) { recolter(i); n++; } });
    if (!n) granUI.toast('Rien n’est mûr pour l’instant.', { type: 'info', duree: 2500 });
    sauverApresAction(); majTout();
  }
  function toutPlanter() {
    const c = CULT[etat.graine];
    if (!dispo(c)) { refuser('Cette graine n’est pas encore disponible.'); return; }
    let n = 0;
    for (let i = 0; i < etat.parcelles.length; i++) {
      if (etat.parcelles[i].c) continue;
      if (etat.pieces < c.cout) break;
      if (planter(i, true)) n++;
    }
    if (!n) refuser(etat.parcelles.some((p) => !p.c) ? 'Pas assez de pièces pour cette graine.' : 'Toutes les parcelles sont occupées.');
    sauverApresAction(); majTout();
  }
  function acheterParcelle() {
    const cout = coutParcelle();
    if (etat.parcelles.length >= D.PARCELLES.max || niv() < niveauParcelle() || etat.pieces < cout) { refuser('Parcelle indisponible pour le moment.'); return; }
    etat.pieces -= cout;
    etat.parcelles.push({ c: null, p: 0 });
    const i = etat.parcelles.length - 1;
    ajouterCase(i);
    if (etat.parcelles.length >= D.PARCELLES.max) { refs.achat.remove(); cases[i].btn.focus(); }
    annoncer(`Parcelle ${i + 1} achetée`);
    sauverApresAction(); majTout();
  }
  function acheterAmelio(id) {
    const a = AMEL[id];
    const cout = coutAmelio(a);
    if (lvl(id) >= a.max || niv() < a.niveau || etat.pieces < cout) { refuser('Amélioration indisponible pour le moment.'); return; }
    etat.pieces -= cout;
    etat.amelio[id] = lvl(id) + 1;
    etat.stats.achats = Math.min(1e6, etat.stats.achats + 1);
    annoncer(`${a.nom} niveau ${lvl(id)}`);
    sauverApresAction(); majTout();
  }
  function reclamer(id) {
    const q = QUETE[id];
    if (!q || etat.quetes.includes(id) || progres(q) < q.n) return;
    etat.quetes.push(id);
    etat.pieces = Math.min(MAX_PIECES, etat.pieces + q.pieces);
    granUI.toast(`+${fmt(q.pieces)} pièces${q.xp ? `, +${q.xp} XP` : ''}`, { titre: 'Objectif atteint.', duree: 3000 });
    if (q.xp) ajouterXp(q.xp);
    sauverApresAction(); majTout();
  }
  function choisirGraine(id) {
    if (!dispo(CULT[id])) return;
    etat.graine = id;
    majTout();
  }
  const sauverApresAction = () => sauver();
  function refuser(msg) {
    annoncer(msg);
    granUI.toast(msg, { type: 'erreur', duree: 2500 });
    if (!reduit()) granUI.shake(refs.pieces.parentNode);
  }
  function annoncer(msg) { if (refs.live) { refs.live.textContent = ''; setTimeout(() => { if (refs.live) refs.live.textContent = msg; }, 30); } }

  /* ---------- Sprites pixel art ---------- */
  function sprite(c, stade) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'pot-sprite');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const r = (x, y, w, h, fill, op) => {
      const e = document.createElementNS(SVG_NS, 'rect');
      e.setAttribute('x', x); e.setAttribute('y', y); e.setAttribute('width', w); e.setAttribute('height', h); e.setAttribute('fill', fill);
      if (op) e.setAttribute('fill-opacity', op);
      svg.append(e);
    };
    const V = '#7FB342', VF = '#2F6B22', T = '#4E8A2E', K = c ? c.couleur : '#fff';
    if (stade === 'graine') { r(6, 12, 1, 1, '#2A1A0E'); r(9, 13, 1, 1, '#2A1A0E'); return svg; }
    if (stade === 0) { r(7, 10, 2, 3, T); r(5, 9, 2, 2, V); r(9, 9, 2, 2, V); return svg; }
    if (stade === 1) { r(7, 6, 2, 7, T); r(4, 8, 3, 2, V); r(9, 6, 3, 2, V); r(5, 5, 2, 2, VF); r(10, 9, 2, 2, VF); return svg; }
    switch (c.forme) {
      case 'racine': r(5, 3, 2, 5, V); r(7, 2, 2, 6, VF); r(9, 3, 2, 5, V); r(5, 9, 6, 2, K); r(6, 11, 4, 1, K); r(7, 12, 2, 2, K); r(5, 9, 2, 1, '#fff', .3); break;
      case 'rond': r(3, 5, 10, 7, VF); r(4, 4, 8, 2, V); r(4, 8, 3, 3, K); r(9, 7, 3, 3, K); r(7, 10, 3, 3, K); r(4, 8, 1, 1, '#fff', .45); r(9, 7, 1, 1, '#fff', .45); break;
      case 'epi': r(7, 3, 2, 11, T); r(3, 8, 4, 2, V); r(9, 6, 4, 2, V); r(6, 3, 4, 6, K); r(7, 3, 1, 6, '#fff', .35); r(5, 4, 2, 5, V); r(10, 4, 1, 5, V); break;
      case 'gros': r(2, 8, 4, 2, V); r(10, 7, 4, 2, V); r(7, 4, 2, 3, T); r(3, 7, 10, 7, K); r(7, 7, 2, 7, '#000', .22); r(4, 8, 2, 1, '#fff', .35); break;
      default: r(7, 7, 2, 7, T); r(4, 10, 3, 2, V); r(9, 11, 3, 2, V); r(4, 2, 8, 6, K); r(5, 1, 6, 1, K); r(5, 8, 6, 1, K); r(6, 3, 4, 4, '#4A2C12'); r(7, 4, 2, 2, '#7A4A1E');
    }
    return svg;
  }

  /* ---------- Interface ---------- */
  const { el } = granUI;
  const txt = (n, v) => { if (n.textContent !== v) n.textContent = v; };
  const attr = (n, k, v) => { if (n.getAttribute(k) !== String(v)) n.setAttribute(k, v); };

  function construire() {
    refs.pieces = el('b', { class: 'pot-pieces__n' }, '0');
    refs.niveau = el('b', {}, '1');
    refs.xpTxt = el('span', { class: 'pot-xp__txt' }, '');
    refs.xpBarre = el('i', {});
    refs.live = el('p', { class: 'pot-sr', role: 'status', 'aria-live': 'polite' });
    refs.absence = el('section', { class: 'pot-absence', hidden: true, 'aria-label': 'Résumé de ton absence' },
      el('div', { class: 'pot-absence__corps', role: 'status' }),
      el('button', { type: 'button', class: 'key key--compact key--principal', onclick: () => { refs.absence.hidden = true; } }, 'Super !'));
    refs.absenceCorps = refs.absence.firstChild;

    const hud = el('header', { class: 'pot-hud' },
      el('div', { class: 'pot-pieces' }, el('span', { class: 'pot-piece', 'aria-hidden': 'true' }), el('span', { class: 'pot-sr' }, 'Pièces : '), refs.pieces),
      el('div', { class: 'pot-niveau' },
        el('div', { class: 'pot-niveau__ligne' }, el('span', {}, 'Ferme niv. '), refs.niveau, refs.xpTxt),
        el('span', { class: 'pot-xp', 'aria-hidden': 'true' }, refs.xpBarre)));

    refs.grille = el('div', { class: 'pot-grille' });
    refs.achat = el('button', { type: 'button', class: 'pot-achat', onclick: acheterParcelle });
    refs.achatCout = el('span', { class: 'pot-achat__cout' }, '');
    refs.achat.append(el('span', { class: 'pot-achat__plus', 'aria-hidden': 'true' }, '+'), el('span', { class: 'pot-achat__lib' }, 'Parcelle'), refs.achatCout);
    refs.grille.append(refs.achat);
    cases = [];
    etat.parcelles.forEach((_, i) => ajouterCase(i));

    const barre = el('div', { class: 'pot-barre-actions' },
      el('button', { type: 'button', class: 'key key--compact key--principal', onclick: toutRecolter }, 'Tout récolter'),
      el('button', { type: 'button', class: 'key key--compact key--secondaire', onclick: toutPlanter }, 'Tout planter'));

    const onglets = [['boutique', 'Boutique'], ['amelio', 'Améliorations'], ['objectifs', 'Objectifs'], ['sauvegarde', 'Sauvegarde']];
    refs.onglets = {};
    refs.panneaux = {};
    const tabs = el('div', { class: 'pot-onglets', role: 'group', 'aria-label': 'Panneaux' },
      onglets.map(([id, nom]) => {
        const b = el('button', { type: 'button', class: 'pot-onglet', 'aria-pressed': id === onglet ? 'true' : 'false', onclick: () => choisirOnglet(id) }, nom);
        refs.onglets[id] = b;
        return b;
      }));
    const panneaux = onglets.map(([id]) => {
      const p = el('section', { class: 'pot-panneau', 'aria-label': onglets.find((o) => o[0] === id)[1], hidden: id !== onglet });
      refs.panneaux[id] = p;
      return p;
    });
    construireBoutique(); construireAmelio(); construireObjectifs(); construireSauvegarde();

    racine.replaceChildren(el('div', { class: 'potager' },
      el('h1', { class: 'pot-titre' }, 'Potager'),
      refs.absence, hud,
      el('div', { class: 'pot-corps' },
        el('div', { class: 'pot-ferme' }, refs.grille, barre),
        el('div', { class: 'pot-cote' }, tabs, panneaux)),
      refs.live));
  }

  function ajouterCase(i) {
    const btn = el('button', { type: 'button', class: 'pot-parcelle', onclick: () => cliquerParcelle(i) });
    const sol = el('span', { class: 'pot-sol', 'aria-hidden': 'true' });
    const fill = el('i', {});
    const barre = el('span', { class: 'pot-pousse', 'aria-hidden': 'true' }, fill);
    const cell = el('div', { class: 'pot-case' }, btn);
    btn.append(sol, barre);
    cases[i] = { btn, cell, sol, fill, cle: '', svg: null, p: -1 };
    refs.grille.insertBefore(cell, refs.achat.parentNode === refs.grille ? refs.achat : null);
  }

  function choisirOnglet(id) {
    onglet = id;
    for (const k of Object.keys(refs.panneaux)) { refs.panneaux[k].hidden = k !== id; attr(refs.onglets[k], 'aria-pressed', k === id); }
    majPanneaux();
  }

  function construireBoutique() {
    refs.graines = {};
    const liste = el('ul', { class: 'pot-liste' });
    for (const c of D.CULTURES) {
      const nom = el('b', {}, c.nom);
      const info = el('span', { class: 'pot-item__info' }, '');
      const b = el('button', { type: 'button', class: 'pot-item', onclick: () => choisirGraine(c.id) },
        el('span', { class: 'pot-item__icone', 'aria-hidden': 'true' }, sprite(c, 2)), el('span', { class: 'pot-item__txt' }, nom, info));
      liste.append(el('li', {}, b));
      refs.graines[c.id] = { b, info };
    }
    refs.panneaux.boutique.replaceChildren(
      el('p', { class: 'pot-aide' }, 'Choisis une graine, puis touche une parcelle vide pour la planter. Touche une plante mûre pour la récolter.'), liste);
  }
  function majBoutique() {
    for (const c of D.CULTURES) {
      const { b, info } = refs.graines[c.id];
      const ok = dispo(c);
      b.disabled = !ok;
      attr(b, 'aria-pressed', etat.graine === c.id);
      const raison = niv() < c.niveau ? `Niveau ${c.niveau} requis` : 'Serre requise';
      txt(info, ok
        ? `Graine ${fmt(c.cout)} · ${duree(c.temps / vitesse(c))} · vend ${fmt(valeur(c))}`
        : raison);
      b.classList.toggle('pot-item--cher', ok && etat.pieces < c.cout);
    }
  }

  function construireAmelio() {
    refs.amelios = {};
    const liste = el('ul', { class: 'pot-liste' });
    for (const a of D.AMELIORATIONS) {
      const niveau = el('span', { class: 'pot-item__niv' }, '');
      const effet = el('span', { class: 'pot-item__info' }, a.effet);
      const b = el('button', { type: 'button', class: 'key key--compact key--principal pot-item__achat', onclick: () => acheterAmelio(a.id) }, '');
      liste.append(el('li', { class: 'pot-ligne' }, el('div', { class: 'pot-item__txt' }, el('b', {}, a.nom), niveau, effet), b));
      refs.amelios[a.id] = { niveau, b };
    }
    refs.panneaux.amelio.replaceChildren(liste);
  }
  function majAmelio() {
    for (const a of D.AMELIORATIONS) {
      const { niveau, b } = refs.amelios[a.id];
      const n = lvl(a.id);
      txt(niveau, a.max === 1 ? (n ? ' · acquis' : '') : ` · niv. ${n}/${a.max}`);
      let lib; let off = true;
      if (n >= a.max) lib = 'Au maximum';
      else if (niv() < a.niveau) lib = `Niveau ${a.niveau}`;
      else { const c = coutAmelio(a); lib = `Acheter · ${fmt(c)}`; off = etat.pieces < c; }
      txt(b, lib);
      b.disabled = off;
      attr(b, 'aria-label', `${a.nom} : ${lib}`);
    }
  }

  function construireObjectifs() {
    refs.quetes = [];
    const liste = el('ul', { class: 'pot-liste' });
    for (let k = 0; k < 3; k++) {
      const titre = el('b', {});
      const prog = el('span', { class: 'pot-item__info' }, '');
      const fill = el('i', {});
      const b = el('button', { type: 'button', class: 'key key--compact key--principal pot-item__achat', onclick: () => reclamer(b.dataset.id) }, 'Réclamer');
      const li = el('li', { class: 'pot-ligne' }, el('div', { class: 'pot-item__txt' }, titre, prog, el('span', { class: 'pot-mini', 'aria-hidden': 'true' }, fill)), b);
      liste.append(li);
      refs.quetes.push({ li, titre, prog, fill, b });
    }
    refs.quetesFin = el('p', { class: 'pot-aide', hidden: true }, 'Tous les objectifs sont accomplis. Bravo, fermier !');
    refs.panneaux.objectifs.replaceChildren(liste, refs.quetesFin);
  }
  function majObjectifs() {
    const actives = D.QUETES.filter((q) => !etat.quetes.includes(q.id)).slice(0, 3);
    refs.quetesFin.hidden = actives.length > 0;
    refs.quetes.forEach((s, k) => {
      const q = actives[k];
      s.li.hidden = !q;
      if (!q) return;
      const p = Math.min(progres(q), q.n);
      s.b.dataset.id = q.id;
      txt(s.titre, libelleQuete(q));
      txt(s.prog, `${fmt(p)} / ${fmt(q.n)} · +${fmt(q.pieces)} pièces${q.xp ? ` · +${q.xp} XP` : ''}`);
      s.fill.style.transform = `scaleX(${p / q.n})`;
      s.b.disabled = p < q.n;
    });
  }

  function construireSauvegarde() {
    refs.code = el('textarea', { class: 'pot-code', rows: 3, 'aria-label': 'Code de sauvegarde', spellcheck: 'false', autocomplete: 'off', placeholder: 'Colle ici un code de sauvegarde GP1…' });
    refs.msg = el('p', { class: 'pot-msg', role: 'status' });
    refs.confirm = el('div', { class: 'pot-confirm', hidden: true, role: 'group', 'aria-label': 'Confirmer la remise à zéro' },
      el('p', {}, 'Tout effacer et recommencer ? Cette action est définitive.'),
      el('button', { type: 'button', class: 'key key--compact key--danger', onclick: recommencer }, 'Oui, tout effacer'),
      el('button', { type: 'button', class: 'key key--compact key--secondaire', onclick: () => { refs.confirm.hidden = true; refs.btnReset.focus(); } }, 'Annuler'));
    refs.btnReset = el('button', { type: 'button', class: 'key key--compact key--fantome', onclick: () => { refs.confirm.hidden = false; refs.confirm.querySelector('button').focus(); } }, 'Recommencer');
    refs.panneaux.sauvegarde.replaceChildren(
      el('p', { class: 'pot-aide' }, 'La partie est sauvegardée sur cet appareil. Exporte un code pour la garder ou la déplacer.'),
      el('div', { class: 'pot-actions' },
        el('button', { type: 'button', class: 'key key--compact key--secondaire', onclick: exporterVersZone }, 'Exporter'),
        el('button', { type: 'button', class: 'key key--compact key--secondaire', onclick: importerDepuisZone }, 'Importer'),
        refs.btnReset),
      refs.code, refs.msg, refs.confirm);
  }
  function message(t, erreur) { refs.msg.textContent = t; refs.msg.classList.toggle('pot-msg--erreur', !!erreur); refs.msg.setAttribute('role', erreur ? 'alert' : 'status'); }
  async function exporterVersZone() {
    sauver();
    const code = exporter();
    refs.code.value = code;
    refs.code.select();
    let copie = false;
    try { await navigator.clipboard.writeText(code); copie = true; } catch { /* presse-papiers refusé */ }
    message(copie ? 'Code copié dans le presse-papiers.' : 'Code prêt : copie-le depuis la zone ci-dessous.', false);
  }
  function importerDepuisZone() {
    const nouvel = decoder(refs.code.value);
    if (!nouvel) { message('Code invalide ou modifié : ta partie n’a pas été touchée.', true); return; }
    nouvel.dernier = Date.now();
    etat = nouvel;
    reconstruireGrille();
    sauver();
    majTout();
    refs.code.value = '';
    message('Partie importée.', false);
    if (refs.live) refs.live.textContent = '';
    annoncer('Sauvegarde importée');
    granUI.toast('Sauvegarde importée.', { duree: 2500 });
  }
  function recommencer() {
    etat = defaut();
    refs.confirm.hidden = true;
    reconstruireGrille();
    sauver();
    majTout();
    message('Nouvelle partie commencée.', false);
    refs.btnReset.focus();
  }
  function reconstruireGrille() {
    refs.grille.replaceChildren(refs.achat);
    cases = [];
    etat.parcelles.forEach((_, i) => ajouterCase(i));
    if (etat.parcelles.length >= D.PARCELLES.max) refs.achat.remove();
  }

  /* ---------- Mises à jour ---------- */
  function majParcelle(i) {
    const pc = etat.parcelles[i];
    const k = cases[i];
    const c = pc.c ? CULT[pc.c] : null;
    const stade = !c ? 'vide' : pc.p >= 1 ? 'mure' : pc.p < 0.34 ? 0 : 1;
    const cle = `${c ? c.id : ''}:${stade}`;
    if (cle !== k.cle) {
      k.cle = cle;
      if (k.svg) k.svg.remove();
      k.svg = stade === 'vide' ? null : sprite(c, stade === 'mure' ? 2 : stade);
      if (k.svg) k.btn.insertBefore(k.svg, k.btn.lastChild);
      const etatTxt = !c ? 'vide' : `${c.nom.toLowerCase()}, ${stade === 'mure' ? 'mûre' : 'en croissance'}`;
      k.btn.setAttribute('aria-label', `Parcelle ${i + 1} : ${etatTxt}`);
      k.btn.classList.toggle('pot-parcelle--mure', stade === 'mure');
      k.btn.classList.toggle('pot-parcelle--vide', stade === 'vide');
      k.btn.dataset.stade = String(stade);
    }
    const p = Math.round(pc.p * 100) / 100;
    if (p !== k.p) { k.p = p; k.fill.style.transform = `scaleX(${stade === 'vide' ? 0 : p})`; }
  }
  function majHud() {
    txt(refs.pieces, fmt(etat.pieces));
    const n = niv();
    txt(refs.niveau, String(n));
    if (n >= D.NIVEAU_MAX) { txt(refs.xpTxt, ' · niveau max'); refs.xpBarre.style.transform = 'scaleX(1)'; return; }
    const de = D.SEUILS_XP[n - 1];
    const vers = D.SEUILS_XP[n];
    txt(refs.xpTxt, ` · XP ${fmt(etat.xp - de)} / ${fmt(vers - de)}`);
    refs.xpBarre.style.transform = `scaleX(${(etat.xp - de) / (vers - de)})`;
  }
  function majAchat() {
    if (refs.achat.parentNode !== refs.grille) return;
    const cout = coutParcelle();
    const lvlReq = niveauParcelle();
    const verrou = niv() < lvlReq;
    const lib = verrou ? `Niveau ${lvlReq}` : fmt(cout);
    txt(refs.achatCout, lib);
    refs.achat.disabled = verrou || etat.pieces < cout;
    attr(refs.achat, 'aria-label', `Acheter la parcelle ${etat.parcelles.length + 1} : ${verrou ? `niveau ${lvlReq} requis` : `${fmt(cout)} pièces`}`);
  }
  function majPanneaux() {
    if (onglet === 'boutique') majBoutique();
    else if (onglet === 'amelio') majAmelio();
    else if (onglet === 'objectifs') majObjectifs();
  }
  function majTout() {
    if (!racine || !refs.grille) return;
    etat.parcelles.forEach((_, i) => majParcelle(i));
    majHud(); majAchat(); majPanneaux();
  }

  function flotter(i, g) {
    if (reduit() || !cases[i]) return;
    const f = el('span', { class: 'pot-flotte', 'aria-hidden': 'true' }, `+${fmt(g)}`);
    cases[i].cell.append(f);
    const fin = () => f.remove();
    f.addEventListener('animationend', fin, { once: true });
    sorties.push(setTimeout(fin, 1400));
  }

  /* ---------- Boucle ---------- */
  function tick() {
    const now = Date.now();
    const dt = Math.min(Math.max(0, (now - dernierTick) / 1000), D.PLAFOND_HORS_LIGNE);
    dernierTick = now;
    if (dt > 0) {
      const res = avancer(dt);
      for (const e of res.evts.slice(0, 6)) flotter(e.i, e.g);
    }
    majTout();
    if (now - dernierAuto >= 10000) { dernierAuto = now; sauver(); }
  }
  const surPagehide = () => sauver();
  const surVisibilite = () => { if (document.hidden) sauver(); };

  function resumeAbsence(secondes) {
    const res = avancer(secondes);
    const murs = etat.parcelles.filter((p) => p.c && p.p >= 1).length;
    const nGain = Math.max(0, Math.floor(res.gain - res.cout));
    if (!nGain && !murs) return;
    const corps = refs.absenceCorps;
    const nombreEl = el('b', {}, '0');
    corps.replaceChildren(
      el('h2', { class: 'pot-absence__titre' }, 'Pendant ton absence…'),
      el('p', {}, `${duree(secondes)} ont passé. `,
        nGain ? el('span', {}, 'Tes paniers ont rapporté ', nombreEl, ` pièces net (${fmt(res.recoltes)} récolte${res.recoltes > 1 ? 's' : ''}). `) : null,
        murs ? `${murs} parcelle${murs > 1 ? 's sont mûres' : ' est mûre'}.` : ''));
    refs.absence.hidden = false;
    if (nGain) granUI.countUp(nombreEl, nGain, { duration: 800 }).then(() => { nombreEl.textContent = fmt(nGain); });
  }

  granRouter.register('potager', {
    enter() {
      racine = document.querySelector('[data-vue="potager"] .jeu-montage');
      if (!racine) return;
      etat = charger();
      const maintenant = Date.now();
      const absence = Math.min(Math.max(0, (maintenant - etat.dernier) / 1000), D.PLAFOND_HORS_LIGNE);
      if (!monte) { monte = true; construire(); } else { reconstruireGrille(); }
      refs.absence.hidden = true;
      if (absence >= 60) resumeAbsence(absence);
      majTout();
      sauver();
      dernierTick = Date.now();
      dernierAuto = dernierTick;
      clearInterval(boucle);
      boucle = setInterval(tick, 250);
      window.addEventListener('pagehide', surPagehide);
      document.addEventListener('visibilitychange', surVisibilite);
    },
    leave() {
      clearInterval(boucle);
      boucle = null;
      window.removeEventListener('pagehide', surPagehide);
      document.removeEventListener('visibilitychange', surVisibilite);
      sorties.forEach(clearTimeout);
      sorties = [];
      if (etat) sauver();
    },
  });
})();
