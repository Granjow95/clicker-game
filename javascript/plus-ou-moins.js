// Plus ou Moins : écrans seulement (départ, jeu, fin) sur données fictives (demo-data.js).
// Aucun socket, aucun appel réseau : le record personnel est gardé dans le localStorage du navigateur.
(() => {
  const $ = (id) => document.getElementById(id);
  const root = () => document.querySelector('[data-vue="plus-ou-moins"]');

  // Paires consécutives de chaque thème ; l'ordre des duels est mélangé à chaque partie (lancer).
  const paires = DEMO_POM_THEMES.flatMap((t) => t.items.slice(0, -1).map((a, i) => ({ theme: t, a, b: t.items[i + 1] })));
  const CLE_RECORD = 'granGames:pom-record';
  const lireRecord = () => {
    try {
      const v = parseInt(localStorage.getItem(CLE_RECORD), 10);
      return Number.isFinite(v) && v > DEMO_POM_RECORD ? Math.min(v, 1000) : DEMO_POM_RECORD;
    } catch { return DEMO_POM_RECORD; }
  };
  const ecrireRecord = (v) => { try { localStorage.setItem(CLE_RECORD, String(v)); } catch { /* stockage indisponible */ } };
  let record = lireRecord();
  let serie = 0;
  let index = 0;
  let verrou = false;
  let timer = null;
  let session = 0; // change à chaque sortie de la vue : ignore les réponses en vol

  function montrer(nom) {
    root().querySelectorAll('[data-ecran]').forEach((s) => {
      const actif = s.dataset.ecran === nom;
      s.hidden = !actif;
      if (actif) { s.classList.remove('ecran'); void s.offsetWidth; s.classList.add('ecran'); }
    });
    const h = root().querySelector(`[data-ecran="${nom}"] h1`);
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  const fmt = (v, unite) => `${v.toLocaleString('fr-FR')} ${unite}`;

  function remplir(panneau, theme, item, valeur) {
    panneau.querySelector('[data-champ="cat"]').textContent = theme.categorie;
    panneau.querySelector('[data-champ="nom"]').textContent = item.nom;
    const v = panneau.querySelector('[data-champ="valeur"]');
    v.textContent = valeur ? fmt(item.valeur, theme.unite) : `? ${theme.unite}`;
    const src = panneau.querySelector('[data-champ="source"]');
    if (src) src.textContent = `Source : ${DEMO_POM_SOURCE}`;
  }

  function afficherDuel() {
    const { theme, a, b } = paires[index % paires.length];
    const duel = $('pom-duel');
    duel.classList.remove('glisse');
    $('pom-annonce').textContent = '';
    ['pom-a', 'pom-b'].forEach((id) => $(id).classList.remove('juste', 'faux'));
    $('pom-question').textContent = theme.question;
    remplir($('pom-a'), theme, a, true);
    remplir($('pom-b'), theme, b, false);
    $('pom-plus').querySelector('[data-champ="plus"]').textContent = theme.plus;
    $('pom-moins').querySelector('[data-champ="moins"]').textContent = theme.moins;
    $('pom-serie').textContent = `Série ${serie}`;
    $('pom-record-jeu').textContent = record;
    if (!granUI.reducedMotion()) { void duel.offsetWidth; duel.classList.add('glisse'); }
    verrou = false;
  }

  function lancer() {
    serie = 0;
    index = 0;
    montrer('jeu');
    afficherDuel();
  }

  async function repondre(choix) {
    if (verrou) return;
    verrou = true;
    const mienne = session;
    const { theme, a, b } = paires[index % paires.length];
    const juste = (b.valeur > a.valeur) === (choix === 'plus');
    const label = choix === 'plus' ? theme.plus : theme.moins;
    await granUI.countUp($('pom-b').querySelector('[data-champ="valeur"]'), b.valeur, { format: (n) => fmt(n, theme.unite) });
    if (mienne !== session) return;
    $('pom-b').classList.add(juste ? 'juste' : 'faux');
    $('pom-annonce').textContent = juste ? 'Juste.' : 'Faux.';
    timer = setTimeout(() => {
      if (juste) { serie += 1; index += 1; afficherDuel(); } else finir(theme, a, b, label);
    }, granUI.reducedMotion() ? 600 : 900);
  }

  function finir(theme, a, b, label) {
    const battu = serie > record;
    const ancien = record;
    if (battu) { record = serie; ecrireRecord(record); }
    $('pom-fin-titre').textContent = `La série s'arrête à ${serie}`;
    $('pom-explication').replaceChildren(
      `${b.nom} fait `, granUI.el('b', {}, fmt(b.valeur, theme.unite)), `. Tu as dit « ${label.toLowerCase()} » que ${a.nom}.`);
    $('pom-fin-serie').textContent = serie;
    $('pom-fin-record').textContent = record;
    const ancienNode = $('pom-fin-ancien');
    ancienNode.hidden = !battu;
    ancienNode.textContent = battu ? ancien : '';
    $('pom-fin-record-bloc').classList.toggle('pom__case--or', battu);
    $('pom-note-record').hidden = !battu;
    montrer('fin');
    $('pom-record-depart').textContent = record;
  }

  function onKey(e) {
    const jeu = root().querySelector('[data-ecran="jeu"]');
    if (!jeu || jeu.hidden) return;
    if (e.repeat) return;
    if (document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); repondre('plus'); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); repondre('moins'); }
  }

  $('pom-lancer').addEventListener('click', lancer);
  $('pom-rejouer').addEventListener('click', lancer);
  $('pom-plus').addEventListener('click', () => repondre('plus'));
  $('pom-moins').addEventListener('click', () => repondre('moins'));

  granRouter.register('plus-ou-moins', {
    enter() {
      document.addEventListener('keydown', onKey);
      record = lireRecord();
      $('pom-record-depart').textContent = record;
      montrer('depart');
    },
    leave() {
      document.removeEventListener('keydown', onKey);
      clearTimeout(timer);
      session += 1;
      verrou = false;
    },
  });
})();
