// Gribouille (gri:) : un joueur dessine, les autres devinent dans le chat. Protocole : ADR 0003 §7.
// Markup injecté ici (chaînes constantes) ; tout texte venant d'un joueur passe par granUI.el / textContent.
// Dépend de : granUI, granRouter, granSalle, granReprise, socket (globale, javascript/auth.js).
(() => {
  const PFX = 'gri';
  const GRACE_MS = 120000; // période de grâce côté serveur
  const SEND_MS = 80; // 1 segment / 80 ms au plus
  const MAX_PTS = 64; // points par segment (serveur : 128 valeurs)
  const NB_SEGMENTS = 20;
  const BASE = 1000; // coordonnées normalisées 0-1000
  const MAX_MSG = 200;
  // Constantes partagées avec le serveur : index c (0-11) et w (0-3).
  const PALETTE = [
    { v: '#1B1D16', n: 'Noir' }, { v: '#FFFFFF', n: 'Blanc (gomme)' }, { v: '#B83A24', n: 'Rouge' }, { v: '#F28AA6', n: 'Rose' },
    { v: '#F2B630', n: 'Jaune' }, { v: '#7FB342', n: 'Vert' }, { v: '#2E63B8', n: 'Bleu' }, { v: '#6B3F1D', n: 'Marron' },
    { v: '#7A7A72', n: 'Gris' }, { v: '#E8762B', n: 'Orange' }, { v: '#5BC0DE', n: 'Ciel' }, { v: '#8E44AD', n: 'Violet' },
  ];
  const EPAISSEURS = [4, 8, 16, 32];
  const NOMS_EPAISSEUR = ['Fin', 'Moyen', 'Épais', 'Très épais'];
  const RAISONS = { time: 'Temps écoulé.', all_found: 'Tout le monde a trouvé.', drawer_left: 'Le dessinateur est parti.' };
  const ERREURS_CODE = {
    bad_code: 'Un code fait 4 lettres, sans voyelles.',
    room_not_found: "Ce code de salle n'existe pas. Vérifie les 4 lettres avec l'hôte.",
    room_full: 'Cette salle est pleine (8 sur 8).',
    game_in_progress: 'La partie a déjà commencé. Attends la prochaine manche.',
  };
  const el = granUI.el;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const fresh = () => ({
    joined: false, code: '', you: '', token: '', username: '', hostId: '', players: [],
    phase: 'lobby', options: { rounds: 3, drawTime: 80 }, round: 0, totalRounds: 0, scores: {},
    drawerId: '', durationMs: 0, deadline: 0, found: new Set(), youFound: false, mask: '', word: '',
    choices: null, picked: false, segments: [], turnEnd: null, ranking: [],
  });

  let S = fresh();
  let host = null; // { montage, root, screenBox, dialog }
  let salle = null; // contrôleur granSalle
  let screen = ''; // entry | lobby | game | over | replaced
  let G = null; // références de l'écran de jeu
  let L = null; // références du salon
  let active = false;
  let resuming = false;
  let replaced = false;
  let forfeitOnLeave = false;
  let routeCode = '';
  let offlineClose = null;
  let timerId = 0;
  let annonce = -1;
  let ro = null;
  const sel = { c: 0, w: 1 };
  const D = { active: false, pid: -1, id: 0, c: 0, w: 1, buf: [], lastSent: null, prev: null, timer: 0, lastEmit: 0, nextId: 0 };
  const attentes = new Set();
  let enregistres = [];

  const later = (fn, ms) => { const t = setTimeout(() => { attentes.delete(t); fn(); }, ms); attentes.add(t); return t; };
  const nom = (pid) => { const p = S.players.find((x) => x.id === pid); return p ? p.username : 'Un joueur'; };
  const estMoi = (pid) => pid === S.you;
  const estHote = () => S.you && S.hostId === S.you;
  const estDessinateur = () => S.drawerId === S.you;
  const enPartie = () => S.joined && (S.phase === 'choosing' || S.phase === 'drawing' || S.phase === 'turn_end');
  const entier = (n) => Number.isInteger(n);

  /* ---------- Écrans ---------- */
  function afficher(nomEcran, node) {
    screen = nomEcran;
    granUI.showScreen(host.screenBox, node);
  }

  function monterEntree() {
    screen = 'entry';
    G = null; L = null;
    const conteneur = el('div');
    host.screenBox.replaceChildren(conteneur);
    salle = granSalle.mount(conteneur, {
      prefix: PFX, titre: 'Gribouille', jeuLabel: 'Gribouille', intro: 'Dessine. Pas de lettres, on te voit.',
      onCreate(username) { S.username = username; salle.setBusy(true); socket.emit('gri:create', { username }); },
      onJoin(code, username) { S.username = username; salle.setBusy(true); socket.emit('gri:join', { code, username }); },
      onResume(entry) { reprendre(entry); },
      onForget() { /* l'entrée est déjà effacée par granSalle */ },
    });
    if (routeCode) salle.setCode(routeCode);
    salle.focus();
  }

  function reprendre(entry) {
    resuming = true;
    if (salle) salle.setBusy(true);
    socket.emit('gri:resume', { code: entry.code, token: entry.token });
  }

  function entreeValide() {
    const e = granReprise.get(PFX);
    return e && (!routeCode || routeCode === e.code) ? e : null;
  }

  function retourEntree(message) {
    stopTimer(); abortStroke();
    S = fresh(); replaced = false;
    granRouter.setLeaveGuard(null);
    monterEntree();
    if (message) granUI.toast(message, { type: 'info' });
  }

  /* ---------- Salon ---------- */
  function construireSalon() {
    const code = el('p', { class: 'gri-code', 'aria-label': `Code de la salle : ${S.code.split('').join(' ')}` }, S.code);
    const lien = `${location.origin}${location.pathname}#/gribouille/${S.code}`;
    const copier = el('button', { class: 'key key--secondaire key--compact', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(lien); granUI.toast('Lien copié.'); } catch { granUI.toast('Copie impossible : sélectionne le lien à la main.', { type: 'erreur' }); }
    } }, 'Copier le lien');
    const liste = el('ul', { class: 'gri-joueurs' });
    const opts = el('div', { class: 'gri-options' });
    const lancer = el('button', { class: 'key key--principal key--bloc', type: 'button', onclick: () => { if (estHote()) socket.emit('gri:start', {}); } }, 'Lancer');
    const aide = el('p', { class: 'gri-aide', role: 'status' });
    const racine = el('section', { class: 'gri-salon' },
      el('h1', { class: 'gri-titre' }, 'Gribouille'),
      el('div', { class: 'gri-salon__code px' },
        el('span', { class: 'gri-etiquette' }, 'Code de la salle'), code,
        el('p', { class: 'gri-lien' }, lien), copier),
      el('div', { class: 'gri-salon__corps' },
        el('div', { class: 'gri-panneau px' }, el('h2', { class: 'gri-h2' }, 'Les joueurs'), liste),
        el('div', { class: 'gri-panneau px' }, el('h2', { class: 'gri-h2' }, 'La partie'), opts, lancer, aide)),
      el('button', { class: 'key key--fantome key--compact', type: 'button', onclick: () => granRouter.navigate('/') }, 'Quitter la salle'));
    L = { liste, opts, lancer, aide, vus: new Set(), racine };
    afficher('lobby', racine);
    majSalon();
  }

  function stepper(label, valeur, unite, moins, plus, min, max) {
    const sortie = el('output', { 'aria-live': 'polite' }, `${valeur}${unite}`);
    return el('div', { class: 'gri-reglage' },
      el('span', { class: 'gri-reglage__nom' }, label),
      el('div', { class: 'stepper' },
        el('button', { type: 'button', 'aria-label': `${label} : moins`, disabled: valeur <= min, onclick: moins }, '−'),
        sortie,
        el('button', { type: 'button', 'aria-label': `${label} : plus`, disabled: valeur >= max, onclick: plus }, '+')));
  }

  function majSalon() {
    if (screen !== 'lobby' || !L) return;
    const { rounds, drawTime } = S.options;
    const hote = estHote();
    L.liste.replaceChildren(...S.players.map((p, i) => {
      const li = el('li', { class: `gri-joueur${p.connected ? '' : ' gri-joueur--hors'}${L.vus.has(p.id) ? '' : ' gri-joueur--arrive'}` },
        el('span', { class: `avatar-touche ${granUI.avatarClass(i)}`, 'aria-hidden': 'true' }, (p.username || '?').slice(0, 1).toUpperCase()),
        el('span', { class: 'gri-joueur__nom' }, p.username),
        p.id === S.hostId ? el('span', { class: 'badge badge--hote' }, 'Hôte') : null,
        estMoi(p.id) ? el('span', { class: 'badge badge--moi' }, 'Toi') : null,
        p.connected ? null : el('span', { class: 'badge badge--absent' }, 'Hors ligne'));
      L.vus.add(p.id);
      return li;
    }));
    const envoyer = (r, t) => socket.emit('gri:options', { rounds: clamp(r, 1, 5), drawTime: clamp(t, 30, 120) });
    if (hote) {
      L.opts.replaceChildren(
        stepper('Manches', rounds, '', () => envoyer(rounds - 1, drawTime), () => envoyer(rounds + 1, drawTime), 1, 5),
        stepper('Temps par dessin', drawTime, ' s', () => envoyer(rounds, drawTime - 10), () => envoyer(rounds, drawTime + 10), 30, 120));
    } else {
      L.opts.replaceChildren(el('p', { class: 'gri-resume' }, `${rounds} manche${rounds > 1 ? 's' : ''}, ${drawTime} s par dessin.`));
    }
    const connectes = S.players.filter((p) => p.connected).length;
    L.lancer.hidden = !hote;
    L.lancer.disabled = connectes < 2;
    L.aide.textContent = hote ? (connectes < 2 ? 'Il faut au moins 2 joueurs connectés.' : '') : "L'hôte lance la partie.";
  }

  /* ---------- Écran de jeu ---------- */
  function construireJeu() {
    const infoManche = el('span', { class: 'gri-info' });
    const infoDessin = el('span', { class: 'gri-info gri-info--dessin' });
    const segs = Array.from({ length: NB_SEGMENTS }, () => el('span'));
    const temps = el('span', { class: 'gri-chrono__temps' }, '0:00');
    const live = el('span', { class: 'sr-only', 'aria-live': 'polite' });
    const chrono = el('div', { class: 'gri-chrono', 'aria-hidden': 'true' }, el('span', { class: 'gri-chrono__segments' }, segs), temps);
    const masque = el('div', { class: 'gri-masque', 'aria-hidden': 'true' });
    const masqueSr = el('p', { class: 'sr-only' });
    const haut = el('header', { class: 'gri-haut px' },
      el('h1', { class: 'sr-only' }, 'Gribouille'),
      el('div', { class: 'gri-haut__infos' }, infoManche, infoDessin,
        el('button', { class: 'key key--fantome key--compact gri-quitter', type: 'button', onclick: () => granRouter.navigate('/') }, 'Quitter')),
      chrono, live, masque, masqueSr);

    const canvas = el('canvas', { class: 'gri-canvas', 'aria-label': 'Zone de dessin', role: 'img' });
    const voile = el('div', { class: 'gri-voile', role: 'status', hidden: true });
    const tampon = el('div', { class: 'gri-tampon', 'aria-hidden': 'true', hidden: true }, 'Trouvé !');
    const toile = el('div', { class: 'gri-toile' }, canvas, voile, tampon);

    const palette = el('div', { class: 'gri-palette', role: 'group', 'aria-label': 'Couleurs' }, PALETTE.map((p, i) =>
      el('button', { class: 'gri-pastille', type: 'button', style: `--p:${p.v}`, 'aria-label': p.n, 'aria-pressed': String(i === sel.c), 'data-c': i,
        onclick: () => { sel.c = i; majOutils(); } })));
    const epaisseurs = el('div', { class: 'gri-epaisseurs', role: 'group', 'aria-label': 'Épaisseur' }, EPAISSEURS.map((e, i) =>
      el('button', { class: 'gri-epaisseur', type: 'button', 'aria-label': NOMS_EPAISSEUR[i], 'aria-pressed': String(i === sel.w), 'data-w': i,
        onclick: () => { sel.w = i; majOutils(); } }, el('span', { style: `--d:${4 + i * 4}px` }))));
    const annuler = el('button', { class: 'key key--secondaire key--compact', type: 'button', onclick: annulerTrait }, 'Annuler');
    const effacer = el('button', { class: 'key key--secondaire key--compact', type: 'button', onclick: toutEffacer }, 'Tout effacer');
    const outils = el('div', { class: 'gri-outils px', hidden: true }, palette, el('div', { class: 'gri-outils__bas' }, epaisseurs, annuler, effacer));

    const scores = el('ol', { class: 'gri-scores' });
    const messages = el('ul', { class: 'gri-messages', role: 'log', 'aria-label': 'Devinettes' });
    const champ = el('input', { class: 'field__input gri-champ', type: 'text', maxlength: 40, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Ton essai' });
    const envoi = el('button', { class: 'key key--principal key--compact', type: 'submit' }, 'Envoyer');
    const form = el('form', { class: 'gri-form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const t = champ.value.trim().slice(0, 40);
      if (!t || champ.disabled) return;
      socket.emit('gri:guess', { text: t });
      champ.value = '';
    } }, champ, envoi);
    const cote = el('aside', { class: 'gri-cote' },
      el('div', { class: 'gri-panneau gri-panneau--scores px' }, el('h2', { class: 'gri-h2' }, 'Scores'), scores),
      el('div', { class: 'gri-panneau gri-panneau--chat px' }, el('h2', { class: 'gri-h2' }, 'Devinettes'), messages, form));

    const racine = el('section', { class: 'gri-jeu' }, haut, el('div', { class: 'gri-scene' }, toile, outils), cote);
    G = { racine, infoManche, infoDessin, segs, temps, live, chrono, masque, masqueSr, canvas, ctx: canvas.getContext('2d'), toile, voile, tampon,
      outils, palette, epaisseurs, annuler, scores, messages, champ, envoi, shown: null, prevMask: '', overlayKey: '' };
    afficher('game', racine);

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    ro = new ResizeObserver(() => redimensionner());
    ro.observe(toile);
    window.addEventListener('resize', redimensionner);
    redimensionner();
  }

  function majOutils() {
    if (!G) return;
    G.palette.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.c) === sel.c)));
    G.epaisseurs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.w) === sel.w)));
  }

  function majJeu() {
    if (screen !== 'game' || !G) return;
    const dessine = estDessinateur();
    const phaseDessin = S.phase === 'drawing';
    G.infoManche.textContent = S.totalRounds ? `Manche ${S.round}/${S.totalRounds}` : '';
    G.infoDessin.textContent = S.drawerId ? (dessine ? 'Tu dessines' : `${nom(S.drawerId)} dessine`) : '';
    G.outils.hidden = !(dessine && phaseDessin);
    const actif = dessine && phaseDessin;
    G.toile.classList.toggle('gri-toile--dessin', actif);
    G.canvas.setAttribute('aria-label', actif ? 'Zone de dessin : dessine ici' : 'Dessin en cours');
    majMasque();
    majScores();
    majChamp();
    majVoile();
    majOutils();
    paintTimer();
  }

  function majMasque() {
    const dessine = estDessinateur();
    const txt = dessine && S.word ? S.word : S.mask;
    if (txt === G.shown) return;
    G.shown = txt;
    if (!txt) { G.masque.replaceChildren(); G.masqueSr.textContent = ''; G.prevMask = ''; return; }
    const prev = G.prevMask;
    G.masque.replaceChildren(...[...txt].map((ch, i) => {
      if (ch === ' ') return el('span', { class: 'gri-case gri-case--espace' });
      if (ch === '_') return el('span', { class: 'gri-case gri-case--vide' });
      const fixe = !/[\p{L}\p{N}]/u.test(ch);
      const c = el('span', { class: `gri-case${fixe ? ' gri-case--fixe' : ''}` }, ch);
      if (!dessine && !fixe && prev && prev[i] === '_') c.classList.add('gri-case--revele');
      return c;
    }));
    if (!dessine) G.prevMask = S.mask;
    const lettres = [...txt].filter((ch) => /[\p{L}\p{N}_]/u.test(ch)).length;
    G.masqueSr.textContent = dessine ? `Ton mot : ${txt}.` : `Mot à deviner : ${lettres} lettres${/[^_\s]/.test(txt) ? `, masque ${txt.replace(/_/g, ' vide ')}` : ''}.`;
  }

  function majScores() {
    const tri = [...S.players].sort((a, b) => (S.scores[b.id] || 0) - (S.scores[a.id] || 0));
    G.scores.replaceChildren(...tri.map((p) => el('li', { class: `gri-score${p.connected ? '' : ' gri-score--hors'}${estMoi(p.id) ? ' gri-score--moi' : ''}${S.found.has(p.id) ? ' gri-score--trouve' : ''}` },
      el('span', { class: 'gri-score__marque', 'aria-hidden': 'true' }, p.id === S.drawerId ? '✎' : (S.found.has(p.id) ? '✓' : '')),
      el('span', { class: 'gri-score__nom' }, p.username),
      p.id === S.drawerId ? el('span', { class: 'sr-only' }, ' (dessine)') : null,
      S.found.has(p.id) ? el('span', { class: 'sr-only' }, ' (a trouvé)') : null,
      p.connected ? null : el('span', { class: 'sr-only' }, ' (hors ligne)'),
      el('span', { class: 'gri-score__pts' }, String(S.scores[p.id] || 0)))));
  }

  function majChamp() {
    const dessine = estDessinateur();
    const peut = S.phase === 'drawing' && !dessine;
    G.champ.disabled = !peut;
    G.envoi.disabled = !peut;
    G.champ.classList.toggle('gri-champ--trouveurs', S.youFound);
    G.champ.placeholder = dessine ? 'Tu dessines : pas de chat' : S.youFound ? 'Chat des trouveurs' : peut ? 'Ton essai' : 'Patience';
    G.champ.setAttribute('aria-label', S.youFound ? 'Chat des trouveurs' : 'Ton essai');
  }

  /* ---------- Voile : choix du mot, fin de tour ---------- */
  function majVoile() {
    const v = G.voile;
    let cle = '';
    if (S.phase === 'choosing') cle = `c:${S.round}:${S.drawerId}:${S.choices ? S.choices.join('|') : ''}:${S.picked}`;
    else if (S.phase === 'turn_end' && S.turnEnd) cle = `t:${S.round}:${S.turnEnd.word}:${S.drawerId}`;
    if (cle === G.overlayKey) return;
    G.overlayKey = cle;
    if (!cle) { v.hidden = true; v.replaceChildren(); return; }
    v.hidden = false;
    if (S.phase === 'choosing') {
      if (estDessinateur() && S.choices) {
        const cartes = S.choices.map((w, i) => el('button', { class: 'gri-carte', type: 'button', disabled: S.picked, style: `--i:${i}`, onclick: () => {
          if (S.picked) return;
          S.picked = true;
          socket.emit('gri:choose', { index: i });
          majVoile();
        } }, w));
        v.replaceChildren(el('div', { class: 'gri-voile__boite' }, el('h2', { class: 'gri-h2' }, S.picked ? 'Mot choisi.' : 'Choisis ton mot'), el('div', { class: 'gri-cartes' }, cartes)));
        if (!S.picked && cartes[0]) cartes[0].focus({ preventScroll: true });
      } else {
        v.replaceChildren(el('div', { class: 'gri-voile__boite' }, el('p', { class: 'gri-attente' }, `${estDessinateur() ? 'Les mots arrivent' : nom(S.drawerId)} ${estDessinateur() ? '…' : 'choisit un mot…'}`)));
      }
      return;
    }
    const t = S.turnEnd;
    const lignes = [...S.players].sort((a, b) => ((t.gained && t.gained[b.id]) || 0) - ((t.gained && t.gained[a.id]) || 0)).map((p, i) => {
      const pts = (t.gained && t.gained[p.id]) || 0;
      const n = el('span', { class: 'gri-gain__pts' }, '+0');
      later(() => granUI.countUp(n, pts, { format: (x) => `+${x}` }), 150 + i * 60);
      return el('li', { class: 'gri-gain' }, el('span', { class: 'gri-gain__nom' }, p.username), n);
    });
    v.replaceChildren(el('div', { class: 'gri-voile__boite' },
      el('h2', { class: 'gri-h2' }, t.word ? ['Le mot était : ', el('strong', { class: 'gri-mot-final' }, t.word)] : 'Pas de mot cette fois.'),
      el('p', { class: 'gri-raison' }, RAISONS[t.reason] || ''),
      el('ul', { class: 'gri-gains' }, lignes)));
  }

  /* ---------- Chat ---------- */
  function ajouterMessage(classe, ...contenu) {
    const ul = G.messages;
    const bas = ul.scrollHeight - ul.scrollTop - ul.clientHeight < 40;
    ul.append(el('li', { class: `gri-msg ${classe}` }, ...contenu));
    while (ul.children.length > MAX_MSG) ul.firstChild.remove();
    if (bas) ul.scrollTop = ul.scrollHeight;
  }

  function confetti() {
    if (granUI.reducedMotion() || !G) return;
    const couleurs = PALETTE.filter((_, i) => i !== 1).map((p) => p.v);
    const nodes = Array.from({ length: 16 }, (_, i) => el('span', { class: 'gri-confetti',
      style: `--dx:${Math.round((Math.random() - .5) * 260)}px;--dy:${Math.round(-60 - Math.random() * 120)}px;--r:${Math.round(Math.random() * 540)}deg;--cc:${couleurs[i % couleurs.length]};--dl:${i * 12}ms` }));
    G.toile.append(...nodes);
    later(() => nodes.forEach((n) => n.remove()), 1200);
  }

  function tamponTrouve() {
    G.tampon.hidden = false;
    G.tampon.classList.remove('gri-tampon--on'); void G.tampon.offsetWidth; G.tampon.classList.add('gri-tampon--on');
    later(() => { if (G) G.tampon.hidden = true; }, 1400);
  }

  /* ---------- Chrono ---------- */
  function paintTimer() {
    if (!G) return;
    const restant = S.deadline && (S.phase === 'choosing' || S.phase === 'drawing') ? Math.max(0, S.deadline - Date.now()) : 0;
    const sec = Math.ceil(restant / 1000);
    const on = S.durationMs ? Math.ceil((restant / S.durationMs) * NB_SEGMENTS) : 0;
    G.segs.forEach((s, i) => s.classList.toggle('on', i < on));
    G.temps.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    G.chrono.classList.toggle('gri-chrono--urgent', S.phase === 'drawing' && sec > 0 && sec <= 10);
    if (S.phase === 'drawing' && (sec === 30 || sec === 10) && annonce !== sec) { annonce = sec; G.live.textContent = `${sec} secondes`; }
  }
  function startTimer() {
    stopTimer();
    annonce = -1;
    timerId = setInterval(paintTimer, 200);
    paintTimer();
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = 0; }
  function armer(durationMs) {
    S.durationMs = durationMs || 0;
    S.deadline = Date.now() + (durationMs || 0);
    startTimer();
  }

  /* ---------- Canvas ---------- */
  function redimensionner() {
    if (!G) return;
    const r = G.toile.getBoundingClientRect();
    if (r.width < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (G.canvas.width !== w || G.canvas.height !== h) { G.canvas.width = w; G.canvas.height = h; }
    toutRedessiner();
  }

  function dessinerSegment(seg) {
    if (!G) return;
    const ctx = G.ctx;
    const k = G.canvas.width / BASE;
    const p = seg.p;
    ctx.strokeStyle = PALETTE[seg.c].v;
    ctx.fillStyle = PALETTE[seg.c].v;
    ctx.lineWidth = EPAISSEURS[seg.w] * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const n = p.length / 2;
    if (n === 1) {
      ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0] * k, p[1] * k);
    for (let i = 1; i < n - 1; i++) { // lissage : courbes quadratiques entre milieux
      const mx = (p[2 * i] + p[2 * i + 2]) / 2;
      const my = (p[2 * i + 1] + p[2 * i + 3]) / 2;
      ctx.quadraticCurveTo(p[2 * i] * k, p[2 * i + 1] * k, mx * k, my * k);
    }
    ctx.lineTo(p[2 * n - 2] * k, p[2 * n - 1] * k);
    ctx.stroke();
  }

  function toutRedessiner() {
    if (!G) return;
    G.ctx.fillStyle = PALETTE[1].v;
    G.ctx.fillRect(0, 0, G.canvas.width, G.canvas.height);
    S.segments.forEach(dessinerSegment);
  }

  const segmentValide = (m) => m && entier(m.id) && m.id >= 0 && m.id <= 65535 && entier(m.c) && m.c >= 0 && m.c < PALETTE.length
    && entier(m.w) && m.w >= 0 && m.w < EPAISSEURS.length && Array.isArray(m.p) && m.p.length >= 2 && m.p.length % 2 === 0 && m.p.length <= 128 && m.p.every(entier);

  /* Saisie (dessinateur) */
  const peutDessiner = () => S.joined && S.phase === 'drawing' && estDessinateur() && screen === 'game';
  function point(e) {
    const r = G.canvas.getBoundingClientRect();
    return [clamp(Math.round(((e.clientX - r.left) / r.width) * BASE), 0, BASE), clamp(Math.round(((e.clientY - r.top) / r.height) * BASE), 0, BASE)];
  }
  function idLibre() {
    const pris = new Set(S.segments.map((s) => s.id));
    let id = D.nextId & 0xFFFF;
    while (pris.has(id)) id = (id + 1) & 0xFFFF;
    D.nextId = id + 1;
    return id;
  }
  function onDown(e) {
    if (!peutDessiner() || D.active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { G.canvas.setPointerCapture(e.pointerId); } catch { /* capture indisponible */ }
    const p = point(e);
    Object.assign(D, { active: true, pid: e.pointerId, id: idLibre(), c: sel.c, w: sel.w, buf: [p], lastSent: null, prev: p });
    dessinerSegment({ c: D.c, w: D.w, p });
    planifier();
  }
  function onMove(e) {
    if (!D.active || e.pointerId !== D.pid) return;
    const evts = typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e];
    for (const ev of evts) {
      const p = point(ev);
      if (p[0] === D.prev[0] && p[1] === D.prev[1]) continue;
      D.buf.push(p);
      dessinerSegment({ c: D.c, w: D.w, p: [D.prev[0], D.prev[1], p[0], p[1]] }); // aperçu immédiat
      D.prev = p;
    }
    planifier();
  }
  function onUp(e) {
    if (!D.active || e.pointerId !== D.pid) return;
    D.active = false;
    try { G.canvas.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ }
    planifier();
  }
  function planifier() {
    if (D.timer || !D.buf.length) return;
    D.timer = setTimeout(envoyerTrait, Math.max(0, SEND_MS - (Date.now() - D.lastEmit)));
  }
  function envoyerTrait() {
    D.timer = 0;
    if (!D.buf.length || !peutDessiner()) { D.buf = []; return; }
    const tout = D.lastSent ? [D.lastSent, ...D.buf] : D.buf;
    const aEnvoyer = D.lastSent && D.buf.length === 0 ? [] : tout;
    D.buf = [];
    for (let i = 0; aEnvoyer.length; i += MAX_PTS - 1) {
      const seg = { id: D.id, c: D.c, w: D.w, p: aEnvoyer.slice(i, i + MAX_PTS).flat() };
      S.segments.push(seg);
      socket.emit('gri:draw', seg);
      if (i + MAX_PTS >= aEnvoyer.length) break;
    }
    if (aEnvoyer.length) D.lastSent = aEnvoyer[aEnvoyer.length - 1];
    D.lastEmit = Date.now();
  }
  function abortStroke() {
    if (D.timer) clearTimeout(D.timer);
    D.timer = 0; D.active = false; D.buf = []; D.lastSent = null;
  }
  function annulerTrait() {
    if (!peutDessiner()) return;
    if (D.timer) { clearTimeout(D.timer); envoyerTrait(); }
    const dernier = S.segments[S.segments.length - 1];
    if (!dernier) return;
    socket.emit('gri:undo', { id: dernier.id });
    S.segments = S.segments.filter((s) => s.id !== dernier.id);
    toutRedessiner();
  }
  function toutEffacer() {
    if (!peutDessiner()) return;
    abortStroke();
    socket.emit('gri:clear', {});
    S.segments = [];
    toutRedessiner();
  }

  /* ---------- Fin de partie ---------- */
  function construireFin() {
    const classement = [...S.ranking].sort((a, b) => b.score - a.score);
    const ordrePodium = [classement[1], classement[0], classement[2]]; // 2e, 1er, 3e
    const rang = new Map(classement.map((r, i) => [r.id, i]));
    const colonnes = ordrePodium.filter(Boolean).map((r) => {
      const i = rang.get(r.id);
      const pts = el('span', { class: 'gri-podium__pts' }, '0');
      later(() => granUI.countUp(pts, r.score), 300 + (2 - i) * 450);
      return el('li', { class: `gri-podium__col gri-podium__col--${i + 1}`, style: `--i:${2 - i}` },
        el('span', { class: 'gri-podium__nom' }, r.username), pts,
        el('span', { class: 'gri-podium__socle' }, el('span', { 'aria-hidden': 'true' }, String(i + 1)), el('span', { class: 'sr-only' }, `${i + 1}e place`)));
    });
    const autres = classement.slice(3).map((r, i) => el('li', { class: 'gri-reste', value: i + 4 }, el('span', { class: 'gri-reste__nom' }, r.username), el('span', {}, `${r.score} pts`)));
    const rejouer = el('button', { class: 'key key--principal key--bloc', type: 'button', onclick: () => { if (estHote()) socket.emit('gri:start', {}); } }, 'Rejouer');
    rejouer.hidden = !estHote();
    const accueil = el('button', { class: 'key key--secondaire key--bloc', type: 'button', onclick: () => granRouter.navigate('/') }, "Retour à l'accueil");
    const racine = el('section', { class: 'gri-fin' },
      el('h1', { class: 'gri-titre' }, 'Fin de la partie'),
      el('ol', { class: 'gri-podium' }, colonnes),
      autres.length ? el('ol', { class: 'gri-restes', start: 4 }, autres) : null,
      el('div', { class: 'gri-fin__actions' }, rejouer, estHote() ? null : el('p', { class: 'gri-aide' }, "L'hôte peut relancer une partie."), accueil));
    afficher('over', racine);
  }

  /* ---------- Synchronisation écran <-> état ---------- */
  function synchroniser() {
    const voulu = S.phase === 'lobby' ? 'lobby' : S.phase === 'over' ? 'over' : 'game';
    if (voulu !== screen) {
      stopTimer(); abortStroke();
      if (ro) { ro.disconnect(); ro = null; }
      window.removeEventListener('resize', redimensionner);
      G = null; L = null;
      if (voulu === 'lobby') construireSalon();
      else if (voulu === 'over') construireFin();
      else { construireJeu(); if (S.deadline) startTimer(); }
    }
    if (voulu === 'lobby') majSalon();
    if (voulu === 'game') { toutRedessiner(); majJeu(); }
    granRouter.setLeaveGuard(enPartie() ? confirmerSortie : null);
  }

  function confirmerSortie() {
    const d = host.dialog;
    if (d.open) return Promise.resolve(false);
    return new Promise((resolve) => {
      let ok = false;
      const rester = el('button', { class: 'key key--principal key--bloc', type: 'button', onclick: () => granUI.closeDialog(d) }, 'Rester');
      const doux = el('button', { class: 'key key--secondaire key--bloc', type: 'button', onclick: () => { ok = true; granUI.closeDialog(d); } }, 'Quitter pour le moment');
      const dur = el('button', { class: 'key key--danger key--bloc', type: 'button', onclick: () => { ok = true; forfeitOnLeave = true; granUI.closeDialog(d); } }, 'Quitter définitivement');
      d.replaceChildren(
        el('div', { class: 'fenetre__tete' }, el('h2', { class: 'fenetre__titre', id: 'gri-quitter-titre' }, 'Quitter la partie ?')),
        el('div', { class: 'fenetre__corps' },
          el('p', {}, 'Le tour est en cours. Tu peux revenir pendant 2 minutes si tu pars pour le moment.'), rester, doux, dur));
      d.addEventListener('close', () => resolve(ok), { once: true });
      granUI.openDialog(d);
    });
  }

  /* ---------- Réception socket ---------- */
  function appliquerEtat(st, payload) {
    S.code = payload.code; S.you = payload.you; S.token = payload.token; S.hostId = payload.hostId; S.players = payload.players || [];
    S.phase = st.phase || 'lobby';
    S.options = st.options || S.options;
    S.round = st.round || 0; S.totalRounds = st.totalRounds || 0; S.scores = st.scores || {};
    S.drawerId = st.drawerId || ''; S.found = new Set(st.found || []); S.youFound = !!st.youFound;
    S.choices = Array.isArray(st.choices) ? st.choices.slice(0, 3).map(String) : null;
    S.picked = false;
    S.mask = typeof st.mask === 'string' ? st.mask : '';
    S.word = typeof st.word === 'string' ? st.word : '';
    S.segments = Array.isArray(st.segments) ? st.segments.filter(segmentValide) : [];
    D.nextId = S.segments.reduce((m, s) => Math.max(m, s.id + 1), 0);
    S.turnEnd = st.turnEnd || null;
    S.ranking = Array.isArray(st.ranking) ? st.ranking : [];
    if (S.phase === 'choosing' || S.phase === 'drawing') armer(st.remainingMs); else { S.deadline = 0; }
    if (S.phase === 'choosing' || S.phase === 'drawing') S.durationMs = st.durationMs || 0;
    if (G) G.shown = null;
  }

  const handlers = {
    connect() {
      if (!active || replaced) return;
      const e = entreeValide();
      if (e && !resuming) reprendre(e);
    },
    disconnect() {
      if (S.joined && S.phase !== 'over') {
        granReprise.touch(PFX, GRACE_MS);
        if (!offlineClose) offlineClose = granUI.toast('Connexion perdue, on te reconnecte…', { type: 'info', duree: 0 });
      }
    },
    'gri:joined'(p) {
      if (!active || !p || typeof p.code !== 'string') return;
      resuming = false;
      if (offlineClose) { offlineClose(); offlineClose = null; }
      const st = p.state || {};
      const premiereFois = !S.joined;
      S.joined = true;
      if (G && screen === 'game') { G.messages.replaceChildren(); G.prevMask = ''; }
      appliquerEtat(st, p);
      const moi = S.players.find((x) => x.id === S.you);
      granReprise.save(PFX, { code: S.code, pid: S.you, token: S.token, username: (moi && moi.username) || S.username });
      if (p.resumed) granUI.toast(`Tu es de retour dans la salle ${S.code}`);
      if (premiereFois && salle) salle.setBusy(false);
      synchroniser();
      if (screen === 'game') majJeu();
    },
    'gri:room'(p) {
      if (!S.joined || !p) return;
      S.hostId = p.hostId; S.players = p.players || [];
      if (screen === 'lobby') majSalon(); else if (screen === 'game') { majJeu(); } else if (screen === 'over') construireFin();
    },
    'gri:options'(p) {
      if (!S.joined || !p) return;
      S.options = { rounds: p.rounds, drawTime: p.drawTime };
      majSalon();
    },
    'gri:choosing'(p) {
      if (!S.joined || !p) return;
      S.phase = 'choosing'; S.drawerId = p.drawerId; S.round = p.round; S.totalRounds = p.totalRounds;
      resetTour(); armer(p.durationMs);
      synchroniser();
      if (G) G.messages.replaceChildren();
      majJeu();
    },
    'gri:choices'(p) {
      if (!S.joined || !p || !Array.isArray(p.words)) return;
      S.choices = p.words.slice(0, 3).map(String);
      if (screen === 'game') majJeu();
    },
    'gri:turn_start'(p) {
      if (!S.joined || !p) return;
      S.phase = 'drawing'; S.drawerId = p.drawerId; S.mask = String(p.mask || '');
      S.segments = []; S.found = new Set(); S.youFound = false; S.word = ''; S.choices = null; S.turnEnd = null; S.picked = false;
      armer(p.durationMs);
      if (G) G.prevMask = S.mask;
      synchroniser();
      majJeu();
    },
    'gri:word'(p) { if (S.joined && p) { S.word = String(p.word || ''); if (screen === 'game') majJeu(); } },
    'gri:hint'(p) { if (S.joined && p && typeof p.mask === 'string') { S.mask = p.mask; if (screen === 'game') majMasque(); } },
    'gri:draw'(m) {
      if (!S.joined || estDessinateur() || !segmentValide(m)) return;
      const seg = { id: m.id, c: m.c, w: m.w, p: m.p };
      S.segments.push(seg);
      dessinerSegment(seg);
    },
    'gri:undo'(m) {
      if (!S.joined || estDessinateur() || !m || !entier(m.id)) return;
      S.segments = S.segments.filter((s) => s.id !== m.id);
      toutRedessiner();
    },
    'gri:clear'() {
      if (!S.joined || estDessinateur()) return;
      S.segments = [];
      toutRedessiner();
    },
    'gri:chat'(p) {
      if (!S.joined || !G || !p || typeof p.text !== 'string') return;
      ajouterMessage(p.found ? 'gri-msg--trouveurs' : '', el('b', { class: 'gri-msg__nom' }, `${nom(p.playerId)} : `), p.text);
    },
    'gri:correct'(p) {
      if (!S.joined || !G || !p) return;
      S.found.add(p.playerId);
      S.scores[p.playerId] = (S.scores[p.playerId] || 0) + (Number(p.points) || 0);
      ajouterMessage('gri-msg--correct', `${estMoi(p.playerId) ? 'Tu as trouvé' : `${nom(p.playerId)} a trouvé`} ! (+${Number(p.points) || 0})`);
      if (estMoi(p.playerId)) { S.youFound = true; tamponTrouve(); confetti(); }
      majScores(); majChamp();
    },
    'gri:close'() { if (S.joined && G) ajouterMessage('gri-msg--proche', 'Tu y es presque !'); },
    'gri:turn_end'(p) {
      if (!S.joined || !p) return;
      S.phase = 'turn_end'; S.turnEnd = { word: p.word == null ? null : String(p.word), reason: p.reason, gained: p.gained || {} };
      if (p.scores) S.scores = p.scores;
      S.deadline = 0; S.choices = null;
      abortStroke(); stopTimer();
      if (screen === 'game') majJeu();
    },
    'gri:game_over'(p) {
      if (!S.joined || !p) return;
      S.phase = 'over'; S.ranking = Array.isArray(p.ranking) ? p.ranking : [];
      S.deadline = 0;
      synchroniser();
    },
    'gri:error'(p) {
      const code = p && p.code;
      const message = (p && p.message) || 'Une erreur est survenue.';
      if (code === 'resume_failed') {
        const etaitDedans = S.joined;
        resuming = false;
        granReprise.clear(PFX);
        if (offlineClose) { offlineClose(); offlineClose = null; }
        if (etaitDedans) retourEntree("Cette partie n'existe plus.");
        else if (salle) { salle.setBusy(false); salle.refreshResume(); }
        return;
      }
      if (S.joined) { granUI.toast(message, { type: 'erreur' }); return; }
      resuming = false;
      if (!salle) return;
      salle.setBusy(false);
      if (ERREURS_CODE[code]) salle.showError('code', ERREURS_CODE[code]);
      else salle.showError('general', message);
    },
    'gri:replaced'() {
      if (!active) return;
      replaced = true; resuming = false;
      stopTimer(); abortStroke();
      S = fresh(); G = null; L = null;
      granRouter.setLeaveGuard(null);
      if (offlineClose) { offlineClose(); offlineClose = null; }
      afficher('replaced', el('section', { class: 'gri-remplace' },
        el('h1', { class: 'gri-titre' }, 'Partie reprise dans un autre onglet'),
        el('p', {}, 'Tu joues déjà cette salle ailleurs. Ferme cet onglet ou retourne à l\'accueil.'),
        el('button', { class: 'key key--principal', type: 'button', onclick: () => granRouter.navigate('/') }, "Retour à l'accueil")));
    },
  };

  function resetTour() {
    S.segments = []; S.found = new Set(); S.youFound = false; S.word = ''; S.mask = ''; S.choices = null; S.turnEnd = null; S.picked = false;
    if (G) { G.prevMask = ''; G.shown = null; }
  }

  const surPageHide = () => { if (S.joined && S.phase !== 'over') granReprise.touch(PFX, GRACE_MS); };

  /* ---------- Cycle de vie ---------- */
  granRouter.register('gribouille', {
    enter(params) {
      const montage = document.querySelector('[data-vue="gribouille"] [data-montage]');
      if (!montage) return;
      active = true; replaced = false; resuming = false; forfeitOnLeave = false;
      routeCode = (params && params.code) || '';
      S = fresh();
      const screenBox = el('div', { class: 'gri-ecrans' });
      const dialog = el('dialog', { class: 'fenetre', 'aria-labelledby': 'gri-quitter-titre' });
      const root = el('div', { class: 'gri' }, screenBox, dialog);
      montage.replaceChildren(root);
      host = { montage, root, screenBox, dialog };
      enregistres = Object.entries(handlers);
      enregistres.forEach(([ev, fn]) => socket.on(ev, fn));
      window.addEventListener('pagehide', surPageHide);
      monterEntree();
      const e = entreeValide();
      if (socket.connected && e && routeCode === e.code) reprendre(e);
    },
    leave() {
      if (!active) return;
      active = false;
      if (S.joined) {
        const dedans = enPartie();
        if (forfeitOnLeave) { socket.emit('gri:leave', { forfeit: true }); granReprise.clear(PFX); }
        else if (dedans) { socket.emit('gri:leave', {}); granReprise.touch(PFX, GRACE_MS); }
        else { socket.emit('gri:leave', {}); granReprise.clear(PFX); }
      }
      enregistres.forEach(([ev, fn]) => socket.off(ev, fn));
      enregistres = [];
      window.removeEventListener('pagehide', surPageHide);
      window.removeEventListener('resize', redimensionner);
      if (ro) { ro.disconnect(); ro = null; }
      if (G && G.canvas) {
        G.canvas.removeEventListener('pointerdown', onDown);
        G.canvas.removeEventListener('pointermove', onMove);
        G.canvas.removeEventListener('pointerup', onUp);
        G.canvas.removeEventListener('pointercancel', onUp);
      }
      stopTimer(); abortStroke();
      attentes.forEach((t) => clearTimeout(t)); attentes.clear();
      if (offlineClose) { offlineClose(); offlineClose = null; }
      if (host && host.dialog.open) host.dialog.close();
      granRouter.setLeaveGuard(null);
      S = fresh(); G = null; L = null; salle = null; screen = ''; host = null; resuming = false; forfeitOnLeave = false;
    },
  });
})();
