// Interface de compte : fenêtre (connexion, inscription, confirmation, résumé, suppression) et page Profil (#/profil).
// Dépend de granAuth (auth.js), granUI (ui.js), granRouter (router.js) et socket (suppression du compte).
// Texte dynamique (pseudo, email, avatar) : toujours textContent via granUI.el(), jamais innerHTML.
// Les gabarits SVG passés à svg() sont des constantes de ce fichier.
const granAccount = (() => {
  const { el } = granUI;
  const GAMES = { imposteur: 'Imposteur', lyrics: 'Lyrics', karaoke: 'Karaoké' };
  const GAME_IDS = Object.keys(GAMES);
  const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
  const USERNAME_ERR = 'Pseudo invalide : 3 à 20 lettres, chiffres ou _.';
  const MODIFIERS = ['fenetre-compte--confirmation', 'fenetre-compte--connecte', 'fenetre-compte--supprime'];
  const UNDO_MS = 6000;

  const dlg = document.getElementById('fenetre-compte');
  const btn = document.getElementById('account-btn');
  let ready = !granAuth.available(); // vrai dès que la session est connue (ou que Supabase est absent)
  let lastUid;
  let statsP = null;
  let profile = null; // { username, avatar_url }
  let deletedState = false;
  let profilActive = false;
  let history = [];
  const pending = new Set(); // suppressions de parties en attente (annulables 6 s)

  /* ---------- Outils ---------- */
  function svg(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup; // constantes uniquement
    return t.content.firstElementChild;
  }
  const iconClose = () => svg('<svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M2 2l10 10M12 2 2 12"></path></svg>');
  const plural = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

  function safeAvatar(url) {
    try { const u = new URL(url); return u.protocol === 'https:' ? u.href : null; } catch (_) { return null; }
  }
  // Avatar : image https seulement, sinon la première lettre du pseudo.
  function paintAvatar(box, url, name) {
    const safe = url ? safeAvatar(url) : null;
    if (safe) box.replaceChildren(el('img', { src: safe, alt: '', referrerpolicy: 'no-referrer', width: 64, height: 64 }));
    else box.textContent = (name || '?').charAt(0).toUpperCase();
  }
  function displayName() {
    const u = granAuth.user();
    if (!u) return '';
    const m = u.user_metadata || {};
    return (profile && profile.username) || m.username || m.name || (u.email ? u.email.split('@')[0] : '') || 'Joueur';
  }
  function setStatus(node, text, erreur) {
    node.textContent = text || '';
    node.classList.toggle('profil__statut--erreur', Boolean(erreur) && !node.classList.contains('profil__statut--clair'));
  }

  /* ---------- Données ---------- */
  function getStats(force) {
    if (!force && statsP) return statsP;
    const sb = granAuth.client();
    const u = granAuth.user();
    if (!sb || !u) return Promise.resolve(null);
    statsP = Promise.resolve(sb.from('player_stats').select('*').eq('user_id', u.id))
      .then(({ data, error }) => (error ? null : (data || [])), () => null);
    const p = statsP;
    p.then((rows) => { if (!rows && statsP === p) statsP = null; }); // jamais de null en cache
    return p;
  }
  function loadProfile() {
    const sb = granAuth.client();
    const u = granAuth.user();
    if (!sb || !u) return Promise.resolve();
    return Promise.resolve(sb.from('profiles').select('username, avatar_url').eq('id', u.id).maybeSingle())
      .then(({ data }) => {
        if (granAuth.user() && granAuth.user().id === u.id) profile = data || null;
        refreshButton();
        refreshFiche();
        if (profilActive) paintProfilHeader();
      }, () => {});
  }

  /* ---------- Bouton de la console ---------- */
  const btnIcone = btn.querySelector('.console__compte-icone');
  const btnNom = btn.querySelector('.console__compte-nom');
  const btnAvatar = el('span', { class: 'console__avatar', 'aria-hidden': 'true' });
  btnAvatar.hidden = true;
  btn.insertBefore(btnAvatar, btnNom);

  function refreshButton() {
    const u = granAuth.user();
    btn.classList.toggle('console__compte--connecte', Boolean(u));
    btnIcone.hidden = Boolean(u);
    btnAvatar.hidden = !u;
    if (u) {
      const name = displayName();
      paintAvatar(btnAvatar, profile && profile.avatar_url, name);
      btnNom.textContent = name;
      btn.setAttribute('aria-label', `Compte : ${name}`);
    } else {
      btnNom.textContent = 'Compte';
      btn.setAttribute('aria-label', 'Compte, connexion ou inscription'); // contient le texte visible « Compte » (WCAG 2.5.3)
    }
  }

  /* ---------- Fiche de joueur (accueil) ---------- */
  const fiche = {
    avatar: document.querySelector('#fiche-joueur .fiche__avatar'),
    nom: document.getElementById('fiche-nom'),
    parties: document.getElementById('fiche-parties'),
    victoires: document.getElementById('fiche-victoires'),
    record: document.getElementById('fiche-record'),
    invite: document.getElementById('fiche-invite'),
    connecte: document.getElementById('fiche-connecte'),
  };
  const ficheAvatarInvite = Array.from(fiche.avatar.childNodes);

  function refreshFiche() {
    const u = granAuth.user();
    fiche.invite.hidden = Boolean(u);
    fiche.connecte.hidden = !u;
    if (!u) {
      fiche.avatar.replaceChildren(...ficheAvatarInvite);
      fiche.nom.textContent = 'Invité';
      [fiche.parties, fiche.victoires, fiche.record].forEach((n) => { n.textContent = '?'; });
      return;
    }
    const name = displayName();
    paintAvatar(fiche.avatar, profile && profile.avatar_url, name);
    fiche.nom.textContent = name;
    const uid = u.id;
    getStats().then((rows) => {
      if (!granAuth.user() || granAuth.user().id !== uid) return;
      if (!rows) { [fiche.parties, fiche.victoires, fiche.record].forEach((n) => { n.textContent = '?'; }); return; }
      fiche.parties.textContent = String(rows.reduce((s, r) => s + r.games_played, 0));
      fiche.victoires.textContent = String(rows.reduce((s, r) => s + r.wins, 0));
      fiche.record.textContent = String(rows.reduce((m, r) => Math.max(m, r.best_score), 0));
    });
  }

  /* ---------- Fenêtre : gabarits ---------- */
  function head(title, { fermer = true, teinte = '' } = {}) {
    return el('div', { class: `fenetre__tete${teinte}` },
      el('h2', { id: 'compte-titre', class: 'fenetre__titre', tabindex: '-1' }, title),
      fermer ? el('button', { type: 'button', class: 'fenetre__fermer', 'aria-label': 'Fermer', onclick: () => granUI.closeDialog(dlg) }, iconClose()) : null);
  }
  function show(modifier, ...nodes) {
    dlg.classList.remove(...MODIFIERS);
    if (modifier) dlg.classList.add(modifier);
    dlg.removeAttribute('aria-busy');
    dlg.replaceChildren(...nodes);
    const t = dlg.querySelector('#compte-titre');
    if (t && dlg.open) t.focus();
  }

  // Champ avec son message d'erreur ; validé à la sortie du champ, pas à chaque touche.
  function makeField(id, label, attrs, validate) {
    const err = el('span', { id: `${id}-err`, class: 'field__erreur', hidden: true });
    const input = el('input', { id, class: 'field__input', ...attrs });
    const wrap = el('div', { class: 'field' }, el('label', { class: 'field__label', for: id }, label), input, err);
    const check = () => {
      const msg = validate(input.value);
      err.hidden = !msg;
      err.textContent = msg || '';
      if (msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', err.id); } else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
      return !msg;
    };
    input.addEventListener('blur', () => { if (input.value || input.getAttribute('aria-invalid')) check(); });
    input.addEventListener('input', () => { if (input.getAttribute('aria-invalid')) check(); });
    return { wrap, input, check };
  }
  const vPseudo = (v) => (USERNAME_RE.test(v.trim()) ? '' : USERNAME_ERR);
  const vEmail = (v) => {
    const s = v.trim();
    if (!s) return 'Il manque ton adresse email.';
    if (/^[^@\s]+@[^@\s.]+$/.test(s)) return "Il manque la fin de l'adresse, par exemple .fr ou .com.";
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? '' : "Cette adresse email n'est pas valide.";
  };
  const vPasswordNew = (v) => (v.length >= 6 ? '' : `6 caractères minimum. Il en manque ${6 - v.length}.`);
  const vPasswordOld = (v) => (v ? '' : 'Il manque ton mot de passe.');

  /* ---------- 1-3. Connexion / inscription / chargement ---------- */
  function renderAuth(mode = 'signin') {
    const signup = mode === 'signup';
    const tab = (id, label) => el('button', {
      type: 'button', role: 'tab', 'aria-selected': String(id === mode),
      onclick: () => { if (id !== mode) renderAuth(id); },
    }, label);
    const fPseudo = signup && makeField('acc-username', 'Pseudo', { type: 'text', maxlength: '20', autocomplete: 'username', required: true }, vPseudo);
    const fEmail = makeField('acc-email', 'Email', { type: 'email', autocomplete: 'email', required: true }, vEmail);
    const fPass = makeField('acc-password', 'Mot de passe', { type: 'password', autocomplete: signup ? 'new-password' : 'current-password', required: true }, signup ? vPasswordNew : vPasswordOld);
    const fields = [fPseudo, fEmail, fPass].filter(Boolean);
    const labelEnvoi = signup ? 'Création…' : 'Connexion…';
    const labelRepos = signup ? 'Créer mon compte' : 'Me connecter';
    const submit = el('button', { type: 'submit', class: 'key key--principal key--bloc' }, labelRepos);
    const alertSlot = el('div', {});
    const form = el('form', { class: 'formulaire', novalidate: true }, ...fields.map((f) => f.wrap), alertSlot, submit);
    let busy = false;

    const setBusy = (on) => {
      busy = on;
      form.classList.toggle('formulaire-envoi', on);
      dlg.toggleAttribute('aria-busy', on);
      fields.forEach((f) => { f.input.readOnly = on; });
      submit.toggleAttribute('aria-disabled', on);
      submit.setAttribute('aria-busy', String(on));
      submit.replaceChildren(...(on ? [el('span', { class: 'dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')), labelEnvoi] : [labelRepos]));
    };
    const showError = (msg, email) => {
      const raw = String(msg || '');
      let titre = raw;
      let suite = '';
      let renvoi = null;
      if (/invalid login credentials/i.test(raw)) { titre = 'Email ou mot de passe incorrect.'; suite = ' Vérifie les majuscules.'; }
      else if (/user already registered|already been registered/i.test(raw)) { titre = 'Un compte existe déjà avec cet email.'; suite = ' Connecte-toi plutôt.'; }
      else if (/email not confirmed/i.test(raw)) {
        titre = "Ton email n'est pas encore confirmé.";
        suite = ' Clique sur le lien reçu par mail.';
        if (email) {
          const st = el('span', { role: 'status' });
          const b = el('button', { type: 'button', class: 'key', onclick: async () => {
            b.disabled = true;
            const r = await granAuth.resend(email);
            b.disabled = false;
            st.textContent = r.error ? ` ${r.error}` : ' Lien renvoyé.';
          } }, 'Renvoyer le lien');
          renvoi = el('div', {}, b, st);
        }
      }
      alertSlot.replaceChildren(el('div', { class: 'alerte', role: 'alert' },
        el('span', { class: 'alerte__icone', 'aria-hidden': 'true' }, '!'),
        el('span', {}, el('b', {}, titre), suite), renvoi));
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      alertSlot.replaceChildren();
      const results = fields.map((f) => f.check());
      const firstBad = fields.find((_, i) => !results[i]);
      if (firstBad) { firstBad.input.focus(); return; }
      const email = fEmail.input.value.trim();
      const password = fPass.input.value;
      const username = signup ? fPseudo.input.value.trim() : '';
      setBusy(true);
      const r = signup ? await granAuth.signUp(email, password, username) : await granAuth.signIn(email, password);
      setBusy(false);
      if (r.error) return showError(r.error, email);
      if (r.needsConfirm) return renderConfirmation(email);
      // La suite (résumé) est affichée par granAuth.onChange
    });

    const discord = el('button', { type: 'button', class: 'key key--discord key--bloc', onclick: async () => {
      const r = await granAuth.signInOAuth('discord');
      if (r.error) showError(r.error);
    } }, 'Continuer avec Discord');

    show('',
      head('Ton compte'),
      el('div', { class: 'fenetre__corps' },
        el('div', { class: 'onglets', role: 'tablist', 'aria-label': 'Choix' }, tab('signin', 'Connexion'), tab('signup', 'Inscription')),
        form,
        signup ? null : el('div', { class: 'separateur-ou' }, 'ou'),
        signup ? null : discord,
        signup ? null : el('p', { class: 'fenetre__aide' }, 'Le compte est facultatif : sans lui, tu joues toujours avec un pseudo.')));
    if (signup) form.after(el('div', { class: 'separateur-ou' }, 'ou'), discord);
  }

  /* ---------- 4. Email de confirmation envoyé ---------- */
  function renderConfirmation(email) {
    const st = el('p', { class: 'fenetre__aide', role: 'status' });
    const renvoyer = el('button', { type: 'button', class: 'key', onclick: async () => {
      renvoyer.disabled = true;
      const r = await granAuth.resend(email);
      renvoyer.disabled = false;
      st.textContent = r.error ? r.error : 'Lien renvoyé.';
    } }, 'Renvoyer le lien');
    show('fenetre-compte--confirmation',
      head('Regarde tes mails'),
      el('div', { class: 'fenetre__corps fenetre__corps--detail' },
        svg('<svg class="fenetre__illustration" aria-hidden="true" viewBox="0 0 16 12" shape-rendering="crispEdges"><rect class="illustration-encre" width="16" height="12"></rect><rect class="illustration-fond" x="1" y="1" width="14" height="10"></rect><path class="illustration-or" d="M1 1h2v1h2v1h2v1h2V3h2V2h2V1h2v2h-2v1h-2v1H9v1H7V5H5V4H3V3H1z"></path></svg>'),
        el('p', { class: 'fenetre__texte' }, 'On a envoyé un lien à ', el('b', {}, email), '. Clique dessus pour activer ton compte.'),
        el('p', { class: 'fenetre__texte fenetre__texte--doux' }, 'Rien reçu ? Regarde dans les indésirables. Tu peux continuer à jouer avec ton pseudo en attendant.'),
        el('div', { class: 'actions-ligne' },
          renvoyer,
          el('button', { type: 'button', class: 'key key--principal', onclick: () => { granUI.closeDialog(dlg); granRouter.navigate('/'); } }, 'Retour aux jeux')),
        st));
  }

  /* ---------- 5. Connecté (résumé) ---------- */
  function renderConnecte() {
    const name = displayName();
    const avatarBox = el('span', { class: 'fenetre__avatar', 'aria-hidden': 'true' });
    paintAvatar(avatarBox, profile && profile.avatar_url, name);
    const sous = el('span', { class: 'fenetre__sous' });
    const resume = el('div', { class: 'resume' });
    const rowTexts = {};
    GAME_IDS.forEach((id) => {
      const t = el('span', { class: 'resume-ligne__texte' });
      rowTexts[id] = t;
      resume.append(el('div', { class: 'resume-ligne' },
        el('span', { class: `pastille-jeu pastille-jeu--${id}`, 'aria-hidden': 'true' }),
        el('span', { class: 'resume-ligne__nom' }, GAMES[id]), t));
    });
    const uid = granAuth.user().id;
    getStats().then((rows) => {
      if (!granAuth.user() || granAuth.user().id !== uid || !rows) return;
      const by = Object.fromEntries(rows.map((r) => [r.game, r]));
      sous.textContent = `${plural(rows.reduce((s, r) => s + r.games_played, 0), 'partie')} jouée${rows.reduce((s, r) => s + r.games_played, 0) > 1 ? 's' : ''}`;
      const g = (id, k) => (by[id] ? by[id][k] : 0);
      rowTexts.imposteur.textContent = plural(g('imposteur', 'wins'), 'victoire');
      rowTexts.lyrics.textContent = `meilleur ${g('lyrics', 'best_score')}`;
      rowTexts.karaoke.textContent = plural(g('karaoke', 'games_played'), 'partie');
    });
    show('fenetre-compte--connecte',
      el('div', { class: 'fenetre__tete fenetre__tete--profil' },
        avatarBox,
        el('div', { class: 'fenetre__identite' }, el('h2', { id: 'compte-titre', class: 'fenetre__pseudo', tabindex: '-1' }, name), sous),
        el('button', { type: 'button', class: 'fenetre__fermer', 'aria-label': 'Fermer', onclick: () => granUI.closeDialog(dlg) }, iconClose())),
      el('div', { class: 'fenetre__corps' },
        resume,
        el('a', { class: 'key key--principal key--bloc', href: '#/profil', onclick: () => granUI.closeDialog(dlg) }, 'Voir ma fiche complète'),
        el('button', { type: 'button', class: 'key key--fantome key--bloc', onclick: async () => {
          await flushPending();
          const r = await granAuth.signOut();
          if (r.error) granUI.toast(r.error, { type: 'erreur' });
        } }, 'Me déconnecter')));
  }

  /* ---------- 6. Compte supprimé ---------- */
  function renderSupprime() {
    show('fenetre-compte--supprime',
      head('Compte supprimé', { fermer: false, teinte: ' fenetre__tete--sans-fermer' }),
      el('div', { class: 'fenetre__corps fenetre__corps--detail' },
        svg('<svg class="fenetre__illustration fenetre__illustration--poubelle" aria-hidden="true" viewBox="0 0 10 10" shape-rendering="crispEdges"><path class="illustration-doux" d="M3 0h4v1H3zM1 1h8v1H1zM2 2h6v8H2z"></path><path class="illustration-papier" d="M3 3h1v6H3zM6 3h1v6H6z"></path></svg>'),
        el('p', { class: 'fenetre__texte' }, 'Ton compte, tes stats et ton historique sont effacés. Tu peux toujours jouer avec un pseudo.'),
        el('button', { type: 'button', class: 'key key--principal', onclick: () => { granUI.closeDialog(dlg); granRouter.navigate('/'); } }, "Retour à l'accueil")));
  }

  function renderIndisponible() {
    show('',
      head('Compte'),
      el('div', { class: 'fenetre__corps' },
        el('div', { class: 'alerte', role: 'alert' },
          el('span', { class: 'alerte__icone', 'aria-hidden': 'true' }, '!'),
          el('span', {}, 'Les comptes sont indisponibles pour le moment. Tu peux jouer en invité.'))));
  }

  function render(mode) {
    if (!granAuth.available()) return renderIndisponible();
    if (deletedState) return renderSupprime();
    if (granAuth.user()) return renderConnecte();
    return renderAuth(mode);
  }

  // open() : clic sur le bouton de la console (événement) ; open('signup') ou open('signin') depuis ailleurs.
  function open(arg) {
    statsP = null; // données fraîches à chaque ouverture
    render(arg === 'signup' ? 'signup' : 'signin');
    granUI.openDialog(dlg);
    const t = dlg.querySelector('#compte-titre');
    if (t) t.focus();
  }

  dlg.addEventListener('close', () => {
    deletedState = false;
    granAuth.flushReconnect();
  });

  /* ---------- Page Profil ---------- */
  const P = {
    avatar: document.getElementById('profil-avatar'),
    nom: document.getElementById('profil-nom'),
    annonce: document.getElementById('p-annonce'),
    annonce: document.getElementById('p-annonce'),
    depuis: document.getElementById('profil-depuis'),
    email: document.getElementById('profil-email'),
    root: document.querySelector('section[data-vue="profil"]'),
    global: document.getElementById('p-global'),
    recentes: document.getElementById('p-recentes'),
    form: document.getElementById('profil-form'),
    pseudo: document.getElementById('p-pseudo'),
    pseudoErr: document.getElementById('p-pseudo-err'),
    avatarUrl: document.getElementById('p-avatar'),
    avatarErr: document.getElementById('p-avatar-err'),
    save: document.getElementById('p-enregistrer'),
    statut: document.getElementById('p-statut'),
    logout: document.getElementById('p-deconnexion'),
    del: document.getElementById('p-supprimer'),
    delStatut: document.getElementById('p-suppr-statut'),
    stats: document.getElementById('p-stats'),
    hist: document.getElementById('p-historique'),
    filtre: document.getElementById('p-filtre'),
  };

  function fieldError(input, err, msg) {
    err.hidden = !msg;
    err.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    return !msg;
  }

  function paintProfilHeader() {
    const u = granAuth.user();
    if (!u) return;
    const name = displayName();
    P.nom.textContent = name;
    P.email.textContent = u.email || '';
    paintAvatar(P.avatar, profile && profile.avatar_url, name);
    if (u.created_at) {
      const d = new Date(u.created_at);
      P.depuis.textContent = Number.isNaN(d.getTime()) ? '' : `Joueur depuis ${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
    }
    if (document.activeElement !== P.pseudo) P.pseudo.value = (profile && profile.username) || name;
    if (document.activeElement !== P.avatarUrl) P.avatarUrl.value = (profile && profile.avatar_url) || '';
  }

  const statCell = (label, value) => {
    const dd = el('dd', {}, '0');
    granUI.countUp(dd, Number(value) || 0);
    return el('div', {}, el('dt', {}, label), dd);
  };

  function paintGlobal(rows) {
    if (!rows) { P.global.replaceChildren(); return; }
    const played = rows.reduce((n, r) => n + (r.games_played || 0), 0);
    const wins = rows.reduce((n, r) => n + (r.wins || 0), 0);
    const jeux = rows.filter((r) => r.games_played > 0 && GAMES[r.game]).length;
    if (!played) { P.global.replaceChildren(el('p', { class: 'profil__vide' }, "Aucune partie enregistrée pour l'instant. Joue à Imposteur, Gribouille, Petit Bac, Lyrics ou Karaoké : tes chiffres s'afficheront ici.")); return; }
    P.global.replaceChildren(el('div', { class: 'stat-global' }, el('dl', {},
      statCell('Parties jouées', played), statCell('Victoires', wins), statCell(`Jeux essayés sur ${GAME_IDS.length}`, jeux))));
  }

  function paintStats(rows) {
    if (!rows) {
      P.global.replaceChildren();
      P.stats.replaceChildren(el('p', { class: 'profil__statut profil__statut--erreur', role: 'alert' }, 'Statistiques indisponibles.'));
      return;
    }
    paintGlobal(rows);
    const by = Object.fromEntries(rows.map((r) => [r.game, r]));
    P.stats.replaceChildren(...GAME_IDS.map((id) => {
      const r = by[id] || { games_played: 0, wins: 0, total_score: 0, best_score: 0 };
      return el('div', { class: `stat-jeu stat-jeu--${id}` },
        el('span', { class: 'stat-jeu__nom' }, GAMES[id]),
        el('dl', {}, statCell('Parties', r.games_played), statCell('Victoires', r.wins), statCell('Score total', r.total_score), statCell('Meilleur score', r.best_score)));
    }));
  }

  function paintRecentes() {
    const enAttente = new Set(Array.from(pending).map((e) => e.id));
    const rows = history.filter((r) => !enAttente.has(r.id)).slice(0, 20);
    if (!rows.length) { P.recentes.replaceChildren(el('p', { class: 'profil__vide' }, 'Aucune partie récente.')); return; }
    P.recentes.replaceChildren(el('ol', { class: 'recentes__liste' }, rows.map((r) => el('li', { class: 'recentes__ligne' },
      el('span', { class: `pastille-jeu pastille-jeu--${r.game}`, 'aria-hidden': 'true' }),
      el('span', { class: 'recentes__jeu' }, GAMES[r.game] || r.game),
      resultTag(r),
      el('span', { class: 'historique__score' }, String(r.score)),
      el('time', { class: 'historique__quand', datetime: r.created_at }, new Date(r.created_at).toLocaleDateString('fr-FR'))))));
  }

  const trash = () => svg('<svg aria-hidden="true" viewBox="0 0 10 10" shape-rendering="crispEdges"><path class="illustration-doux" d="M3 0h4v1H3zM1 1h8v1H1zM2 2h6v8H2z"></path><path class="illustration-parchemin" d="M3 3h1v6H3zM6 3h1v6H6z"></path></svg>');

  function resultTag(r) {
    if (r.game === 'karaoke') return el('span', { class: 'tag' }, 'Chanté');
    return r.won ? el('span', { class: 'tag tag--gagne' }, 'Gagné') : el('span', { class: 'tag tag--perdu' }, 'Perdu');
  }

  function paintHistory() {
    const filtre = P.filtre.value;
    const enAttente = new Set(Array.from(pending).map((e) => e.id));
    const rows = history.filter((r) => (!filtre || r.game === filtre) && !enAttente.has(r.id));
    if (!rows.length) { P.hist.replaceChildren(el('p', { class: 'historique__vide' }, filtre ? `Aucune partie de ${GAMES[filtre]} pour l'instant.` : 'Aucune partie.')); return; }
    const th = (t, sr) => el('th', { scope: 'col' }, sr ? el('span', { class: 'sr-only' }, t) : t);
    const body = rows.map((r) => {
      const tr = el('tr', {},
        el('th', { scope: 'row' }, el('span', { class: 'historique__jeu' }, el('span', { class: `pastille-jeu pastille-jeu--${r.game}`, 'aria-hidden': 'true' }), GAMES[r.game] || r.game)),
        el('td', {}, resultTag(r)),
        el('td', { class: 'historique__score' }, String(r.score)),
        el('td', { class: 'historique__quand' }, new Date(r.created_at).toLocaleDateString('fr-FR')),
        el('td', { class: 'historique__action' }));
      tr.lastChild.append(el('button', { type: 'button', class: 'historique__suppr', 'aria-label': `Supprimer cette partie (${GAMES[r.game] || r.game})`, onclick: () => removeGame(r, tr) }, trash()));
      return tr;
    });
    P.hist.replaceChildren(el('table', {},
      el('thead', {}, el('tr', {}, th('Jeu'), th('Résultat'), th('Score'), th('Quand'), th('Actions', true))),
      el('tbody', {}, body)));
  }

  // Suppression sans confirmation : la ligne disparaît, la vraie suppression part après 6 s sauf « Annuler ».
  function removeGame(r, tr) {
    tr.hidden = true;
    const entry = { timer: null, id: r.id };
    entry.commit = async () => {
      clearTimeout(entry.timer);
      pending.delete(entry);
      const u = granAuth.user();
      if (!u) return;
      const { error } = await granAuth.client().from('game_results').delete().eq('id', r.id).eq('user_id', u.id);
      if (error) { tr.hidden = false; granUI.toast('Suppression impossible.', { type: 'erreur' }); return; }
      history = history.filter((x) => x.id !== r.id);
      tr.remove();
      if (profilActive) { getStats(true).then(paintStats); paintRecentes(); if (!history.length) paintHistory(); }
    };
    entry.timer = setTimeout(entry.commit, UNDO_MS);
    pending.add(entry);
    if (profilActive) paintRecentes();
    granUI.toast('Partie supprimée.', {
      duree: UNDO_MS,
      action: { label: 'Annuler', onClick: () => { clearTimeout(entry.timer); pending.delete(entry); tr.hidden = false; if (profilActive) paintRecentes(); } },
    });
  }
  function flushPending() { return Promise.all(Array.from(pending).map((e) => e.commit())); }
  window.addEventListener('pagehide', () => { flushPending(); });

  async function loadHistory() {
    const u = granAuth.user();
    const sb = granAuth.client();
    if (!u || !sb) return;
    const erreur = () => {
      P.hist.replaceChildren(el('p', { class: 'historique__vide profil__statut--erreur', role: 'alert' }, 'Historique indisponible.'));
      P.recentes.replaceChildren(el('p', { class: 'profil__vide profil__statut--erreur', role: 'alert' }, 'Parties récentes indisponibles.'));
    };
    try {
      const { data, error } = await sb.from('game_results')
        .select('id, game, score, won, created_at').eq('user_id', u.id)
        .order('created_at', { ascending: false }).limit(100);
      if (!granAuth.user() || granAuth.user().id !== u.id) return; // changement d'utilisateur pendant la requête
      if (error) { erreur(); return; }
      history = data || [];
      paintHistory();
      paintRecentes();
      P.annonce.textContent = `${history.length} partie${history.length > 1 ? 's' : ''} chargée${history.length > 1 ? 's' : ''}`;
    } catch (_) {
      if (granAuth.user() && granAuth.user().id === u.id) erreur();
    }
  }

  function initProfil() {
    if (!ready) { P.nom.textContent = 'Ton profil'; return; } // la session n'est pas encore connue : onChange rappellera
    if (!granAuth.user()) { granRouter.navigate('/'); open('signin'); return; }
    paintProfilHeader();
    setStatus(P.statut, '');
    setStatus(P.delStatut, '');
    P.global.replaceChildren(el('div', { class: 'skel stat-global' }));
    P.stats.replaceChildren(el('div', { class: 'skel stat-jeu' }));
    P.recentes.replaceChildren(el('p', { class: 'profil__vide' }, 'Chargement…'));
    P.hist.replaceChildren(el('p', { class: 'historique__vide' }, 'Chargement…'));
    P.annonce.textContent = '';
    if (!profile) loadProfile();
    getStats(true).then(paintStats);
    refreshFiche();
    loadHistory();
  }

  P.filtre.addEventListener('change', paintHistory);

  P.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = granAuth.user();
    const sb = granAuth.client();
    if (!u || !sb) return;
    const username = P.pseudo.value.trim();
    const avatarUrl = P.avatarUrl.value.trim();
    const okP = fieldError(P.pseudo, P.pseudoErr, USERNAME_RE.test(username) ? '' : USERNAME_ERR);
    const okA = fieldError(P.avatarUrl, P.avatarErr, !avatarUrl || safeAvatar(avatarUrl) ? '' : "L'avatar doit être une adresse https.");
    if (!okP) return P.pseudo.focus();
    if (!okA) return P.avatarUrl.focus();
    P.save.disabled = true;
    setStatus(P.statut, 'Enregistrement…');
    const { error } = await sb.from('profiles')
      .update({ username, avatar_url: avatarUrl || null, updated_at: new Date().toISOString() })
      .eq('id', u.id);
    P.save.disabled = false;
    if (error) return setStatus(P.statut, error.code === '23505' ? 'Ce pseudo est déjà pris.' : 'Enregistrement impossible.', true);
    profile = { username, avatar_url: avatarUrl || null };
    paintProfilHeader();
    refreshButton();
    refreshFiche();
    setStatus(P.statut, 'Profil mis à jour.');
  });

  P.logout.addEventListener('click', async () => {
    await flushPending();
    const r = await granAuth.signOut();
    if (r.error) setStatus(P.statut, r.error, true);
  });

  // Suppression du compte : appui long de 2 s (confirmation), puis événement serveur account_delete.
  function deleteAccount() {
    P.del.disabled = true;
    setStatus(P.delStatut, 'Suppression en cours');
    let timer = null;
    const done = () => { clearTimeout(timer); socket.off('account_deleted', onOk); socket.off('account_delete_error', onErr); };
    const onOk = async () => {
      done();
      await granAuth.signOut().catch(() => {});
      P.del.disabled = false;
      setStatus(P.delStatut, '');
      deletedState = true;
      open();
    };
    const onErr = (e) => { done(); P.del.disabled = false; setStatus(P.delStatut, (e && e.message) || 'Suppression impossible.'); };
    socket.once('account_deleted', onOk);
    socket.once('account_delete_error', onErr);
    timer = setTimeout(() => onErr({ message: 'Le serveur ne répond pas. Réessaie.' }), 10000);
    socket.emit('account_delete');
  }
  granUI.holdToConfirm(P.del, deleteAccount);

  // Entrée écran vers écran : cascade de 40 ms sur les blocs, rejouée à chaque enter() (vues persistantes).
  function animateEntry() {
    if (!P.root || !granAuth.user()) return;
    P.root.classList.remove('profil--entre');
    void P.root.offsetWidth;
    P.root.classList.add('profil--entre');
  }

  granRouter.register('profil', {
    enter() { profilActive = true; initProfil(); animateEntry(); },
    leave() { profilActive = false; statsP = null; flushPending(); },
  });

  /* ---------- Session ---------- */
  granAuth.onChange(() => {
    const first = !ready;
    ready = true;
    const user = granAuth.user();
    const uid = user ? user.id : null;
    const changed = uid !== lastUid;
    lastUid = uid;
    if (!user) { profile = null; statsP = null; history = []; }
    refreshButton();
    if (!changed && !first) return; // simple renouvellement du jeton : rien à recharger
    statsP = null;
    profile = null; // utilisateur différent : pas de profil de l'ancien
    history = [];
    refreshButton();
    refreshFiche();
    if (user) loadProfile();
    if (dlg.open) render();
    if (profilActive) {
      if (user) { initProfil(); if (first) animateEntry(); } else { granRouter.navigate('/'); }
    }
  });

  btn.addEventListener('click', () => open());
  document.getElementById('fiche-creer').addEventListener('click', () => open('signup'));
  document.getElementById('fiche-connexion').addEventListener('click', () => open('signin'));
  refreshButton();
  refreshFiche();

  return { open, refreshButton };
})();
