// Authentification (Supabase) + création du socket. Le compte est optionnel : sans session, le socket est invité.
// Expose la globale granAuth. Le jeton est relu à chaque (re)connexion via auth: (cb) => cb({ token }).
const granAuth = (() => {
  let token = null;
  let session = null;
  let sb = null;
  let lastUserId = null;
  let pendingReconnect = false;
  let refreshing = false;
  const listeners = [];

  const socket = io(GRAN_BACKEND, { autoConnect: false, auth: (cb) => cb({ token }) });
  window.socket = socket;

  function inGame() {
    if (typeof currentRoomId !== 'undefined' && currentRoomId) return true;
    return typeof kk !== 'undefined' && !!kk.roomId;
  }

  // Nouveau handshake (nouvelle identité) : jamais pendant une partie, différé jusqu'au retour au menu.
  function reconnect() {
    if (inGame()) { pendingReconnect = true; return; }
    pendingReconnect = false;
    if (socket.connected) socket.disconnect();
    socket.connect();
  }

  function onSession(s) {
    session = s || null;
    token = session ? session.access_token : null;
    const uid = session ? session.user.id : null;
    const changed = uid !== lastUserId;
    lastUserId = uid;
    listeners.forEach((fn) => { try { fn(session); } catch (e) { console.error(e); } });
    return changed;
  }

  if (window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(GRAN_SUPABASE_URL, GRAN_SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    sb.auth.onAuthStateChange((event, s) => {
      // Le callback ne doit pas appeler d'API supabase de façon synchrone : on décale.
      setTimeout(() => {
        const changed = onSession(s);
        if (event !== 'INITIAL_SESSION' && changed) reconnect();
      }, 0);
    });
    // getSession limité à ~3 s : au-delà (ou en cas d'échec) on se connecte en invité.
    const sessionP = sb.auth.getSession().then(({ data }) => { onSession(data.session); });
    const timeoutP = new Promise((resolve) => setTimeout(resolve, 3000));
    Promise.race([sessionP, timeoutP]).catch(() => {}).finally(() => socket.connect());
  } else {
    socket.connect(); // CDN indisponible : on joue en invité
  }

  socket.on('auth_error', () => {
    // Jeton refusé par le serveur : on retombe en invité côté serveur ; on tente un rafraîchissement.
    // Garde : une seule tentative à la fois, et seulement si le jeton a réellement changé (pas de boucle).
    if (!sb || refreshing) return;
    refreshing = true;
    const rejected = token;
    sb.auth.refreshSession()
      .then(({ data, error }) => {
        if (error || !data || !data.session || data.session.access_token === rejected) return;
        onSession(data.session);
        reconnect(); // même uid : on force le nouveau handshake ; reporté si une partie est en cours
      })
      .catch(() => {})
      .finally(() => { refreshing = false; });
  });

  const fail = (error) => (error ? { error: error.message || 'Erreur' } : {});
  const redirectTo = () => location.origin + location.pathname;

  return {
    available: () => !!sb,
    client: () => sb,
    session: () => session,
    user: () => (session ? session.user : null),
    onChange(fn) { listeners.push(fn); },
    inGame,
    // À appeler au retour au menu pour appliquer un changement de compte reporté.
    flushReconnect() { if (pendingReconnect && !inGame()) reconnect(); },
    async signUp(email, password, username) {
      if (!sb) return { error: 'Comptes indisponibles.' };
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { username }, emailRedirectTo: redirectTo() },
      });
      if (error) return fail(error);
      return { needsConfirm: !data.session };
    },
    async resend(email) {
      if (!sb) return { error: 'Comptes indisponibles.' };
      const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo() } });
      return fail(error);
    },
    async signIn(email, password) {
      if (!sb) return { error: 'Comptes indisponibles.' };
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return fail(error);
    },
    async signInOAuth(provider) {
      if (provider !== 'discord') return { error: 'Fournisseur non pris en charge.' };
      if (!sb) return { error: 'Comptes indisponibles.' };
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
      return fail(error);
    },
    async signOut() {
      if (!sb) return {};
      const { error } = await sb.auth.signOut();
      return fail(error);
    },
  };
})();
