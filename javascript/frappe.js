// Course de frappe : écrans seulement (départ, compte à rebours, course, résultats) sur données fictives.
// Aucun socket, aucun appel réseau : les autres voitures avancent selon DEMO_FRAPPE_JOUEURS.
// La frappe ne déclenche aucune animation : seules les couleurs des lettres changent.
(() => {
  const $ = (id) => document.getElementById(id);
  const root = () => document.querySelector('[data-vue="frappe"]');
  const el = granUI.el;

  let mode = 'salle';
  let moiPret = false;
  let phraseIdx = 0;
  let phrase = '';
  let joueurs = [];
  let timers = []; // setTimeout / setInterval à purger dans leave()
  let debut = 0;
  let frappes = 0;
  let fautes = 0;
  let avant = '';
  let fini = false;

  const clearTimers = () => { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = []; };

  function montrer(nom) {
    root().querySelectorAll('[data-ecran]').forEach((s) => {
      const actif = s.dataset.ecran === nom;
      s.hidden = !actif;
      if (actif) { s.classList.remove('ecran'); void s.offsetWidth; s.classList.add('ecran'); }
    });
    const h = root().querySelector(`[data-ecran="${nom}"] h1`);
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  const liste = () => (mode === 'solo' ? DEMO_FRAPPE_JOUEURS.filter((j) => j.moi) : DEMO_FRAPPE_JOUEURS);
  const moiNom = () => DEMO_FRAPPE_JOUEURS.find((j) => j.moi).nom;
  const rang = (n) => (n === 1 ? '1er' : `${n}e`);

  /* ---------- Ligne de départ ---------- */
  function statut(j) {
    const pret = j.moi ? moiPret : j.pret;
    if (j.hote) return { texte: pret ? 'Hôte, prête' : 'Hôte', classe: 'badge--hote' };
    if (j.moi) return { texte: pret ? 'Prêt' : 'Pas prêt', classe: pret ? 'badge--pret' : 'badge--absent' };
    return { texte: pret ? (j.nom === 'Léa' ? 'Prête' : 'Prêt') : 'Pas prêt', classe: pret ? 'badge--pret' : 'badge--absent' };
  }

  function rendreDepart() {
    $('fra-couloirs').replaceChildren(...liste().map((j, i) => {
      const s = statut(j);
      return el('li', {},
        el('span', { class: 'couloirs__num' }, i + 1),
        el('span', { class: `joueur__avatar c-${(DEMO_FRAPPE_JOUEURS.indexOf(j) % 5) + 1}`, 'aria-hidden': 'true' }, j.nom[0]),
        el('span', { class: 'couloirs__nom' }, j.moi ? `${j.nom} (toi)` : j.nom),
        el('span', { class: `badge ${s.classe}` }, s.texte));
    }));
    ['solo', 'salle'].forEach((m) => $(`fra-tab-${m}`).setAttribute('aria-selected', String(m === mode)));
    $('fra-code-bloc').hidden = mode === 'solo';
    $('fra-aide').textContent = mode === 'solo' ? 'Tu pars quand tu es prêt.' : 'Départ automatique quand tout le monde est prêt.';
    const bouton = $('fra-pret');
    bouton.textContent = moiPret ? 'Prêt, on attend les autres' : 'Je suis prêt';
    bouton.setAttribute('aria-pressed', String(moiPret));
  }

  function choisirMode(m) {
    clearTimers(); // annule un décompte déjà programmé par pret()
    mode = m;
    moiPret = false;
    rendreDepart();
  }

  function pret() {
    if (moiPret) return;
    moiPret = true;
    rendreDepart();
    timers.push(setTimeout(decompte, 700));
  }

  /* ---------- Compte à rebours ---------- */
  function decompte() {
    montrer('decompte');
    const feux = [...$('fra-feux').children];
    const chiffre = $('fra-chiffre');
    $('fra-feux').classList.remove('vert');
    let n = 3;
    const maj = () => {
      chiffre.textContent = n;
      chiffre.classList.remove('decompte--pop'); void chiffre.offsetWidth; chiffre.classList.add('decompte--pop'); // 400 ms
      feux.forEach((f, i) => f.classList.toggle('on', i < 4 - n));
    };
    maj();
    const t = setInterval(() => {
      n -= 1;
      if (n > 0) { maj(); return; }
      clearInterval(t);
      feux.forEach((f) => f.classList.remove('on'));
      $('fra-feux').classList.add('vert');
      timers.push(setTimeout(course, 400));
    }, 1000);
    timers.push(t);
  }

  /* ---------- Course ---------- */
  function piste() {
    $('fra-piste').replaceChildren(...liste().map((j, i) => {
      const c = DEMO_FRAPPE_JOUEURS.indexOf(j) % 5 + 1;
      const pct = el('span', { class: 'piste__pct', 'data-pct': j.nom }, '0 %');
      return el('div', { class: 'piste__couloir', 'data-nom': j.nom },
        el('span', { class: 'piste__num', 'aria-hidden': 'true' }, i + 1),
        el('div', { class: 'piste__rail' },
          el('span', { class: `piste__voiture c-${c}${j.moi ? ' piste__voiture--moi' : ''}`, 'data-voiture': j.nom },
            el('span', { class: 'piste__initiale', 'aria-hidden': 'true' }, j.nom[0]), j.moi ? 'Toi' : j.nom, pct)),
        el('span', { class: 'piste__arrivee damier-course', 'aria-hidden': 'true' }));
    }));
  }

  function avancer(nom, p) {
    const v = $('fra-piste').querySelector(`[data-voiture="${nom}"]`);
    if (!v) return;
    v.style.setProperty('--avance', `${Math.round(p * 100)}%`);
    v.querySelector('.piste__pct').textContent = `${Math.round(p * 100)} %`;
  }

  function rendrePhrase(valeur) {
    let erreur = false;
    const spans = [...phrase].map((car, i) => {
      let classe = 'reste';
      if (i < valeur.length) {
        if (!erreur && valeur[i] === car) classe = 'ok'; else { erreur = true; classe = 'faute'; }
      } else if (i === valeur.length) classe = 'curseur';
      return el('span', { class: classe }, car);
    });
    $('fra-phrase').replaceChildren(...spans);
    return erreur ? [...phrase].findIndex((c, i) => valeur[i] !== c) : valeur.length; // caractères justes consécutifs
  }

  const tempsBot = (j) => (j.mpm ? (phrase.length * 12) / j.mpm : Infinity); // 5 caractères = 1 mot

  function course() {
    phrase = DEMO_FRAPPE_PHRASES[phraseIdx % DEMO_FRAPPE_PHRASES.length];
    phraseIdx += 1;
    fini = false;
    frappes = 0; fautes = 0; avant = '';
    $('fra-mpm').textContent = '0';
    $('fra-precision').textContent = '100';
    $('fra-position').textContent = '1er';
    piste();
    rendrePhrase('');
    montrer('course');
    const saisie = $('fra-saisie');
    saisie.value = '';
    saisie.setAttribute('maxlength', String(phrase.length));
    saisie.focus();
    debut = performance.now();
    // Voitures fictives : progression linéaire d'après leur vitesse
    timers.push(setInterval(() => {
      const s = (performance.now() - debut) / 1000;
      liste().filter((j) => !j.moi && j.mpm).forEach((j) => avancer(j.nom, Math.min(1, s / tempsBot(j))));
      $('fra-position').textContent = `${rang(position(s, null))} / ${liste().length}`;
    }, 300));
  }

  // Position actuelle : joueurs devant moi + 1 (mon avancement lu sur la piste).
  function position(s, maProgression) {
    const moi = maProgression ?? (parseInt($('fra-piste').querySelector(`[data-voiture="${moiNom()}"] .piste__pct`)?.textContent, 10) / 100 || 0);
    return 1 + liste().filter((j) => !j.moi && j.mpm && Math.min(1, s / tempsBot(j)) > moi).length;
  }

  function surSaisie() {
    if (fini) return;
    const valeur = $('fra-saisie').value;
    if (valeur.length > avant.length) { // une lettre ajoutée : on compte la précision
      frappes += valeur.length - avant.length;
      if (valeur.length > phrase.length || valeur[valeur.length - 1] !== phrase[valeur.length - 1]) fautes += 1;
    }
    avant = valeur;
    const justes = Math.min(rendrePhrase(valeur), phrase.length);
    const s = Math.max(0.001, (performance.now() - debut) / 1000);
    avancer(moiNom(), justes / phrase.length);
    $('fra-mpm').textContent = Math.round(justes / 5 / (s / 60));
    $('fra-precision').textContent = frappes ? Math.round(((frappes - fautes) / frappes) * 100) : 100;
    $('fra-position').textContent = `${rang(position(s, justes / phrase.length))} / ${liste().length}`;
    if (valeur === phrase) { fini = true; clearTimers(); timers.push(setTimeout(() => resultats(s), 500)); }
  }

  /* ---------- Résultats ---------- */
  function resultats(secondes) {
    const mpm = Math.round(phrase.length / 5 / (secondes / 60));
    const precision = frappes ? Math.round(((frappes - fautes) / frappes) * 100) : 100;
    const lignes = liste().map((j) => (j.moi
      ? { nom: j.nom, moi: true, t: secondes, mpm, precision }
      : { nom: j.nom, t: tempsBot(j), mpm: j.mpm, precision: j.precision }));
    lignes.sort((a, b) => a.t - b.t);
    $('fra-classement').replaceChildren(...lignes.map((l, i) => el('li', { class: `fra__rang${l.moi ? ' fra__rang--moi' : ''}${l.mpm ? '' : ' fra__rang--abandon'}` },
      el('span', { class: 'fra__rang-num' }, i + 1),
      el('span', { class: 'fra__rang-nom' }, l.moi ? `${l.nom} (toi)` : l.nom),
      el('span', { class: 'fra__rang-mpm' }, l.mpm ? `${l.mpm} mpm` : 'abandon'),
      el('span', { class: 'fra__rang-prec' }, l.mpm ? `${l.precision} %` : ''))));
    const marches = [{ i: 1, h: 'moyen' }, { i: 0, h: 'haut' }, { i: 2, h: 'bas' }].filter((m) => lignes[m.i] && lignes[m.i].mpm);
    $('fra-podium').replaceChildren(...marches.map((m) => el('div', { class: 'podium__colonne' },
      el('span', { class: 'podium__nom' }, lignes[m.i].nom),
      el('span', { class: `podium__marche podium__marche--${m.h}` }, m.i + 1))));
    $('fra-quitter').textContent = mode === 'solo' ? 'Autre jeu' : 'Quitter la salle';
    montrer('resultats');
  }

  function revanche() {
    moiPret = false;
    rendreDepart();
    montrer('depart');
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText($('fra-code').textContent);
      granUI.toast(`Code ${$('fra-code').textContent} copié.`);
    } catch {
      granUI.toast('Copie impossible ici. Recopie le code à la main.', { type: 'erreur' });
    }
  }

  $('fra-tab-solo').addEventListener('click', () => choisirMode('solo'));
  $('fra-tab-salle').addEventListener('click', () => choisirMode('salle'));
  $('fra-pret').addEventListener('click', pret);
  $('fra-copier').addEventListener('click', copier);
  $('fra-saisie').addEventListener('input', surSaisie);
  $('fra-revanche').addEventListener('click', revanche);
  $('fra-phrase').closest('section').addEventListener('click', () => $('fra-saisie').focus());

  granRouter.register('frappe', {
    enter(params) {
      $('fra-code').textContent = params && params.code ? params.code.toUpperCase() : DEMO_FRAPPE_CODE;
      mode = 'salle';
      moiPret = false;
      rendreDepart();
      montrer('depart');
    },
    leave() {
      clearTimers();
      fini = true;
      $('fra-saisie').value = '';
    },
  });
})();
