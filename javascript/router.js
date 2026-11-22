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
    // Code de salle : 4 lettres dans le design ; les salles actuelles ont un nom libre (30 car. max) tant que B1 n'est pas livré.
    { pattern: /^\/imposteur$/, view: 'imposteur', monde: 'imposteur', css: 'imposteur', label: 'Imposteur', title: "Imposteur, Gran'Games" },
    { pattern: /^\/imposteur\/([^/]{1,90})$/, view: 'imposteur', monde: 'imposteur', css: 'imposteur', label: 'Imposteur', title: 'Imposteur, salle {1}', params: ['code'] },
    { pattern: /^\/lyrics$/, view: 'lyrics', monde: 'lyrics', css: 'lyrics', label: 'Lyrics', title: "Lyrics, Gran'Games" },
    { pattern: /^\/karaoke$/, view: 'karaoke', monde: 'karaoke', css: 'karaoke', label: 'Karaoké', title: "Karaoké, Gran'Games" },
    { pattern: /^\/karaoke\/salle\/([^/]{1,90})$/, view: 'karaoke', monde: 'karaoke', css: 'karaoke', label: 'Karaoké', title: 'Karaoké, salle {1}', params: ['code'] },
    { pattern: /^\/plus-ou-moins$/, view: 'plus-ou-moins', monde: 'plus-ou-moins', css: 'plus-ou-moins', label: 'Plus ou Moins', title: "Plus ou Moins, Gran'Games" },
    { pattern: /^\/frappe$/, view: 'frappe', monde: 'frappe', css: 'frappe', label: 'Course de frappe', title: "Course de frappe, Gran'Games" },
    { pattern: /^\/frappe\/([\w-]{1,6})$/, view: 'frappe', monde: 'frappe', css: 'frappe', label: 'Course de frappe', title: 'Course de frappe, salle {1}', params: ['code'] },
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
      const params = {};
      let bad = false;
      (r.params || []).forEach((p, i) => {
        try { params[p] = decodeURIComponent(m[i + 1]); } catch { bad = true; }
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

  function paintConsole(route, path) {
    const isGame = Boolean(route.monde);
    const consoleEl = document.querySelector('.console');
    if (consoleEl) {
      consoleEl.classList.toggle('console--jeu', isGame);
      const quitter = consoleEl.querySelector('.console__quitter');
      const ariane = consoleEl.querySelector('.console__ariane');
      if (quitter) quitter.hidden = !isGame;
      if (ariane) {
        ariane.hidden = !isGame;
        if (isGame) {
          const sep = () => { const s = document.createElement('span'); s.setAttribute('aria-hidden', 'true'); s.textContent = '/'; return s; };
          const nom = document.createElement('span'); nom.textContent = "Gran'Games";
          const jeu = document.createElement('span'); jeu.textContent = route.label;
          const nodes = [nom, sep(), jeu];
          if (route.params.code) {
            const salle = document.createElement('span');
            salle.setAttribute('aria-current', 'page');
            salle.textContent = `Salle ${route.params.code}`;
            nodes.push(sep(), salle);
          } else jeu.setAttribute('aria-current', 'page');
          ariane.replaceChildren(...nodes);
        }
      }
      consoleEl.querySelectorAll('.console__nav a').forEach((a) => {
        const target = a.getAttribute('href').slice(1);
        if (target === path || (target === '/' && path === '')) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    }
    document.body.classList.toggle('damier', !isGame);
    if (route.monde) document.body.dataset.monde = route.monde; else delete document.body.dataset.monde;
  }

  let rendering = false; // verrou de ré-entrance : un hashchange pendant le garde est rejoué ensuite
  let rerender = false;
  async function render() {
    if (rendering) { rerender = true; return; }
    rendering = true;
    try { await renderNow(); } finally {
      rendering = false;
      if (rerender) { rerender = false; render(); }
    }
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

    const swap = () => {
      if (current) {
        const h = handlers.get(current.route.view);
        if (h && h.leave) h.leave();
        const old = sectionOf(current.route.view);
        if (old) old.hidden = true;
      }
      const section = sectionOf(route.view);
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
    if (animate) await document.startViewTransition(swap).finished.catch(() => {});
    else swap();
    document.documentElement.classList.remove('retour');
    previousIsGame = isGame;
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
