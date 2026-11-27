// ======= javascript/karaoke.js =======

/* ── État global ── */
const kk = {
  mode: null,         // 'solo' | 'multi'
  roomId: null,       // code de salle (4 lettres) une fois confirmé par kk:joined
  you: null,          // id joueur dans la salle (fourni par le serveur)
  hostId: null,
  username: null,
  isHost: false,
  started: false,     // « en partie » côté serveur (chanson lancée)
  auto: false,        // reprise automatique en cours (pour le toast « de retour »)
  replaced: false,    // place reprise dans un autre onglet
  forfeit: false,     // sortie par « Abandonner »
  entree: null,       // retour de granSalle.mount
  busyTimer: null,
  song: null,         // { title, artist, lyrics, syncedLyrics? }
  lines: [],          // string[] — paroles ligne par ligne
  lrcLines: null,     // [{time, text}] ou null si pas de LRC
  currentLine: 0,
  players: [],
  autoPlay: false,
  autoTimer: null,
  gapTimer: null,     // intervalle de mise à jour du compte à rebours (intro / pause instru)
  playClock0: null,   // performance.now() correspondant à l'instant 0 de la chanson
  fromSelect: null,   // 'karaoke-mode' | 'karaoke-room'
  // ── Audio (vidéo YouTube en fond, synchro pilotée par la position de lecture) ──
  audioMode: 'none',  // 'none' | 'full' | 'instrumental'
  ytPlayer: null,
  audioActive: false, // true quand le moteur audio pilote la lecture
  syncRAF: null,
  audioCandidates: [], // IDs vidéo à essayer (certains refusent l'intégration)
  audioIdx: 0,
  audioWatchdog: null,
  audioDeadline: null, // délai max avant bascule sans musique
  ytReady: false,
  endTimer: null,     // écran de fin différé (solo, dernière ligne atteinte à la main)
  pickSeq: 0,         // jeton du dernier choix de chanson (réponses tardives ignorées)
  picking: false,     // salle : choix envoyé, en attente de kk:song_selected
  pickTimer: null,
  // ── Salle : horloge de lecture partagée (ADR 0005) ──
  room: null,         // { mode, lines: [{ t, text }], videoIds, endMs, clock, ended }
  lastSeq: -1,        // dernier numéro d'horloge appliqué
  offset: 0,          // heure serveur - heure locale (ms)
  offsetRtt: Infinity,
  offsetAt: 0,
  roomTimer: null,    // boucle de synchro (paroles + lecteur)
  timeTimer: null,    // nouvelle mesure du décalage toutes les 30 s
  playerGen: 0,       // jeton du lecteur courant
  drift: 0,           // mesures consécutives au-delà du seuil de dérive
  lastSeekAt: 0,
  playAskedAt: 0,     // lecture demandée au lecteur (détection de l'autoplay bloqué)
  preloadAt: 0,       // préchargement muet tenté pendant l'attente (une fois par horloge)
  preloading: false,  // son coupé le temps du préchargement
};

// Adresse du backend : voir javascript/config.js
const KK_BACKEND = GRAN_BACKEND;

/* ───────────────────────────────────────────────
   NAVIGATION — afficher / cacher les sections
─────────────────────────────────────────────── */
// « Artiste - Titre — Artiste » : retire l'artiste répété en tête du titre (données de chansons hétérogènes).
function kkSongLabel(song) {
  const artist = String(song.artist || '').trim();
  let title = String(song.title || '').trim();
  if (artist) {
    const low = title.toLowerCase();
    const pre = artist.toLowerCase();
    if (low.startsWith(pre)) {
      const rest = title.slice(artist.length).replace(/^\s*[-–—:]\s*/, '');
      if (rest) title = rest;
    }
  }
  return artist ? `${title} — ${artist}` : title;
}

function kkShow(id) {
  const sections = ['karaoke-mode', 'karaoke-room', 'karaoke-select', 'karaoke-game'];
  sections.forEach(n => {
    const el = document.getElementById(n);
    if (el) el.style.display = (n === id) ? (n === 'karaoke-game' ? 'flex' : 'block') : 'none';
  });
  granUI.focusScreen(document.getElementById(id)); // le focus suit l'écran interne
}

function kkHideAll() {
  ['karaoke-mode', 'karaoke-room', 'karaoke-select', 'karaoke-game'].forEach(n => {
    const el = document.getElementById(n);
    if (el) el.style.display = 'none';
  });
}

/* ───────────────────────────────────────────────
   ENTRÉE — appelé depuis app.js (routeur)
─────────────────────────────────────────────── */
// Entrée : granRouter.register('karaoke') dans app.js affiche karaoke-mode

/* ───────────────────────────────────────────────
   MODE SELECTION
─────────────────────────────────────────────── */
window.karaokeStartSolo = function () {
  kk.mode = 'solo';
  kk.isHost = true;
  kk.fromSelect = 'karaoke-mode';
  kkShowSelect();
};

window.karaokeShowRoom = function () {
  kkShowEntree(null, { focus: true });
};

// Retour à l'accueil : le routeur appelle leave() (voir app.js) qui libère salle, audio et lecteur.
window.karaokeBackToMenu = function () {
  granRouter.navigate('/');
};

window.karaokeBackToMode = function () {
  kkQuitRoom();
  kk.mode = null;
  kkShow('karaoke-mode');
  granAuth.flushReconnect();
};

/* ───────────────────────────────────────────────
   ROOM MULTIJOUEUR (protocole kk:*)
─────────────────────────────────────────────── */
const KK_P = 'kk';            // préfixe de reprise (granReprise)
const KK_GRACE_MS = 120000;   // retour possible 2 min après une sortie en chanson
const kkEl = (...a) => granUI.el(...a);

const kkInGame = () => kk.mode === 'multi' && !!kk.roomId && kk.started && !kk.replaced && !(kk.room && kk.room.ended);
const kkDisplayed = (id) => { const e = document.getElementById(id); return !!e && e.style.display !== 'none'; };

function kkClearBusy() { clearTimeout(kk.busyTimer); kk.busyTimer = null; }
function kkOccuper() {
  if (!kk.entree) return;
  kk.entree.setBusy(true);
  kkClearBusy();
  kk.busyTimer = setTimeout(() => {
    if (kk.entree) { kk.entree.setBusy(false); kk.entree.showError('general', 'Le serveur ne répond pas. Réessaie dans un instant.'); }
  }, 10000);
}

// Remet à zéro l'état de salle (sans rien émettre) : minuteurs, audio, garde de sortie.
function kkResetRoom() {
  kkClearBusy();
  clearTimeout(kk.autoTimer);
  clearTimeout(kk.endTimer);
  kk.autoPlay = false;
  kkHideGap();
  kkDestroyAudio();
  const overlay = document.getElementById('kk-end-overlay');
  if (overlay) overlay.style.display = 'none';
  granRouter.setLeaveGuard(null);
  kk.roomId = null; kk.you = null; kk.hostId = null; kk.isHost = false; kk.started = false;
  kk.players = []; kk.song = null; kk.lines = []; kk.lrcLines = null; kk.currentLine = 0;
  kk.audioMode = 'none';
  kk.room = null; kk.lastSeq = -1;
  kk.picking = false; clearTimeout(kk.pickTimer);
}

// Informe le serveur de notre départ et met à jour l'entrée de reprise.
function kkSendLeave(forfeit) {
  if (kk.replaced) return;
  // Création/jointure envoyée mais pas encore confirmée : on prévient le serveur pour ne pas laisser de joueur fantôme.
  if (!kk.roomId) { if (kk.busyTimer) socket.emit('kk:leave', { forfeit: true }); return; }
  if (forfeit) {
    socket.emit('kk:leave', { forfeit: true });
    granReprise.clear(KK_P);
  } else {
    socket.emit('kk:leave', {});
    if (kkInGame()) granReprise.touch(KK_P, KK_GRACE_MS); else granReprise.clear(KK_P); // chanson terminée : plus de reprise
  }
}

// Quitte la salle courante (si on y est) et retombe sur l'état « aucune salle ».
function kkQuitRoom() {
  if (kk.mode === 'multi') {
    kkSendLeave(kk.forfeit);
    kk.forfeit = false;
    kk.entree = null;
    kkResetRoom();
  }
}

function kkShowEntree(code, { message = '', focus = false } = {}) {
  kkResetRoom();
  kk.mode = 'multi';
  kk.replaced = false;
  const holder = document.getElementById('kk-entree');
  const lobby = document.getElementById('kk-lobby');
  if (lobby) lobby.style.display = 'none';
  if (holder) holder.style.display = 'block';
  kk.entree = granSalle.mount(holder, {
    prefix: KK_P, titre: 'Karaoké', jeuLabel: 'Karaoké',
    intro: "Un code, des amis, la même chanson sur tous les écrans. L'hôte choisit la musique et mène la danse.",
    onCreate: (u) => { kk.username = u; kkOccuper(); socket.emit('kk:create', { username: u }); },
    onJoin: (c, u) => { kk.username = u; kkOccuper(); socket.emit('kk:join', { code: c, username: u }); },
    onResume: (e) => { kk.username = e.username || kk.username; kkOccuper(); socket.emit('kk:resume', { code: e.code, token: e.token }); },
    onForget: () => {},
  });
  if (code) kk.entree.setCode(code);
  if (message) kk.entree.showError('general', message);
  kkShow('karaoke-room');
  if (focus) kk.entree.focus();
}

// Affiche le salon (code, joueurs, chanson) à la place de l'écran d'entrée.
function kkShowLobby() {
  const holder = document.getElementById('kk-entree');
  const lobby = document.getElementById('kk-lobby');
  if (holder) holder.style.display = 'none';
  if (lobby) lobby.style.display = 'block';
  const codeEl = document.getElementById('kk-room-code-text');
  if (codeEl) codeEl.textContent = kk.roomId || '';
  kkRenderLobby();
  kkShow('karaoke-room');
}

