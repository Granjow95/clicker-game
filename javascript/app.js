// Câblage : enregistre les vues (enter/leave) des jeux dans le routeur, puis le démarre. Chargé en dernier.
// leave() reprend le contenu de l'ancien goBack() : quitter la salle côté serveur, retirer les listeners,
// arrêter les minuteurs, détruire le lecteur YouTube, appliquer un changement de compte reporté.
(() => {
  const $ = (id) => document.getElementById(id);
  const show = (id, display = 'block') => { const n = $(id); if (n) n.style.display = display; };
  const hide = (id) => { const n = $(id); if (n) n.style.display = 'none'; };

  /* ---------- Imposteur ---------- */
  granRouter.register('imposteur', {
    enter(params) {
      if (params && params.code) $('room-id').value = params.code; // pré-remplit, jamais de jointure automatique
    },
    leave() {
      if (currentRoomId) socket.emit('leave_room', currentRoomId);
      socket.off('room_update', onRoomUpdate);
      socket.off('room-created', onRoomCreated);
      resetImposteur(); // état, minuteurs, écrans (imposteur.js)
      granAuth.flushReconnect();
    },
  });

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
      show('karaoke-mode');
      if (params && params.code) {
        // Lien de salle : on affiche le formulaire avec le code pré-rempli, sans rejoindre.
        window.karaokeShowRoom();
        $('kk-roomcode').value = params.code;
      }
    },
    leave() {
      kkCleanup();
      ['karaoke-mode', 'karaoke-room', 'karaoke-select', 'karaoke-game'].forEach(hide);
      granAuth.flushReconnect();
    },
  });

  /* ---------- Accueil ---------- */
  // « On t'a donné un code ? » : mène à la salle Imposteur avec code et pseudo pré-remplis (jamais de jointure automatique).
  $('form-rejoindre').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('h-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,30}$/.test(code)) { $('h-code').focus(); granUI.shake($('h-code')); return; }
    $('room-id').value = code;
    $('username').value = $('h-pseudo').value.trim();
    granRouter.navigate(`/imposteur/${code}`);
  });

  // « Un jeu au hasard » (404) : un des jeux jouables aujourd'hui.
  $('jeu-hasard').addEventListener('click', (e) => {
    e.preventDefault();
    const jeux = ['imposteur', 'lyrics', 'karaoke'];
    granRouter.navigate(`/${jeux[Math.floor(Math.random() * jeux.length)]}`);
  });

  // Lien d'évitement : pas de changement de hash (le routeur le prendrait pour une route), on déplace le focus.
  $('lien-evitement').addEventListener('click', (e) => { e.preventDefault(); $('contenu').focus(); });

  granRouter.start();
})();
