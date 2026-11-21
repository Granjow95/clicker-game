/* ==========================================================================
   Gran'Games : routeur par #hash (vanilla, sans build)
   - Le bouton retour du navigateur fonctionne (chaque route = une entrée d'historique).
   - Charge styles/<jeu>.css à l'entrée d'un jeu (une seule fois).
   - Pose data-monde sur <main> pour changer d'ambiance.
   - Met à jour <title>, remet le scroll en haut, donne le focus au <h1>.
   - Transition "insertion de cartouche" via View Transitions API si dispo.
   Les écrans INTERNES d'un jeu (indices, vote, révélation…) ne sont PAS des routes :
   ils dépendent du serveur temps réel et se changent avec showScreen() (js/ui.js).
   ========================================================================== */

const ROUTES = [
  // motif                                 vue (id de <template> ou fonction)  monde            css            titre
  { pattern: /^\/?$/,                       view: 'accueil',       monde: null,            css: 'main-menu',     title: "Gran'Games" },
  { pattern: /^\/jeux$/,                    view: 'accueil',       monde: null,            css: 'main-menu',     title: "Gran'Games, les jeux", anchor: 'jeux' },
  { pattern: /^\/nouveautes$/,              view: 'accueil',       monde: null,            css: 'main-menu',     title: "Gran'Games, nouveautés", anchor: 'nouveautes' },
  { pattern: /^\/profil$/,                  view: 'profil',        monde: null,            css: 'compte',        title: "Ton profil, Gran'Games", auth: true },
  { pattern: /^\/imposteur$/,               view: 'imposteur',     monde: 'imposteur',     css: 'imposteur',     title: "Imposteur, Gran'Games" },
  { pattern: /^\/imposteur\/([A-Z]{4})$/i,  view: 'imposteur',     monde: 'imposteur',     css: 'imposteur',     title: "Imposteur, salle {1}", params: ['code'] },
  { pattern: /^\/lyrics$/,                  view: 'lyrics',        monde: 'lyrics',        css: 'lyrics',        title: "Lyrics, Gran'Games" },
  { pattern: /^\/lyrics\/([\w-]+)$/,        view: 'lyrics-partie', monde: 'lyrics',        css: 'lyrics',        title: "Lyrics, Gran'Games", params: ['id'] },
  { pattern: /^\/karaoke$/,                 view: 'karaoke',       monde: 'karaoke',       css: 'karaoke',       title: "Karaoké, Gran'Games" },
  { pattern: /^\/karaoke\/salle\/([A-Z]{4})$/i, view: 'karaoke',   monde: 'karaoke',       css: 'karaoke',       title: "Karaoké, salle {1}", params: ['code'] },
  { pattern: /^\/plus-ou-moins$/,           view: 'plus-ou-moins', monde: 'plus-ou-moins', css: 'plus-ou-moins', title: "Plus ou Moins, Gran'Games" },
  { pattern: /^\/frappe$/,                  view: 'frappe',        monde: 'frappe',        css: 'frappe',        title: "Course de frappe, Gran'Games" },
  { pattern: /^\/frappe\/([A-Z]{4})$/i,     view: 'frappe',        monde: 'frappe',        css: 'frappe',        title: "Course de frappe, salle {1}", params: ['code'] },
  { pattern: /^\/regles\/([\w-]+)$/,        view: 'regles',        monde: null,            css: 'main-menu',     title: "Règles, Gran'Games", params: ['jeu'] },
];
const NOT_FOUND = { view: '404', monde: null, css: 'main-menu', title: "Page introuvable, Gran'Games" };

const loadedCss = new Set();
function loadCss(name) {
  if (!name || loadedCss.has(name)) return Promise.resolve();
  loadedCss.add(name);
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `styles/${name}.css`;
    link.onload = link.onerror = resolve;
    document.head.appendChild(link);
  });
}

function match(path) {
  for (const r of ROUTES) {
    const m = path.match(r.pattern);
    if (m) {
      const params = {};
      (r.params || []).forEach((p, i) => { params[p] = m[i + 1]; });
      const title = r.title.replace('{1}', (m[1] || '').toUpperCase());
      return { ...r, params, title };
    }
  }
  return { ...NOT_FOUND, params: {} };
}

/* Handlers de vues : chaque jeu s'enregistre ici (ex. registerView('imposteur', mountImposteur)).
   Une vue reçoit (main, params) et peut renvoyer une fonction de nettoyage. */
const views = new Map();
let cleanup = null;
let previousIsGame = false;
export function registerView(name, mount) { views.set(name, mount); }

/* Bloquer la sortie (ex. partie en cours) : la vue appelle setLeaveGuard(fn) ;
   fn() renvoie une Promise<boolean> (true = on peut partir). */
let leaveGuard = null;
export function setLeaveGuard(fn) { leaveGuard = fn; }

let lastHash = location.hash;
async function render() {
  const path = (location.hash || '#/').slice(1);
  const route = match(path);

  if (leaveGuard) {
    const ok = await leaveGuard();
    if (!ok) { history.pushState(null, '', lastHash || '#/'); return; } // on reste
    leaveGuard = null;
  }
  lastHash = location.hash;

  await loadCss(route.css);
  const main = document.querySelector('main');
  const isGame = Boolean(route.monde);
  const goingBack = previousIsGame && !isGame;

  const swap = () => {
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    if (route.monde) main.dataset.monde = route.monde; else delete main.dataset.monde;
    document.body.dataset.monde = route.monde || '';
    const mount = views.get(route.view);
    main.replaceChildren();
    const tpl = document.getElementById(`vue-${route.view}`);
    if (tpl) main.appendChild(tpl.content.cloneNode(true));
    if (mount) cleanup = mount(main, route.params) || null;
    document.title = route.title;
    // console : onglet courant
    document.querySelectorAll('.console__nav a').forEach((a) => {
      const target = a.getAttribute('href').slice(1);
      if (target === path || (target === '/' && path === '')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (route.anchor) document.getElementById(route.anchor)?.scrollIntoView();
    else window.scrollTo(0, 0);
    const h1 = main.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  };

  const animate = document.startViewTransition && (isGame !== previousIsGame)
    && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('retour', goingBack);
  if (animate) await document.startViewTransition(swap).finished.catch(() => {});
  else swap();
  document.documentElement.classList.remove('retour');
  previousIsGame = isGame;
}

export function navigate(path) { location.hash = path.startsWith('#') ? path : `#${path}`; }
export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