function kkLienSalle() { return `${location.origin}${location.pathname}#/karaoke/${kk.roomId}`; }
window.kk_copyLink = async function () {
  if (!kk.roomId) return;
  const url = kkLienSalle();
  try { await navigator.clipboard.writeText(url); granUI.toast('Lien copié.', { type: 'succes' }); return; } catch { /* repli ci-dessous */ }
  try {
    const t = kkEl('textarea', { class: 'sr-only', 'aria-hidden': 'true' }); t.value = url;
    document.body.append(t); t.select(); const ok = document.execCommand('copy'); t.remove();
    if (ok) { granUI.toast('Lien copié.', { type: 'succes' }); return; }
  } catch { /* échec silencieux */ }
  granUI.toast(url, { type: 'info', titre: 'Copie impossible :' });
};

window.karaokeGoSelectSong = function () {
  kk.fromSelect = 'karaoke-room';
  kkShowSelect();
};

window.karaokeMultiStart = function () {
  if (!kk.song || !kk.isHost) return;
  socket.emit('kk:start', {});
};

function kkBadge(text, cls) {
  const b = document.createElement('span');
  b.className = 'badge ' + cls;
  b.textContent = text;
  return b;
}

function kkModeLabel() {
  return kk.room && kk.room.mode === 'instrumental' ? 'Instrumentale' : 'Musique complète';
}

function kkHostName() {
  const h = (kk.players || []).find(p => p.id === kk.hostId);
  return h ? h.username : "l'hôte";
}

function kkRenderLobby() {
  const { players, song } = kk;
  const list = document.getElementById('kk-players-list');
  if (list) {
    list.replaceChildren();
    (players || []).forEach((p, i) => {
      const hors = p.connected === false;
      const li = document.createElement('li');
      li.className = 'joueur' + (p.id === kk.you ? ' joueur--moi' : '') + (hors ? ' joueur--absent' : '');
      const av = document.createElement('span');
      av.className = 'joueur__avatar ' + granUI.avatarClass(i);
      av.setAttribute('aria-hidden', 'true');
      av.textContent = (p.username || '?').charAt(0).toUpperCase();
      const nom = document.createElement('span');
      nom.className = 'joueur__nom';
      nom.textContent = p.username;
      li.append(av, nom);
      if (p.id === kk.hostId) li.append(kkBadge('Hôte', 'badge--hote'));
      if (p.id === kk.you) li.append(kkBadge('Toi', 'badge--moi'));
      if (hors) li.append(kkBadge('hors ligne', 'badge--absent'));
      list.appendChild(li);
    });
  }
  const count = document.getElementById('kk-players-title');
  if (count) count.textContent = `Dans la salle (${(players || []).length})`;

  const hostPanel = document.getElementById('kk-host-panel');
  const guestPanel = document.getElementById('kk-guest-panel');
  if (hostPanel) hostPanel.style.display = kk.isHost ? 'flex' : 'none'; // masqué par défaut en CSS
  if (guestPanel) guestPanel.style.display = kk.isHost ? 'none' : 'block';

  const hostDisp = document.getElementById('kk-selected-song-display');
  const startBtn = document.getElementById('kk-start-btn');
  const guestDisp = document.getElementById('kk-guest-song-display');
  if (song) {
    const songLabel = `${kkSongLabel(song)} · ${kkModeLabel()}`;
    if (hostDisp) { hostDisp.textContent = songLabel; hostDisp.style.display = 'block'; }
    if (startBtn && kk.isHost) startBtn.style.display = 'inline-flex';
    if (guestDisp) guestDisp.textContent = songLabel + '. En attente du démarrage…';
  } else {
    if (hostDisp) hostDisp.style.display = 'none';
    if (startBtn) startBtn.style.display = 'none';
    if (guestDisp) guestDisp.textContent = `En attente que ${kkHostName()} choisisse une musique…`;
  }
}

/* ── Garde de sortie (en chanson) ── */
let kkDlgResolve = null;
let kkDlgResultat = false;
function kkGarde() {
  const dlg = document.getElementById('kk-garde');
  if (!dlg) return Promise.resolve(true);
  return new Promise((resolve) => { kkDlgResolve = resolve; kkDlgResultat = false; granUI.openDialog(dlg); });
}
window.kk_gardeChoix = function (choix) { // 'rester' | 'quitter' | 'abandonner'
  kkDlgResultat = choix !== 'rester';
  kk.forfeit = choix === 'abandonner';
  const dlg = document.getElementById('kk-garde');
  if (dlg) granUI.closeDialog(dlg);
};
function kkMajGarde() { granRouter.setLeaveGuard(kkInGame() ? kkGarde : null); }

// Retour au salon (fin de chanson décidée par l'hôte, ou nouvelle chanson choisie).
function kkBackToLobby() {
  kk.started = false;
  kk.currentLine = 0;
  if (kk.room) { kk.room.clock = null; kk.room.ended = false; }
  clearTimeout(kk.autoTimer);
  clearTimeout(kk.endTimer);
  kk.autoPlay = false;
  kkHideGap();
  kkDestroyAudio();
  const overlay = document.getElementById('kk-end-overlay');
  if (overlay) overlay.style.display = 'none';
  kkMajGarde();
  kkShowLobby();
}

// Place reprise dans un autre onglet : plus rien à faire ici.
function kkShowReplaced() {
  clearTimeout(kk.autoTimer);
  clearTimeout(kk.endTimer);
  kkHideGap();
  kkDestroyAudio();
  kkClearBusy();
  kk.roomId = null; kk.started = false; kk.replaced = true; kk.players = []; kk.entree = null;
  granRouter.setLeaveGuard(null);
  const holder = document.getElementById('kk-entree');
  const lobby = document.getElementById('kk-lobby');
  if (lobby) lobby.style.display = 'none';
  if (holder) {
    holder.style.display = 'block';
    holder.replaceChildren(kkEl('section', { class: 'entree-salle ecran' },
      kkEl('h1', { class: 'entree-salle__titre' }, 'Partie reprise dans un autre onglet'),
      kkEl('p', { class: 'entree-salle__intro' }, 'Ta place dans la salle est maintenant occupée par un autre onglet. Tu peux fermer celui-ci.'),
      kkEl('button', { class: 'key key--principal key--bloc', type: 'button', onclick: () => granRouter.navigate('/') }, "Retour à l'accueil")));
  }
  kkShow('karaoke-room');
}

/* ───────────────────────────────────────────────
   SÉLECTION DE MUSIQUE
─────────────────────────────────────────────── */
let _kkSongs = [];
let _kkGen = 0;
let _kkLoading = false;
let _kkDebounce = null;
let _kkSelectWired = false;

function kkShowSelect() {
  kkShow('karaoke-select');
  if (!_kkSelectWired) {
    _kkSelectWired = true;
    const input = document.getElementById('kk-search');
    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(_kkDebounce);
        const q = input.value.trim();
        if (!q) { _kkDebounce = setTimeout(kkLoadTop, 200); }
        else if (q.length >= 2) { _kkDebounce = setTimeout(() => kkSearch(q), 400); }
      });
    }
  }
  document.getElementById('kk-search').value = '';
  kkLoadTop();
}

window.karaokeBackFromSelect = function () {
  kkShow(kk.fromSelect || 'karaoke-mode');
};

async function kkLoadTop() {
  const gen = ++_kkGen;
  _kkSongs = [];
  _kkLoading = true;
  kkSetBanner('Chargement des tendances…');
  kkRenderGrid();
  const songs = await topSongsWithCache();
  if (gen !== _kkGen) return;
  await kkLoadWithLyrics(songs, gen);
}

async function kkSearch(q) {
  const gen = ++_kkGen;
  _kkSongs = [];
  _kkLoading = true;
  kkSetBanner('Recherche en cours…');
  kkRenderGrid();
  const songs = await searchWithCache(q);
  if (gen !== _kkGen) return;
  await kkLoadWithLyrics(songs, gen);
}

async function kkLoadWithLyrics(songs, gen) {
  // En salle, la musique et les paroles sont calées sur les horaires LRC : les chansons sans horaires sont masquées.
  if (kk.mode === 'multi') songs = songs.filter(s => s._syncedLyrics);
  _kkSongs = [];
  const total = songs.length;
  kkSetBanner(`Vérification des paroles… 0 / ${total}`);
  kkRenderGrid();

  let _renderTimer = null;
  function queueRender() {
    if (_renderTimer) return;
    _renderTimer = setTimeout(() => { _renderTimer = null; kkRenderGrid(); }, 60);
  }

  await Promise.all(songs.map(async song => {
    let lyrics = null;
    if (song._lyrics) {
      lyrics = song._lyrics;
      _cacheStoreLyrics(song.artist, song.title, lyrics);
    } else if (song._confirmedOvh) {
      lyrics = await _tryLyricsOvh(song.artist, song.title);
      if (!lyrics) lyrics = await _tryLrclibDirect(song.artist, song.title);
      _cacheStoreLyrics(song.artist, song.title, lyrics);
    } else {
      lyrics = await getLyricsWithCache(song.artist, song.title);
    }
    if (gen !== _kkGen) return;
    if (lyrics) {
      _kkSongs.push({ ...song, _lyrics: lyrics });
      queueRender();
    }
  }));

  if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }
  if (gen !== _kkGen) return;
  _kkLoading = false;
  kkSetBanner(null);
  if (_kkSongs.length === 0) kkSetBanner(kk.mode === 'multi' ? 'Aucune chanson aux paroles synchronisées. Essaie un autre terme.' : 'Aucune chanson disponible. Essaie un autre terme.');
  kkRenderGrid();
}

