/* global FRAPPE_PHRASES */
// Course de frappe, mode solo : départ, compte à rebours, course, résultats.
// Aucun socket, aucun appel réseau : tu cours contre 3 robots (vitesse fixe) et ton fantôme de record.
// La frappe ne déclenche aucune animation : seules les couleurs des lettres changent.
(() => {
  const $ = (id) => document.getElementById(id);
  const root = () => document.querySelector('[data-vue="frappe"]');
  const el = granUI.el;

  const ROBOTS = [
    { id: 'lent', nom: 'Robot lent', mpm: 30 },
    { id: 'moyen', nom: 'Robot moyen', mpm: 45 },
    { id: 'rapide', nom: 'Robot rapide', mpm: 65 },
  ];
  let phrase = '';
  let derniere = -1; // index de la dernière phrase, pour ne pas la rejouer d'affilée
  let adversaires = []; // robots + fantôme de record éventuel
  let timers = []; // setTimeout / setInterval à purger dans leave()
  let debut = 0;
  let frappes = 0;
  let fautes = 0;
  let avant = '';
  let fini = false;
  const CLE_RECORD = 'granGames:frappe-record';
  const lireRecord = () => {
    try { const v = parseInt(localStorage.getItem(CLE_RECORD), 10); return Number.isFinite(v) && v > 0 ? Math.min(v, 300) : 0; } catch { return 0; }
  };
  const ecrireRecord = (v) => { try { localStorage.setItem(CLE_RECORD, String(v)); } catch { /* stockage indisponible */ } };
  // Apostrophe typographique tapable : on compare avec l'apostrophe droite du clavier.
  const car = (c) => (c === '\u2019' ? "'" : c);

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

  const MOI = { id: 'moi', nom: 'Toi', moi: true };
  const liste = () => [MOI, ...adversaires];
  const rang = (n) => (n === 1 ? '1er' : `${n}e`);

  function preparer() {
    const record = lireRecord();
    adversaires = [...ROBOTS];
    if (record) adversaires.push({ id: 'fantome', nom: 'Fantôme de ton record', mpm: record, fantome: true });
  }

  const etiquette = (j) => `${j.nom} ${j.mpm} mpm`;

  /* ---------- Ligne de départ ---------- */
  function rendreDepart() {
    preparer();
    const record = lireRecord();
    $('fra-couloirs').replaceChildren(...liste().map((j, i) => el('li', {},
      el('span', { class: 'couloirs__num' }, i + 1),
      el('span', { class: `joueur__avatar c-${(i % 5) + 1}`, 'aria-hidden': 'true' }, j.moi ? 'T' : j.fantome ? 'F' : 'R'),
      el('span', { class: 'couloirs__nom' }, j.moi ? 'Toi' : etiquette(j)),
      j.moi ? null : el('span', { class: `badge ${j.fantome ? 'badge--fantome' : 'badge--robot'}` }, j.fantome ? 'Fantôme' : 'Robot'))));
    $('fra-aide').textContent = record ? `Record : ${record} mpm. Ton fantôme court à cette vitesse.` : 'Pas encore de record : termine une course pour créer ton fantôme.';
  }

  function pret() {
    const bouton = $('fra-pret');
    if (bouton.disabled) return;
    bouton.disabled = true;
    timers.push(setTimeout(decompte, 400));
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
      const pct = el('span', { class: 'piste__pct' }, '0 %');
      return el('div', { class: 'piste__couloir' },
        el('span', { class: 'piste__num', 'aria-hidden': 'true' }, i + 1),
        el('div', { class: 'piste__rail' },
          el('span', { class: `piste__voiture c-${(i % 5) + 1}${j.moi ? ' piste__voiture--moi' : ''}`, 'data-voiture': j.id },
            el('span', { class: 'piste__initiale', 'aria-hidden': 'true' }, j.moi ? 'T' : j.fantome ? 'F' : 'R'), j.nom, pct)),
        el('span', { class: 'piste__arrivee damier-course', 'aria-hidden': 'true' }));
    }));
  }

  function avancer(id, p) {
    const v = $('fra-piste').querySelector(`[data-voiture="${id}"]`);
    if (!v) return;
    v.style.setProperty('--avance', `${Math.round(p * 100)}%`);
    v.querySelector('.piste__pct').textContent = `${Math.round(p * 100)} %`;
  }

  function rendrePhrase(valeur) {
    let erreur = false;
    const spans = [...phrase].map((c, i) => {
      let classe = 'reste';
      if (i < valeur.length) {
        if (!erreur && valeur[i] === car(c)) classe = 'ok'; else { erreur = true; classe = 'faute'; }
      } else if (i === valeur.length) classe = 'curseur';
      return el('span', { class: classe }, c);
    });
    $('fra-phrase').replaceChildren(...spans);
    return erreur ? [...phrase].findIndex((c, i) => valeur[i] !== car(c)) : valeur.length; // caractères justes consécutifs
  }

  const tempsBot = (j) => (phrase.length * 12) / j.mpm; // 5 caractères = 1 mot
  const progresBot = (j, s) => Math.min(1, s / tempsBot(j));

  function choisirPhrase() {
    let i = Math.floor(Math.random() * FRAPPE_PHRASES.length);
    if (FRAPPE_PHRASES.length > 1 && i === derniere) i = (i + 1 + Math.floor(Math.random() * (FRAPPE_PHRASES.length - 1))) % FRAPPE_PHRASES.length;
    derniere = i;
    return FRAPPE_PHRASES[i];
  }

  // Place actuelle : adversaires strictement devant moi + 1.
  const position = (s, moi) => 1 + adversaires.filter((j) => progresBot(j, s) > moi).length;

  function course() {
    phrase = choisirPhrase();
    fini = false;
    frappes = 0; fautes = 0; avant = '';
    $('fra-mpm').textContent = '0';
    $('fra-precision').textContent = '100';
    $('fra-position').textContent = `1er / ${liste().length}`;
    piste();
    rendrePhrase('');
    montrer('course');
    const saisie = $('fra-saisie');
    saisie.value = '';
    saisie.setAttribute('maxlength', String(phrase.length));
    saisie.focus();
    debut = performance.now();
    // Robots et fantôme : progression linéaire d'après leur vitesse
    timers.push(setInterval(() => {
      const s = (performance.now() - debut) / 1000;
      adversaires.forEach((j) => avancer(j.id, progresBot(j, s)));
    }, 300));
  }

  function surSaisie() {
    if (fini) return;
    const valeur = [...$('fra-saisie').value].map(car).join('');
    if (valeur.length > avant.length) { // une lettre ajoutée : on compte la précision
      frappes += valeur.length - avant.length;
      if (valeur.length > phrase.length || valeur[valeur.length - 1] !== car(phrase[valeur.length - 1])) fautes += 1;
    }
    avant = valeur;
    const justes = Math.min(rendrePhrase(valeur), phrase.length);
    const s = Math.max(0.001, (performance.now() - debut) / 1000);
    avancer('moi', justes / phrase.length);
    $('fra-mpm').textContent = Math.round(justes / 5 / (s / 60));
    $('fra-precision').textContent = frappes ? Math.round(((frappes - fautes) / frappes) * 100) : 100;
    $('fra-position').textContent = `${rang(position(s, justes / phrase.length))} / ${liste().length}`;
    $('fra-annonce').textContent = '';
    if ([...phrase].map(car).join('') === valeur) { fini = true; clearTimers(); timers.push(setTimeout(() => resultats(s), 500)); }
  }

  /* ---------- Résultats ---------- */
  function resultats(secondes) {
    const mpm = Math.round(phrase.length / 5 / (secondes / 60));
    const precision = frappes ? Math.round(((frappes - fautes) / frappes) * 100) : 100;
    if (mpm > lireRecord()) {
      const premier = lireRecord() === 0;
      ecrireRecord(mpm);
      if (!premier) granUI.toast(`Nouveau record : ${mpm} mpm.`, { type: 'succes' });
    }
    const lignes = liste().map((j) => (j.moi
      ? { nom: 'Toi', moi: true, t: secondes, mpm, precision }
      : { nom: j.nom, t: tempsBot(j), mpm: j.mpm }));
    lignes.sort((a, b) => a.t - b.t);
    const place = lignes.findIndex((l) => l.moi) + 1;
    $('fra-resume').textContent = `${rang(place)} sur ${lignes.length} : ${mpm} mpm, ${precision} % de précision, ${secondes.toFixed(1).replace('.', ',')} s.`;
    $('fra-classement').replaceChildren(...lignes.map((l, i) => el('li', { class: `fra__rang${l.moi ? ' fra__rang--moi' : ''}` },
      el('span', { class: 'fra__rang-num' }, i + 1),
      el('span', { class: 'fra__rang-nom' }, l.nom),
      el('span', { class: 'fra__rang-mpm' }, `${l.mpm} mpm`),
      el('span', { class: 'fra__rang-prec' }, l.moi ? `${l.precision} %` : ''))));
    const marches = [{ i: 1, h: 'moyen' }, { i: 0, h: 'haut' }, { i: 2, h: 'bas' }].filter((m) => lignes[m.i]);
    $('fra-podium').replaceChildren(...marches.map((m) => el('div', { class: 'podium__colonne' },
      el('span', { class: 'podium__nom' }, lignes[m.i].nom),
      el('span', { class: `podium__marche podium__marche--${m.h}` }, m.i + 1))));
    montrer('resultats');
  }

  function revanche() {
    $('fra-pret').disabled = false;
    rendreDepart();
    montrer('depart');
  }

  $('fra-pret').addEventListener('click', pret);
  $('fra-saisie').addEventListener('input', surSaisie);
  $('fra-revanche').addEventListener('click', revanche);
  $('fra-phrase').closest('section').addEventListener('click', () => $('fra-saisie').focus());

  granRouter.register('frappe', {
    enter() {
      clearTimers();
      $('fra-pret').disabled = false;
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
