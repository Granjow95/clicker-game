// Routeur par #hash (scripts classiques, sans build). Globale : granRouter.
// Adapté de gran-games-design/js/router.js : les vues sont des <section data-vue="..."> persistantes
// dans index.html (jamais détruites : les ID et listeners des jeux restent valides).
// - Le bouton retour du navigateur fonctionne (chaque route = une entrée d'historique).
// - Un hash non routable (#access_token=..., #error=... de Supabase) est ignoré : accueil, sans 404.
// - Chaque jeu enregistre register(nom, { enter(params), leave() }) : leave() libère salle, timers, lecteur.
// - Les écrans INTERNES d'un jeu (indices, vote…) ne sont pas des routes (voir granUI.showScreen).
const granRouter = (() => {
  const ROUTES = [
    { pattern: /^\/?$/, view: 'accueil', title: "Gran'Games" },
    { pattern: /^\/(jeux|nouveautes)$/, redirect: '#/' }, // anciennes adresses : renvoi vers l'accueil
    { pattern: /^\/profil$/, view: 'profil', title: "Ton profil, Gran'Games" },
    // Code de salle : 4 lettres (consonnes côté serveur ; le client accepte [A-Za-z]{4}, l'écran d'entrée valide).
    { pattern: /^\/imposteur$/, view: 'imposteur', monde: 'imposteur', css: 'imposteur', label: 'Imposteur', title: "Imposteur, Gran'Games" },
    { pattern: /^\/imposteur\/([A-Za-z]{4})$/, upper: true, view: 'imposteur', monde: 'imposteur', css: 'imposteur', label: 'Imposteur', title: 'Imposteur, salle {1}', params: ['code'] },
    { pattern: /^\/gribouille$/, view: 'gribouille', monde: 'gribouille', css: 'gribouille', label: 'Gribouille', title: "Gribouille, Gran'Games" },
    { pattern: /^\/gribouille\/([A-Za-z]{4})$/, upper: true, view: 'gribouille', monde: 'gribouille', css: 'gribouille', label: 'Gribouille', title: 'Gribouille, salle {1}', params: ['code'] },
    { pattern: /^\/petit-bac$/, view: 'petit-bac', monde: 'petit-bac', css: 'petit-bac', label: 'Petit Bac', title: "Petit Bac, Gran'Games" },
    { pattern: /^\/petit-bac\/([A-Za-z]{4})$/, upper: true, view: 'petit-bac', monde: 'petit-bac', css: 'petit-bac', label: 'Petit Bac', title: 'Petit Bac, salle {1}', params: ['code'] },
    { pattern: /^\/mot-cache$/, js: ['mot-cache-mots.js', 'mot-cache-logique.js', 'mot-cache.js'], view: 'mot-cache', monde: 'mot-cache', css: 'mot-cache', label: 'Mot Caché', title: "Mot Caché, Gran'Games" },
    { pattern: /^\/echo$/, js: ['echo.js'], view: 'echo', monde: 'echo', css: 'echo', label: 'Écho', title: "Écho, Gran'Games" },
    { pattern: /^\/lyrics$/, view: 'lyrics', monde: 'lyrics', css: 'lyrics', label: 'Lyrics', title: "Lyrics, Gran'Games" },
    { pattern: /^\/karaoke$/, view: 'karaoke', monde: 'karaoke', css: 'karaoke', label: 'Karaoké', title: "Karaoké, Gran'Games" },
    { pattern: /^\/karaoke\/salle\/[^/]+$/, redirect: '#/karaoke' }, // ancienne forme : renvoi vers l'entrée du jeu
    { pattern: /^\/karaoke\/([A-Za-z]{4})$/, upper: true, view: 'karaoke', monde: 'karaoke', css: 'karaoke', label: 'Karaoké', title: 'Karaoké, salle {1}', params: ['code'] },
    { pattern: /^\/potager$/, js: ['potager-donnees.js', 'potager.js'], view: 'potager', monde: 'potager', css: 'potager', label: 'Potager', title: "Potager, Gran'Games" },
    { pattern: /^\/plus-ou-moins$/, redirect: '#/potager' }, // jeu retiré, remplacé par le Potager
    { pattern: /^\/frappe$/, js: ['frappe-donnees.js', 'frappe.js'], view: 'frappe', monde: 'frappe', css: 'frappe', label: 'Course de frappe', title: "Course de frappe, Gran'Games" },
    { pattern: /^\/frappe\/[^/]*$/, redirect: '#/frappe' }, // pas de salle à code pour ce jeu : renvoi vers l'entrée
  ];
  const NOT_FOUND = { view: '404', title: "Page introuvable, Gran'Games", params: {} };

  const handlers = new Map(); // nom de vue -> { enter, leave }
  const cssLinks = new Map(); // nom de feuille de jeu -> <link>
  let current = null; // { view, key, route }
  let leaveGuard = null;
  let lastHash = location.hash;
  let previousIsGame = false;
  let started = false;

  const sectionOf = (view) => document.querySelector(`[data-vue="${view}"]`);

  function match(path) {
    for (const r of ROUTES) {
      const m = path.match(r.pattern);
      if (!m) continue;
      if (r.redirect) return { redirect: r.redirect }; // pas de vue ni de titre sur une redirection
      const params = {};
      let bad = false;
      (r.params || []).forEach((p, i) => {
        try { params[p] = decodeURIComponent(m[i + 1]); } catch { bad = true; }
        if (!bad && r.upper) params[p] = params[p].toUpperCase();
        if (!bad && params[p].length > 30) bad = true; // le serveur coupe à 30 caractères
      });
      if (bad) break;
      const route = { ...r, params, title: r.title.replace('{1}', m[1] ? params[r.params[0]] : '') };
      if (sectionOf(route.view)) return route;
      break; // jeu pas encore livré (pas de section) : on retombe sur la 404
    }
    return NOT_FOUND;
  }

  // Une seule feuille de jeu active à la fois (les anciennes feuilles redéfinissent body).
  function useCss(name) {
    cssLinks.forEach((link, n) => { link.disabled = n !== name; });
    if (!name || cssLinks.has(name)) return Promise.resolve();
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `styles/${name}.css`;
      link.onload = link.onerror = resolve;
      cssLinks.set(name, link);
      document.head.appendChild(link);
    });
  }

  // Scripts d'un jeu chargés à la première entrée (champ `js` de la route). Une Promise par fichier ;
  // async = false garde l'ordre d'exécution. Ces fichiers appellent register() à leur chargement,
  // donc avant le enter() de renderNow (qui attend cette Promise). En cas d'échec on retire la balise pour pouvoir réessayer.
  const jsLoads = new Map(); // nom de fichier -> Promise
  function loadJs(files) {
    return Promise.all((files || []).map((f) => {
      if (jsLoads.has(f)) return jsLoads.get(f);
      const p = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = `javascript/${f}`;
        el.async = false;
        el.onload = resolve;
        el.onerror = () => { el.remove(); jsLoads.delete(f); reject(new Error(`chargement impossible : ${f}`)); };
        document.head.appendChild(el);
      });
      jsLoads.set(f, p);
      return p;
    }));
  }

  // Barre unique : la structure ne change jamais, seuls le contexte (nom du jeu, salle), le libellé du lien de sortie
  // et la couleur (variables --nav-* issues de body[data-monde], voir base.css) s'adaptent.
  function paintConsole(route, path) {
    const isGame = Boolean(route.monde);
    const consoleEl = document.querySelector('.console');
    if (consoleEl) {
      const ctx = consoleEl.querySelector('.console__contexte');
      if (ctx) {
        ctx.hidden = !isGame;
        ctx.textContent = isGame ? (route.params.code ? `${route.label} · Salle ${route.params.code}` : route.label) : '';
      }
      const jeux = consoleEl.querySelector('#console-jeux');
      if (jeux) jeux.textContent = isGame ? '\u2190 Accueil' : jeux.dataset.label;
      consoleEl.querySelectorAll('.console__nav a').forEach((a) => {
        const target = a.getAttribute('href').slice(1);
        const actif = !isGame && (target === path || (target === '/' && path === ''));
        if (actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
    }
    const pied = document.getElementById('pied');
    if (pied) pied.hidden = route.view !== 'accueil' && route.view !== 'profil';
    document.body.classList.toggle('damier', !isGame);
    if (route.monde) document.body.dataset.monde = route.monde; else delete document.body.dataset.monde;
  }

  // Verrou de ré-entrance. Boucle : tant qu'un hashchange est arrivé pendant le rendu, ou que location.hash
  // diffère du hash traité, on rejoue : la vue affichée finit toujours par correspondre au hash courant.
  let rendering = false;
  let rerender = false;
  let handledHash = null;
  async function render() {
    if (rendering) { rerender = true; return; }
    rendering = true;
    try {
      for (let i = 0; i < 10; i++) {
        rerender = false;
        try { await renderNow(); } catch (e) { console.error(e); }
        if (!rerender && location.hash === handledHash) break;
      }
    } finally { rendering = false; }
  }

  // Position dans l'historique (history.state.gi) : permet de revenir sur place si le garde refuse.
  let histIdx = null;
  function stampHistory() {
    const s = history.state;
    if (s && typeof s.gi === 'number') return s.gi;
    const n = (histIdx === null ? 0 : histIdx) + 1;
    history.replaceState({ ...(s || {}), gi: n }, '');
    return n;
  }

  async function renderNow() {
    const hash = location.hash;
    handledHash = hash;
    let path;
    if (hash === '' || hash === '#') path = '/';
    else if (hash.startsWith('#/')) path = hash.slice(1);
    else { // hash technique (jeton Supabase, erreur OAuth) : on n'y touche pas
      if (current) return;
      path = '/';
    }
    const route = match(path);
    if (route.redirect) { location.replace(route.redirect); return; } // hashchange relance render()
    const gi = stampHistory();
    const key = `${route.view}|${JSON.stringify(route.params)}`;

    if (current && current.key === key) { // même vue (ex. changement de params) : pas de changement de vue
      current.route = route;
      document.title = route.title;
      paintConsole(route, path);
      window.scrollTo(0, 0);
      lastHash = hash;
      histIdx = gi;
      return;
    }

    // Scripts du jeu (lazy) avant le garde et le changement de vue : en cas d'échec on reste sur place puis retour accueil.
    if (route.js) {
      try { await loadJs(route.js); } catch (e) {
        console.error(e);
        granUI.toast('Impossible de charger le jeu. Réessaie.', { type: 'erreur' });
        location.replace('#/'); // hashchange relance render() ; sans effet si on est déjà sur l'accueil
        return;
      }
      if (location.hash !== hash) return; // l'adresse a changé pendant le chargement : la boucle de render() traitera la nouvelle
    }

    if (leaveGuard && current) {
      const ok = await leaveGuard();
      if (!ok) { // on reste : retour sur l'entrée d'origine (retour, avant ou nouveau lien) sans empiler
        if (histIdx !== null && histIdx !== gi) history.go(histIdx - gi);
        else history.replaceState(history.state, '', lastHash || '#/');
        return;
      }
      leaveGuard = null;
    }
    lastHash = hash;
    histIdx = gi;

    await useCss(route.css);
    const isGame = Boolean(route.monde);
    const goingBack = previousIsGame && !isGame;

    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      if (current) {
        const h = handlers.get(current.route.view);
        if (h && h.leave) h.leave();
        const old = sectionOf(current.route.view);
        if (old) old.hidden = true;
      }
      const section = sectionOf(route.view);
      // Premier rendu (lien direct #/jeu/CODE) : aucune vue courante, l'accueil visible par défaut doit aussi être masqué.
      document.querySelectorAll('[data-vue]').forEach((s) => { if (s !== section) s.hidden = true; });
      section.hidden = false;
      current = { key, route };
      paintConsole(route, path);
      const h = handlers.get(route.view);
      if (h && h.enter) h.enter(route.params);
      document.title = route.title;
      window.scrollTo(0, 0);
      const h1 = section.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    };

    const animate = document.startViewTransition && isGame !== previousIsGame && !granUI.reducedMotion();
    document.documentElement.classList.toggle('retour', goingBack);
    try {
    if (animate) {
      // Garde-fou : une transition qui ne démarre pas (onglet en arrière-plan) ne doit jamais bloquer le routeur.
      let timer;
      const timeout = new Promise((res) => { timer = setTimeout(res, 1000); });
      const vt = document.startViewTransition(swap);
      // Une transition interrompue par la suivante rejette ready/updateCallbackDone : sans effet, on évite l'erreur console.
      vt.ready.catch(() => {});
      if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
      await Promise.race([vt.finished.catch(() => {}), timeout]);
      clearTimeout(timer);
      swap();
    } else swap();
    } finally { // même si enter() lève une erreur : pas de classe « retour » orpheline
      document.documentElement.classList.remove('retour');
      previousIsGame = isGame;
    }
  }

  return {
    register(view, h) { handlers.set(view, h); },
    // fn() renvoie une Promise<boolean> (true = on peut partir). Remis à zéro après chaque sortie.
    setLeaveGuard(fn) { leaveGuard = fn; },
    navigate(path) { location.hash = path.startsWith('#') ? path : `#${path}`; },
    current: () => (current ? { view: current.route.view, params: current.route.params } : null),
    start() {
      if (started) return;
      started = true;
      window.addEventListener('hashchange', render);
      render();
    },
  };
})();