function kkSetBanner(msg) {
  let b = document.getElementById('kk-banner');
  const grid = document.getElementById('kk-songs-grid');
  if (!grid) return;
  if (msg) {
    if (!b) { b = document.createElement('p'); b.id = 'kk-banner'; b.className = 'kk-banner'; b.setAttribute('role', 'status'); grid.parentNode.insertBefore(b, grid); }
    b.textContent = msg;
  } else if (b) { b.remove(); }
}

function kkRenderGrid() {
  const grid = document.getElementById('kk-songs-grid');
  if (!grid) return;
  grid.replaceChildren();

  if (_kkSongs.length === 0) {
    const div = document.createElement('div');
    div.className = 'kk-empty';
    div.textContent = _kkLoading ? 'Chargement…' : 'Aucune chanson disponible.';
    grid.appendChild(div);
    return;
  }

  _kkSongs.forEach(song => {
    const card = document.createElement('button');
    card.className = 'kar-chanson';
    card.type = 'button';

    if (song.cover) {
      const img = document.createElement('img');
      if (/^https:\/\//i.test(song.cover)) { img.referrerPolicy = 'no-referrer'; img.src = song.cover; }
      img.alt = '';
      img.className = 'kar-chanson__pochette';
      img.onerror = () => img.remove();
      card.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'kar-chanson__pochette kar-chanson__pochette--vide';
      ph.setAttribute('aria-hidden', 'true');
      const vin = document.createElement('span');
      vin.className = 'kar-vinyle';
      ph.appendChild(vin);
      const col = granUI.pochetteColors(song.title || '');
      Object.entries(col).forEach(([k, v]) => ph.style.setProperty(k, v));
      card.appendChild(ph);
    }

    const info = document.createElement('div');
    info.className = 'kar-chanson__texte';
    const t = document.createElement('div');
    t.className = 'kar-chanson__titre';
    t.textContent = song.title;
    const s = document.createElement('div');
    s.className = 'kar-chanson__artiste';
    s.textContent = [song.artist, song.year].filter(Boolean).join(' · ');
    info.appendChild(t);
    info.appendChild(s);
    card.appendChild(info);

    card.disabled = kk.picking;
    card.onclick = () => kkPickSong(song);
    grid.appendChild(card);
  });
}

async function kkPickSong(song) {
  if (kk.picking) return;
  const seq = ++kk.pickSeq;
  const encore = () => seq === kk.pickSeq && kkDisplayed('karaoke-select');

  if (kk.mode === 'multi') {
    // En salle : rien n'est affiché avant la confirmation du serveur (qui peut refuser ou passer l'hôte à un autre).
    if (!kk.isHost || !kk.roomId || !song._syncedLyrics) return;
    const choice = await kkAskAudioChoice(song, { salle: true });
    if (!choice || !encore() || !kk.roomId || !kk.isHost) return;
    kk.picking = true;
    kkSetBanner(`Préparation de « ${song.title} »…`);
    kkRenderGrid();
    clearTimeout(kk.pickTimer);
    kk.pickTimer = setTimeout(() => {
      if (!kk.picking) return;
      kkPickDone();
      granUI.toast('Le serveur ne répond pas. Réessaie dans un instant.', { type: 'erreur' });
    }, 12000);
    socket.emit('kk:select_song', {
      mode: choice,
      song: {
        title: song.title,
        artist: song.artist,
        cover: song.cover || '',
        syncedLyrics: song._syncedLyrics,
        duration: Number.isFinite(song.duration) ? song.duration : undefined,
        year: Number.isFinite(song.year) ? song.year : undefined,
      },
    });
    return;
  }

  // _syncedLyrics est déjà inclus dans la réponse de recherche lrclib → disponible immédiatement.
  // Sinon (résultats Deezer / lyrics.ovh : paroles brutes uniquement), on tente de récupérer
  // le vrai timing LRC propre à la musique pour que la lecture auto soit bien synchronisée.
  let synced = song._syncedLyrics || null;
  if (!synced && typeof getSyncedLyrics === 'function') {
    kkSetBanner(`Synchronisation de « ${song.title} »…`);
    try { synced = await getSyncedLyrics(song.artist, song.title); } catch {}
    if (seq === kk.pickSeq) kkSetBanner(null);
  }
  if (!encore()) return; // autre chanson choisie entre-temps, ou écran quitté

  const selected = {
    title:         song.title,
    artist:        song.artist,
    cover:         song.cover || '',
    lyrics:        song._lyrics,
    syncedLyrics:  synced,
    duration:      song.duration || null,
  };

  kk.song = selected;
  // Choix audio : musique complète / instrumentale / sans musique
  const choice = await kkAskAudioChoice(selected);
  if (!choice || !encore()) return; // tiroir fermé : on reste sur le choix de la chanson
  kk.audioMode = choice;
  kkLaunchGame(selected);
}

// Fin d'un choix de chanson en salle (confirmé, refusé ou sans réponse).
function kkPickDone() {
  kk.picking = false;
  clearTimeout(kk.pickTimer);
  kkSetBanner(null);
  if (kkDisplayed('karaoke-select')) kkRenderGrid();
}

/* ───────────────────────────────────────────────
   CHOIX AUDIO — modale affichée à la sélection (solo)
─────────────────────────────────────────────── */
function kkAskAudioChoice(song, { salle = false } = {}) {
  return new Promise(resolve => {
    const dlg = document.getElementById('kk-audio-modal');
    if (!dlg) { resolve(salle ? 'full' : 'none'); return; }
    if (dlg.open) { resolve(null); return; }
    const sans = dlg.querySelector('input[name="kk-audio"][value="none"]');
    if (sans && sans.closest('label')) sans.closest('label').hidden = salle; // en salle : classique ou instrumental
    document.getElementById('kk-audio-song').textContent = song.title;
    document.getElementById('kk-audio-artist').textContent = song.artist;
    dlg.querySelector('input[name="kk-audio"][value="full"]').checked = true;
    const go = document.getElementById('kk-audio-go');
    let choice = null; // reste null si la fenêtre est fermée sans choisir (Échap, voile, quitter)
    const onGo = () => {
      const r = dlg.querySelector('input[name="kk-audio"]:checked');
      choice = r ? r.value : 'full';
      granUI.closeDialog(dlg);
    };
    go.addEventListener('click', onGo);
    dlg.addEventListener('close', () => { go.removeEventListener('click', onGo); resolve(choice); }, { once: true });
    granUI.openDialog(dlg);
  });
}

/* ───────────────────────────────────────────────
   JEU — DISPLAY
─────────────────────────────────────────────── */
function parsePlain(text) {
  return (text || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

function parseLRC(lrc) {
  const raw = [];
  // [ \t]* au lieu de \s* : évite d'absorber le \n et de capturer le timestamp de la ligne suivante
  const re = /\[(\d+):(\d+(?:\.\d+)?)\][ \t]*(.*)/gm;
  let m;
  while ((m = re.exec(lrc)) !== null) {
    const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
    // Nettoyer les timestamps résiduels ([mm:ss] ou <mm:ss>) dans le texte
    const text = m[3]
      .replace(/\[\d+:\d+(?:\.\d+)?\]/g, '')
      .replace(/<\d+:\d+(?:\.\d+)?>/g, '')
      .trim();
    if (text) raw.push({ time, text });
  }
  if (!raw.length) return null;

  // Fusionner les lignes consécutives < 1s (syllabes isolées, doublons)
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const next = raw[i + 1];
    if (next && (next.time - raw[i].time) < 1.0) {
      raw[i + 1] = { time: raw[i].time, text: raw[i].text + ' ' + next.text };
    } else {
      out.push(raw[i]);
    }
  }
  return out.length ? out : null;
}

// Affiche les contrôles (hôte/solo) ou le message spectateur.
function kkApplyHostControls() {
  const multi = kk.mode === 'multi';
  const isSoloOrHost = !multi || kk.isHost;
  const ctrlEl = document.getElementById('kk-controls');
  const specMsg = document.getElementById('kk-spectator-msg');
  if (ctrlEl) ctrlEl.style.display = isSoloOrHost ? 'flex' : 'none';
  if (specMsg) {
    specMsg.textContent = `${kkHostName()} contrôle la lecture`;
    specMsg.style.display = isSoloOrHost ? 'none' : 'block';
  }
  const endActions = document.getElementById('kk-end-actions');
  if (endActions) endActions.style.display = isSoloOrHost ? '' : 'none'; // en salle, seul l'hôte relance ou change de chanson
  if (multi) {
    // Bouton central de l'hôte : pause / lecture de l'horloge partagée
    const playBtn = document.getElementById('kk-play-btn');
    if (playBtn) {
      const enCours = !!(kk.room && kk.room.clock && kk.room.clock.playing);
      playBtn.style.display = kk.isHost ? 'inline-flex' : 'none';
      playBtn.disabled = !!(kk.room && kk.room.ended);
      kkSetPlayLabel(playBtn, enCours ? 'Pause' : 'Lecture', enCours);
    }
  }
}

function kkLaunchGame(song, startLine) {
  kk.song = song;
  // Quand le LRC est disponible, utiliser ses lignes pour l'affichage ET le timing
  // → kk.lines et kk.lrcLines ont toujours le même nombre d'éléments au même index
  if (song.syncedLyrics) {
    kk.lrcLines = parseLRC(song.syncedLyrics);
    kk.lines    = kk.lrcLines ? kk.lrcLines.map(l => l.text) : parsePlain(song.lyrics);
  } else {
    kk.lines    = parsePlain(song.lyrics);
    kk.lrcLines = null;
  }
  kk.currentLine = Math.max(0, Math.min(Number(startLine) || 0, Math.max(0, kk.lines.length - 1)));
  kk.autoPlay = false;
  kk.playClock0 = null;
  clearTimeout(kk.autoTimer);
  kkHideGap();
  kkDestroyAudio();

  kkShow('karaoke-game');

  // Topbar
  const titleBar = document.getElementById('kk-song-title-bar');
  if (titleBar) titleBar.textContent = kkSongLabel(song);

  kkApplyHostControls();

  // Bouton auto seulement en solo
  const playBtn = document.getElementById('kk-play-btn');
  if (playBtn) {
    playBtn.style.display = kk.mode === 'solo' ? 'inline-flex' : 'none';
    playBtn.disabled = false;
    kkSetPlayLabel(playBtn, 'Auto', false);
  }

  // Barre joueurs (multi)
  kkUpdatePlayersBar();

  // Cacher le overlay de fin
  const overlay = document.getElementById('kk-end-overlay');
  if (overlay) overlay.style.display = 'none';

  kkRenderLyrics();

  // Démarrer l'audio si demandé (la synchro sera pilotée par la position de lecture)
  const avecSon = kk.mode === 'solo' && (kk.audioMode === 'full' || kk.audioMode === 'instrumental');
  kkShowSound(avecSon);
  kkSetNoAudio(false);
  if (avecSon) kkStartAudio(song, kk.audioMode);
}

function kkRenderLyrics() {
  const { lines, currentLine } = kk;
  const total = lines.length;

  const animEl = (id, text, addAnim) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (addAnim) {
      el.classList.remove('kk-lyric-curr');
      void el.offsetWidth;
      el.classList.add('kk-lyric-curr');
    }
    el.textContent = text;
  };

  animEl('kk-line-prev', lines[currentLine - 1] || '', false);
  animEl('kk-line-curr', lines[currentLine] || '', true);
  animEl('kk-line-next', lines[currentLine + 1] || '', false);

  const counter = document.getElementById('kk-line-counter');
  if (counter) counter.textContent = total ? `Ligne ${currentLine + 1}/${total}` : '';

  const prevBtn = document.getElementById('kk-prev-btn');
  const nextBtn = document.getElementById('kk-next-btn');
  if (kk.mode === 'multi') {
    // En salle, la ligne affichée vient de l'horloge : -1 pendant l'intro (« précédente » ramène au début).
    kkRenderLyricsButtons();
    if (counter && kk.room && kk.room.clock && !kk.room.clock.playing && !kk.room.ended) counter.textContent = `En pause · ${counter.textContent}`;
    return; // l'écran de fin n'apparaît que sur kk:ended
  }
  if (prevBtn) prevBtn.disabled = (currentLine === 0);
  if (nextBtn) nextBtn.disabled = (currentLine >= total - 1);

  // Vérifier fin de chanson (en mode audio, c'est l'événement « fin de vidéo » qui décide)
  clearTimeout(kk.endTimer);
  if (currentLine >= total - 1 && total > 0) {
    kk.endTimer = setTimeout(() => {
      const overlay = document.getElementById('kk-end-overlay');
      if (overlay && !kk.autoPlay && !kk.audioActive && kk.currentLine >= kk.lines.length - 1) overlay.style.display = 'flex';
    }, 800);
  }
}

// Libellé + état du bouton Auto (aria-pressed porte l'état ; l'icône est dessinée en CSS)
function kkSetPlayLabel(btn, label, pressed) {
  if (!btn) return;
  btn.textContent = label;
  btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
}

function kkSetLine(idx) {
  kk.currentLine = Math.max(0, Math.min(idx, kk.lines.length - 1));
  kkRenderLyrics();
}

function kkUpdatePlayersBar() {
  const bar = document.getElementById('kk-players-bar');
  if (!bar) return;
  bar.replaceChildren();
  bar.hidden = kk.mode !== 'multi' || kk.players.length === 0;
  if (bar.hidden) return;
  kk.players.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'public__joueur' + (p.id === kk.hostId ? ' public__joueur--hote' : '') + (p.connected === false ? ' public__joueur--absent' : '');
    const av = document.createElement('span');
    av.className = 'public__avatar ' + granUI.avatarClass(i);
    av.setAttribute('aria-hidden', 'true');
    av.textContent = (p.username || '?').charAt(0).toUpperCase();
    const nom = document.createElement('span');
    nom.textContent = (p.id === kk.hostId ? `${p.username} (hôte, au micro)` : p.username) + (p.connected === false ? ' (hors ligne)' : '');
    li.append(av, nom);
    bar.appendChild(li);
  });
}

