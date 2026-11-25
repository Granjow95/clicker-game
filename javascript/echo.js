// Écho : jeu solo de mémoire. 4 pavés (couleur + forme + son) ; le jeu joue une séquence, le joueur la rejoue.
// Aucun réseau. Markup injecté au premier enter() ; record par mode dans le localStorage.
(() => {
  const CLE_RECORD = 'granGames:echo-record';
  const CLE_MUET = 'granGames:echo-muet';
  const DUREE_CHRONO = 60; // secondes
  const MODES = { classique: 'Classique', chrono: 'Chrono' };
  // Disposition en croix : 1 haut, 2 droite, 3 bas, 4 gauche (les flèches suivent la position).
  const PADS = [
    { n: 1, couleur: 'bleu', forme: 'cercle', cls: 'echo-pad--1', freq: 261.63, touche: 'ArrowUp' },
    { n: 2, couleur: 'vert', forme: 'carré', cls: 'echo-pad--2', freq: 329.63, touche: 'ArrowRight' },
    { n: 3, couleur: 'jaune', forme: 'triangle', cls: 'echo-pad--3', freq: 392, touche: 'ArrowDown' },
    { n: 4, couleur: 'rouge', forme: 'losange', cls: 'echo-pad--4', freq: 523.25, touche: 'ArrowLeft' },
  ];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const FORMES = {
    cercle: ['circle', { cx: 20, cy: 20, r: 14 }],
    'carré': ['rect', { x: 7, y: 7, width: 26, height: 26 }],
    triangle: ['polygon', { points: '20,6 35,33 5,33' }],
    losange: ['polygon', { points: '20,4 36,20 20,36 4,20' }],
  };

  let racine = null;
  let monte = false;
  let mode = 'classique';
  let muet = false;
  let enCours = false; // une partie est active
  let phase = 'inactif'; // 'ecoute' | 'toi' | 'inactif'
  let seq = [];
  let pos = 0;
  let score = 0; // niveaux réussis (classique) ou séquences réussies (chrono)
  let fin = 0; // échéance du chrono (ms)
  let session = 0; // change à chaque sortie / nouvelle partie : invalide les lectures en vol
  let minuteurs = [];
  let tick = null;
  let ctx = null;
  const sons = new Set();
  const refs = {};

  /* ---------- Stockage ---------- */
  const lireRecords = () => {
    try {
      const o = JSON.parse(localStorage.getItem(CLE_RECORD));
      const r = {};
      for (const m of Object.keys(MODES)) r[m] = Number.isFinite(o?.[m]) ? Math.min(Math.max(0, Math.floor(o[m])), 999) : 0;
      return r;
    } catch { return { classique: 0, chrono: 0 }; }
  };
  const ecrireRecord = (m, v) => {
    try { localStorage.setItem(CLE_RECORD, JSON.stringify({ ...lireRecords(), [m]: v })); } catch { /* stockage indisponible */ }
  };
  const lireMuet = () => { try { return localStorage.getItem(CLE_MUET) === '1'; } catch { return false; } };
  const ecrireMuet = (v) => { try { localStorage.setItem(CLE_MUET, v ? '1' : '0'); } catch { /* stockage indisponible */ } };

  /* ---------- Minuteurs liés à la session ---------- */
  function apres(ms, fn) {
    const mienne = session;
    const id = setTimeout(() => {
      minuteurs = minuteurs.filter((t) => t !== id);
      if (mienne === session) fn();
    }, ms);
    minuteurs.push(id);
  }
  function toutStopper() {
    session += 1;
    minuteurs.forEach(clearTimeout);
    minuteurs = [];
    clearInterval(tick);
    tick = null;
    sons.forEach((o) => { try { o.stop(); } catch { /* déjà arrêté */ } });
    sons.clear();
    phase = 'inactif';
    enCours = false;
    if (refs.pads) refs.pads.forEach((p) => p.classList.remove('allume', 'pop'));
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }

  /* ---------- Son (WebAudio) ---------- */
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function note(freq, duree, { type = 'sine', vol = 0.22 } = {}) {
    if (muet) return;
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012); // attaque courte : pas de clic
    gain.gain.setValueAtTime(vol, t0 + Math.max(0.02, duree - 0.06));
    gain.gain.linearRampToValueAtTime(0.0001, t0 + duree); // relâche courte
    osc.connect(gain).connect(c.destination);
    sons.add(osc);
    osc.onended = () => { sons.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(t0);
    osc.stop(t0 + duree + 0.02);
  }
  const sonPad = (i, duree = 0.32) => note(PADS[i].freq, duree, { type: 'triangle' });
  const sonErreur = () => note(110, 0.5, { type: 'sawtooth', vol: 0.16 });
  const sonSucces = () => { note(523.25, 0.12, { type: 'sine', vol: 0.14 }); apres(110, () => note(659.25, 0.18, { type: 'sine', vol: 0.14 })); };

  /* ---------- Interface ---------- */
  function forme(nom) {
    const [tag, attrs] = FORMES[nom];
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.setAttribute('class', 'echo-pad__forme');
    svg.setAttribute('aria-hidden', 'true');
    const f = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) f.setAttribute(k, String(v));
    svg.append(f);
    return svg;
  }

  function construire() {
    const { el } = granUI;
    const boutonMode = (m) => el('button', { type: 'button', class: 'echo-mode', 'data-mode': m, 'aria-pressed': m === mode ? 'true' : 'false', onclick: () => choisirMode(m) },
      el('span', { class: 'echo-mode__nom' }, MODES[m]),
      el('span', { class: 'echo-mode__aide' }, m === 'classique' ? 'La séquence s’allonge à chaque niveau.' : `${DUREE_CHRONO} s : enchaîne un maximum de séquences.`));
    const boutonSon = el('button', { type: 'button', class: 'key key--fantome key--compact echo-son', 'aria-pressed': 'false', onclick: () => basculerSon() });
    refs.son = boutonSon;
    refs.recordDepart = el('b', {}, '0');
    refs.modeNom = el('span', {}, '');
    refs.niveau = el('b', {}, '0');
    refs.niveauLib = el('span', {}, 'Niveau');
    refs.record = el('b', {}, '0');
    refs.temps = el('span', { class: 'echo-hud__temps', hidden: true }, '');
    refs.indic = el('p', { class: 'echo-indic', 'aria-hidden': 'true' }, '');
    refs.live = el('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' }, '');
    refs.pads = PADS.map((p, i) => el('button', {
      type: 'button',
      class: `echo-pad ${p.cls}`,
      'aria-label': `Pavé ${p.n}, ${p.couleur}, ${p.forme}`,
      onpointerdown: (e) => { if (e.button === 0 || e.pointerType !== 'mouse') { e.preventDefault(); jouerPad(i); } },
      onclick: (e) => { if (e.detail === 0) jouerPad(i); }, // Entrée / Espace sur un pavé focalisé
    }, forme(p.forme), el('span', { class: 'echo-pad__num', 'aria-hidden': 'true' }, String(p.n))));
    refs.finTitre = el('h1', { class: 'echo-titre echo-titre--fin' }, 'Fin de partie');
    refs.finScore = el('b', { class: 'echo-fin__score' }, '0');
    refs.finLib = el('span', {}, '');
    refs.finRecord = el('span', {}, '');
    refs.tampon = el('p', { class: 'echo-tampon', hidden: true }, 'Nouveau record');

    const depart = el('div', { 'data-ecran': 'depart', class: 'echo-ecran echo-depart' },
      el('h1', { class: 'echo-titre' }, 'Écoute. Retiens. Rejoue.'),
      el('p', { class: 'echo-lead' }, 'Quatre pavés, quatre sons. Reproduis la séquence, de plus en plus vite.'),
      el('p', { class: 'echo-record' }, 'Record du mode : ', refs.recordDepart),
      el('div', { class: 'echo-modes', role: 'group', 'aria-label': 'Mode de jeu' }, boutonMode('classique'), boutonMode('chrono')),
      el('div', { class: 'echo-actions' },
        el('button', { type: 'button', class: 'key key--principal key--bloc', onclick: lancer }, 'Jouer'),
        boutonSon),
      el('p', { class: 'echo-aide' }, 'Clavier : 1 à 4 ou les flèches (haut, droite, bas, gauche).'));
    const jeu = el('div', { 'data-ecran': 'jeu', class: 'echo-ecran echo-jeu', hidden: true },
      el('h2', { class: 'sr-only' }, 'Partie en cours'),
      el('p', { class: 'echo-hud' },
        el('span', {}, refs.modeNom), el('span', {}, refs.niveauLib, ' ', refs.niveau),
        el('span', {}, 'Record ', refs.record), refs.temps),
      el('div', { class: 'echo-plateau' }, ...refs.pads, refs.indic),
      refs.live,
      el('button', { type: 'button', class: 'key key--fantome key--compact echo-abandon', onclick: () => { toutStopper(); montrer('depart'); majDepart(); } }, 'Abandonner'));
    const finEcran = el('div', { 'data-ecran': 'fin', class: 'echo-ecran echo-fin', hidden: true },
      refs.finTitre,
      el('p', { class: 'echo-fin__bloc' }, refs.finLib, refs.finScore),
      refs.tampon,
      el('p', { class: 'echo-record' }, refs.finRecord),
      el('div', { class: 'echo-actions' },
        el('button', { type: 'button', class: 'key key--principal', onclick: lancer }, 'Rejouer'),
        el('button', { type: 'button', class: 'key key--fantome', onclick: () => { montrer('depart'); majDepart(); } }, 'Changer de mode')));
    racine.replaceChildren(el('div', { class: 'echo' }, depart, jeu, finEcran));
  }

  function montrer(nom) {
    racine.querySelectorAll('[data-ecran]').forEach((s) => {
      const actif = s.dataset.ecran === nom;
      s.hidden = !actif;
      if (actif) { s.classList.remove('ecran'); void s.offsetWidth; s.classList.add('ecran'); }
    });
    const h = racine.querySelector(`[data-ecran="${nom}"] h1, [data-ecran="${nom}"] h2`);
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function majDepart() {
    refs.recordDepart.textContent = String(lireRecords()[mode]);
    racine.querySelectorAll('.echo-mode').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false'));
    majBoutonSon();
  }
  function choisirMode(m) { mode = m; majDepart(); }
  function majBoutonSon() {
    refs.son.textContent = muet ? 'Son : coupé' : 'Son : activé';
    refs.son.setAttribute('aria-pressed', muet ? 'true' : 'false');
    refs.son.setAttribute('aria-label', muet ? 'Son coupé. Activer le son' : 'Son activé. Couper le son');
  }
  function basculerSon() {
    muet = !muet;
    ecrireMuet(muet);
    majBoutonSon();
    if (!muet) sonPad(0, 0.2); // premier geste : crée l'AudioContext
  }

  function annoncer(court, long) {
    refs.indic.textContent = court;
    refs.live.textContent = long || court;
  }
  const majScore = () => { refs.niveau.textContent = String(score); };

  /* ---------- Déroulement ---------- */
  const pas = () => {
    const n = mode === 'chrono' ? score : seq.length - 1;
    return Math.max(260, 640 - 28 * n); // vitesse croissante, bornée
  };
  const alea = () => Math.floor(Math.random() * 4);

  function allumer(i, ms) {
    const p = refs.pads[i];
    p.classList.add('allume');
    sonPad(i, Math.max(0.16, ms / 1000));
    apres(ms, () => p.classList.remove('allume'));
  }

  function lancer() {
    toutStopper();
    audio(); // geste utilisateur : crée / réveille l'AudioContext
    enCours = true;
    score = 0;
    seq = [alea()];
    pos = 0;
    refs.modeNom.textContent = MODES[mode];
    refs.record.textContent = String(lireRecords()[mode]);
    refs.temps.hidden = mode !== 'chrono';
    refs.niveauLib.textContent = mode === 'chrono' ? 'Réussies' : 'Niveau';
    majScore();
    annoncer('', '');
    montrer('jeu');
    apres(600, () => {
      if (mode === 'chrono') demarrerChrono();
      lire();
    });
  }

  function demarrerChrono() {
    fin = Date.now() + DUREE_CHRONO * 1000;
    const maj = () => {
      const reste = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
      refs.temps.textContent = `${reste} s`;
      if (reste <= 0) terminer(false);
    };
    maj();
    tick = setInterval(maj, 200);
  }

  function lire() {
    phase = 'ecoute';
    pos = 0;
    annoncer('Écoute…', `${mode === 'chrono' ? `${score} réussie${score > 1 ? 's' : ''}` : `Niveau ${seq.length}`}. Écoute.`);
    const p = pas();
    seq.forEach((pad, k) => apres(k * p, () => allumer(pad, Math.round(p * 0.62))));
    apres(seq.length * p + 80, () => {
      phase = 'toi';
      annoncer('À toi', 'À toi.');
    });
  }

  function jouerPad(i) {
    if (phase !== 'toi') return; // pendant la lecture (ou hors partie) : ignoré
    const p = refs.pads[i];
    if (i !== seq[pos]) { erreur(i); return; }
    p.classList.add('allume');
    sonPad(i);
    apres(170, () => p.classList.remove('allume'));
    pos += 1;
    if (pos === seq.length) reussite();
  }

  function reussite() {
    phase = 'inactif';
    score += 1;
    majScore();
    const rec = lireRecords()[mode];
    if (score > rec) refs.record.textContent = String(score);
    refs.niveau.classList.remove('pop');
    if (!granUI.reducedMotion()) { void refs.niveau.offsetWidth; refs.niveau.classList.add('pop'); }
    refs.pads.forEach((p) => { p.classList.remove('pop'); if (!granUI.reducedMotion()) { void p.offsetWidth; p.classList.add('pop'); } });
    annoncer('Bien !', mode === 'chrono' ? `${score} réussie${score > 1 ? 's' : ''}.` : `Niveau ${score} réussi.`);
    apres(170, () => sonSucces());
    apres(750, () => {
      seq = mode === 'chrono' ? [alea()] : [...seq, alea()];
      lire();
    });
  }

  function erreur(i) {
    phase = 'inactif';
    clearInterval(tick);
    tick = null;
    const p = refs.pads[i];
    p.classList.add('faux');
    sonErreur();
    granUI.shake(racine.querySelector('.echo-plateau'));
    annoncer('Raté', 'Raté.');
    apres(900, () => { p.classList.remove('faux'); terminer(true); });
  }

  function terminer(parErreur) {
    if (!enCours) return; // déjà terminé
    toutStopper();
    const mienne = session;
    const rec = lireRecords()[mode];
    const battu = score > rec;
    if (battu) ecrireRecord(mode, score);
    const meilleur = Math.max(score, rec);
    refs.finTitre.textContent = parErreur ? 'Raté' : 'Temps écoulé';
    refs.finLib.textContent = mode === 'chrono' ? 'Séquences réussies ' : 'Niveaux réussis ';
    refs.finRecord.replaceChildren('Record ', granUI.el('b', {}, String(meilleur)), ` (${MODES[mode]})`);
    refs.tampon.hidden = !battu;
    refs.tampon.classList.remove('echo-tampon--anime');
    if (battu) { void refs.tampon.offsetWidth; refs.tampon.classList.add('echo-tampon--anime'); }
    montrer('fin');
    granUI.countUp(refs.finScore, score, { duration: 500 }).then(() => { if (mienne === session) refs.finScore.textContent = String(score); });
  }

  /* ---------- Clavier ---------- */
  function onKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const jeu = racine && racine.querySelector('[data-ecran="jeu"]');
    if (!jeu || jeu.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
    let i = -1;
    if (e.key >= '1' && e.key <= '4') i = Number(e.key) - 1;
    else i = PADS.findIndex((p) => p.touche === e.key);
    if (i < 0) return;
    e.preventDefault();
    jouerPad(i);
  }

  granRouter.register('echo', {
    enter() {
      racine = document.querySelector('[data-vue="echo"] [data-montage]');
      if (!racine) return;
      if (!monte) { monte = true; muet = lireMuet(); construire(); }
      document.addEventListener('keydown', onKey);
      toutStopper();
      majDepart();
      montrer('depart');
    },
    leave() {
      document.removeEventListener('keydown', onKey);
      toutStopper();
    },
  });
})();
