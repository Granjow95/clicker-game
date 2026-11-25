// Petit Bac : client (protocole pb:, ADR 0003). Vue montée une seule fois dans [data-vue="petit-bac"] [data-montage].
// Tout texte venant d'un joueur passe par granUI.el / textContent (jamais innerHTML).
(() => {
  const P = 'pb';
  const el = granUI.el;
  const GRACE_MS = 120000;
  const THROTTLE_MS = 2000;
  const NB_CAT = 6;
  const NB_SEG = 20;
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const EN_PARTIE = ['writing', 'collecting', 'review', 'results'];
  const STATUTS = [
    { k: 'unique', label: 'Unique', pts: 10 },
    { k: 'partage', label: 'Partagé', pts: 5 },
    { k: 'refuse', label: 'Refusé', pts: 0 },
  ];
  const MSG_ERR = { not_host: 'Seul l\'hôte peut valider.', bad_phase: 'Action impossible à ce moment.', invalid: 'Action invalide.' };

  let racine = null;   // [data-montage]
  let statut = null;   // bandeau « connexion perdue »
  let vue = null;      // conteneur de l'écran courant
  let dlg = null;      // fenêtre de confirmation de départ
  let dlgResultat = false;
  let dlgResolve = null;
  let entree = null;   // retour de granSalle.mount
  let S = null;        // état de la salle
  let attache = false;

  const nouvelEtat = () => ({
    code: null, you: null, hostId: null, players: [], names: {}, username: '',
    phase: null, options: { rounds: 5, duration: 90, categories: [0, 1, 2, 3, 4, 5] }, allCategories: [],
    scores: {}, round: 0, totalRounds: 0, letter: '', categories: [], answers: null,
    review: null, fin: 0, dur: 0, stoppedBy: undefined, results: null, ranking: null,
    dirty: false, dernierEnvoi: 0, envoiTimer: 0, chrono: 0, anims: [], busyTimer: 0,
    auto: false, replaced: false, ui: {}, lastSec: -1,
  });

  /* ---------- Utilitaires ---------- */
  const nom = (id) => (id === S.you ? 'toi' : S.names[id] || 'Un joueur');
  const nomAffiche = (id) => S.names[id] || 'Un joueur';
  const inGame = () => EN_PARTIE.includes(S.phase);
  const estHote = () => !!S.you && S.hostId === S.you;
  const connectes = () => S.players.filter((p) => p.connected !== false).length;
  const pad = (s) => String(s).padStart(2, '0');
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const later = (fn, ms) => { const id = setTimeout(fn, ms); S.anims.push(id); return id; };
  const clearAnims = () => { S.anims.forEach(clearTimeout); S.anims = []; };
  const stopChrono = () => { clearInterval(S.chrono); S.chrono = 0; };
  const stopEnvoi = () => { clearTimeout(S.envoiTimer); S.envoiTimer = 0; };
  const clearBusy = () => { clearTimeout(S.busyTimer); S.busyTimer = 0; };

  // Même règle que le serveur (backend/lib/util.js normalizeWord) : accents retirés, article initial retiré.
  function normaliser(v) {
    const s = String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’‘`´]/g, "'").replace(/[-‐-―_]/g, ' ')
      .replace(/\s*'\s*/g, "'").replace(/\s+/g, ' ').trim();
    return s.replace(/^(?:l'|(?:le|la|les|un|une|des) )/, '').trim() || s;
  }
  function evaluer(texte, lettre) {
    const n = normaliser(texte);
    if (!n) return { etat: 'vide', icone: '○', txt: 'À remplir' };
    if (n[0] !== lettre.toLowerCase()) return { etat: 'non', icone: '✗', txt: `Ne commence pas par ${lettre}` };
    return { etat: 'ok', icone: '✓', txt: 'Commence par la bonne lettre' };
  }

  function monter(node, focus = true) {
    node.classList.add('ecran');
    if (focus) granUI.showScreen(vue, node);
    else vue.replaceChildren(node);
  }
  const bouton = (cls, texte, onClick, attrs = {}) => el('button', { class: `key ${cls}`, type: 'button', onclick: onClick, ...attrs }, texte);
  const retourAccueil = () => granRouter.navigate('/');

  function majGarde() { granRouter.setLeaveGuard(S && S.code && inGame() ? garde : null); }
  function garde() {
    return new Promise((resolve) => { dlgResolve = resolve; dlgResultat = false; granUI.openDialog(dlg); });
  }
  function construireDialogue() {
    const fermer = (ok) => { dlgResultat = ok; granUI.closeDialog(dlg); };
    dlg = el('dialog', { class: 'fenetre', 'aria-labelledby': 'pb-garde-titre' },
      el('div', { class: 'fenetre__tete' }, el('h2', { class: 'fenetre__titre', id: 'pb-garde-titre' }, 'Quitter la partie ?')),
      el('div', { class: 'fenetre__corps' },
        el('p', {}, 'Une partie est en cours. Si tu pars maintenant, tu pourras la reprendre pendant 2 minutes.'),
        el('div', { class: 'pb-actions' },
          bouton('key--principal', 'Rester', () => fermer(false)),
          bouton('key--secondaire', 'Quitter', () => fermer(true)))));
    dlg.addEventListener('close', () => { if (dlgResolve) { const r = dlgResolve; dlgResolve = null; r(dlgResultat); } });
  }

  function quitterDefinitivement() {
    granRouter.setLeaveGuard(null);
    if (S.code) socket.emit('pb:leave', { forfeit: true });
    granReprise.clear(P);
    S.code = null;
    retourAccueil();
  }

  /* ---------- Entrée de salle ---------- */
  function allerEntree(code, { message = '', focus = false } = {}) {
    stopChrono(); stopEnvoi(); clearAnims(); clearBusy();
    const ancien = S;
    S = nouvelEtat();
    S.username = ancien ? ancien.username : '';
    granRouter.setLeaveGuard(null);
    statut.hidden = true;
    const holder = el('div');
    vue.replaceChildren(holder);
    entree = granSalle.mount(holder, {
      prefix: P, titre: 'Petit Bac', jeuLabel: 'Petit Bac',
      intro: 'Une lettre, six catégories, un chrono. Le chrono, lui, ne discute pas.',
      onCreate: (u) => { S.username = u; occuper(); socket.emit('pb:create', { username: u }); },
      onJoin: (c, u) => { S.username = u; occuper(); socket.emit('pb:join', { code: c, username: u }); },
      onResume: (e) => { S.username = e.username || S.username; occuper(); socket.emit('pb:resume', { code: e.code, token: e.token }); },
      onForget: () => {},
    });
    if (code) entree.setCode(code);
    if (message) entree.showError('general', message);
    if (focus) entree.focus();
  }
  function occuper() {
    entree.setBusy(true);
    clearBusy();
    S.busyTimer = setTimeout(() => { if (entree) { entree.setBusy(false); entree.showError('general', 'Le serveur ne répond pas. Réessaie dans un instant.'); } }, 10000);
  }

  /* ---------- Salon ---------- */
  function ligneJoueur(p, i) {
    const moi = p.id === S.you;
    const hors = p.connected === false;
    return el('li', { class: `joueur arrive${moi ? ' joueur--moi' : ''}${hors ? ' joueur--absent' : ''}` },
      el('span', { class: `joueur__avatar ${granUI.avatarClass(i)}`, 'aria-hidden': 'true' }, (p.username || '?').slice(0, 1).toUpperCase()),
      el('span', { class: 'joueur__nom' }, p.username),
      p.id === S.hostId ? el('span', { class: 'badge badge--hote' }, 'Hôte') : null,
      moi ? el('span', { class: 'badge badge--moi' }, 'Toi') : null,
      hors ? el('span', { class: 'badge badge--absent' }, 'hors ligne') : null);
  }
  function rafraichirSalon() {
    const u = S.ui;
    if (!u.liste || !u.liste.isConnected) return;
    u.liste.replaceChildren(...S.players.map(ligneJoueur));
    u.compte.textContent = `${S.players.length} joueur${S.players.length > 1 ? 's' : ''}`;
    if (u.start) {
      const ok = connectes() >= 2;
      u.start.disabled = !ok;
      u.aide.textContent = ok ? 'Tout le monde est là ? Lance la partie.' : 'Il faut au moins 2 joueurs connectés pour commencer.';
    }
  }

  function lienSalle() { return `${location.origin}${location.pathname}#/petit-bac/${S.code}`; }
  async function copierLien() {
    const url = lienSalle();
    try { await navigator.clipboard.writeText(url); granUI.toast('Lien copié.', { type: 'succes' }); return; } catch { /* repli ci-dessous */ }
    try {
      const t = el('textarea', { class: 'sr-only', 'aria-hidden': 'true' }); t.value = url;
      document.body.append(t); t.select(); const ok = document.execCommand('copy'); t.remove();
      if (ok) { granUI.toast('Lien copié.', { type: 'succes' }); return; }
    } catch { /* échec silencieux */ }
    granUI.toast(url, { type: 'info', titre: 'Copie impossible :' });
  }

  function envoyerOptions() {
    const u = S.ui;
    const cats = u.cases.filter((c) => c.checked).map((c) => Number(c.value));
    if (cats.length !== NB_CAT) return;
    S.options = { rounds: S.options.rounds, duration: S.options.duration, categories: cats };
    socket.emit('pb:options', { ...S.options });
  }
  function syncOptions() {
    const u = S.ui;
    const o = S.options;
    if (u.cases) {
      u.cases.forEach((c) => { c.checked = o.categories.includes(Number(c.value)); });
      majCases();
    }
    if (u.manches) u.manches.textContent = String(o.rounds);
    if (u.duree) u.duree.textContent = `${o.duration} s`;
    if (u.resume) u.resume.textContent = resumeOptions();
  }
  function resumeOptions() {
    const o = S.options;
    const cats = o.categories.map((i) => S.allCategories[i]).filter(Boolean).join(', ');
    return `${o.rounds} manche${o.rounds > 1 ? 's' : ''} de ${o.duration} s. Catégories : ${cats}.`;
  }
  function majCases() {
    const u = S.ui;
    const n = u.cases.filter((c) => c.checked).length;
    u.cases.forEach((c) => { c.disabled = !c.checked && n >= NB_CAT; });
    u.nbCat.textContent = `${n}/${NB_CAT} choisies`;
    u.nbCat.classList.toggle('pb-ko', n !== NB_CAT);
  }
  function stepper(label, idOut, moins, plus) {
    const out = el('output', { id: idOut, 'aria-live': 'polite' });
    const node = el('div', { class: 'stepper', role: 'group', 'aria-label': label },
      el('button', { type: 'button', 'aria-label': `${label} : moins`, onclick: moins }, '−'),
      out,
      el('button', { type: 'button', 'aria-label': `${label} : plus`, onclick: plus }, '+'));
    return { node, out };
  }

  function blocOptionsHote() {
    const u = S.ui;
    const o = S.options;
    const sm = stepper('Manches', 'pb-o-manches',
      () => { S.options.rounds = Math.max(1, S.options.rounds - 1); syncOptions(); envoyerOptions(); },
      () => { S.options.rounds = Math.min(10, S.options.rounds + 1); syncOptions(); envoyerOptions(); });
    const sd = stepper('Durée', 'pb-o-duree',
      () => { S.options.duration = Math.max(60, S.options.duration - 15); syncOptions(); envoyerOptions(); },
      () => { S.options.duration = Math.min(180, S.options.duration + 15); syncOptions(); envoyerOptions(); });
    u.manches = sm.out; u.duree = sd.out;
    u.nbCat = el('span', { class: 'pb-compteur', role: 'status' });
    u.cases = S.allCategories.map((c, i) => el('input', { type: 'checkbox', value: i, checked: o.categories.includes(i), onchange: () => { majCases(); envoyerOptions(); } }));
    const grille = el('div', { class: 'pb-cases' }, u.cases.map((c, i) => el('label', { class: 'pb-case' }, c, el('span', {}, S.allCategories[i]))));
    const bloc = el('div', { class: 'pb-options panneau sur-papier' },
      el('h2', { class: 'pb-sous-titre' }, 'Les règles de la partie'),
      el('div', { class: 'pb-reglages' },
        el('div', { class: 'field' }, el('span', { class: 'field__label' }, 'Manches'), sm.node),
        el('div', { class: 'field' }, el('span', { class: 'field__label' }, 'Durée d\'une manche'), sd.node)),
      el('fieldset', { class: 'pb-categories' }, el('legend', { class: 'field__label' }, 'Catégories ', u.nbCat), grille));
    return bloc;
  }

  function afficherSalon({ focus = true } = {}) {
    stopChrono(); stopEnvoi(); clearAnims();
    S.ui = {};
    const u = S.ui;
    const hote = estHote();
    u.hote = hote;
    u.liste = el('ul', { class: 'joueurs pb-joueurs', 'aria-label': 'Joueurs dans la salle' });
    u.compte = el('span', { class: 'pb-compteur' });
    u.aide = el('p', { class: 'pb-aide', id: 'pb-start-aide' });
    const codeBloc = el('div', { class: 'pb-code-bloc' },
      el('p', { class: 'pb-code-label' }, 'Code de la salle'),
      el('p', { class: 'pb-code', 'aria-label': `Code de la salle : ${S.code.split('').join(' ')}` }, S.code),
      bouton('key--secondaire key--compact', 'Copier le lien', copierLien));
    const noeuds = [
      el('h1', { class: 'pb-titre' }, 'Petit Bac, le salon'),
      codeBloc,
      el('section', { class: 'pb-carte', 'aria-label': 'Joueurs' }, el('div', { class: 'pb-entete' }, el('h2', { class: 'pb-sous-titre' }, 'Les joueurs'), u.compte), u.liste),
    ];
    if (hote) {
      noeuds.push(blocOptionsHote());
      u.start = bouton('key--principal key--bloc', 'Lancer la partie', () => socket.emit('pb:start', {}), { 'aria-describedby': 'pb-start-aide' });
      noeuds.push(u.start, u.aide);
    } else {
      u.resume = el('p', { class: 'pb-resume' });
      noeuds.push(el('section', { class: 'pb-carte' }, el('h2', { class: 'pb-sous-titre' }, 'Les règles'), u.resume),
        el('p', { class: 'pb-attente', role: 'status' }, 'En attente de l\'hôte…'));
    }
    noeuds.push(bouton('key--fantome pb-sortie', 'Quitter la salle', retourAccueil));
    monter(el('div', { class: 'pb-ecran' }, noeuds), focus);
    syncOptions();
    rafraichirSalon();
  }

  /* ---------- Manche ---------- */
  function valeurs() { return S.ui.inputs ? S.ui.inputs.map((i) => i.value) : []; }
  function envoyerReponses(force) {
    if (!S.ui.inputs) return;
    if (!S.dirty && !force) return;
    stopEnvoi();
    S.dirty = false; S.dernierEnvoi = Date.now();
    socket.emit('pb:answers', { answers: valeurs() });
  }
  function planifierEnvoi() {
    S.dirty = true;
    if (S.envoiTimer) return;
    S.envoiTimer = setTimeout(() => { S.envoiTimer = 0; envoyerReponses(); }, Math.max(0, THROTTLE_MS - (Date.now() - S.dernierEnvoi)));
  }
  function majIndicateurs() {
    const u = S.ui;
    let tous = true;
    u.inputs.forEach((inp, i) => {
      const r = evaluer(inp.value, S.letter);
      if (r.etat !== 'ok') tous = false;
      u.etats[i].dataset.etat = r.etat;
      u.etats[i].replaceChildren(el('span', { 'aria-hidden': 'true' }, `${r.icone} `), r.txt);
    });
    u.stop.disabled = !tous || S.phase !== 'writing';
    u.stopAide.textContent = tous ? 'Les 6 réponses commencent par la lettre : tu peux stopper. L\'hôte vérifiera le fond.' : 'Remplis les 6 catégories avec la bonne lettre pour pouvoir stopper.';
  }

  function peindreChrono(left) {
    const u = S.ui;
    if (!u.segs) return;
    const sec = Math.ceil(left / 1000);
    const on = S.dur ? Math.ceil((left / S.dur) * NB_SEG) : 0;
    u.segs.forEach((s, i) => s.classList.toggle('on', i < on));
    u.temps.textContent = fmt(left);
    const fin = sec > 0 && sec <= 5;
    u.chrono.classList.toggle('pb-chrono--fin', fin);
    if (sec !== S.lastSec) {
      S.lastSec = sec;
      if (fin && !granUI.reducedMotion()) { u.temps.classList.remove('pb-tic'); void u.temps.offsetWidth; u.temps.classList.add('pb-tic'); }
      if (sec === 30 || sec === 10) u.live.textContent = `${sec} secondes`;
    }
  }
  function lancerChrono(remainingMs, durationMs) {
    stopChrono();
    S.fin = Date.now() + remainingMs; S.dur = durationMs || remainingMs; S.lastSec = -1;
    const tick = () => { const left = Math.max(0, S.fin - Date.now()); peindreChrono(left); if (left <= 0) stopChrono(); };
    S.chrono = setInterval(tick, 200);
    tick();
  }

  function banniere(texte) {
    const b = S.ui.banniere;
    if (!b) return;
    b.textContent = texte;
    b.hidden = !texte;
  }
  function verrouiller(by) {
    const u = S.ui;
    if (!u.inputs) return;
    stopChrono();
    u.inputs.forEach((i) => { i.readOnly = true; });
    u.form.classList.add('pb-verrou');
    u.stop.disabled = true;
    banniere(by ? `Stop ! lancé par ${nom(by)}` : 'Temps écoulé');
  }

  function tirerLettre(final, direct) {
    const c = S.ui.lettre;
    c.textContent = final;
    if (direct || granUI.reducedMotion()) return;
    S.ui.boite.classList.add('pb-lettre--roule');
    const t0 = Date.now();
    const roule = () => {
      if (Date.now() - t0 >= 600) {
        c.textContent = final;
        S.ui.boite.classList.remove('pb-lettre--roule');
        S.ui.boite.classList.remove('pb-lettre--tampon'); void S.ui.boite.offsetWidth; S.ui.boite.classList.add('pb-lettre--tampon');
        return;
      }
      c.textContent = ALPHABET[Math.floor(Math.random() * 26)];
      later(roule, 55);
    };
    roule();
  }

  function afficherManche({ resume = false, remainingMs = 0, durationMs = 0, locked = false, by = null } = {}) {
    stopChrono(); stopEnvoi(); clearAnims();
    S.ui = {};
    const u = S.ui;
    const L = S.letter.toUpperCase();
    u.lettre = el('span', { 'aria-hidden': 'true' }, L);
    u.boite = el('div', { class: 'pb-lettre', role: 'img', 'aria-label': `La lettre est ${L}` }, u.lettre);
    u.temps = el('span', { class: 'minuteur__temps' }, '0:00');
    u.segs = Array.from({ length: NB_SEG }, () => el('span'));
    u.live = el('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    u.chrono = el('div', { class: 'minuteur pb-chrono' }, u.temps, el('div', { class: 'minuteur__segments', 'aria-hidden': 'true' }, u.segs), u.live);
    u.banniere = el('p', { class: 'pb-banniere', role: 'status', hidden: true });
    u.inputs = []; u.etats = [];
    const champs = S.categories.map((cat, i) => {
      const id = `pb-rep-${i}`;
      const inp = el('input', {
        class: 'field__input pb-saisie', id, maxlength: 30, autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false',
        'aria-describedby': `${id}-etat`,
      });
      inp.value = (S.answers && S.answers[i]) || '';
      inp.addEventListener('input', () => { majIndicateurs(); planifierEnvoi(); });
      const etat = el('span', { class: 'pb-etat', id: `${id}-etat` });
      u.inputs.push(inp); u.etats.push(etat);
      return el('div', { class: 'pb-champ' }, el('label', { class: 'pb-champ__cat', for: id }, cat), inp, etat);
    });
    u.form = el('form', { class: 'pb-form', novalidate: true, 'aria-label': 'Tes réponses' }, champs);
    u.form.addEventListener('submit', (e) => { e.preventDefault(); if (!u.stop.disabled) lancerStop(); });
    u.stop = bouton('key--principal key--bloc pb-stop', 'Stop !', lancerStop, { disabled: true, 'aria-describedby': 'pb-stop-aide' });
    u.stopAide = el('p', { class: 'pb-aide', id: 'pb-stop-aide' });
    const ecran = el('div', { class: 'pb-ecran' },
      el('h1', { class: 'pb-titre pb-titre--manche' }, `Manche ${S.round} sur ${S.totalRounds}`),
      el('div', { class: 'pb-haut' }, u.boite, u.chrono),
      u.banniere, u.form, u.stop, u.stopAide,
      bouton('key--fantome pb-sortie', 'Quitter définitivement', quitterDefinitivement));
    monter(ecran, true);
    if (locked) { S.dur = durationMs || remainingMs; S.lastSec = -1; peindreChrono(remainingMs); } else lancerChrono(remainingMs, durationMs);
    majIndicateurs();
    if (locked) verrouiller(by);
    tirerLettre(L, resume);
    if (!resume && !locked) {
      if (granUI.reducedMotion()) u.inputs[0].focus({ preventScroll: true });
      else later(() => u.inputs[0] && u.inputs[0].focus({ preventScroll: true }), 650);
    }
  }
  function lancerStop() {
    if (S.phase !== 'writing') return;
    S.dirty = false; S.dernierEnvoi = Date.now(); stopEnvoi();
    socket.emit('pb:stop', { answers: valeurs() });
  }

  /* ---------- Validation par l'hôte ---------- */
  const ptsStatut = (k) => (STATUTS.find((x) => x.k === k) || STATUTS[2]).pts;
  function suggestion(texte, doubl) {
    if (evaluer(texte, S.review.letter).etat !== 'ok') return 'refuse';
    return doubl && doubl.length ? 'partage' : 'unique';
  }
  function sousTotal() { return S.review.sheet.reduce((t, c) => t + ptsStatut(c && c.status), 0); }
  function verdict(cat, status) {
    const r = S.review;
    if (!r || S.phase !== 'review' || S.reviewEnvoye || !estHote()) return;
    socket.emit('pb:verdict', { playerId: r.playerId, cat, status });
  }
  function allerFiche(index) {
    const r = S.review;
    if (!r || S.reviewEnvoye || !estHote() || index < 0 || index >= r.total || index === r.index) return;
    socket.emit('pb:review_goto', { index });
  }
  function validerManche() {
    const r = S.review;
    if (!r || !estHote()) return;
    const u = S.ui.rev;
    const nonVues = r.total - r.decided.length;
    if (nonVues > 0 && !u.confirme) {
      u.confirme = true;
      u.done.textContent = `${nonVues} fiche${nonVues > 1 ? 's' : ''} non vue${nonVues > 1 ? 's' : ''} : confirmer ?`;
      u.annule = later(() => { u.confirme = false; majReview(); }, 5000);
      return;
    }
    clearTimeout(u.annule); u.confirme = false;
    S.reviewEnvoye = true;
    u.done.disabled = true;
    u.lignes.forEach((l) => l.btns.forEach((b) => { b.disabled = true; }));
    u.pastilles.forEach((b) => { if (b.tagName === 'BUTTON') b.disabled = true; });
    socket.emit('pb:review_done', {});
  }
  function majReview() {
    const r = S.review; const u = S.ui.rev;
    if (!r || !u) return;
    const hote = estHote();
    u.titre.textContent = `Fiche ${/^[aeiouyhàâéèêëîïôûü]/i.test(r.username || "") ? "d’" : "de "}${r.username} (${r.index + 1}/${r.total})`;
    u.pastilles.forEach((b, i) => {
      b.dataset.fait = r.decided.includes(i) ? '1' : '0';
      b.setAttribute('aria-label', `Fiche ${i + 1} sur ${r.total}${r.decided.includes(i) ? ', vue' : ', non vue'}`);
      if (i === r.index) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    u.progres.textContent = `${r.decided.length}/${r.total} vues`;
    r.categories.forEach((cat, c) => {
      const cell = r.sheet[c] || { text: '', status: 'refuse' };
      const ligne = u.lignes[c];
      ligne.root.dataset.etat = cell.status;
      const st = STATUTS.find((x) => x.k === cell.status) || STATUTS[2];
      const sug = suggestion(cell.text, r.doublons[c]);
      const vide = !String(cell.text || '').trim(); // une case vide est toujours refusée (règle serveur)
      ligne.btns.forEach((b, i) => {
        const on = STATUTS[i].k === cell.status;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.dataset.suggere = STATUTS[i].k === sug ? '1' : '0';
        if (vide && STATUTS[i].k !== 'refuse') b.disabled = true;
      });
      ligne.statut.dataset.etat = cell.status;
      ligne.statut.textContent = `${st.label} ${st.pts ? `+${st.pts}` : '0'}`;
      const d = (r.doublons[c] || []).map(nomAffiche);
      ligne.doub.textContent = d.length ? `Même réponse que ${d.join(', ')}` : '';
      ligne.doub.hidden = !d.length;
    });
    const t = sousTotal();
    u.sous.textContent = `Sous-total de la fiche : ${t} point${t > 1 ? 's' : ''}`;
    if (hote) {
      const derniere = r.index >= r.total - 1;
      u.prev.disabled = r.index <= 0;
      u.next.hidden = derniere;
      u.done.className = `key ${derniere ? 'key--principal' : 'key--secondaire'} key--bloc`;
      u.done.textContent = 'Valider la manche';
    }
  }
  function afficherReview({ focus = true, dir = 1 } = {}) {
    const r = S.review;
    if (!r) return;
    stopChrono(); stopEnvoi(); clearAnims();
    const hote = estHote();
    const refocus = !focus && vue.contains(document.activeElement) ? document.activeElement.dataset.rf : null;
    S.ui = {};
    S.reviewEnvoye = false;
    const u = (S.ui.rev = { cle: `${r.playerId}|${hote}`, confirme: false, annule: 0 });
    u.titre = el('h1', { class: 'pb-titre pb-titre--manche' });
    u.progres = el('span', { class: 'pb-compteur' });
    u.pastilles = Array.from({ length: r.total }, (_, i) => (hote
      ? el('button', { type: 'button', class: 'pb-pastille', 'data-rf': `p${i}`, onclick: () => allerFiche(i) })
      : el('span', { class: 'pb-pastille' })));
    u.lignes = r.categories.map((cat, c) => {
      const cell = r.sheet[c] || { text: '' };
      const txt = String(cell.text || '').trim();
      const btns = hote ? STATUTS.map((st, i) => el('button', {
        type: 'button', class: 'pb-seg', 'data-k': st.k, 'data-rf': `v${c}${i}`, 'aria-pressed': 'false',
        'aria-label': `${cat} : ${st.label}, ${st.pts} point${st.pts > 1 ? 's' : ''}`, onclick: () => verdict(c, st.k),
      }, el('span', {}, st.label), el('small', {}, st.pts ? `+${st.pts}` : '0'))) : [];
      const statut = el('span', { class: 'pb-tampon-statut', role: hote ? null : 'status' });
      const doub = el('p', { class: 'pb-doub', hidden: true });
      const root = el('li', { class: 'pb-rev-ligne' },
        el('span', { class: 'pb-rev-cat' }, cat),
        el('span', { class: txt ? 'pb-rev-rep' : 'pb-rev-rep pb-rev-rep--vide' }, txt || '—'),
        doub,
        hote ? el('div', { class: 'pb-segs', role: 'group', 'aria-label': `Verdict pour ${cat}` }, btns) : null,
        statut);
      return { root, btns, statut, doub };
    });
    u.sous = el('p', { class: 'pb-sous-total', role: 'status' });
    const carte = el('ol', { class: 'pb-rev-liste' }, u.lignes.map((l) => l.root));
    const glisse = el('div', { class: 'pb-rev-carte' }, carte);
    glisse.style.setProperty('--dir', String(dir));
    u.carte = glisse;
    let actions;
    if (hote) {
      u.prev = bouton('key--secondaire', '← Fiche précédente', () => allerFiche(S.review.index - 1), { 'data-rf': 'prev' });
      u.next = bouton('key--principal', 'Fiche suivante →', () => allerFiche(S.review.index + 1), { 'data-rf': 'next' });
      u.done = bouton('key--secondaire key--bloc', 'Valider la manche', validerManche, { 'data-rf': 'done' });
      actions = el('div', { class: 'pb-rev-nav' }, el('div', { class: 'pb-actions' }, u.prev, u.next), u.done);
    } else {
      actions = el('p', { class: 'pb-attente', role: 'status' }, `${nomAffiche(S.hostId)} valide les réponses…`);
    }
    monter(el('div', { class: 'pb-ecran pb-ecran--rev' },
      u.titre,
      el('div', { class: 'pb-rev-haut' },
        el('div', { class: 'pb-lettre pb-lettre--petite', role: 'img', 'aria-label': `Lettre ${String(r.letter).toUpperCase()}` }, el('span', { 'aria-hidden': 'true' }, String(r.letter).toUpperCase())),
        el('div', { class: 'pb-pastilles', role: hote ? 'group' : null, 'aria-label': 'Fiches' }, u.pastilles, u.progres)),
      glisse, u.sous, actions,
      bouton('key--fantome pb-sortie', 'Quitter définitivement', quitterDefinitivement)), focus);
    majReview();
    if (refocus) { const n = vue.querySelector(`[data-rf="${refocus}"]`); if (n && !n.disabled && !n.hidden) n.focus({ preventScroll: true }); }
  }
  function surReview(d) {
    const avant = S.review;
    S.phase = 'review';
    S.review = d; S.letter = d.letter; S.categories = d.categories;
    const u = S.ui.rev;
    const memeEcran = u && u.cle === `${d.playerId}|${estHote()}` && u.pastilles.length === d.total;
    if (memeEcran) { majReview(); majGarde(); return; }
    const dir = avant && d.index < avant.index ? -1 : 1;
    afficherReview({ focus: !u, dir });
    majGarde();
  }

  /* ---------- Résultats ---------- */
  function etatCellule(c) {
    if (!c || !String(c.text || '').trim()) return { k: 'vide', label: 'Vide' };
    const st = STATUTS.find((x) => x.k === c.status);
    if (st) return { k: st.k, label: st.label };
    if (!c.valid) return { k: 'refuse', label: 'Refusé' };
    return c.points >= 10 ? { k: 'unique', label: 'Unique' } : { k: 'partage', label: 'Partagé' };
  }
  function afficherResultats(res, { focus = true } = {}) {
    stopChrono(); stopEnvoi(); clearAnims();
    S.ui = {};
    const ids = Object.keys(res.table);
    const tete = el('tr', {}, el('th', { scope: 'col', class: 'pb-th-cat' }, 'Catégorie'),
      ids.map((id) => el('th', { scope: 'col', class: id === S.you ? 'pb-moi' : null }, nomAffiche(id), id === S.you ? el('span', { class: 'badge badge--moi' }, 'Toi') : null)));
    const lignes = res.categories.map((cat, i) => el('tr', {},
      el('th', { scope: 'row', class: 'pb-th-cat' }, cat),
      ids.map((id) => {
        const c = res.table[id][i];
        const e = etatCellule(c);
        return el('td', { class: 'pb-cell', 'data-etat': e.k },
          el('span', { class: 'pb-mot' }, (c && c.text) || '—'),
          el('span', { class: 'pb-cell__etat' }, e.label),
          el('span', { class: 'pb-cell__pts' }, c && c.points ? `+${c.points}` : ''));
      })));
    const gagnes = ids.map((id) => el('td', { class: 'pb-total' }, el('b', {}, '+0')));
    const totaux = ids.map((id) => el('td', { class: 'pb-total' }, String(S.scores[id] ?? 0)));
    const pied = [
      el('tr', {}, el('th', { scope: 'row', class: 'pb-th-cat' }, 'Points gagnés'), gagnes),
      el('tr', { class: 'pb-ligne-total' }, el('th', { scope: 'row', class: 'pb-th-cat' }, 'Total'), totaux),
    ];
    const table = el('table', { class: 'pb-table' },
      el('caption', { class: 'sr-only' }, `Résultats de la manche, lettre ${String(res.letter).toUpperCase()}`),
      el('thead', {}, tete), el('tbody', {}, lignes), el('tfoot', {}, pied));
    const actions = estHote()
      ? bouton('key--principal key--bloc', res.isLastRound ? 'Voir le classement' : 'Manche suivante', () => socket.emit('pb:next', {}))
      : el('p', { class: 'pb-attente', role: 'status' }, 'En attente de l\'hôte…');
    monter(el('div', { class: 'pb-ecran pb-ecran--large' },
      el('h1', { class: 'pb-titre pb-titre--manche' }, `Résultats, lettre ${String(res.letter).toUpperCase()}`),
      el('div', { class: 'pb-table-wrap', tabindex: 0, role: 'region', 'aria-label': 'Tableau des résultats, défilable' }, table),
      actions,
      bouton('key--fantome pb-sortie', 'Quitter définitivement', quitterDefinitivement)), focus);
    gagnes.forEach((td, i) => granUI.countUp(td.firstChild, res.gained[ids[i]] || 0, { format: (n) => `+${n}` }));
  }

  /* ---------- Fin de partie ---------- */
  function afficherFin(ranking, { focus = true } = {}) {
    stopChrono(); stopEnvoi(); clearAnims();
    S.ui = {};
    const top = ranking.slice(0, 3);
    const reste = ranking.slice(3);
    const ordreArrivee = [2, 1, 0]; // 3e, 2e, puis 1er
    const marches = top.map((r, i) => {
      const pts = el('span', { class: 'pb-podium__pts' }, '0');
      const m = el('li', { class: `pb-marche pb-marche--${i + 1}`, style: `--i:${ordreArrivee.indexOf(i)}` },
        el('span', { class: 'pb-podium__rang' }, i === 0 ? '1er' : `${i + 1}e`),
        el('span', { class: 'pb-podium__nom' }, r.username), pts, el('span', { class: 'sr-only' }, ' points'));
      later(() => granUI.countUp(pts, r.score, { duration: 800 }), granUI.reducedMotion() ? 0 : 300 + ordreArrivee.indexOf(i) * 350);
      return m;
    });
    const liste = reste.length
      ? el('ol', { class: 'classement pb-classement', start: 4 }, reste.map((r, i) => el('li', {},
        el('span', { class: 'classement__rang' }, String(i + 4)), el('span', {}, r.username), el('span', { class: 'classement__points' }, String(r.score)))))
      : null;
    S.ui.start = estHote() ? bouton('key--principal key--bloc', 'Rejouer', () => socket.emit('pb:start', {}), { 'aria-describedby': 'pb-start-aide' }) : null;
    S.ui.aide = el('p', { class: 'pb-aide', id: 'pb-start-aide' });
    S.ui.liste = null;
    monter(el('div', { class: 'pb-ecran' },
      el('h1', { class: 'pb-titre' }, 'Le classement'),
      el('ol', { class: 'pb-podium', 'aria-label': 'Podium' }, marches),
      liste,
      S.ui.start || el('p', { class: 'pb-attente', role: 'status' }, 'En attente de l\'hôte pour rejouer…'),
      S.ui.start ? S.ui.aide : null,
      bouton('key--secondaire key--bloc', 'Retour à l\'accueil', retourAccueil)), focus);
    majRejouer();
  }
  function majRejouer() {
    const u = S.ui;
    if (!u || !u.start || S.phase !== 'over') return;
    const ok = connectes() >= 2;
    u.start.disabled = !ok;
    u.aide.textContent = ok ? '' : 'Il faut au moins 2 joueurs connectés pour rejouer.';
  }

  /* ---------- Écran « reprise ailleurs » ---------- */
  function afficherRemplace() {
    stopChrono(); stopEnvoi(); clearAnims();
    S.code = null; S.replaced = true; S.ui = {};
    granRouter.setLeaveGuard(null);
    monter(el('div', { class: 'pb-ecran' },
      el('h1', { class: 'pb-titre' }, 'Partie reprise dans un autre onglet'),
      el('p', { class: 'pb-resume' }, 'Ta place dans la salle est maintenant occupée par un autre onglet. Tu peux fermer celui-ci.'),
      bouton('key--principal key--bloc', 'Retour à l\'accueil', retourAccueil)));
  }

  /* ---------- État complet (jointure, reprise) ---------- */
  function appliquerEtat(st) {
    S.phase = st.phase;
    if (st.options) S.options = st.options;
    if (st.allCategories) S.allCategories = st.allCategories;
    S.scores = st.scores || {};
    S.round = st.round || 0; S.totalRounds = st.totalRounds || 0;
    if (st.phase !== 'lobby') { S.letter = st.letter || ''; S.categories = st.categories || []; S.answers = st.myAnswers || null; }
    switch (st.phase) {
      case 'writing':
        S.stoppedBy = st.stoppedBy;
        afficherManche({ resume: true, remainingMs: st.remainingMs || 0, durationMs: st.durationMs || 0 });
        break;
      case 'collecting':
        S.stoppedBy = st.stoppedBy;
        afficherManche({ resume: true, remainingMs: st.remainingMs || 0, durationMs: st.durationMs || 0, locked: true, by: st.stoppedBy || null });
        break;
      case 'review': S.review = st.review; if (st.review) { S.letter = st.review.letter; S.categories = st.review.categories; afficherReview(); } else afficherManche({ resume: true, locked: true }); break;
      case 'results': S.results = st.results; afficherResultats(st.results); break;
      case 'over': S.ranking = st.ranking; afficherFin(st.ranking || []); break;
      default: afficherSalon();
    }
    majGarde();
  }
  function setJoueurs(players) {
    S.players = Array.isArray(players) ? players : [];
    S.players.forEach((p) => { S.names[p.id] = p.username; });
  }

  /* ---------- Écouteurs socket ---------- */
  const surSocket = {
    'pb:joined': (d) => {
      clearBusy();
      S.code = d.code; S.you = d.you; S.hostId = d.hostId; S.replaced = false;
      setJoueurs(d.players);
      const moi = S.players.find((p) => p.id === d.you);
      if (moi) S.username = moi.username;
      granReprise.save(P, { code: d.code, pid: d.you, token: d.token, username: S.username });
      statut.hidden = true;
      if (d.resumed && S.auto) granUI.toast(`Tu es de retour dans la salle ${d.code}`, { type: 'succes' });
      S.auto = false;
      appliquerEtat(d.state || { phase: 'lobby' });
    },
    'pb:room': (d) => {
      if (!S.code) return;
      const hoteAvant = S.hostId;
      S.hostId = d.hostId; setJoueurs(d.players);
      if (S.phase === 'lobby') {
        if (hoteAvant !== S.hostId && (hoteAvant === S.you || S.hostId === S.you)) afficherSalon({ focus: false });
        else rafraichirSalon();
      } else if (S.phase === 'review') {
        if (hoteAvant !== S.hostId) afficherReview({ focus: false });
        else if (S.ui.rev) majReview();
      } else if (S.phase === 'over') {
        if (hoteAvant !== S.hostId && (hoteAvant === S.you || S.hostId === S.you)) afficherFin(S.ranking || [], { focus: false });
        else majRejouer();
      }
    },
    'pb:options': (o) => { if (!S.code || !o) return; S.options = o; if (S.ui.cases || S.ui.resume) syncOptions(); },
    'pb:round_start': (d) => {
      if (!S.code) return;
      S.phase = 'writing'; S.round = d.round; S.totalRounds = d.totalRounds; S.letter = d.letter; S.categories = d.categories;
      S.answers = null; S.review = null; S.dirty = false; S.dernierEnvoi = 0; S.stoppedBy = undefined;
      afficherManche({ remainingMs: d.durationMs, durationMs: d.durationMs });
      majGarde();
    },
    'pb:stopped': (d) => {
      if (!S.code || !S.ui.inputs) return;
      S.phase = 'collecting'; S.stoppedBy = d.by;
      envoyerReponses(true);
      verrouiller(d.by);
    },
    'pb:review': (d) => { if (S.code && d) surReview(d); },
    'pb:results': (res) => {
      if (!S.code) return;
      S.phase = 'results'; S.review = null; S.results = res; S.scores = res.scores || {};
      afficherResultats(res);
      majGarde();
    },
    'pb:game_over': (d) => {
      if (!S.code) return;
      S.phase = 'over'; S.ranking = d.ranking || [];
      majGarde();
      afficherFin(S.ranking);
    },
    'pb:replaced': () => { if (S.code) afficherRemplace(); },
    'pb:error': (e) => {
      const code = e && e.code;
      const msg = (e && e.message) || MSG_ERR[code] || 'Une erreur est survenue.';
      if (code === 'bad_phase' && (S.phase !== 'review' || S.reviewEnvoye)) return;
      clearBusy();
      if (code === 'resume_failed') {
        granReprise.clear(P);
        allerEntree(null, { message: msg, focus: true });
        return;
      }
      if (!S.code) {
        if (!entree) return;
        entree.setBusy(false);
        entree.showError(code === 'room_not_found' || code === 'bad_code' ? 'code' : 'general', msg);
        entree.refreshResume();
        return;
      }
      granUI.toast(msg, { type: 'erreur' });
    },
    connect: () => {
      statut.hidden = true;
      if (!S.code || S.replaced) return;
      const e = granReprise.get(P);
      if (e) { S.auto = true; socket.emit('pb:resume', { code: e.code, token: e.token }); }
    },
    disconnect: () => {
      if (S.code && inGame()) { granReprise.touch(P, GRACE_MS); }
      if (S.code) { statut.textContent = 'Connexion perdue. Reconnexion en cours…'; statut.hidden = false; }
    },
  };
  const surPagehide = () => { if (S && S.code && inGame()) granReprise.touch(P, GRACE_MS); };

  function attacher() {
    if (attache) return;
    attache = true;
    Object.entries(surSocket).forEach(([ev, fn]) => socket.on(ev, fn));
    window.addEventListener('pagehide', surPagehide);
  }
  function detacher() {
    if (!attache) return;
    attache = false;
    Object.entries(surSocket).forEach(([ev, fn]) => socket.off(ev, fn));
    window.removeEventListener('pagehide', surPagehide);
  }

  /* ---------- Routeur ---------- */
  granRouter.register('petit-bac', {
    enter(params) {
      const point = document.querySelector('[data-vue="petit-bac"] [data-montage]');
      if (!point) return;
      racine = point;
      S = nouvelEtat();
      statut = el('p', { class: 'pb-statut', role: 'status', hidden: true });
      vue = el('div', { class: 'pb-vue' });
      construireDialogue();
      racine.replaceChildren(statut, vue, dlg);
      attacher();
      allerEntree(params && params.code ? params.code : null);
    },
    leave() {
      detacher();
      if (!S) return;
      stopChrono(); stopEnvoi(); clearAnims(); clearBusy();
      if (S.code && !S.replaced) {
        socket.emit('pb:leave', {});
        if (inGame()) granReprise.touch(P, GRACE_MS); else granReprise.clear(P);
      }
      if (dlg && dlg.open) dlg.close();
      if (dlgResolve) { const r = dlgResolve; dlgResolve = null; r(false); }
      granRouter.setLeaveGuard(null);
      S = nouvelEtat();
      entree = null;
    },
  });
})();