/* ───────────────────────────────────────────────
   CONTRÔLES DE JEU
─────────────────────────────────────────────── */
window.karaokeAdvance = function (direction) {
  if (kk.mode === 'multi') {
    // L'hôte demande au serveur de déplacer l'horloge (donc la musique) ; bornes vérifiées ici et côté serveur.
    if (!kk.isHost || !kk.room || !kk.room.clock || kk.room.ended) return;
    const idx = kkRoomLine();
    if (direction === 'next' && idx >= kk.room.lines.length - 1) return;
    if (direction === 'prev' && idx < 0) return;
    socket.emit('kk:advance', { direction: direction === 'prev' ? 'prev' : 'next', from: idx }); // ligne vue par l'hôte
    return;
  }
  clearTimeout(kk.autoTimer);
  if (kk.mode === 'solo') {
    const next = direction === 'next' ? kk.currentLine + 1 : kk.currentLine - 1;
    // En mode audio : on déplace la lecture audio sur la ligne visée → tout reste synchronisé
    if (kk.audioActive && kk.ytPlayer && kk.lrcLines) {
      const tgt = Math.max(0, Math.min(next, kk.lrcLines.length - 1));
      try { kk.ytPlayer.seekTo(Math.max(0, kk.lrcLines[tgt].time), true); } catch {}
      kkSetLine(tgt);
      return;
    }
    kkSetLine(next);
    // En lecture auto, on re-cale l'horloge sur la ligne choisie puis on reprogramme la suite
    if (kk.autoPlay) kkReanchor();
  }
};

window.karaokeToggleAutoPlay = function () {
  if (kk.mode === 'multi') { // hôte : pause / reprise pour toute la salle
    if (!kk.isHost || !kk.room || !kk.room.clock || kk.room.ended) return;
    socket.emit(kk.room.clock.playing ? 'kk:pause' : 'kk:play', {});
    return;
  }
  const overlay = document.getElementById('kk-end-overlay');

  // Mode audio : le bouton met en lecture / pause le son
  if (kk.audioActive && kk.ytPlayer) {
    let st = -1;
    try { st = kk.ytPlayer.getPlayerState(); } catch {}
    if (st === 1 /* PLAYING */) { try { kk.ytPlayer.pauseVideo(); } catch {} }
    else {
      if (overlay) overlay.style.display = 'none';
      try { kk.ytPlayer.playVideo(); } catch {}
    }
    return;
  }

  if (kk.autoPlay) { kkPauseAuto(); return; }
  if (overlay) overlay.style.display = 'none';
  // Si on était en fin de chanson, on repart du début
  if (kk.currentLine >= kk.lines.length - 1) kkSetLine(0);
  kkPlayAuto();
};

/* ── Moteur de lecture automatique ──
   La synchronisation suit la VRAIE timeline LRC de chaque musique via une horloge
   absolue (playClock0). On respecte ainsi l'intro et les pauses instrumentales,
   différentes pour chaque chanson — au lieu d'un rythme générique par défaut. */
function kkPlayAuto() {
  kk.autoPlay = true;
  const btn = document.getElementById('kk-play-btn');
  kkSetPlayLabel(btn, 'Pause', true);

  if (kk.lrcLines && kk.currentLine === 0) {
    // Départ au début : instant 0 = maintenant → l'intro de la chanson est respectée
    kk.playClock0 = performance.now();
    kkScheduleLine(0);
  } else {
    kkReanchor();
  }
}

function kkPauseAuto() {
  kk.autoPlay = false;
  clearTimeout(kk.autoTimer);
  kkHideGap();
  const btn = document.getElementById('kk-play-btn');
  kkSetPlayLabel(btn, 'Auto', false);
}

// Recale l'horloge pour que la ligne courante corresponde à « maintenant », puis programme la suite
function kkReanchor() {
  if (kk.lrcLines) {
    const t = kk.lrcLines[kk.currentLine]?.time || 0;
    kk.playClock0 = performance.now() - t * 1000;
  }
  kkHideGap();
  kkScheduleLine(kk.currentLine + 1);
}

// Programme l'affichage de la ligne `idx` à son horodatage réel (ou à une estimation sans LRC)
function kkScheduleLine(idx) {
  clearTimeout(kk.autoTimer);
  kkHideGap();
  if (!kk.autoPlay) return;

  // Fin de chanson : on laisse la dernière ligne affichée le temps de sa durée, puis overlay
  if (idx >= kk.lines.length) {
    kk.autoTimer = setTimeout(kkFinishAuto, kkEstimateDelay(kk.lines.length - 1));
    return;
  }

  let delay;
  if (kk.lrcLines && kk.playClock0 != null) {
    delay = kk.lrcLines[idx].time * 1000 - (performance.now() - kk.playClock0);
  } else {
    delay = kkEstimateDelay(idx - 1);
  }
  delay = Math.max(0, delay);

  // Intro (idx 0) ou longue pause instrumentale : afficher un compte à rebours
  if (delay > 3500) kkShowGap(performance.now() + delay, idx === 0);

  kk.autoTimer = setTimeout(() => {
    if (!kk.autoPlay) return;
    kkHideGap();
    kkSetLine(idx);
    kkScheduleLine(idx + 1);
  }, delay);
}

