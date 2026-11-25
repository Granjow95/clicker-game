// Écran d'entrée de salle commun (Imposteur, Gribouille, Petit Bac). Globale : granSalle.
// granSalle.mount(container, { prefix, titre, intro, jeuLabel, onCreate(username), onJoin(code, username), onResume(entry), onForget() })
//   -> { setCode(code), showError(field, message), setBusy(bool), refreshResume(), focus() }
// field : 'pseudo' | 'code' | 'general'. Tout texte passe par granUI.el / textContent (aucun innerHTML).
const granSalle = (() => {
  const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;
  const CLE_PSEUDO = 'granGames:pseudo';
  const MSG_CODE = 'Un code fait 4 lettres, sans voyelles.';
  const MSG_PSEUDO = 'Il te faut un pseudo pour entrer.';

  const lirePseudo = () => {
    try { const v = localStorage.getItem(CLE_PSEUDO); if (v) return v; } catch { /* stockage indisponible */ }
    try {
      const u = typeof granAuth !== 'undefined' && granAuth.user ? granAuth.user() : null;
      const m = u && u.user_metadata;
      const nom = m && (m.username || m.name);
      if (typeof nom === 'string') return nom.slice(0, 20);
    } catch { /* compte indisponible */ }
    return '';
  };
  const memoriserPseudo = (v) => { try { localStorage.setItem(CLE_PSEUDO, v); } catch { /* stockage indisponible */ } };
  const normaliserCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  function mount(container, opts) {
    const { prefix, titre, intro, jeuLabel, onCreate, onJoin, onResume, onForget } = opts;
    const el = granUI.el;
    const id = (s) => `es-${prefix}-${s}`;

    const h1 = el('h1', { id: id('titre'), class: 'entree-salle__titre' }, titre);
    const pIntro = el('p', { class: 'entree-salle__intro' }, intro || '');
    const repriseTexte = el('p');
    const btnReprendre = el('button', { class: 'key key--principal', type: 'button' }, 'Reprendre la partie');
    const btnOubli = el('button', { class: 'key key--fantome', type: 'button' }, 'Non, quitter');
    const reprise = el('div', { class: 'entree-salle__reprise px', hidden: true }, repriseTexte,
      el('div', { class: 'entree-salle__reprise-actions' }, btnReprendre, btnOubli));

    const inPseudo = el('input', { class: 'field__input', id: id('pseudo'), maxlength: 20, autocomplete: 'off', 'aria-describedby': id('pseudo-err') });
    const errPseudo = el('p', { class: 'field__erreur', id: id('pseudo-err'), role: 'alert', hidden: true });
    const btnCreer = el('button', { class: 'key key--principal key--bloc', type: 'button' }, 'Créer une salle');

    const inCode = el('input', {
      class: 'field__input field__input--code', id: id('code'), maxlength: 4, placeholder: 'KRAB',
      autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-describedby': id('code-err'),
    });
    const errCode = el('p', { class: 'field__erreur', id: id('code-err'), role: 'alert', hidden: true });
    const btnRejoindre = el('button', { class: 'key key--sombre key--bloc', type: 'submit' }, 'Rejoindre avec un code');
    const form = el('form', { class: 'entree-salle__rejoindre', novalidate: true },
      el('div', { class: 'field' }, el('label', { class: 'field__label', for: id('code') }, 'Code de salle'), inCode, errCode),
      btnRejoindre);
    const errGeneral = el('p', { class: 'field__erreur entree-salle__erreur', role: 'alert', hidden: true });

    const root = el('section', { class: 'entree-salle ecran', 'aria-labelledby': id('titre') },
      h1, pIntro, reprise,
      el('div', { class: 'field' }, el('label', { class: 'field__label', for: id('pseudo') }, 'Ton pseudo'), inPseudo, errPseudo),
      btnCreer,
      el('p', { class: 'entree-salle__ou' }, 'ou'),
      form, errGeneral);
    container.replaceChildren(root);
    inPseudo.value = lirePseudo();

    const champs = { pseudo: [inPseudo, errPseudo], code: [inCode, errCode], general: [null, errGeneral] };
    function showError(field, message) {
      const [input, err] = champs[field] || champs.general;
      err.textContent = message || '';
      err.hidden = !message;
      if (input) { if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    }
    const clearErrors = () => ['pseudo', 'code', 'general'].forEach((f) => showError(f, ''));

    function pseudoValide() {
      const v = inPseudo.value.trim().slice(0, 20);
      if (!v) { showError('pseudo', MSG_PSEUDO); inPseudo.focus(); granUI.shake(inPseudo); return null; }
      memoriserPseudo(v);
      return v;
    }

    inCode.addEventListener('input', () => {
      const n = normaliserCode(inCode.value);
      if (n !== inCode.value) inCode.value = n;
      showError('code', '');
    });
    inPseudo.addEventListener('input', () => showError('pseudo', ''));

    btnCreer.addEventListener('click', () => {
      clearErrors();
      const pseudo = pseudoValide();
      if (pseudo) onCreate(pseudo);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErrors();
      const pseudo = pseudoValide();
      if (!pseudo) return;
      const code = normaliserCode(inCode.value);
      if (!CODE_RE.test(code)) { showError('code', MSG_CODE); inCode.focus(); granUI.shake(inCode); return; }
      onJoin(code, pseudo);
    });
    btnReprendre.addEventListener('click', () => {
      const entry = granReprise.get(prefix);
      if (entry && onResume) onResume(entry); else refreshResume();
    });
    btnOubli.addEventListener('click', () => {
      granReprise.clear(prefix);
      if (onForget) onForget();
      refreshResume();
      btnCreer.focus();
    });

    // Un seul bouton principal : « Reprendre la partie » s'il existe, sinon « Créer une salle ».
    function refreshResume() {
      const entry = granReprise.get(prefix);
      const etaitVisible = !reprise.hidden;
      reprise.hidden = !entry;
      btnCreer.classList.toggle('key--principal', !entry);
      btnCreer.classList.toggle('key--secondaire', !!entry);
      if (entry) {
        repriseTexte.replaceChildren(`Ta partie${jeuLabel ? ` de ${jeuLabel}` : ''} t'attend dans la salle `, el('strong', {}, entry.code), '.');
        if (!etaitVisible && container.offsetParent !== null) btnReprendre.focus();
      }
    }
    refreshResume();

    return {
      setCode(code) { inCode.value = normaliserCode(code); showError('code', ''); },
      showError,
      setBusy(busy) {
        root.setAttribute('aria-busy', busy ? 'true' : 'false');
        [btnCreer, btnRejoindre, btnReprendre, btnOubli].forEach((b) => { b.disabled = !!busy; });
      },
      refreshResume,
      focus() {
        if (!reprise.hidden) btnReprendre.focus();
        else if (!inPseudo.value) inPseudo.focus();
        else if (!inCode.value) btnCreer.focus();
        else inCode.focus();
      },
    };
  }

  return { mount };
})();
