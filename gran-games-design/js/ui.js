/* ==========================================================================
   Gran'Games : petits outils d'interface (vanilla, modules ES)
   Tout texte venant d'un joueur passe par textContent : jamais innerHTML.
   ========================================================================== */

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Crée un élément proprement. el('span', { class: 'badge badge--hote' }, 'Hôte') */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c))); // texte = sûr
  }
  return node;
}

/* Changer d'écran DANS un jeu (salle -> indices -> vote…) : fondu + 8 px + flou 2 px, 200 ms */
export function showScreen(container, node) {
  node.classList.add('ecran');
  container.replaceChildren(node);
  const h = node.querySelector('h1, h2');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
}

/* ---------- Toasts ---------- */
let stack;
const ICONS = { succes: '✓', erreur: '!', info: '!' }; // rendus en police pixel, ou remplace par les SVG des maquettes
export function toast(message, { type = 'succes', titre = '', duree = 4000, action = null } = {}) {
  if (!stack) {
    stack = el('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(stack);
  }
  const t = el('div', { class: `toast toast--${type}`, role: type === 'erreur' ? 'alert' : 'status' },
    el('span', { class: 'toast__icone', 'aria-hidden': 'true' }, ICONS[type]),
    el('span', { class: 'toast__texte' }, titre ? el('b', {}, titre + ' ') : null, message),
    action ? el('button', { class: 'key key--principal key--compact', type: 'button', onclick: () => { action.onClick(); close(); } }, action.label) : null,
  );
  stack.append(t);
  let timer, remaining = duree, started = Date.now();
  const close = () => {
    clearTimeout(timer);
    t.classList.add('sortie');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 400);
  };
  const arm = () => { if (type !== 'erreur' && remaining > 0) { started = Date.now(); timer = setTimeout(close, remaining); } };
  const pause = () => { clearTimeout(timer); remaining -= Date.now() - started; };
  t.addEventListener('mouseenter', pause); t.addEventListener('mouseleave', arm);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : arm()));
  arm();
  return close;
}

/* ---------- Fenêtres (<dialog class="fenetre">) ---------- */
let opener = null;
export function openDialog(dialog) {
  opener = document.activeElement;
  dialog.classList.remove('ferme');
  dialog.showModal();
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(dialog); }, { once: true });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(dialog); }); // clic sur le voile
}
export function closeDialog(dialog) {
  if (reducedMotion()) { dialog.close(); opener?.focus(); return; }
  dialog.classList.add('ferme');
  const done = () => { dialog.close(); dialog.classList.remove('ferme'); opener?.focus(); };
  dialog.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 400);
}

/* ---------- Retours visuels ---------- */
export function shake(node) { // mot inexistant, mauvais code
  node.classList.remove('secousse'); void node.offsetWidth; node.classList.add('secousse');
}

/* Chiffre compté (Plus ou Moins, score de fin) : 700 ms, ease-out fort */
export function countUp(node, to, { from = 0, duration = 700, format = (n) => n.toLocaleString('fr-FR') } = {}) {
  if (reducedMotion()) { node.textContent = format(to); return Promise.resolve(); }
  return new Promise((resolve) => {
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      node.textContent = format(Math.round(from + (to - from) * ease(p)));
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

/* Lyrics : dévoile toutes les occurrences d'un mot, 30 ms d'écart, 12 animées max */
export function revealWords(nodes) {
  nodes.forEach((n, i) => {
    n.textContent = n.dataset.mot;
    n.classList.remove('mot--cache');
    if (i < 12 && !reducedMotion()) { n.style.setProperty('--i', i); n.classList.add('mot--revele'); }
  });
}

/* Minuteur à 20 segments. Annonce aux lecteurs d'écran à 30 s et 10 s seulement. */
export function segmentedTimer(root, totalSec, onEnd) {
  const segs = root.querySelectorAll('.minuteur__segments span');
  const label = root.querySelector('.minuteur__temps');
  const live = root.querySelector('[aria-live]');
  let left = totalSec;
  const paint = () => {
    const on = Math.ceil((left / totalSec) * segs.length);
    segs.forEach((s, i) => s.classList.toggle('on', i < on));
    label.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    root.classList.toggle('minuteur--urgent', left < 10);
    if (live && (left === 30 || left === 10)) live.textContent = `${left} secondes`;
  };
  paint();
  const id = setInterval(() => { left -= 1; paint(); if (left <= 0) { clearInterval(id); onEnd?.(); } }, 1000);
  return () => clearInterval(id);
}

/* Appui long (suppression du compte) : 2 s pour confirmer, relâcher annule. */
export function holdToConfirm(button, onConfirm, ms = 2000) {
  let t;
  const start = (e) => { e.preventDefault(); button.classList.add('appui'); t = setTimeout(() => { button.classList.remove('appui'); onConfirm(); }, ms); };
  const stop = () => { clearTimeout(t); button.classList.remove('appui'); };
  button.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => button.addEventListener(ev, stop));
  button.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
  button.addEventListener('keyup', stop);
}

/* Pochette générée : couleur stable tirée du titre */
const POCHETTES = [['#F2B630', '#2E63B8'], ['#F28AA6', '#1B1D16'], ['#7FB342', '#F2B630'], ['#EFE8CC', '#B83A24'], ['#B83A24', '#EFE8CC'], ['#2E63B8', '#F28AA6']];
export function pochetteColors(title) {
  let h = 0; for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [fond, rond] = POCHETTES[h % POCHETTES.length];
  return { '--pochette-fond': fond, '--pochette-rond': rond };
}

/* Couleur d'avatar par ordre d'arrivée dans la salle (classes .c-1 à .c-5) */
export const avatarClass = (index) => `c-${(index % 5) + 1}`;