function kkFinishAuto() {
  kk.autoPlay = false;
  kkHideGap();
  const btn = document.getElementById('kk-play-btn');
  kkSetPlayLabel(btn, 'Auto', false);
  const overlay = document.getElementById('kk-end-overlay');
  if (overlay) overlay.style.display = 'flex';
}

// Estimation utilisée uniquement sans timing LRC : ~longueur de la ligne
function kkEstimateDelay(idx) {
  const line = kk.lines[idx] || '';
  const words = line.split(/\s+/).filter(Boolean).length || 1;
  return Math.max(2000, words * 450);
}

/* ── Indicateur d'intro / pause instrumentale ── */
function kkEnsureGapEl() {
  const stage = document.querySelector('.kk-stage');
  if (!stage) return null;
  let g = document.getElementById('kk-gap');
  if (!g) {
    g = document.createElement('div');
    g.id = 'kk-gap';
    g.className = 'kk-gap';
    const pulse = document.createElement('div');
    pulse.className = 'kk-gap-pulse';
    pulse.setAttribute('aria-hidden', 'true');
    const count = document.createElement('div');
    count.className = 'kk-gap-count';
    const label = document.createElement('div');
    label.className = 'kk-gap-label';
    g.append(pulse, count, label);
    stage.appendChild(g);
  }
  return g;
}

// Version « horloge » (moteur auto sans audio) : compte à rebours auto-rafraîchi
function kkShowGap(untilMs, isIntro) {
  const g = kkEnsureGapEl();
  if (!g) return;
  g.querySelector('.kk-gap-label').textContent = isIntro ? 'La chanson démarre…' : 'Pause instrumentale…';
  g.style.display = 'flex';
  const countEl = g.querySelector('.kk-gap-count');
  clearInterval(kk.gapTimer);
  const update = () => {
    const sec = Math.ceil((untilMs - performance.now()) / 1000);
    countEl.textContent = sec > 0 ? sec : '';
  };
  update();
  kk.gapTimer = setInterval(update, 200);
}

// Version « audio » : le compte à rebours est mis à jour par la boucle de synchro
function kkAudioGap(remainSec, isIntro) {
  const g = kkEnsureGapEl();
  if (!g) return;
  g.querySelector('.kk-gap-label').textContent = isIntro ? 'La chanson démarre…' : 'Pause instrumentale…';
  g.querySelector('.kk-gap-count').textContent = remainSec > 0 ? Math.ceil(remainSec) : '';
  g.style.display = 'flex';
}

function kkHideGap() {
  clearInterval(kk.gapTimer);
  const g = document.getElementById('kk-gap');
  if (g) g.style.display = 'none';
}

/* ═══════════════════════════════════════════════════
   MOTEUR AUDIO — lecteur YouTube caché + synchro réelle
   La position de lecture (getCurrentTime) pilote l'affichage des paroles :
   chaque chanson est ainsi parfaitement calée sur SON propre timing.
═══════════════════════════════════════════════════ */
let _ytApiPromise = null;
const KK_AUDIO_TIMEOUT = 8000; // délai max recherche + lecteur prêt, puis bascule sans musique
const KK_NO_AUDIO_MSG = 'Pas d\'audio disponible pour cette chanson. Les paroles défilent quand même.';

function kkLoadYTApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (_ytApiPromise) return _ytApiPromise;
  _ytApiPromise = new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { prev && prev(); } catch {} resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return _ytApiPromise;
}

// Conteneur de la vidéo : en fond du jeu, non-interactif (pointer-events:none).
// On recrée le div interne à chaque fois : YT.Player.destroy() supprime l'iframe.
function kkEnsureYTHost() {
  const game = document.getElementById('karaoke-game') || document.body;
  let host = document.getElementById('kk-yt-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'kk-yt-host';
  }
  if (host.parentNode !== game) game.appendChild(host);
  host.style.display = 'block';
  host.innerHTML = '<div id="kk-yt-player"></div>';
  return host;
}

