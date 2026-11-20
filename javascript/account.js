// Interface de compte : connexion / inscription, profil, historique, suppression du compte.
// Dépend de granAuth (auth.js), socket et esc() (imposteur.js). Texte dynamique : textContent ou esc().
const granAccount = (() => {
  const GAMES = { imposteur: 'Imposteur', lyrics: 'Lyrics', karaoke: 'Karaoké' };
  const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
  let dlg = null;
  let body = null;
  let opener = null;

  function el(tag, props = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && n.append(c));
    return n;
  }

  function field(id, label, props) {
    return el('div', { class: 'acc-field' },
      el('label', { for: id, text: label }),
      el('input', { id, ...props }));
  }

  function status(text, kind) {
    const s = el('p', { class: `acc-status${kind ? ' acc-' + kind : ''}`, role: kind === 'error' ? 'alert' : 'status', text: text || '' });
    return s;
  }

  function setStatus(node, text, kind) {
    node.textContent = text || '';
    node.className = `acc-status${kind ? ' acc-' + kind : ''}`;
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }

  function safeAvatar(url) {
    try { const u = new URL(url); return u.protocol === 'https:' ? u.href : null; } catch (_) { return null; }
  }

  function avatar(url, name) {
    const safe = url && safeAvatar(url);
    if (safe) return el('img', { class: 'acc-avatar', src: safe, alt: '', referrerpolicy: 'no-referrer', width: 56, height: 56 });
    return el('span', { class: 'acc-avatar acc-avatar-fallback', 'aria-hidden': 'true', text: (name || '?').charAt(0).toUpperCase() });
  }

  function ensureDialog() {
    if (dlg) return;
    body = el('div', { class: 'acc-body' });
    const close = el('button', { type: 'button', class: 'acc-close', 'aria-label': 'Fermer', text: '✖', onclick: () => dlg.close() });
    dlg = el('dialog', { class: 'acc-dialog', 'aria-labelledby': 'acc-title' }, close, body);
    dlg.addEventListener('close', () => {
      if (opener && document.contains(opener)) opener.focus();
      granAuth.flushReconnect();
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
  }

  function setView(...nodes) {
    body.replaceChildren(...nodes);
    const t = body.querySelector('#acc-title');
    if (t) t.focus();
  }

  const title = (text) => el('h2', { id: 'acc-title', class: 'acc-title', tabindex: '-1', text });

  /* ---------- Connexion / inscription ---------- */
  function renderAuth(mode = 'signin') {
    const signup = mode === 'signup';
    const st = status('');
    const form = el('form', { class: 'acc-form', novalidate: true },
      signup && field('acc-username', 'Pseudo (3 à 20 lettres, chiffres ou _)', { type: 'text', maxlength: '20', autocomplete: 'username', required: true }),
      field('acc-email', 'Email', { type: 'email', autocomplete: 'email', required: true }),
      field('acc-password', 'Mot de passe', { type: 'password', autocomplete: signup ? 'new-password' : 'current-password', minlength: '8', required: true }),
      el('button', { type: 'submit', class: 'acc-btn acc-primary', text: signup ? 'Créer mon compte' : 'Se connecter' }),
      st);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector('#acc-email').value.trim();
      const password = form.querySelector('#acc-password').value;
      const username = signup ? form.querySelector('#acc-username').value.trim() : '';
      if (!email || !password) return setStatus(st, 'Email et mot de passe requis.', 'error');
      if (signup && !USERNAME_RE.test(username)) return setStatus(st, 'Pseudo invalide : 3 à 20 lettres, chiffres ou _.', 'error');
      if (signup && password.length < 8) return setStatus(st, 'Mot de passe : 8 caractères minimum.', 'error');
      const submit = form.querySelector('button[type=submit]');
      submit.disabled = true;
      setStatus(st, 'Un instant…');
      const r = signup ? await granAuth.signUp(email, password, username) : await granAuth.signIn(email, password);
      submit.disabled = false;
      if (r.error) return setStatus(st, r.error, 'error');
      if (r.needsConfirm) return setStatus(st, 'Compte créé. Vérifie ta boîte mail pour confirmer ton adresse.', 'ok');
      // La suite (profil) est affichée par granAuth.onChange
    });

    const oauth = (provider, label) => el('button', {
      type: 'button', class: 'acc-btn acc-oauth',
      onclick: async () => { const r = await granAuth.signInOAuth(provider); if (r.error) setStatus(st, r.error, 'error'); },
      text: label,
    });
    setView(
      title(signup ? 'Créer un compte' : 'Connexion'),
      el('p', { class: 'acc-hint', text: 'Le compte est facultatif : sans lui, tu joues toujours avec un pseudo.' }),
      form,
      el('div', { class: 'acc-sep', role: 'separator', text: 'ou' }),
      el('div', { class: 'acc-oauth-row' }, oauth('google', 'Continuer avec Google'), oauth('discord', 'Continuer avec Discord')),
      el('button', { type: 'button', class: 'acc-link', onclick: () => renderAuth(signup ? 'signin' : 'signup'),
        text: signup ? 'J\'ai déjà un compte' : 'Pas de compte ? Créer un compte' }),
    );
  }

  /* ---------- Profil ---------- */
  async function renderProfile() {
    const user = granAuth.user();
    const sb = granAuth.client();
    if (!user || !sb) return renderAuth();
    const st = status('');
    const statsBox = el('div', { class: 'acc-stats', 'aria-live': 'polite' }, el('p', { class: 'acc-hint', text: 'Chargement…' }));
    const histBox = el('div', { class: 'acc-history', 'aria-live': 'polite' });
    const nameLabel = el('p', { class: 'acc-name', text: '…' });
    const avatarBox = el('div', { class: 'acc-avatar-box' }, avatar(null, '?'));

    const form = el('form', { class: 'acc-form', novalidate: true },
      field('acc-p-username', 'Pseudo (3 à 20 lettres, chiffres ou _)', { type: 'text', maxlength: '20', autocomplete: 'nickname', required: true }),
      field('acc-p-avatar', 'Avatar (adresse https d\'une image)', { type: 'url', inputmode: 'url', maxlength: '500', placeholder: 'https://…' }),
      el('button', { type: 'submit', class: 'acc-btn acc-primary', text: 'Enregistrer' }),
      st);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = form.querySelector('#acc-p-username').value.trim();
      const avatarUrl = form.querySelector('#acc-p-avatar').value.trim();
      if (!USERNAME_RE.test(username)) return setStatus(st, 'Pseudo invalide : 3 à 20 lettres, chiffres ou _.', 'error');
      if (avatarUrl && !safeAvatar(avatarUrl)) return setStatus(st, 'L\'avatar doit être une adresse https.', 'error');
      setStatus(st, 'Enregistrement…');
      const { error } = await sb.from('profiles')
        .update({ username, avatar_url: avatarUrl || null, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) return setStatus(st, error.code === '23505' ? 'Ce pseudo est déjà pris.' : 'Enregistrement impossible.', 'error');
      nameLabel.textContent = username;
      avatarBox.replaceChildren(avatar(avatarUrl, username));
      setStatus(st, 'Profil mis à jour.', 'ok');
    });

    const delSt = status('');
    const delBtn = el('button', { type: 'button', class: 'acc-btn acc-danger', text: 'Supprimer mon compte', onclick: () => confirmDelete(delSt, delBtn) });

    setView(
      title('Mon compte'),
      el('div', { class: 'acc-head' }, avatarBox, el('div', {}, nameLabel, el('p', { class: 'acc-hint', text: user.email || '' }))),
      form,
      el('h3', { class: 'acc-sub', text: 'Statistiques' }), statsBox,
      el('h3', { class: 'acc-sub', text: 'Dernières parties' }), histBox,
      el('div', { class: 'acc-actions' },
        el('button', { type: 'button', class: 'acc-btn', text: 'Se déconnecter', onclick: async () => {
          const r = await granAuth.signOut(); if (r.error) setStatus(st, r.error, 'error');
        } }),
        delBtn),
      delSt,
    );

    const { data: prof } = await sb.from('profiles').select('username, avatar_url').eq('id', user.id).maybeSingle();
    if (prof) {
      nameLabel.textContent = prof.username;
      form.querySelector('#acc-p-username').value = prof.username || '';
      form.querySelector('#acc-p-avatar').value = prof.avatar_url || '';
      avatarBox.replaceChildren(avatar(prof.avatar_url, prof.username));
    } else {
      nameLabel.textContent = 'Joueur';
    }
    loadStats(statsBox);
    loadHistory(histBox);
  }

  async function loadStats(box) {
    const { data, error } = await granAuth.client().from('player_stats').select('*').eq('user_id', granAuth.user().id);
    if (error) return box.replaceChildren(el('p', { class: 'acc-status acc-error', text: 'Statistiques indisponibles.' }));
    if (!data || !data.length) return box.replaceChildren(el('p', { class: 'acc-hint', text: 'Pas encore de partie enregistrée.' }));
    const head = el('tr', {}, ...['Jeu', 'Parties', 'Victoires', 'Meilleur'].map((t) => el('th', { scope: 'col', text: t })));
    const rows = data.map((r) => el('tr', {},
      el('th', { scope: 'row', text: GAMES[r.game] || r.game }),
      el('td', { text: String(r.games_played) }), el('td', { text: String(r.wins) }), el('td', { text: String(r.best_score) })));
    box.replaceChildren(el('table', { class: 'acc-table' }, el('caption', { class: 'acc-sr', text: 'Statistiques par jeu' }), el('thead', {}, head), el('tbody', {}, rows)));
  }

  async function loadHistory(box) {
    const { data, error } = await granAuth.client().from('game_results')
      .select('id, game, score, won, created_at').eq('user_id', granAuth.user().id)
      .order('created_at', { ascending: false }).limit(20);
    if (error) return box.replaceChildren(el('p', { class: 'acc-status acc-error', text: 'Historique indisponible.' }));
    if (!data || !data.length) return box.replaceChildren(el('p', { class: 'acc-hint', text: 'Aucune partie.' }));
    const list = el('ul', { class: 'acc-list' });
    data.forEach((r) => {
      const label = `${GAMES[r.game] || r.game} · ${r.score} pts · ${r.won ? 'gagnée' : 'perdue'} · ${new Date(r.created_at).toLocaleDateString('fr-FR')}`;
      const btn = el('button', { type: 'button', class: 'acc-mini', 'aria-label': `Supprimer la partie : ${label}`, text: '🗑',
        onclick: async () => {
          btn.disabled = true;
          const { error: e } = await granAuth.client().from('game_results').delete().eq('id', r.id).eq('user_id', granAuth.user().id);
          if (e) { btn.disabled = false; return showToast('Suppression impossible.'); }
          loadStats(document.querySelector('.acc-stats'));
          loadHistory(box);
        } });
      list.append(el('li', {}, el('span', { text: label }), btn));
    });
    box.replaceChildren(list);
  }

  /* ---------- Suppression du compte ---------- */
  function confirmDelete(st, btn) {
    const yes = el('button', { type: 'button', class: 'acc-btn acc-danger', text: 'Oui, supprimer définitivement' });
    const no = el('button', { type: 'button', class: 'acc-btn', text: 'Annuler', onclick: () => { box.remove(); btn.disabled = false; btn.focus(); } });
    const box = el('div', { class: 'acc-confirm', role: 'alertdialog', 'aria-label': 'Confirmer la suppression du compte' },
      el('p', { text: 'Ton compte, ton profil et tout ton historique seront supprimés. Cette action est irréversible.' }), yes, no);
    btn.disabled = true;
    st.before(box);
    no.focus();
    yes.addEventListener('click', () => {
      yes.disabled = no.disabled = true;
      setStatus(st, 'Suppression…');
      let timer = null;
      const done = () => { clearTimeout(timer); socket.off('account_deleted', onOk); socket.off('account_delete_error', onErr); };
      const onOk = async () => {
        done();
        await granAuth.signOut().catch(() => {});
        showToast('Compte supprimé.', false);
        dlg.close();
      };
      const onErr = (e) => { done(); box.remove(); btn.disabled = false; setStatus(st, (e && e.message) || 'Suppression impossible.', 'error'); };
      socket.once('account_deleted', onOk);
      socket.once('account_delete_error', onErr);
      timer = setTimeout(() => onErr({ message: 'Le serveur ne répond pas. Réessaie.' }), 10000);
      socket.emit('account_delete');
    });
  }

  /* ---------- Ouverture ---------- */
  function render() {
    if (!granAuth.available()) {
      return setView(title('Compte'), el('p', { class: 'acc-status acc-error', text: 'Les comptes sont indisponibles pour le moment. Tu peux jouer en invité.' }));
    }
    if (granAuth.user()) renderProfile(); else renderAuth();
  }

  function open(e) {
    ensureDialog();
    opener = (e && e.currentTarget) || document.getElementById('account-btn');
    render();
    if (!dlg.open) dlg.showModal();
  }

  function refreshButton() {
    const b = document.getElementById('account-btn');
    if (!b) return;
    const u = granAuth.user();
    b.textContent = u ? '👤 Mon compte' : '👤 Connexion';
    b.setAttribute('aria-label', u ? 'Mon compte' : 'Connexion ou inscription');
  }

  granAuth.onChange(() => { refreshButton(); if (dlg && dlg.open) render(); });
  document.getElementById('account-btn').addEventListener('click', open);
  refreshButton();

  return { open };
})();
