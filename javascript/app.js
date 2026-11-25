// Câblage : enregistre les vues (enter/leave) des jeux dans le routeur, puis le démarre. Chargé en dernier.
// leave() reprend le contenu de l'ancien goBack() : quitter la salle côté serveur, retirer les listeners,
// arrêter les minuteurs, détruire le lecteur YouTube, appliquer un changement de compte reporté.
(() => {
  const $ = (id) => document.getElementById(id);
  const show = (id, display = 'block') => { const n = $(id); if (n) n.style.display = display; };
  const hide = (id) => { const n = $(id); if (n) n.style.display = 'none'; };

  /* ---------- Zone « Reprendre » (accueil) ---------- */
  const JEUX_REPRISE = Object.fromEntries(GRAN_JEUX.filter((j) => j.reprise).map((j) => [j.reprise, { route: j.route, label: `${/^[aeiouyéèÉ]/i.test(j.nom) ? "d'" : 'de '}${j.nom}` }]));
  // La reprise elle-même est faite par l'écran d'entrée du jeu ; ici on ne fait que l'y envoyer.
  function renderReprise() {
    const zone = $('accueil-reprise');
    if (!zone) return;
    const lignes = granReprise.all().filter((e) => JEUX_REPRISE[e.prefix]).map((e) => {
      const j = JEUX_REPRISE[e.prefix];
      return granUI.el('div', { class: 'accueil-reprise px' },
        granUI.el('p', {}, `Ta partie ${j.label} t'attend dans la salle `, granUI.el('strong', {}, e.code), '.'),
        granUI.el('a', { class: 'key key--principal', href: `#${j.route}`, 'aria-label': `Reprendre la partie ${j.label}` }, 'Reprendre'));
    });
    zone.replaceChildren(...lignes);
    zone.hidden = lignes.length === 0;
  }

  /* ---------- Lyrics ---------- */
  granRouter.register('lyrics', {
    enter() {
      window.lyricsShowPage('lyrics-select');
      if (window.renderLyricsSelection) window.renderLyricsSelection();
    },
    leave() {
      window.lyricsShowPage(null);
      granAuth.flushReconnect();
    },
  });

  /* ---------- Karaoké ---------- */
  granRouter.register('karaoke', {
    enter(params) {
      hide('karaoke-game');
      window.karaokeEnter(params);
    },
    leave() {
      kkCleanup();
      ['karaoke-mode', 'karaoke-room', 'karaoke-select', 'karaoke-game'].forEach(hide);
      granAuth.flushReconnect();
    },
  });

  /* ---------- Accueil ---------- */
  // Entrée « écran vers écran » en cascade (40 ms entre bandeaux). Les vues sont persistantes : on rejoue à chaque enter().
  // Retour d'un jeu avec View Transition : la transition anime déjà l'écran, on saute la cascade.
  granRouter.register('accueil', {
    enter() {
      renderReprise();
      const vue = document.querySelector('[data-vue="accueil"]');
      if (!vue) return;
      const reduit = granUI.reducedMotion();
      const parVT = document.documentElement.classList.contains('retour') && !!document.startViewTransition && !reduit;
      vue.classList.remove('accueil--entre');
      if (parVT) return;
      void vue.offsetWidth; // relance l'animation si on revient sur l'accueil
      vue.classList.add('accueil--entre');
    },
    leave() {
      const vue = document.querySelector('[data-vue="accueil"]');
      if (vue) vue.classList.remove('accueil--entre');
    },
  });

  // « Un jeu au hasard » (404) : un des jeux jouables aujourd'hui.
  $('jeu-hasard').addEventListener('click', (e) => {
    e.preventDefault();
    granRouter.navigate(GRAN_JEUX[Math.floor(Math.random() * GRAN_JEUX.length)].route);
  });

  // Liens « Jeux » (navbar, footer) : depuis l'accueil, défile jusqu'à la liste ; ailleurs, va à l'accueil puis défile.
  // En jeu, le lien de la navbar devient « ← Accueil » (géré par le routeur) : on laisse alors la navigation normale.
  document.addEventListener('click', (e) => {
    const lien = e.target.closest && e.target.closest('[data-vers-jeux]');
    if (!lien) return;
    const courant = granRouter.current();
    if (courant && courant.view !== 'accueil' && courant.view !== 'profil' && courant.view !== '404') return;
    e.preventDefault();
    const defiler = () => {
      const liste = $('liste-jeux');
      if (!liste) return;
      liste.scrollIntoView({ behavior: granUI.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      liste.focus({ preventScroll: true });
    };
    if (courant && courant.view === 'accueil') defiler();
    else { granRouter.navigate('/'); setTimeout(defiler, 450); }
  });

  // Lien d'évitement : pas de changement de hash (le routeur le prendrait pour une route), on déplace le focus.
  $('lien-evitement').addEventListener('click', (e) => { e.preventDefault(); $('contenu').focus(); });

  granRouter.start();
})();