async function kkFetchVideoIds(song, mode) {
  const suffix = mode === 'instrumental' ? ' instrumental' : ' audio';
  const q = `${song.artist} ${song.title}${suffix}`;
  const url = `${KK_BACKEND}/yt-search?q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(KK_AUDIO_TIMEOUT) });
    if (!r.ok) { console.warn('[karaoke] yt-search HTTP', r.status, url); return []; }
    const data = await r.json();
    const ids = (data.videoIds || (data.videoId ? [data.videoId] : []))
      .filter((v) => typeof v === 'string' && /^[\w-]{11}$/.test(v));
    if (!ids.length) console.warn('[karaoke] yt-search : aucune vidéo pour', q);
    return ids;
  } catch (e) {
    console.warn('[karaoke] yt-search injoignable :', KK_BACKEND, e.message);
    return [];
  }
}

function kkSetPlayBtn(playing) {
  const btn = document.getElementById('kk-play-btn');
  if (!btn) return;
  btn.style.display = 'inline-flex';
  kkSetPlayLabel(btn, playing ? 'Pause' : 'Lecture', !!playing);
}

async function kkStartAudio(song, mode) {
  kkDestroyAudio();
  kkAudioGap(0, true);
  const g = document.getElementById('kk-gap');
  if (g) g.querySelector('.kk-gap-label').textContent = 'Recherche de l\'audio…';

  const ids = await kkFetchVideoIds(song, mode);
  // La chanson a pu changer pendant la recherche → on abandonne
  if (!kk.song || kk.song.title !== song.title || kk.song.artist !== song.artist) return;
  if (!ids.length) { kkAudioFallback(KK_NO_AUDIO_MSG); return; }

  await Promise.race([kkLoadYTApi(), new Promise(r => setTimeout(r, KK_AUDIO_TIMEOUT))]);
  if (!kk.song || kk.song.title !== song.title || kk.audioMode === 'none') return;
  if (!(window.YT && window.YT.Player)) { kkAudioFallback(KK_NO_AUDIO_MSG); return; }
  kkEnsureYTHost();

  kk.audioCandidates = ids;
  kk.audioIdx = 0;
  kk.audioActive = true;
  clearTimeout(kk.audioDeadline);
  kk.audioDeadline = setTimeout(() => { // le lecteur n'est jamais devenu prêt
    if (kk.audioActive && !kk.ytReady) kkAudioFallback(KK_NO_AUDIO_MSG);
  }, KK_AUDIO_TIMEOUT);
  kk.ytReady = false;
  kk.ytPlayer = new YT.Player('kk-yt-player', {
    videoId: ids[0],
    playerVars: {
      autoplay: 1, controls: 0, disablekb: 1, playsinline: 1,
      rel: 0, fs: 0, modestbranding: 1, iv_load_policy: 3,
    },
    events: {
      onReady: e => { kk.ytReady = true; clearTimeout(kk.audioDeadline); kkApplyVolume(); try { e.target.playVideo(); } catch {} kkArmAudioWatchdog(); },
      onStateChange: kkOnYTState,
      onError: kkOnYTError,
    },
  });
}

// Une vidéo refuse l'intégration / est indisponible → on tente la suivante
function kkOnYTError(e) {
  console.warn('[karaoke] erreur YouTube', e.data, '— candidat', kk.audioIdx + 1, '/', kk.audioCandidates.length);
  kk.audioIdx++;
  if (kk.ytPlayer && kk.audioIdx < kk.audioCandidates.length) {
    try {
      kk.ytPlayer.loadVideoById(kk.audioCandidates[kk.audioIdx]);
      kkArmAudioWatchdog();
    } catch { kkAudioFallback('Lecture audio impossible — paroles seules.'); }
  } else {
    kkAudioFallback('Aucune vidéo lisible trouvée — paroles seules.');
  }
}

// Si le navigateur bloque l'autoplay avec son, proposer un bouton (geste explicite)
function kkArmAudioWatchdog() {
  clearTimeout(kk.audioWatchdog);
  kk.audioWatchdog = setTimeout(() => {
    let st = -1;
    try { st = kk.ytPlayer.getPlayerState(); } catch {}
    if (st !== 1) kkShowAudioStart();
  }, 2500);
}

// Bouton de secours quand l'autoplay avec son est bloqué par le navigateur
function kkShowAudioStart() {
  const stage = document.querySelector('.kk-stage');
  if (!stage) return;
  let b = document.getElementById('kk-audio-start');
  if (!b) {
    b = document.createElement('button');
    b.id = 'kk-audio-start';
    b.type = 'button';
    b.className = 'key key--principal kk-audio-start';
    b.textContent = 'Lancer la musique';
    b.onclick = kkAudioStartClick;
    stage.appendChild(b);
  }
  b.style.display = 'inline-flex';
}
function kkHideAudioStart() {
  const b = document.getElementById('kk-audio-start');
  if (b) b.style.display = 'none';
}

function kkOnYTState(e) {
  // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
  if (e.data === 1) {
    clearTimeout(kk.audioWatchdog);
    kkHideAudioStart();
    kkSetPlayBtn(true);
    kkStartSyncLoop();
  } else if (e.data === 2) {
    kkSetPlayBtn(false);
    kkStopSyncLoop();
  } else if (e.data === 0) {
    kkStopSyncLoop();
    kkHideGap();
    const overlay = document.getElementById('kk-end-overlay');
    if (overlay) overlay.style.display = 'flex';
  }
}

function kkStartSyncLoop() {
  cancelAnimationFrame(kk.syncRAF);
  const loop = () => {
    if (!kk.audioActive || !kk.ytPlayer) return;
    kkAudioSyncStep();
    kk.syncRAF = requestAnimationFrame(loop);
  };
  kk.syncRAF = requestAnimationFrame(loop);
}

function kkStopSyncLoop() {
  cancelAnimationFrame(kk.syncRAF);
  kk.syncRAF = null;
}

// Cale la ligne affichée sur la position de lecture audio, gère intro et pauses instrumentales
function kkAudioSyncStep() {
  let t = 0;
  try { t = kk.ytPlayer.getCurrentTime() || 0; } catch { return; }

  if (!kk.lrcLines || !kk.lrcLines.length) { kkHideGap(); return; } // pas de timing → audio seul, paroles statiques

  // Avant la première ligne : intro de la chanson
  if (t < kk.lrcLines[0].time - 0.2) {
    kkAudioGap(kk.lrcLines[0].time - t, true);
    return;
  }

  // Dernière ligne dont l'horodatage est passé
  let idx = 0;
  for (let i = 0; i < kk.lrcLines.length; i++) {
    if (kk.lrcLines[i].time <= t + 0.05) idx = i; else break;
  }

  // Longue pause instrumentale avant la ligne suivante
  const next = kk.lrcLines[idx + 1];
  if (next && (next.time - t) > 5) {
    kkAudioGap(next.time - t, false);
  } else {
    kkHideGap();
  }

  if (idx !== kk.currentLine) kkSetLine(idx);
}

// Détruit le lecteur YouTube seulement (la boucle de salle continue : paroles sur l'horloge).
function kkDestroyPlayer() {
  clearTimeout(kk.audioWatchdog);
  clearTimeout(kk.audioDeadline);
  kkHideAudioStart();
  kk.ytReady = false;
  kk.playAskedAt = 0;
  kk.preloadAt = 0;
  kk.preloading = false;
  if (kk.ytPlayer) {
    try { kk.ytPlayer.destroy(); } catch {}
    kk.ytPlayer = null;
  }
  const host = document.getElementById('kk-yt-host');
  if (host) { host.style.display = 'none'; host.innerHTML = ''; }
}

// Arrête tout l'audio : synchro solo, boucle de salle, lecteur.
function kkDestroyAudio() {
  kkStopSyncLoop();
  kkStopRoomLoop();
  kk.playerGen++;
  kk.audioActive = false;
  kkDestroyPlayer();
}

function kkAudioFallback(msg) {
  kkDestroyAudio();
  kk.audioMode = 'none';
  kkHideGap();
  if (msg && typeof granUI !== 'undefined') granUI.toast(msg, { type: 'erreur' });
  kkShowSound(false);
  const btn = document.getElementById('kk-play-btn');
  if (btn) {
    btn.style.display = kk.mode === 'solo' ? 'inline-flex' : 'none';
    kkSetPlayLabel(btn, 'Auto', false);
  }
  // Solo : défilement par le timing LRC avec l'horloge interne (mode sans musique)
  if (kk.mode === 'solo' && kk.song && !kk.autoPlay) kkPlayAuto();
}

window.karaokeRestartSong = function () {
  if (kk.mode === 'multi') { // l'hôte relance : tout le monde repart de la première ligne (kk:started)
    if (kk.isHost) socket.emit('kk:restart', {});
    return;
  }
  const overlay = document.getElementById('kk-end-overlay');
  if (overlay) overlay.style.display = 'none';
  kk.autoPlay = false;
  clearTimeout(kk.autoTimer);
  kk.playClock0 = null;
  kkHideGap();
  // Mode audio : on rembobine la chanson au début et on relance
  if (kk.audioActive && kk.ytPlayer) {
    try { kk.ytPlayer.seekTo(0, true); kk.ytPlayer.playVideo(); } catch {}
    kkSetLine(0);
    return;
  }
  const btn = document.getElementById('kk-play-btn');
  kkSetPlayLabel(btn, 'Auto', false);
  kkSetLine(0);
};

window.karaokeExitGame = async function () {
  if (kk.mode === 'multi') {
    if (kkInGame()) { // bouton « Quitter » : même choix que la garde de navigation
      const ok = await kkGarde();
      if (!ok) return;
    }
    kkQuitRoom();
    kk.mode = null;
    kkShow('karaoke-mode');
    return;
  }
  clearTimeout(kk.autoTimer);
  kk.autoPlay = false;
  kkHideGap();
  kkDestroyAudio();
  kk.song = null;
  kkShow('karaoke-mode');
};

// Fin de chanson (hôte) : retour au salon pour tout le monde.
window.karaokeChangeSong = function () {
  if (kk.mode === 'multi') { if (kk.isHost) socket.emit('kk:stop', {}); return; }
  window.karaokeExitGame();
};

/* ═══════════════════════════════════════════════════
   SON LOCAL — volume et muet propres à cet appareil (solo et salle)
═══════════════════════════════════════════════════ */
const KK_SON_CLE = 'granKaraokeAudio';
function kkSonPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(KK_SON_CLE) || 'null');
    if (v && typeof v === 'object') {
      const n = Number(v.volume);
      return { volume: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 80, muted: v.muted === true };
    }
  } catch { /* stockage indisponible */ }
  return { volume: 80, muted: false };
}
function kkSaveSon(p) { try { localStorage.setItem(KK_SON_CLE, JSON.stringify(p)); } catch { /* stockage indisponible */ } }

function kkApplyVolume() {
  const p = kkSonPrefs();
  const coupe = p.muted || p.volume === 0;
  if (kk.ytPlayer && kk.ytReady) {
    try { kk.ytPlayer.setVolume(p.volume); if (coupe) kk.ytPlayer.mute(); else kk.ytPlayer.unMute(); } catch { /* lecteur pas prêt */ }
  }
  const btn = document.getElementById('kk-mute-btn');
  if (btn) {
    btn.setAttribute('aria-pressed', coupe ? 'true' : 'false');
    btn.textContent = coupe ? 'Remettre le son' : 'Couper le son';
  }
  const vol = document.getElementById('kk-volume');
  if (vol && Number(vol.value) !== p.volume) vol.value = String(p.volume);
}

window.karaokeToggleMute = function () {
  const p = kkSonPrefs();
  if (p.muted || p.volume === 0) { p.muted = false; if (p.volume === 0) p.volume = 50; } else p.muted = true;
  kkSaveSon(p);
  kkApplyVolume();
};

function kkShowSound(on) {
  const el = document.getElementById('kk-son');
  if (el) el.hidden = !on;
  if (on) kkApplyVolume();
}
function kkSetNoAudio(on) {
  const el = document.getElementById('kk-no-audio');
  if (el) el.hidden = !on;
  if (on) kkShowSound(false);
}

// Bouton « Lancer la musique » (autoplay refusé) : le geste de l'utilisateur relance le lecteur, calé sur l'horloge en salle.
function kkAudioStartClick() {
  const p = kk.ytPlayer;
  if (!p) return;
  try {
    if (kk.mode === 'multi' && kk.room && kk.room.clock) {
      const pos = kkClockPos(kk.room.clock, kkServerNow());
      p.seekTo(Math.max(0, pos + KK_AVANCE_SEEK) / 1000, true);
    }
    kkApplyVolume();
    p.playVideo();
  } catch { /* lecteur indisponible */ }
  kk.playAskedAt = Date.now();
}

/* ═══════════════════════════════════════════════════
   SALLE — horloge de lecture partagée (ADR 0005)
   Le serveur détient { playing, baseMs, baseAt, seq }. Les paroles se calculent sur cette horloge
   (identiques chez tous, même sans vidéo) et le lecteur YouTube de chaque appareil la suit.
═══════════════════════════════════════════════════ */
const KK_SEUIL_DERIVE = 250;   // écart lecteur / horloge toléré (ms)
const KK_PAUSE_RECALAGE = 2000; // pas deux recalages en moins de 2 s
const KK_AVANCE_SEEK = 150;    // compense le temps que met un seekTo à repartir
const KK_SYNC_MS = 125;

const kkServerNow = () => Date.now() + kk.offset;
function kkClockPos(clock, now) {
  if (!clock) return 0;
  return clock.playing && now >= clock.baseAt ? clock.baseMs + (now - clock.baseAt) : clock.baseMs;
}
// Même règle que le serveur (lineAt) : dernière ligne dont l'horaire est passé, -1 pendant l'intro.
function kkLineAt(lines, pos) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].t <= pos + 50) idx = i; else break; }
  return idx;
}
function kkRoomLine() {
  if (!kk.room || !kk.room.clock) return -1;
  return kkLineAt(kk.room.lines, kkClockPos(kk.room.clock, kkServerNow()));
}

// Chanson reçue du serveur (kk:song_selected ou snapshot) : seule source des lignes et des vidéos en salle.
function kkRoomApply(d) {
  kk.song = d.song || null;
  kk.room = {
    mode: d.mode === 'instrumental' ? 'instrumental' : 'full',
    lines: (Array.isArray(d.lines) ? d.lines : [])
      .filter(l => l && Number.isFinite(l.t) && typeof l.text === 'string')
      .map(l => ({ t: l.t, text: l.text })),
    videoIds: (Array.isArray(d.videoIds) ? d.videoIds : []).filter(v => typeof v === 'string' && /^[\w-]{11}$/.test(v)),
    endMs: Number(d.endMs) || 0,
    clock: null,
    ended: false,
  };
}

// Applique une horloge reçue ; ignore une horloge plus ancienne que la dernière (sauf snapshot forcé).
function kkRoomClock(clock, serverNow, force = false) {
  if (!kk.room || !clock || typeof clock !== 'object') return false;
  const seq = Number(clock.seq) || 0;
  if (!force && seq <= kk.lastSeq) return false;
  kk.lastSeq = Math.max(kk.lastSeq, seq);
  if (kk.offsetRtt === Infinity && Number.isFinite(serverNow)) kk.offset = serverNow - Date.now(); // estimation avant mesure
  kk.room.clock = { playing: !!clock.playing, baseMs: Number(clock.baseMs) || 0, baseAt: Number(clock.baseAt) || 0 };
  kk.drift = 0;
  kk.lastSeekAt = 0;
  kk.playAskedAt = 0;
  kk.preloadAt = 0;
  return true;
}

// Décalage d'horloge : on garde la mesure au plus petit aller-retour (remplacée si elle a plus de 2 min).
function kkTimeSample() {
  return new Promise((resolve) => {
    if (typeof socket === 'undefined' || !socket.connected) { resolve(); return; }
    const c = Date.now();
    socket.timeout(2000).emit('kk:time', { c }, (err, r) => {
      if (!err && r && r.c === c && Number.isFinite(r.s)) {
        const now = Date.now();
        const rtt = now - c;
        if (rtt < kk.offsetRtt || now - kk.offsetAt > 120000) {
          kk.offset = r.s - (c + rtt / 2);
          kk.offsetRtt = rtt;
          kk.offsetAt = now;
        }
      }
      resolve();
    });
  });
}
async function kkTimeSync() {
  kk.offsetRtt = Infinity; // nouvelle série (entrée en scène, reprise après coupure)
  for (let i = 0; i < 5 && kk.roomTimer; i++) {
    await kkTimeSample();
    await new Promise(r => setTimeout(r, 150));
  }
}

function kkStopRoomLoop() {
  clearInterval(kk.roomTimer); kk.roomTimer = null;
  clearInterval(kk.timeTimer); kk.timeTimer = null;
}

// Écran de chanson en salle : paroles du serveur, boucle de synchro, lecteur local.
function kkLaunchRoomGame() {
  const r = kk.room;
  kk.lines = r.lines.map(l => l.text);
  kk.lrcLines = r.lines.map(l => ({ time: l.t / 1000, text: l.text }));
  kk.currentLine = 0;
  kk.autoPlay = false;
  clearTimeout(kk.autoTimer);
  clearTimeout(kk.endTimer);
  kkHideGap();
  kkDestroyAudio();

  kkShow('karaoke-game');
  const titleBar = document.getElementById('kk-song-title-bar');
  if (titleBar) titleBar.textContent = kkSongLabel(kk.song) + (r.mode === 'instrumental' ? ' (instrumentale)' : '');
  kkApplyHostControls();
  kkUpdatePlayersBar();
  const overlay = document.getElementById('kk-end-overlay');
  if (overlay) overlay.style.display = r.ended ? 'flex' : 'none';
  kkRenderLyrics();
  kkSetNoAudio(false);
  kkShowSound(true);

  kk.roomTimer = setInterval(kkRoomTick, KK_SYNC_MS);
  kk.timeTimer = setInterval(kkTimeSample, 30000);
  if (kk.offsetRtt === Infinity || Date.now() - kk.offsetAt > 60000) kkTimeSync(); // pas de nouvelle série à chaque relance
  kkRoomTick();
  kkRoomPlayer();
}

function kkGapText(label, sec) {
  const g = kkEnsureGapEl();
  if (!g) return;
  g.querySelector('.kk-gap-label').textContent = label;
  g.querySelector('.kk-gap-count').textContent = sec > 0 ? Math.ceil(sec) : '';
  g.style.display = 'flex';
}

// Un pas de synchro : ligne affichée, indicateur (intro, pause, instrumental), recalage du lecteur.
function kkRoomTick() {
  const r = kk.room;
  if (!r || !r.clock || !kkDisplayed('karaoke-game')) return;
  const now = kkServerNow();
  const c = r.clock;
  const pos = kkClockPos(c, now);
  const idx = kkLineAt(r.lines, pos);
  if (Math.max(0, idx) !== kk.currentLine) kkSetLine(Math.max(0, idx));
  else kkRenderLyricsButtons();
  const counter = document.getElementById('kk-line-counter');
  if (counter && r.lines.length) {
    const txt = `${!c.playing && !r.ended ? 'En pause · ' : ''}Ligne ${kk.currentLine + 1}/${r.lines.length}`;
    if (counter.textContent !== txt) counter.textContent = txt;
  }

  if (r.ended || !c.playing) kkHideGap(); // en pause, les paroles restent visibles (« En pause » dans le compteur)
  else if (idx < 0 && r.lines.length) kkGapText('La chanson démarre…', (Math.max(0, c.baseAt - now) + r.lines[0].t - pos) / 1000);
  else {
    const next = r.lines[idx + 1];
    if (next && next.t - pos > 5000) kkGapText('Pause instrumentale…', (next.t - pos) / 1000);
    else kkHideGap();
  }
  kkRoomSyncPlayer(now, c, pos);
}

// Boutons précédente / suivante en salle (l'intro se termine sans changer de ligne affichée).
function kkRenderLyricsButtons() {
  if (kk.mode !== 'multi') return;
  const idx = kkRoomLine();
  const total = kk.lines.length;
  const fini = !!(kk.room && kk.room.ended);
  const prevBtn = document.getElementById('kk-prev-btn');
  const nextBtn = document.getElementById('kk-next-btn');
  if (prevBtn) prevBtn.disabled = idx < 0 || fini;
  if (nextBtn) nextBtn.disabled = idx >= total - 1 || fini;
}

// Lecteur YouTube de cet appareil : mêmes candidats, dans le même ordre, que les autres joueurs.
async function kkRoomPlayer() {
  const r = kk.room;
  const gen = ++kk.playerGen;
  if (!r.videoIds.length) { kkSetNoAudio(true); return; }
  await Promise.race([kkLoadYTApi(), new Promise(res => setTimeout(res, KK_AUDIO_TIMEOUT))]);
  if (gen !== kk.playerGen || kk.room !== r) return;
  if (!(window.YT && window.YT.Player)) { kkSetNoAudio(true); return; }
  kkEnsureYTHost();
  kk.audioCandidates = r.videoIds;
  kk.audioIdx = 0;
  kk.ytReady = false;
  clearTimeout(kk.audioDeadline);
  kk.audioDeadline = setTimeout(() => { if (gen === kk.playerGen && !kk.ytReady) kkRoomNoAudio(); }, 10000);
  kk.ytPlayer = new YT.Player('kk-yt-player', {
    videoId: r.videoIds[0],
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0, modestbranding: 1, iv_load_policy: 3 },
    events: {
      onReady: () => {
        if (gen !== kk.playerGen) return;
        kk.ytReady = true;
        clearTimeout(kk.audioDeadline);
        kkApplyVolume();
        kkRoomTick();
      },
      onStateChange: (e) => { if (gen === kk.playerGen && e.data === 1) kkHideAudioStart(); },
      onError: (e) => {
        if (gen !== kk.playerGen) return;
        console.warn('[karaoke] erreur YouTube', e.data, '— candidat', kk.audioIdx + 1, '/', kk.audioCandidates.length);
        kk.audioIdx++;
        if (kk.ytPlayer && kk.audioIdx < kk.audioCandidates.length) {
          kk.playAskedAt = 0;
          try { kk.ytPlayer.cueVideoById(kk.audioCandidates[kk.audioIdx]); } catch { kkRoomNoAudio(); }
        } else {
          kkRoomNoAudio();
        }
      },
    },
  });
}

// Aucune vidéo lisible sur cet appareil : les paroles continuent sur l'horloge.
function kkRoomNoAudio() {
  kk.playerGen++;
  kkDestroyPlayer();
  kkSetNoAudio(true);
}

function kkRoomSyncPlayer(now, c, pos) {
  const p = kk.ytPlayer;
  if (!p || !kk.ytReady) return;
  let st, cur;
  try { st = p.getPlayerState(); cur = (p.getCurrentTime() || 0) * 1000; } catch { return; }
  const t = Date.now();
  const enLecture = c.playing && now >= c.baseAt && !kk.room.ended;

  if (!enLecture) {
    // 1 = lecture, 3 = chargement → on met en pause, puis on cale la position d'attente
    if (st === 1 || st === 3) {
      try { p.pauseVideo(); } catch { /* lecteur indisponible */ }
    } else if (st === 2 && !kk.room.ended && Math.abs(cur - c.baseMs) > KK_SEUIL_DERIVE) {
      try { p.seekTo(c.baseMs / 1000, true); } catch { /* lecteur indisponible */ }
    } else if ((st === -1 || st === 5) && !kk.room.ended && !kk.preloadAt) {
      // Pas encore chargée : un seekTo (son coupé) lance le chargement, le pas suivant met en pause → départ à l'heure
      kk.preloadAt = t;
      kk.preloading = true;
      try { p.mute(); p.seekTo(c.baseMs / 1000, true); } catch { /* lecteur indisponible */ }
    }
    if (st === 2 && kk.preloading) { kk.preloading = false; kkApplyVolume(); }
    kk.playAskedAt = 0;
    return;
  }
  if (st === 0) { // vidéo terminée : on la laisse finie si elle est plus courte que la chanson, sinon (« Recommencer ») on relance
    let duree = 0;
    try { duree = (p.getDuration() || 0) * 1000; } catch { /* lecteur indisponible */ }
    if (!duree || pos >= duree - 500) return;
  }
  if (st !== 1 && st !== 3) {
    if (!kk.playAskedAt) {
      kk.playAskedAt = t;
      try { p.seekTo((pos + KK_AVANCE_SEEK) / 1000, true); p.playVideo(); } catch { /* lecteur indisponible */ }
    } else if (t - kk.playAskedAt > 1500) {
      kkShowAudioStart(); // autoplay refusé par le navigateur : un geste est nécessaire
    }
    return;
  }
  if (st === 3) return; // en chargement : la demande de lecture reste en cours (détection de l'autoplay bloqué)
  kk.playAskedAt = 0;
  if (kk.preloading) { kk.preloading = false; kkApplyVolume(); }
  if (Math.abs(cur - pos) > KK_SEUIL_DERIVE) kk.drift++; else kk.drift = 0;
  if (kk.drift >= 2 && t - kk.lastSeekAt > KK_PAUSE_RECALAGE) {
    kk.drift = 0;
    kk.lastSeekAt = t;
    try { p.seekTo((pos + KK_AVANCE_SEEK) / 1000, true); } catch { /* lecteur indisponible */ }
  }
}

/* ───────────────────────────────────────────────
   SOCKET.IO — ÉVÉNEMENTS KARAOKÉ
─────────────────────────────────────────────── */
const kkSurSocket = {
  'kk:joined': (d) => {
    kkClearBusy();
    kk.mode = 'multi';
    kk.roomId = d.code; kk.you = d.you; kk.hostId = d.hostId; kk.replaced = false;
    kk.players = Array.isArray(d.players) ? d.players : [];
    kk.isHost = d.hostId === d.you;
    const moi = kk.players.find((p) => p.id === d.you);
    if (moi) kk.username = moi.username;
    granReprise.save(KK_P, { code: d.code, pid: d.you, token: d.token, username: kk.username || '' });
    if (d.resumed && kk.auto) granUI.toast(`Tu es de retour dans la salle ${d.code}`, { type: 'succes' });
    kk.auto = false;
    const st = d.state || {};
    if (st.song) kkRoomApply(st); else { kk.song = null; kk.room = null; }
    kk.started = !!(st.started && kk.room && kk.room.lines.length && st.clock);
    if (kk.started) {
      kkRoomClock(st.clock, st.serverNow, true);
      kk.room.ended = !!st.ended;
      kkLaunchRoomGame();
      kkMajGarde();
    } else {
      kkBackToLobby();
    }
  },
  'kk:room': (d) => {
    if (!kk.roomId) return;
    kk.hostId = d.hostId;
    kk.isHost = d.hostId === kk.you;
    kk.players = Array.isArray(d.players) ? d.players : [];
    if (kkDisplayed('kk-lobby') && kkDisplayed('karaoke-room')) kkRenderLobby();
    if (kkDisplayed('karaoke-game')) { kkUpdatePlayersBar(); kkApplyHostControls(); kkRenderLyrics(); }
    if (!kk.isHost && kk.picking) kkPickDone(); // le serveur abandonne la sélection d'un ancien hôte sans répondre
    if (!kk.isHost && kkDisplayed('karaoke-select')) kkShowLobby(); // plus hôte : le choix de chanson ne nous revient plus
  },
  'kk:song_selected': (d) => {
    if (!kk.roomId || !d || !d.song) return;
    kkRoomApply(d);
    kkPickDone();
    if (kk.started) { kkBackToLobby(); return; }
    if (kkDisplayed('karaoke-select') && kk.isHost) kkShowLobby();
    else if (kkDisplayed('karaoke-room')) kkRenderLobby();
  },
  'kk:started': (d) => {
    if (!kk.roomId || !kk.room || !kk.room.lines.length || !d) return;
    const dejaEnScene = kk.started && kkDisplayed('karaoke-game') && !!kk.roomTimer;
    kk.started = true;
    kk.room.ended = false;
    kkRoomClock(d.clock, d.serverNow);
    if (dejaEnScene) { // « Recommencer » : on garde le lecteur, l'horloge le ramène au début
      const overlay = document.getElementById('kk-end-overlay');
      if (overlay) overlay.style.display = 'none';
      kkApplyHostControls();
      kkRoomTick();
    } else {
      kkLaunchRoomGame();
    }
    kkMajGarde();
  },
  'kk:clock': (d) => {
    if (!kk.roomId || !kk.started || !d) return;
    if (kkRoomClock(d.clock, d.serverNow)) { kkApplyHostControls(); kkRoomTick(); }
  },
  'kk:ended': (d) => {
    if (!kk.roomId || !kk.started || !kk.room) return;
    if (d) kkRoomClock(d.clock, d.serverNow);
    kk.room.ended = true;
    kkRoomTick();
    const overlay = document.getElementById('kk-end-overlay');
    if (overlay) overlay.style.display = 'flex';
    kkApplyHostControls();
    kkRenderLyrics();
    kkMajGarde();
  },
  'kk:stopped': () => { if (kk.roomId) kkBackToLobby(); },
  'kk:replaced': () => { if (kk.roomId) kkShowReplaced(); },
  'kk:error': (e) => {
    const code = e && e.code;
    const msg = (e && e.message) || 'Une erreur est survenue.';
    kkClearBusy();
    if (kk.picking) kkPickDone();
    if (code === 'resume_failed') {
      granReprise.clear(KK_P);
      kkShowEntree(null, { message: msg, focus: true });
      return;
    }
    if (!kk.roomId) {
      if (!kk.entree) return;
      kk.entree.setBusy(false);
      kk.entree.showError(code === 'room_not_found' || code === 'bad_code' ? 'code' : code === 'username_taken' ? 'pseudo' : 'general', msg);
      kk.entree.refreshResume();
      return;
    }
    granUI.toast(msg, { type: 'erreur' });
  },
  connect: () => {
    if (kk.mode !== 'multi' || !kk.roomId || kk.replaced) return;
    const e = granReprise.get(KK_P);
    if (e) { kk.auto = true; socket.emit('kk:resume', { code: e.code, token: e.token }); }
  },
  disconnect: () => {
    if (kkInGame()) granReprise.touch(KK_P, KK_GRACE_MS);
    if (kk.mode === 'multi' && kk.roomId) granUI.toast('Reconnexion en cours…', { type: 'erreur', titre: 'Connexion perdue.' });
  },
};
const kkSurPagehide = () => { if (kkInGame()) granReprise.touch(KK_P, KK_GRACE_MS); };
let kkAttache = false;

// Écouteurs attachés à l'entrée dans la vue (karaokeEnter), retirés dans kkCleanup (mêmes références).
function kkAttacher() {
  if (kkAttache) return;
  kkAttache = true;
  Object.entries(kkSurSocket).forEach(([ev, fn]) => socket.on(ev, fn));
  window.addEventListener('pagehide', kkSurPagehide);
}
function kkDetacher() {
  if (!kkAttache) return;
  kkAttache = false;
  Object.entries(kkSurSocket).forEach(([ev, fn]) => socket.off(ev, fn));
  window.removeEventListener('pagehide', kkSurPagehide);
}

// Entrée dans la vue (appelée par le routeur, voir app.js).
window.karaokeEnter = function (params) {
  kk.replaced = false;
  kk.forfeit = false;
  kkAttacher();
  const dlg = document.getElementById('kk-garde');
  if (dlg && !dlg.dataset.kkWired) { // Échap / clic sur le voile : on reste
    dlg.dataset.kkWired = '1';
    dlg.addEventListener('close', () => { if (kkDlgResolve) { const r = kkDlgResolve; kkDlgResolve = null; r(kkDlgResultat); } });
  }
  if (params && params.code) {
    kkShowEntree(params.code); // lien de salle : code pré-rempli, sans rejoindre
  } else {
    kkShow('karaoke-mode');
  }
};

/* ───────────────────────────────────────────────
   CLEANUP
─────────────────────────────────────────────── */
function kkCleanup() {
  kkDetacher();
  const drawer = document.getElementById('kk-audio-modal');
  if (drawer && drawer.open) drawer.close();
  const dlg = document.getElementById('kk-garde');
  if (dlg && dlg.open) dlg.close();
  if (kkDlgResolve) { const r = kkDlgResolve; kkDlgResolve = null; r(false); }
  if (kk.mode === 'multi') kkSendLeave(kk.forfeit);
  kk.forfeit = false;
  kk.entree = null;
  kkResetRoom();
  kk.mode = null;
  kk.username = null;
}

/* ───────────────────────────────────────────────
   INIT
─────────────────────────────────────────────── */
(function init() {
  // Raccourcis clavier pour le jeu
  document.addEventListener('keydown', e => {
    if (!kkDisplayed('karaoke-game')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+A, Cmd+←… restent aux raccourcis du navigateur
    if (document.querySelector('dialog[open]')) return;
    const cible = e.target && e.target.closest ? e.target : null;
    if (cible && cible.closest('input, textarea, select, [contenteditable]')) return;

    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      if (kk.mode === 'multi' && e.repeat) return; // touche maintenue : un saut par appui en salle
      e.preventDefault();
      karaokeAdvance(e.code === 'ArrowRight' ? 'next' : 'prev');
    } else if (e.code === 'Space') {
      if ((kk.mode === 'multi' && e.repeat) || (cible && cible.closest('button, a, [role="button"]'))) return; // Espace active le bouton focalisé
      e.preventDefault();
      if (kk.mode === 'multi') karaokeToggleAutoPlay(); else karaokeAdvance('next');
    } else if (e.code === 'KeyA' && kk.mode === 'solo' && !e.repeat) {
      e.preventDefault();
      karaokeToggleAutoPlay();
    }
  });

  // Volume local (non partagé avec la salle)
  const vol = document.getElementById('kk-volume');
  if (vol) vol.addEventListener('input', () => {
    const p = kkSonPrefs();
    p.volume = Math.max(0, Math.min(100, Number(vol.value) || 0));
    if (p.volume > 0) p.muted = false;
    kkSaveSon(p);
    kkApplyVolume();
  });
  kkApplyVolume();
})();
