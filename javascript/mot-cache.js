// Mot Caché : jeu solo (5 lettres, 6 essais). Aucun réseau. Markup injecté au premier enter().
// Logique pure : granMotCache (mot-cache-logique.js). Stats : localStorage « granGames:mot-cache ».
(() => {
  const { LONGUEUR, ESSAIS, evaluer, normaliser, estValide, cleDuJour, motDuJour, motAleatoire } = granMotCache;
  const CLE = 'granGames:mot-cache';
  const { el } = granUI;

  const LIBELLES = { exact: 'bien placée', present: 'mal placée', absent: 'absente' };
  const MARQUES = { exact: '✓', present: '~', absent: '×' };
  const RANGS = { absent: 1, present: 2, exact: 3 };
  const CLAVIER = [['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'], ['ENTREE', 'W', 'X', 'C', 'V', 'B', 'N', 'EFFACER']];
  const FLIP_MS = 120;
  const DECALAGE_MS = 60;

  /* ---------- Stats (localStorage, tout est défensif) ---------- */
  const statsVides = () => ({ parties: 0, victoires: 0, serie: 0, meilleure: 0, distribution: Array(ESSAIS).fill(0), jour: null });
  const entier = (v, max = 1e6) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
  function lireStats() {
    const s = statsVides();
    try {
      const o = JSON.parse(localStorage.getItem(CLE));
      if (!o || typeof o !== 'object') return s;
      s.parties = entier(o.parties); s.victoires = entier(o.victoires); s.serie = entier(o.serie); s.meilleure = entier(o.meilleure);
      if (Array.isArray(o.distribution)) s.distribution = s.distribution.map((_, i) => entier(o.distribution[i]));
      const j = o.jour;
      if (j && typeof j.cle === 'string' && Array.isArray(j.essais)) {
        const essais = j.essais.map(normaliser).filter((m) => m.length === LONGUEUR).slice(0, ESSAIS);
        s.jour = { cle: j.cle.slice(0, 10), essais, fini: j.fini === true, gagne: j.gagne === true };
      }
    } catch { /* stockage indisponible ou corrompu */ }
    return s;
  }
  let stats = lireStats();
  const ecrireStats = () => { try { localStorage.setItem(CLE, JSON.stringify(stats)); } catch { /* ignoré */ } };

  /* ---------- État ---------- */
  let racine = null;
  let ui = {};
  let partie = null; // { mode: 'jour' | 'libre', solution, essais: [], courant: '', fini, gagne }
  let verrou = false; // pendant le retournement des cases
  let session = 0;
  let timers = [];
  let actif = false;

  const attendre = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); };
  const effacerTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const animer = () => !granUI.reducedMotion();

  function montrer(nom) {
    racine.querySelectorAll('[data-ecran]').forEach((s) => {
      const on = s.dataset.ecran === nom;
      s.hidden = !on;
      if (on) { s.classList.remove('ecran'); void s.offsetWidth; s.classList.add('ecran'); }
    });
    granUI.focusScreen(racine.querySelector(`[data-ecran="${nom}"]`));
  }

  /* ---------- Construction du markup (une seule fois) ---------- */
  function construire() {
    const bouton = (cls, texte, fn, attrs = {}) => el('button', { type: 'button', class: `key ${cls}`, onclick: fn, ...attrs }, texte);

    ui.statsZone = el('div', { class: 'mc-stats' });
    const depart = el('section', { class: 'mc-ecran mc-depart', 'data-ecran': 'depart', 'aria-labelledby': 'mc-titre' },
      el('h1', { class: 'mc-titre', id: 'mc-titre' }, 'Mot Caché'),
      el('p', { class: 'mc-accroche' }, '6 essais. Pas un de plus.'),
      el('ol', { class: 'mc-regles' },
        el('li', {}, 'Trouve le mot de 5 lettres en 6 essais.'),
        el('li', {}, 'Après chaque essai, chaque lettre est marquée : bien placée (✓), mal placée (~) ou absente (×).'),
        el('li', {}, 'Chaque essai doit être un mot de la liste. Les accents sont ignorés.')),
      el('div', { class: 'mc-choix' },
        bouton('key--principal mc-bouton', 'Mot du jour', () => lancer('jour')),
        bouton('key--secondaire mc-bouton', 'Partie libre', () => lancer('libre'))),
      ui.statsZone);

    ui.grille = el('div', { class: 'mc-grille', role: 'grid', 'aria-label': 'Grille des essais' });
    ui.message = el('p', { class: 'mc-message', role: 'status' });
    ui.annonce = el('p', { class: 'sr-only', 'aria-live': 'polite' });
    ui.clavier = el('div', { class: 'mc-clavier', role: 'group', 'aria-label': 'Clavier' });
    ui.touches = new Map();
    for (const rangee of CLAVIER) {
      const r = el('div', { class: 'mc-rangee' });
      for (const t of rangee) {
        const spe = t === 'ENTREE' || t === 'EFFACER';
        const b = el('button', {
          type: 'button', class: `mc-touche${spe ? ' mc-touche--large' : ''}`, 'data-touche': t,
          'aria-label': t === 'ENTREE' ? 'Entrée' : t === 'EFFACER' ? 'Effacer' : t,
          onclick: () => (t === 'ENTREE' ? valider() : t === 'EFFACER' ? effacer() : saisir(t)),
        }, t === 'ENTREE' ? 'Entrée' : t === 'EFFACER' ? 'Effacer' : t);
        if (!spe) { b.append(el('span', { class: 'mc-marque', 'aria-hidden': 'true' })); ui.touches.set(t, b); }
        r.append(b);
      }
      ui.clavier.append(r);
    }
    ui.mode = el('p', { class: 'mc-mode' });
    const jeu = el('section', { class: 'mc-ecran mc-jeu', 'data-ecran': 'jeu', 'aria-label': 'Partie en cours' },
      el('div', { class: 'mc-barre' },
        bouton('key--fantome key--compact', 'Quitter', quitter), ui.mode),
      ui.grille, ui.message, ui.annonce, ui.clavier);

    ui.finTitre = el('h2', { class: 'mc-titre mc-titre--fin', id: 'mc-fin-titre' });
    ui.finMot = el('div', { class: 'mc-mot-revele', role: 'img' });
    ui.finTexte = el('p', { class: 'mc-fin-texte' });
    ui.finGrille = el('pre', { class: 'mc-partage-apercu', 'aria-label': 'Aperçu du résultat à partager' });
    const fin = el('section', { class: 'mc-ecran mc-fin', 'data-ecran': 'fin', 'aria-labelledby': 'mc-fin-titre' },
      ui.finTitre, ui.finTexte, ui.finMot, ui.finGrille,
      el('div', { class: 'mc-choix' },
        bouton('key--principal mc-bouton', 'Rejouer', () => lancer('libre')),
        bouton('key--secondaire mc-bouton', 'Partager', partager),
        bouton('key--fantome mc-bouton', 'Retour', () => afficherDepart())));

    racine.replaceChildren(el('div', { class: 'mc' }, depart, jeu, fin));
  }

  /* ---------- Écran de départ + stats ---------- */
  function afficherStats() {
    const { parties, victoires, serie, meilleure, distribution } = stats;
    const pct = parties ? Math.round((victoires / parties) * 100) : 0;
    const max = Math.max(1, ...distribution);
    const case_ = (valeur, lib) => el('div', { class: 'mc-stat' }, el('dd', {}, String(valeur)), el('dt', {}, lib));
    ui.statsZone.replaceChildren(
      el('h2', { class: 'mc-sous-titre' }, 'Tes statistiques'),
      el('dl', { class: 'mc-stats-liste' }, case_(parties, 'Parties'), case_(`${pct} %`, 'Victoires'), case_(serie, 'Série'), case_(meilleure, 'Meilleure série')),
      el('h3', { class: 'mc-sous-titre mc-sous-titre--petit' }, 'Essais pour trouver'),
      el('ul', { class: 'mc-distrib' }, distribution.map((n, i) => el('li', { class: 'mc-barre-ligne' },
        el('span', { class: 'mc-barre-num' }, `${i + 1}`),
        el('span', { class: 'mc-barre-piste', 'aria-hidden': 'true' },
          el('span', { class: `mc-barre-remplie${n ? '' : ' mc-barre-remplie--vide'}`, style: `width:${n ? Math.max(8, Math.round((n / max) * 100)) : 0}%` })),
        el('span', { class: 'mc-barre-val' }, `${n}`),
        el('span', { class: 'sr-only' }, ` ${n > 1 ? 'parties' : 'partie'} en ${i + 1} ${i ? 'essais' : 'essai'}`)))));
  }

  function afficherDepart() {
    effacerTimers();
    session += 1;
    partie = null;
    verrou = false;
    stats = lireStats();
    afficherStats();
    montrer('depart');
  }

  /* ---------- Grille ---------- */
  function construireGrille() {
    ui.grille.replaceChildren(...Array.from({ length: ESSAIS }, (_, r) => el('div', { class: 'mc-ligne', role: 'row', 'aria-label': `Essai ${r + 1}` },
      ...Array.from({ length: LONGUEUR }, () => el('div', { class: 'mc-case', role: 'gridcell', 'aria-label': 'vide' },
        el('span', { class: 'mc-lettre', 'aria-hidden': 'true' }), el('span', { class: 'mc-marque', 'aria-hidden': 'true' }))))));
    ui.touches.forEach((b) => { b.className = 'mc-touche'; b.setAttribute('aria-label', b.dataset.touche); b.querySelector('.mc-marque').textContent = ''; });
    ui.message.textContent = '';
    ui.annonce.textContent = '';
  }

  const ligne = (r) => ui.grille.children[r];

  function peindreCase(c, lettre, etat) {
    c.querySelector('.mc-lettre').textContent = lettre || '';
    c.querySelector('.mc-marque').textContent = etat ? MARQUES[etat] : '';
    c.classList.toggle('mc-case--pleine', !!lettre && !etat);
    c.classList.remove('mc-case--exact', 'mc-case--present', 'mc-case--absent');
    if (etat) c.classList.add(`mc-case--${etat}`);
    c.setAttribute('aria-label', !lettre ? 'vide' : etat ? `${lettre}, ${LIBELLES[etat]}` : `${lettre}, saisie`);
  }

  function peindreCourant() {
    const l = ligne(partie.essais.length);
    if (!l) return;
    [...l.children].forEach((c, i) => peindreCase(c, partie.courant[i], null));
  }

  function majTouches(mot, etats) {
    mot.split('').forEach((lettre, i) => {
      const b = ui.touches.get(lettre);
      if (!b) return;
      const actuel = ['exact', 'present', 'absent'].find((e) => b.classList.contains(`mc-touche--${e}`));
      if (actuel && RANGS[actuel] >= RANGS[etats[i]]) return;
      b.classList.remove('mc-touche--exact', 'mc-touche--present', 'mc-touche--absent');
      b.classList.add(`mc-touche--${etats[i]}`);
      b.querySelector('.mc-marque').textContent = MARQUES[etats[i]];
      b.setAttribute('aria-label', `${lettre}, ${LIBELLES[etats[i]]}`);
    });
  }

  const resume = (mot, etats) => mot.split('').map((l, i) => `${l} ${LIBELLES[etats[i]]}`).join(', ');

  /* ---------- Saisie ---------- */
  function saisir(lettre) {
    if (!partie || partie.fini || verrou || partie.courant.length >= LONGUEUR) return;
    partie.courant += lettre;
    ui.message.textContent = '';
    peindreCourant(); // jamais d'animation à la frappe
  }

  function effacer() {
    if (!partie || partie.fini || verrou || !partie.courant) return;
    partie.courant = partie.courant.slice(0, -1);
    ui.message.textContent = '';
    peindreCourant();
  }

  function refuser(texte) {
    ui.message.textContent = texte;
    granUI.shake(ligne(partie.essais.length));
  }

  function valider() {
    if (!partie || partie.fini || verrou) return;
    if (partie.courant.length < LONGUEUR) return refuser('Pas assez de lettres.');
    if (!estValide(partie.courant)) return refuser("Ce mot n'est pas dans la liste.");
    const mot = partie.courant;
    const etats = evaluer(mot, partie.solution);
    const r = partie.essais.length;
    partie.essais.push(mot);
    partie.courant = '';
    partie.gagne = etats.every((e) => e === 'exact');
    partie.fini = partie.gagne || partie.essais.length >= ESSAIS;
    sauverJour(); // sauvegardé avant l'animation : quitter en plein retournement ne perd pas l'essai
    ui.message.textContent = '';
    revele(r, mot, etats, true);
  }

  /* Colore une ligne : retournement case par case (120 ms, décalage 60 ms) à la validation seulement. */
  function revele(r, mot, etats, avecAnim) {
    const cases = [...ligne(r).children];
    const { gagne, fini } = partie;
    const final = () => {
      majTouches(mot, etats);
      if (avecAnim) {
        ui.annonce.textContent = `Essai ${r + 1} : ${resume(mot, etats)}.`;
        if (gagne && animer()) cases.forEach((c, i) => { c.style.setProperty('--i', i); c.classList.add('mc-case--rebond'); });
        if (fini) attendre(() => terminer(), gagne && animer() ? 700 : 450);
      }
    };
    if (!avecAnim || !animer()) {
      cases.forEach((c, i) => peindreCase(c, mot[i], etats[i]));
      verrou = false;
      final();
      return;
    }
    verrou = true;
    const mienne = session;
    cases.forEach((c, i) => {
      attendre(() => { if (mienne === session) c.classList.add('mc-case--retourne'); }, i * DECALAGE_MS);
      attendre(() => { if (mienne === session) peindreCase(c, mot[i], etats[i]); }, i * DECALAGE_MS + FLIP_MS / 2);
    });
    attendre(() => { if (mienne !== session) return; verrou = false; final(); }, (LONGUEUR - 1) * DECALAGE_MS + FLIP_MS + 20);
  }

  /* ---------- Cycle de partie ---------- */
  function sauverJour() {
    if (partie.mode !== 'jour') return;
    stats.jour = { cle: cleDuJour(), essais: partie.essais.slice(), fini: false, gagne: partie.gagne }; // fini: posé par terminer()
    ecrireStats();
  }

  function lancer(mode) {
    effacerTimers();
    session += 1;
    verrou = false;
    stats = lireStats();
    const cle = cleDuJour();
    partie = { mode, solution: mode === 'jour' ? motDuJour() : motAleatoire(), essais: [], courant: '', fini: false, gagne: false };
    construireGrille();
    ui.mode.textContent = mode === 'jour' ? 'Mot du jour' : 'Partie libre';
    if (mode === 'jour' && stats.jour && stats.jour.cle === cle) { // reprise du mot du jour
      partie.essais = stats.jour.essais.filter(estValide);
      const dernier = partie.essais[partie.essais.length - 1];
      partie.gagne = dernier === partie.solution;
      partie.fini = partie.gagne || partie.essais.length >= ESSAIS;
      partie.essais.forEach((mot, r) => {
        const etats = evaluer(mot, partie.solution);
        [...ligne(r).children].forEach((c, i) => peindreCase(c, mot[i], etats[i]));
        majTouches(mot, etats);
      });
      if (partie.fini) {
        if (stats.jour.fini) afficherFin(false); else terminer(); // terminer() compte la partie si on avait quitté avant la fin de l'animation
        return;
      }
    }
    montrer('jeu');
  }

  function quitter() { afficherDepart(); }

  /* Fin : met à jour les stats une seule fois par partie, puis affiche l'écran de fin. */
  function terminer() {
    if (!partie || !actif) return;
    stats = lireStats();
    stats.parties += 1;
    if (partie.gagne) {
      stats.victoires += 1;
      stats.serie += 1;
      stats.meilleure = Math.max(stats.meilleure, stats.serie);
      stats.distribution[partie.essais.length - 1] += 1;
    } else stats.serie = 0;
    if (partie.mode === 'jour') stats.jour = { cle: cleDuJour(), essais: partie.essais.slice(), fini: true, gagne: partie.gagne };
    ecrireStats();
    if (typeof granStats !== 'undefined') granStats.enregistrer('mot-cache', { score: partie.gagne ? ESSAIS + 1 - partie.essais.length : 0, gagne: partie.gagne, manches: 1, meta: { mode: partie.mode, essais: partie.essais.length } });
    afficherFin(true);
  }

  function afficherFin(anime) {
    const { solution, essais, gagne } = partie;
    ui.finTitre.textContent = gagne ? (essais.length === 1 ? 'Du premier coup.' : `Trouvé en ${essais.length} essais.`) : 'Raté.';
    ui.finTexte.textContent = gagne ? 'Bien joué. Le mot était :' : 'Le mot était :';
    ui.finMot.setAttribute('aria-label', `Le mot était ${solution.split('').join(' ')}`);
    ui.finMot.replaceChildren(...solution.split('').map((l, i) => {
      const c = el('span', { class: 'mc-case mc-case--exact mc-case--mini', 'aria-hidden': 'true' }, el('span', { class: 'mc-lettre' }, l), el('span', { class: 'mc-marque' }, MARQUES.exact));
      if (gagne && anime && animer()) { c.style.setProperty('--i', i); c.classList.add('mc-case--rebond'); }
      return c;
    }));
    ui.finGrille.textContent = grillePartage();
    montrer('fin');
  }

  /* ---------- Partage : carrés texte ---------- */
  const CARRES = { exact: '🟩', present: '🟨', absent: '⬛' };
  function grillePartage() {
    return partie.essais.map((mot) => evaluer(mot, partie.solution).map((e) => CARRES[e]).join('')).join('\n');
  }
  async function partager() {
    const d = new Date();
    const titre = `Mot Caché ${partie.mode === 'jour' ? cleDuJour(d) : '(libre)'} ${partie.gagne ? partie.essais.length : 'X'}/${ESSAIS}`;
    const texte = `${titre}\n\n${grillePartage()}`;
    try {
      await navigator.clipboard.writeText(texte);
      granUI.toast('Résultat copié', { type: 'succes' });
      return;
    } catch { /* repli ci-dessous */ }
    if (navigator.share) {
      try { await navigator.share({ text: texte }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    // Dernier recours : zone de texte sélectionnable, à copier à la main
    let zone = ui.finGrille.parentNode.querySelector('.mc-partage-zone');
    if (!zone) {
      zone = el('textarea', { class: 'mc-partage-zone', readonly: '', rows: '6', 'aria-label': 'Résultat à copier' });
      zone.style.cssText = 'width:100%;margin-top:.5rem;font:inherit;resize:none';
      ui.finGrille.after(zone);
    }
    zone.value = texte;
    zone.focus();
    zone.select();
    granUI.toast('Copie impossible. Le résultat est sélectionné : copie-le à la main.', { type: 'erreur' });
  }

  /* ---------- Clavier physique ---------- */
  function onKey(e) {
    if (!partie || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ((e.key === 'Enter' || e.key === ' ') && t && t.tagName === 'BUTTON') return; // le clic du bouton s'en charge
    if (racine.querySelector('[data-ecran="jeu"]').hidden) return;
    if (e.key === 'Enter') { e.preventDefault(); valider(); }
    else if (e.key === 'Backspace') { e.preventDefault(); effacer(); }
    else if (e.key.length === 1) {
      const l = normaliser(e.key);
      if (l.length === 1) { e.preventDefault(); saisir(l); }
    }
  }

  granRouter.register('mot-cache', {
    enter() {
      racine = document.querySelector('[data-vue="mot-cache"] [data-montage]');
      if (!racine) return;
      if (!racine.querySelector('.mc')) construire();
      actif = true;
      document.addEventListener('keydown', onKey);
      afficherDepart();
    },
    leave() {
      actif = false;
      document.removeEventListener('keydown', onKey);
      effacerTimers();
      session += 1;
      verrou = false;
    },
  });
})();
