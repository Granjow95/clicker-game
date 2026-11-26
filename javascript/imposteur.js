// Imposteur v2 : protocole imp:* (ADR 0003), entrée via granSalle, reprise via granReprise.
// Le socket est créé dans auth.js. Tout texte de joueur passe par granUI.el / textContent.

// Échappe le HTML (conservé pour les autres scripts ; les rendus d'ici n'utilisent jamais innerHTML).
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Seule globale partagée : granAuth.inGame() la lit pour différer un changement d'identité en partie.
// Posée à imp:joined, remise à '' sur erreur ou en quittant la vue.
let currentRoomId = "";

(() => {
  const P = "imp";
  const GRACE_MS = 120000;
  const MAX_JOUEURS = 8;
  const MIN_JOUEURS = 3;
  const MIN_JOUEURS_WHITE = 4;
  const el = granUI.el;
  const OPTIONS_PAR_DEFAUT = { rounds: 3, timer: 60, mrWhite: false };

  let S = null;            // état de la vue (null hors de la vue)
  let vue = null;          // conteneur des écrans
  let statut = null;       // ligne « connexion perdue »
  let entree = null;       // retour de granSalle.mount
  let attache = false;
  let quitForfeit = false; // choix fait dans la fenêtre « Quitter la partie ? »
  const minuteurs = new Set();

  /* ---------- Outils ---------- */

  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const initiale = (nom) => (String(nom || "?").trim().charAt(0) || "?").toUpperCase();
  const reduit = () => granUI.reducedMotion();
  const delai = (ms) => (reduit() ? 0 : ms);

  function apres(fn, ms) {
    const id = setTimeout(() => { minuteurs.delete(id); fn(); }, ms);
    minuteurs.add(id);
    return id;
  }
  function chaque(fn, ms) {
    const id = setInterval(fn, ms);
    minuteurs.add(id);
    return id;
  }
  function arreter(id) { clearTimeout(id); clearInterval(id); minuteurs.delete(id); }
  function clearTimers() {
    minuteurs.forEach((id) => { clearTimeout(id); clearInterval(id); });
    minuteurs.clear();
  }

  // Chrono basé sur une échéance (pas de dérive). Rougit sous 10 s. Retourne la fonction d'arrêt.
  function chrono(node, finMs, onEnd) {
    let id = null;
    let fini = false;
    const maj = () => {
      const reste = Math.max(0, Math.ceil((finMs - Date.now()) / 1000));
      node.textContent = mmss(reste);
      node.classList.toggle("imp-chrono--urgent", reste <= 10);
      if (reste <= 0 && !fini) { fini = true; arreter(id); if (onEnd) onEnd(); }
    };
    id = chaque(maj, 250);
    maj();
    return () => arreter(id);
  }

  function nouvelEtat() {
    return {
      code: null, you: null, token: null, hostId: null, username: "",
      players: [], names: {}, vus: new Set(),
      phase: "lobby", options: { ...OPTIONS_PAR_DEFAUT },
      round: 0, totalRounds: 3, timer: 60,
      word: null, role: "player", mrWhite: false, order: [], hints: {},
      currentId: null, myVote: null, pendingVote: null,
      reveal: null, ranking: null, over: false, scores: {},
      replaced: false, auto: false, carteOuverte: false, revealDone: false,
      busyTimer: null, stopChrono: null, ui: {},
    };
  }

  const estHote = () => !!S && !!S.you && S.hostId === S.you;
  const nom = (pid) => S.names[pid] || "???";
  const connectes = () => S.players.filter((p) => p.connected).length;
  const enPartie = () => !!S && !!S.code && !S.over && S.phase !== "lobby";

  function setJoueurs(players) {
    const avant = new Map(S.players.map((p) => [p.id, p.connected]));
    S.players = (Array.isArray(players) ? players : []).map((p) => ({
      id: p.id,
      username: p.username,
      connected: p.connected === undefined ? avant.get(p.id) !== false : p.connected !== false,
    }));
    S.players.forEach((p) => { S.names[p.id] = p.username; });
  }

  function avatar(nomJoueur, index, taille) {
    return el("span", {
      class: `imp-avatar imp-avatar--${taille} ${granUI.avatarClass(index)}`,
      "aria-hidden": "true",
    }, initiale(nomJoueur));
  }
  const indexJoueur = (pid) => Math.max(0, S.players.findIndex((p) => p.id === pid));
  const estHorsLigne = (pid) => { const p = S.players.find((x) => x.id === pid); return !!p && !p.connected; };

  function monter(node, focus = true) {
    node.classList.add("ecran");
    if (focus) granUI.showScreen(vue, node); else vue.replaceChildren(node);
  }

  function barreQuitter() {
    return el("div", { class: "imp-barre" },
      el("button", { class: "key key--fantome key--compact", type: "button", onclick: () => granRouter.navigate("/") }, "Quitter"));
  }

  /* ---------- Garde de sortie ---------- */

  function majGarde() { granRouter.setLeaveGuard(enPartie() ? confirmLeave : null); }

  function confirmLeave() {
    const dialog = document.getElementById("imp-quitter");
    const rester = document.getElementById("imp-rester");
    const partir = document.getElementById("imp-partir");
    const abandon = document.getElementById("imp-abandon");
    return new Promise((resolve) => {
      let quitter = false;
      quitForfeit = false;
      const onStay = () => granUI.closeDialog(dialog);
      const onLeave = () => { quitter = true; quitForfeit = false; granUI.closeDialog(dialog); };
      const onForfeit = () => { quitter = true; quitForfeit = true; granUI.closeDialog(dialog); };
      rester.addEventListener("click", onStay);
      partir.addEventListener("click", onLeave);
      abandon.addEventListener("click", onForfeit);
      dialog.addEventListener("close", () => {
        rester.removeEventListener("click", onStay);
        partir.removeEventListener("click", onLeave);
        abandon.removeEventListener("click", onForfeit);
        resolve(quitter);
      }, { once: true });
      granUI.openDialog(dialog);
    });
  }

  /* ---------- Entrée de salle ---------- */

  function clearBusy() { if (S && S.busyTimer) { clearTimeout(S.busyTimer); S.busyTimer = null; } }
  function occuper() {
    entree.setBusy(true);
    clearBusy();
    S.busyTimer = setTimeout(() => {
      S.busyTimer = null;
      if (entree && !S.code) { entree.setBusy(false); entree.showError("general", "Le serveur ne répond pas. Réessaie dans un instant."); }
    }, 10000);
  }

  function resetClient() {
    clearTimers();
    clearBusy();
    currentRoomId = "";
    const ancien = S;
    S = nouvelEtat();
    S.username = ancien ? ancien.username : "";
    granRouter.setLeaveGuard(null);
  }

  function allerEntree(code, { message = "", focus = false } = {}) {
    const holder = el("div");
    vue.replaceChildren(holder);
    statut.hidden = true;
    entree = granSalle.mount(holder, {
      prefix: P, titre: "Imposteur", jeuLabel: "Imposteur",
      intro: "Tout le monde a le même mot. Sauf un.",
      onCreate: (u) => { S.username = u; occuper(); socket.emit("imp:create", { username: u }); },
      onJoin: (c, u) => { S.username = u; occuper(); socket.emit("imp:join", { code: c, username: u }); },
      onResume: (e) => { S.username = e.username || S.username; occuper(); socket.emit("imp:resume", { code: e.code, token: e.token }); },
      onForget: () => {},
    });
    if (code) entree.setCode(code);
    if (message) entree.showError("general", message);
    if (focus) entree.focus();
  }

  /* ---------- Carte de rôle (se retourne au toucher) ---------- */

  function carte({ distribution = false } = {}) {
    const blanc = S.role === "white";
    const dos = el("span", { class: "imp-carte__face imp-carte__face--dos" },
      el("span", { class: "imp-carte__etiquette" }, "Ta carte"),
      el("span", { class: "imp-carte__invite" }, "Touche pour voir ton mot"),
      el("span", { class: "imp-mot__tampon", "aria-hidden": "true" }, "Confidentiel"));
    const face = el("span", { class: "imp-carte__face imp-carte__face--avant" },
      blanc
        ? [el("span", { class: "imp-carte__etiquette" }, "Ton rôle"),
          el("span", { class: "imp-carte__texte" }, "Tu es Mr White. Tu n'as pas de mot. Écoute les autres et bluffe."),
          el("span", { class: "imp-mot__tampon imp-mot__tampon--blanc", "aria-hidden": "true" }, "Sans mot")]
        : [el("span", { class: "imp-carte__etiquette" }, "Ton mot"),
          el("span", { class: "imp-mot__valeur" }, S.word || "(inconnu)")]);
    const bouton = el("button", { type: "button", class: `imp-carte${distribution ? " arrive" : ""}`, "aria-expanded": "false" },
      el("span", { class: "imp-carte__inner" }, dos, face));
    const maj = () => {
      const ouverte = S.carteOuverte;
      bouton.classList.toggle("imp-carte--ouverte", ouverte);
      bouton.setAttribute("aria-expanded", String(ouverte));
      bouton.setAttribute("aria-label", ouverte ? "Cacher ta carte" : "Voir ta carte");
      dos.setAttribute("aria-hidden", String(ouverte));
      face.setAttribute("aria-hidden", String(!ouverte));
    };
    bouton.addEventListener("click", () => { S.carteOuverte = !S.carteOuverte; maj(); });
    maj();
    return bouton;
  }

  /* ---------- Salon ---------- */

  function stepper(label, id, { min, max, step, value, unite }) {
    const input = el("input", { type: "number", id, min, max, step, value, "aria-labelledby": `${id}-nom` });
    const bouger = (delta) => {
      const suivant = (parseInt(input.value, 10) || min) + delta;
      input.value = Math.min(max, Math.max(min, suivant));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const moins = el("button", { type: "button", "aria-label": delta(-step, unite), onclick: () => bouger(-step) }, "-");
    const plus = el("button", { type: "button", "aria-label": delta(step, unite), onclick: () => bouger(step) }, "+");
    const bloc = el("div", { class: "imp-reglage" },
      el("span", { class: "imp-reglage__nom", id: `${id}-nom` }, label),
      el("div", { class: "stepper imp-stepper", role: "group", "aria-labelledby": `${id}-nom` },
        moins,
        el("span", { class: "imp-stepper__valeur" }, input, unite ? el("span", { "aria-hidden": "true" }, "s") : null),
        plus));
    return { bloc, input, boutons: [moins, plus] };
  }
  function delta(d, unite) {
    const n = Math.abs(d);
    const plusOuMoins = d < 0 ? "de moins" : "de plus";
    return unite ? `${n} secondes ${plusOuMoins}` : `Une manche ${plusOuMoins}`;
  }

  function lireOptions() {
    const u = S.ui;
    const bornes = (v, min, max, defaut) => Math.min(max, Math.max(min, parseInt(v, 10) || defaut));
    return {
      rounds: bornes(u.manches.input.value, 1, 10, 3),
      timer: bornes(u.duree.input.value, 10, 120, 60),
      mrWhite: u.white.checked,
    };
  }
  function envoyerOptions() {
    if (!estHote() || !S.code) return;
    if (S.ui) S.ui.sale = false;
    S.options = lireOptions();
    socket.emit("update_lobby_options", { options: S.options });
  }
  function syncOptions() {
    const u = S.ui;
    if (!u.manches || !u.manches.input.isConnected) return;
    const o = S.options;
    if (!u.sale && document.activeElement !== u.manches.input) u.manches.input.value = o.rounds;
    if (!u.sale && document.activeElement !== u.duree.input) u.duree.input.value = o.timer;
    u.white.checked = !!o.mrWhite;
  }

  function ligneSalon(p, i) {
    const moi = p.id === S.you;
    const neuf = !S.vus.has(p.id);
    S.vus.add(p.id);
    return el("li", {
      class: `imp-joueur${moi ? " imp-joueur--moi" : ""}${p.connected ? "" : " imp-joueur--absent"}${neuf ? " arrive" : ""}`,
      style: neuf && !reduit() ? `animation-delay:${i * 40}ms` : null,
    },
    avatar(p.username || "Anonyme", i, "petit"),
    el("span", { class: "imp-joueur__nom" }, p.username || "Anonyme"),
    p.id === S.hostId ? el("span", { class: "badge badge--hote" }, "Hôte") : null,
    moi ? el("span", { class: "badge badge--moi" }, "Toi") : null,
    p.connected ? null : el("span", { class: "badge badge--absent" }, "hors ligne"));
  }

  function rafraichirSalon() {
    const u = S.ui;
    if (!u.liste || !u.liste.isConnected) return;
    const hote = estHote();
    const n = connectes();
    u.liste.replaceChildren(...S.players.map(ligneSalon));
    u.compte.textContent = `${S.players.length}/${MAX_JOUEURS}`;
    [u.manches, u.duree].forEach((s) => { s.input.disabled = !hote; s.boutons.forEach((b) => { b.disabled = !hote; }); });
    const peutWhite = n >= MIN_JOUEURS_WHITE;
    u.white.disabled = !hote || !peutWhite;
    u.whiteAide.textContent = peutWhite ? "" : `Il faut au moins ${MIN_JOUEURS_WHITE} joueurs connectés (${n} pour l'instant).`;
    u.whiteAide.hidden = peutWhite;
    syncOptions();
    if (hote) {
      u.lancer.hidden = false;
      u.lancer.disabled = n < MIN_JOUEURS;
      u.aide.textContent = n < MIN_JOUEURS ? `Il faut au moins ${MIN_JOUEURS} joueurs connectés pour lancer (${n} pour l'instant).` : "";
      u.aide.hidden = n >= MIN_JOUEURS;
    } else {
      u.lancer.hidden = true;
      const h = S.players.find((p) => p.id === S.hostId);
      u.aide.textContent = `En attente de ${h ? h.username : "l'hôte"}…`;
      u.aide.hidden = false;
    }
  }

  function regles() {
    return el("details", { class: "imp-regles" },
      el("summary", {}, "Comment on joue"),
      el("div", { class: "imp-regles__corps" },
        el("p", {}, "Tout le monde reçoit le même mot, sauf l'imposteur qui reçoit un mot proche (il ne sait pas qu'il est l'imposteur). Chacun donne un indice à son tour, puis on vote pour désigner l'imposteur."),
        el("p", {}, "Avec Mr White, un joueur n'a aucun mot : il bluffe. S'il est démasqué, il peut encore gagner en devinant le mot des civils."),
        el("ul", { class: "imp-regles__bareme" },
          el("li", {}, "Voter pour l'imposteur : +100"),
          el("li", {}, "Voter pour Mr White : +50"),
          el("li", {}, "Imposteur non éliminé : +100"),
          el("li", {}, "Mr White non éliminé : +100"),
          el("li", {}, "Mr White éliminé qui trouve le mot : +150"))));
  }

  function afficherSalon({ focus = true } = {}) {
    clearTimers();
    S.phase = "lobby";
    S.currentId = null;
    majGarde();
    const u = S.ui = {};
    u.liste = el("ul", { class: "imp-liste" });
    u.compte = el("span", { class: "imp-compte" });
    u.manches = stepper("Manches", "imp-manches", { min: 1, max: 10, step: 1, value: S.options.rounds });
    u.duree = stepper("Temps par tour", "imp-duree", { min: 10, max: 120, step: 10, value: S.options.timer, unite: true });
    let debounce = null;
    const planifier = () => { u.sale = true; clearTimeout(debounce); debounce = apres(envoyerOptions, 300); };
    [u.manches.input, u.duree.input].forEach((i) => i.addEventListener("input", planifier));

    u.white = el("input", { type: "checkbox", id: "imp-white", "aria-describedby": "imp-white-aide" });
    u.white.addEventListener("change", envoyerOptions);
    u.whiteAide = el("p", { class: "imp-aide", id: "imp-white-aide", hidden: true });
    const blocWhite = el("div", { class: "imp-white" },
      el("label", { class: "imp-white__label", for: "imp-white" }, u.white,
        el("span", {}, "Ajouter un Mr White (4 joueurs minimum) : il n'a aucun mot et doit bluffer")),
      u.whiteAide);

    u.lancer = el("button", { type: "button", class: "key key--principal key--bloc", "aria-describedby": "imp-lancer-aide", onclick: lancer },
      S.over ? "Lancer une nouvelle partie" : "Lancer la partie");
    u.aide = el("p", { class: "imp-attente", id: "imp-lancer-aide", role: "status" });

    const copier = el("button", { type: "button", class: "key key--principal key--compact", onclick: copierLien }, "Copier le lien");
    const node = el("div", { class: "imp-salon" },
      barreQuitter(),
      el("h1", { class: "imp-titre-ecran" }, "Le salon"),
      el("div", { class: "imp-fiche imp-fiche--code" },
        el("div", { class: "imp-fiche__code" },
          el("span", { class: "imp-fiche__etiquette" }, "Code de la salle"),
          el("span", { class: "imp-code", "aria-label": `Code ${S.code.split("").join(" ")}` }, S.code)),
        copier),
      el("div", { class: "imp-joueurs" },
        el("div", { class: "imp-joueurs__tete" }, el("h2", { class: "imp-h2" }, "Joueurs"), u.compte),
        u.liste),
      el("div", { class: "imp-reglages" }, u.manches.bloc, u.duree.bloc),
      blocWhite,
      el("div", { class: "imp-lancer" }, u.lancer, u.aide),
      regles());
    monter(node, focus);
    rafraichirSalon();
  }

  function lancer() {
    if (!estHote()) return;
    if (connectes() < MIN_JOUEURS) { granUI.toast(`Il faut au moins ${MIN_JOUEURS} joueurs connectés.`, { type: "erreur" }); return; }
    S.options = lireOptions();
    socket.emit("update_lobby_options", { options: S.options });
    socket.emit("start_round", {});
  }

  async function copierLien() {
    const url = `${location.origin}${location.pathname}#/imposteur/${encodeURIComponent(S.code)}`;
    try {
      await navigator.clipboard.writeText(url);
      granUI.toast("Lien copié.");
    } catch {
      granUI.toast(`Copie impossible. Donne le code ${S.code} à tes amis.`, { type: "erreur" });
    }
  }

  /* ---------- Manche : indices ---------- */

  function infoManche(suite) {
    return el("p", { class: "imp-manche", "aria-live": "polite" },
      `Manche ${S.round}/${S.totalRounds}${suite ? `, ${suite}` : ""}`);
  }

  function boutonHote() {
    if (!estHote()) return [];
    if (S.phase === "hints") {
      return [el("button", { type: "button", class: "key key--secondaire key--bloc", onclick: () => socket.emit("force_vote", {}) }, "Passer aux votes")];
    }
    if (S.phase === "voting") {
      return [el("button", { type: "button", class: "key key--secondaire key--bloc", onclick: () => socket.emit("force_reveal", {}) }, "Révéler maintenant")];
    }
    return [];
  }
  function majHote() {
    const u = S.ui;
    if (S.phase === "lobby") { rafraichirSalon(); return; }
    if (S.phase === "revealed") { majActions(); return; }
    if (u.hote && u.hote.isConnected) u.hote.replaceChildren(...boutonHote());
  }

  function ligneTour(pid, i, cascade) {
    const etat = el("span", { class: "imp-tour__etat" });
    const minuteur = el("span", { class: "imp-tour__timer hidden" });
    const indices = el("span", { class: "imp-tour__indices" });
    const li = el("li", {
      class: `imp-tour${cascade ? " arrive" : ""}`,
      "data-pid": pid,
      style: cascade && !reduit() ? `animation-delay:${i * 40}ms` : null,
    },
    el("span", { class: "imp-tour__tete" },
      avatar(nom(pid), indexJoueur(pid), "petit"),
      el("span", { class: "imp-tour__nom" }, pid === S.you ? `${nom(pid)} (toi)` : nom(pid)),
      etat, minuteur),
    indices);
    S.ui.lignes[pid] = { li, etat, minuteur, indices };
    return li;
  }

  function paintTours() {
    const lignes = S.ui.lignes;
    if (!lignes) return;
    S.order.forEach((pid) => {
      const l = lignes[pid];
      if (!l) return;
      const actif = pid === S.currentId;
      const horsLigne = estHorsLigne(pid);
      l.li.classList.toggle("imp-tour--actif", actif);
      l.li.classList.toggle("imp-tour--absent", horsLigne);
      const aJoue = (S.hints[pid] || []).length > 0;
      l.etat.textContent = horsLigne ? "hors ligne" : actif ? "écrit…" : aJoue ? "a joué" : "attend";
      if (!actif) l.minuteur.classList.add("hidden");
    });
  }

  function ajouterIndice(pid, hint, skipped, anim) {
    const l = S.ui.lignes && S.ui.lignes[pid];
    if (!l) return;
    const texte = skipped || hint == null ? "(passe son tour)" : hint;
    const ecrit = anim && !skipped && !reduit();
    l.indices.append(el("span", {
      class: `imp-indice${skipped ? " imp-indice--passe" : ""}${ecrit ? " imp-indice--ecrit" : ""}`,
      style: ecrit ? `--n:${Math.max(1, String(texte).length)}` : null,
    }, texte));
  }

  function afficherManche({ focus = true, distribution = false } = {}) {
    clearTimers();
    S.stopChrono = null;
    S.phase = "hints";
    majGarde();
    const u = S.ui = { lignes: {} };
    u.tours = el("ol", { class: "imp-tours" });
    S.order.forEach((pid, i) => u.tours.append(ligneTour(pid, i, distribution)));
    u.saisie = el("div", { class: "imp-saisie-zone" });
    u.hote = el("div", { class: "imp-actions" }, ...boutonHote());
    const node = el("div", { class: "imp-manche-ecran" },
      barreQuitter(),
      el("h1", { class: "imp-titre-ecran" }, "Les indices"),
      infoManche("indices"),
      carte({ distribution }),
      u.tours, u.saisie, u.hote);
    monter(node, focus);
    paintTours();
  }

  function demarrerTour(pid, resteMs) {
    if (S.stopChrono) { S.stopChrono(); S.stopChrono = null; }
    S.currentId = pid;
    const l = S.ui.lignes && S.ui.lignes[pid];
    paintTours();
    S.ui.saisie.replaceChildren();
    S.ui.formulaire = null;
    if (!l) return;
    l.minuteur.classList.remove("hidden");
    const fin = Date.now() + resteMs;
    if (pid !== S.you) {
      S.stopChrono = chrono(l.minuteur, fin);
      return;
    }
    const input = el("input", { type: "text", id: "imp-indice", class: "imp-saisie__champ", maxlength: 40, autocomplete: "off", spellcheck: "false" });
    const poser = el("button", { type: "submit", class: "key key--sombre imp-saisie__poser" }, "Poser");
    const erreur = el("p", { class: "field__erreur", role: "alert", hidden: true });
    const form = el("form", { class: "imp-saisie arrive", novalidate: true },
      el("label", { class: "imp-saisie__label", for: "imp-indice" }, "À toi : un mot pour ton indice"),
      el("div", { class: "imp-saisie__ligne" }, input, poser), erreur);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (poser.disabled) return;
      const hint = input.value.trim();
      if (!hint) { erreur.textContent = "Écris un mot avant de poser."; erreur.hidden = false; granUI.shake(input); input.focus(); return; }
      erreur.hidden = true;
      poser.disabled = true;
      input.readOnly = true;
      socket.emit("submit_hint", { hint: hint.slice(0, 40) });
    });
    S.ui.formulaire = { form, input, poser };
    S.ui.saisie.append(form);
    S.stopChrono = chrono(l.minuteur, fin, () => {
      if (S.ui.formulaire && S.ui.formulaire.form === form && !poser.disabled && input.value.trim()) form.requestSubmit();
    });
    input.focus();
  }

  /* ---------- Vote ---------- */

  function peindreVote() {
    const u = S.ui;
    if (!u.grille || !u.grille.isConnected) return;
    const choisi = S.myVote || S.pendingVote;
    const verrou = !!choisi;
    const boutons = [];
    S.players.forEach((p, i) => {
      if (p.id === S.you) return;
      const est = p.id === choisi;
      const b = el("button", {
        type: "button", role: "radio", "aria-checked": String(est),
        class: `key imp-vote${est ? " imp-vote--choisi" : ""}${p.connected ? "" : " imp-vote--absent"}`,
        disabled: verrou,
        onclick: () => voter(p.id),
      },
      avatar(p.username, i, "grand"),
      el("span", { class: "imp-vote__nom" }, p.username),
      p.connected ? null : el("span", { class: "imp-vote__hors" }, "hors ligne"),
      est ? el("span", { class: "imp-vote__marque" }, S.myVote ? "ton vote" : "envoi…") : null);
      boutons.push(b);
    });
    u.grille.replaceChildren(...boutons);
    if (S.myVote) {
      u.bilan.replaceChildren(`Tu as voté pour : ${nom(S.myVote)}.`, el("br"), el("span", { class: "imp-bilan__suite" }, "On attend les autres joueurs."));
      u.bilan.classList.remove("hidden");
    } else if (S.pendingVote) {
      u.bilan.replaceChildren("Envoi de ton vote…");
      u.bilan.classList.remove("hidden");
    } else {
      u.bilan.classList.add("hidden");
    }
  }

  function voter(pid) {
    if (S.myVote || S.pendingVote) return;
    S.pendingVote = pid;
    peindreVote();
    socket.emit("vote", { votedId: pid });
    apres(() => { if (S.pendingVote === pid && !S.myVote) { S.pendingVote = null; peindreVote(); } }, 5000);
  }

  function afficherVote({ focus = true } = {}) {
    clearTimers();
    S.stopChrono = null;
    S.phase = "voting";
    S.currentId = null;
    majGarde();
    const u = S.ui = {};
    u.grille = el("div", { class: "imp-votes", role: "radiogroup", "aria-label": "Suspect" });
    u.bilan = el("div", { class: "imp-bilan hidden", role: "status" });
    u.hote = el("div", { class: "imp-actions" }, ...boutonHote());
    const node = el("div", { class: "imp-vote-ecran" },
      barreQuitter(),
      el("h1", { class: "imp-titre-ecran" }, "Qui ment ?"),
      infoManche("vote"),
      el("p", { class: "imp-intro imp-intro--doux" }, "Désigne un suspect. Tu ne peux pas voter pour toi."),
      u.grille, u.bilan, carte(), u.hote);
    monter(node, focus);
    peindreVote();
  }

  /* ---------- Mr White : dernière chance ---------- */

  function afficherWhite(whiteId, resteMs, { focus = true } = {}) {
    clearTimers();
    S.stopChrono = null;
    S.phase = "white_guess";
    majGarde();
    const u = S.ui = {};
    const minuteur = el("span", { class: "imp-chrono", role: "timer" });
    let contenu;
    if (whiteId === S.you) {
      const input = el("input", { type: "text", id: "imp-devine", class: "imp-saisie__champ", maxlength: 40, autocomplete: "off", spellcheck: "false" });
      const envoyer = el("button", { type: "submit", class: "key key--sombre imp-saisie__poser" }, "Deviner");
      const erreur = el("p", { class: "field__erreur", role: "alert", hidden: true });
      const form = el("form", { class: "imp-saisie", novalidate: true },
        el("label", { class: "imp-saisie__label", for: "imp-devine" }, "Devine le mot des civils"),
        el("div", { class: "imp-saisie__ligne" }, input, envoyer), erreur);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (envoyer.disabled) return;
        const guess = input.value.trim();
        if (!guess) { erreur.textContent = "Écris un mot avant d'envoyer."; erreur.hidden = false; granUI.shake(input); input.focus(); return; }
        envoyer.disabled = true; input.readOnly = true;
        socket.emit("imp:white_guess", { guess: guess.slice(0, 40) });
      });
      u.formulaire = { form, input, poser: envoyer };
      contenu = [el("p", { class: "imp-intro" }, "Tu as été démasqué. Une chance : trouve le mot des civils."), form];
      apres(() => input.focus(), 0);
    } else {
      contenu = [el("p", { class: "imp-intro" }, "Mr White a été démasqué ! Il tente de deviner le mot…")];
    }
    const node = el("div", { class: "imp-vote-ecran" },
      barreQuitter(),
      el("h1", { class: "imp-titre-ecran" }, "Mr White"),
      infoManche("dernière chance"),
      ...contenu,
      el("p", { class: "imp-attente" }, "Temps restant : ", minuteur),
      carte());
    monter(node, focus);
    S.stopChrono = chrono(minuteur, Date.now() + resteMs);
  }

  /* ---------- Révélation ---------- */

  function verdict(r) {
    if (r.aborted) return { texte: "Manche annulée", detail: "Un joueur clé est parti : aucun point cette manche.", classe: "neutre" };
    if (!r.eliminatedId) return { texte: "Égalité", detail: "Égalité : personne n'est éliminé.", classe: "neutre" };
    const n = nom(r.eliminatedId);
    if (r.caught) return { texte: "Démasqué !", detail: `${n} est éliminé : c'était l'imposteur.`, classe: "juste" };
    if (r.whiteId && r.eliminatedId === r.whiteId) return { texte: "Mr White !", detail: `${n} est éliminé : c'était Mr White.`, classe: "neutre" };
    return { texte: "Raté !", detail: `${n} est éliminé, mais ce n'était pas l'imposteur.`, classe: "faux" };
  }

  function majActions() {
    const u = S.ui;
    if (!u.actions || !u.actions.isConnected || !S.reveal) return;
    const fin = S.over || S.reveal.isLastRound;
    const hote = estHote();
    const h = S.players.find((p) => p.id === S.hostId);
    const nomHote = h ? h.username : "l'hôte";
    const noeuds = [];
    if (!fin) {
      noeuds.push(hote
        ? el("button", { type: "button", class: "key key--principal key--bloc", onclick: () => socket.emit("start_next_round", {}) },
          `Manche suivante (${S.round + 1}/${S.totalRounds})`)
        : el("p", { class: "imp-attente" }, `En attente de ${nomHote}…`));
    } else {
      noeuds.push(hote
        ? el("button", { type: "button", class: "key key--principal key--bloc", onclick: () => socket.emit("start_round", {}) }, "Rejouer")
        : el("p", { class: "imp-attente" }, `En attente de ${nomHote} pour rejouer…`));
      if (hote) noeuds.push(el("button", { type: "button", class: "key key--secondaire key--bloc", onclick: () => afficherSalon() }, "Modifier les réglages"));
      noeuds.push(el("a", { class: "key key--fantome key--bloc", href: "#/" }, "Accueil"));
    }
    u.actions.replaceChildren(...noeuds);
  }

  function lignesClassement(r) {
    const pts = r.scores || {};
    const gagne = r.gained || {};
    const lignes = (r.players || S.players).map((p) => ({ id: p.id, nom: p.username || "???", total: pts[p.id] || 0, gain: gagne[p.id] || 0 }));
    lignes.sort((a, b) => b.total - a.total);
    return el("ol", { class: "imp-classement" }, lignes.map((l, i) => {
      const rang = 1 + lignes.filter((x) => x.total > l.total).length;
      return el("li", { class: rang === 1 ? "imp-classement__tete" : null },
        el("span", { class: "imp-classement__rang" }, rang),
        el("span", { class: "imp-classement__nom" }, l.id === S.you ? `${l.nom} (toi)` : l.nom),
        el("span", { class: "imp-classement__gain" }, l.gain > 0 ? `+${l.gain}` : ""),
        el("span", { class: "imp-classement__total" }, l.total));
    }));
  }

  function montrerPodium() {
    const zone = S.ui.classement;
    if (!zone || !zone.isConnected || !S.ranking) return;
    const top = S.ranking.slice(0, 3);
    const ordre = [top[1], top[0], top[2]].filter(Boolean); // 2e, 1er, 3e
    const marches = ordre.map((j) => {
      const rang = 1 + S.ranking.filter((x) => x.score > j.score).length;
      return el("li", { class: `imp-marche imp-marche--${Math.min(rang, 3)}` },
        el("span", { class: "imp-marche__nom" }, j.id === S.you ? `${j.username} (toi)` : j.username),
        el("span", { class: "imp-marche__score" }, j.score),
        el("span", { class: "imp-marche__rang" }, rang));
    });
    const confettis = reduit() ? [] : Array.from({ length: 16 }, (_, i) => el("i", {
      style: `--x:${(i * 37) % 100}%;--d:${(i % 8) * 90}ms;--c:var(${["--bouton-dor", "--pomme", "--bonbon", "--faience", "--brique"][i % 5]})`,
    }));
    const reste = S.ranking.slice(3);
    zone.replaceChildren(
      el("h2", { class: "imp-h2" }, "Classement final"),
      el("div", { class: "imp-final" },
        el("div", { class: "imp-confettis", "aria-hidden": "true" }, ...confettis),
        el("ol", { class: "imp-podium" }, ...marches)),
      reste.length ? el("ol", { class: "imp-classement", start: 4 }, reste.map((j, i) =>
        el("li", {},
          el("span", { class: "imp-classement__rang" }, i + 4),
          el("span", { class: "imp-classement__nom" }, j.username),
          el("span", { class: "imp-classement__gain" }),
          el("span", { class: "imp-classement__total" }, j.score)))) : null);
  }

  function afficherReveal(r, { instant = false, focus = true } = {}) {
    clearTimers();
    S.stopChrono = null;
    S.phase = "revealed";
    S.reveal = r;
    S.scores = r.scores || S.scores;
    S.round = r.round || S.round;
    S.totalRounds = r.totalRounds || S.totalRounds;
    S.currentId = null;
    S.revealDone = false;
    if (r.isLastRound) S.over = true;
    majGarde();
    (r.players || []).forEach((p) => { S.names[p.id] = p.username; });

    const players = r.players || S.players;
    const compte = {};
    Object.values(r.votes || {}).forEach((v) => { compte[v] = (compte[v] || 0) + 1; });
    const urne = el("ul", { class: "imp-urne", "aria-label": "Votes reçus" });
    const bulletins = players.map((p, i) => {
      const n = el("span", { class: "imp-bulletin__nb" }, instant ? compte[p.id] || 0 : 0);
      const li = el("li", { class: "imp-bulletin" }, avatar(p.username, i, "grand"),
        el("span", { class: "imp-bulletin__nom" }, p.username), n);
      urne.append(li);
      return { li, n, total: compte[p.id] || 0 };
    });
    const v = verdict(r);
    const tampon = el("span", { class: `imp-tampon imp-tampon--${v.classe}`, role: "status" }, v.texte);
    const bloc = el("div", { class: "imp-verdict hidden" }, tampon, el("p", { class: "imp-verdict__detail" }, v.detail));

    const impostor = players.find((p) => p.id === r.impostorId);
    const mots = el("div", { class: "imp-mots" },
      el("div", { class: "imp-mots__case imp-mots__case--juste" }, el("span", {}, "Mot des civils"), el("p", {}, r.wordPair ? r.wordPair.normal : "(inconnu)")),
      el("div", { class: "imp-mots__case imp-mots__case--faux" }, el("span", {}, "Mot de l'imposteur"), el("p", {}, r.wordPair ? r.wordPair.impostor : "(inconnu)")));
    let white = null;
    if (r.whiteId) {
      const guess = r.whiteGuess ? `Il a proposé « ${r.whiteGuess} » : ${r.whiteGuessCorrect ? "correct, +150." : "raté."}` : "Il n'a rien proposé.";
      white = el("p", { class: "imp-white-reveal" }, `Mr White était ${nom(r.whiteId)}. `, r.eliminatedId === r.whiteId ? guess : "");
    }
    const classement = el("div", { class: "imp-classement-zone" },
      el("h2", { class: "imp-h2" }, r.isLastRound ? "Classement" : "Scores"), lignesClassement(r));
    const actions = el("div", { class: "imp-actions" });
    const suite = el("div", { class: "imp-suite hidden" },
      el("div", { class: "imp-fiche imp-fiche--revele" },
        avatar(impostor ? impostor.username : "?", Math.max(0, players.findIndex((p) => p.id === r.impostorId)), "enorme"),
        el("div", { class: "imp-fiche__texte" },
          el("span", { class: "imp-fiche__etiquette" }, "L'imposteur était"),
          el("span", { class: "imp-fiche__nom" }, impostor ? impostor.username : "???"))),
      mots, white, classement, actions);
    S.ui = { classement, actions, suite };
    const details = el("details", { class: "imp-regles" },
      el("summary", {}, "Qui a voté quoi"),
      el("ul", { class: "imp-qui" }, Object.entries(r.votes || {}).map(([a, b]) =>
        el("li", {}, `${nom(a)} a voté pour ${nom(b)}`))));
    monter(el("div", { class: "imp-revele" },
      r.isLastRound ? null : barreQuitter(),
      el("h1", { class: "imp-titre-ecran" }, "Le verdict"),
      infoManche(r.isLastRound ? "fin de partie" : "révélation"),
      urne, bloc, suite, details), focus);

    const etape4 = () => {
      suite.classList.remove("hidden");
      if (!instant) suite.classList.add("arrive");
      S.revealDone = true;
      majActions();
      if (S.ranking) montrerPodium();
    };
    const etape3 = () => {
      bloc.classList.remove("hidden");
      apres(etape4, delai(900));
    };
    const etape2 = () => {
      bulletins.forEach((b) => { b.li.classList.remove("imp-bulletin--allume"); granUI.countUp(b.n, b.total); });
      apres(etape3, delai(1000));
    };
    if (instant) {
      bulletins.forEach((b) => { b.n.textContent = b.total; });
      etape3();
      return;
    }
    if (reduit()) { etape2(); return; }
    let pas = 0;
    const roulement = chaque(() => {
      bulletins.forEach((b, i) => b.li.classList.toggle("imp-bulletin--allume", i === pas % bulletins.length));
      pas += 1;
      if (pas > 12) { arreter(roulement); etape2(); }
    }, 100);
  }

  /* ---------- Reprise de l'écran depuis un état serveur ---------- */

  function aplatirIndices(h) {
    const res = {};
    S.order.forEach((pid) => { res[pid] = []; });
    Object.keys(h || {}).sort((a, b) => Number(a) - Number(b)).forEach((tour) => {
      (h[tour] || []).forEach((e) => {
        if (!res[e.playerId]) res[e.playerId] = [];
        res[e.playerId].push({ hint: e.hint, skipped: !!e.skipped });
      });
    });
    return res;
  }

  function appliquerEtat(st) {
    S.options = { ...OPTIONS_PAR_DEFAUT, ...(st.options || S.options) };
    S.round = st.round || 0;
    S.totalRounds = st.totalRounds || S.options.rounds;
    S.scores = st.scores || {};
    S.over = !!st.over;
    S.myVote = null;
    S.pendingVote = null;
    S.reveal = null;
    S.ranking = st.ranking || null;
    S.carteOuverte = false;
    if (st.phase !== "lobby") {
      S.word = st.word == null ? null : st.word;
      S.role = st.role || "player";
      S.mrWhite = !!st.mrWhite;
      S.order = Array.isArray(st.order) ? st.order : [];
      S.timer = st.timer || S.options.timer;
      S.hints = aplatirIndices(st.hints);
      S.myVote = st.myVote || null;
    }
    switch (st.phase) {
      case "hints": {
        afficherManche();
        S.order.forEach((pid) => (S.hints[pid] || []).forEach((h) => ajouterIndice(pid, h.hint, h.skipped, false)));
        if (st.currentId) demarrerTour(st.currentId, st.turnLeftMs || 0); else paintTours();
        break;
      }
      case "voting": afficherVote(); break;
      case "white_guess": afficherWhite(st.whiteId, st.guessLeftMs || 0); break;
      case "revealed": if (st.reveal) afficherReveal(st.reveal, { instant: true }); else afficherSalon(); break;
      default: afficherSalon();
    }
  }

  /* ---------- Écran « reprise ailleurs » ---------- */

  function afficherRemplace() {
    clearTimers();
    S.replaced = true;
    currentRoomId = "";
    granRouter.setLeaveGuard(null);
    statut.hidden = true;
    monter(el("div", { class: "imp-vote-ecran" },
      el("h1", { class: "imp-titre-ecran" }, "Partie reprise dans un autre onglet"),
      el("p", { class: "imp-intro" }, "Tu as rejoint cette partie depuis un autre onglet ou appareil. Celui-ci ne reçoit plus rien."),
      el("a", { class: "key key--principal key--bloc", href: "#/" }, "Retour à l'accueil")));
  }

  /* ---------- Écouteurs socket (références stables : on les retire dans leave()) ---------- */

  const surSocket = {
    "imp:joined": (d) => {
      if (!S) return;
      clearBusy();
      S.code = d.code; S.you = d.you; S.token = d.token; S.hostId = d.hostId; S.replaced = false;
      currentRoomId = d.code;
      S.vus = new Set();
      setJoueurs(d.players);
      const moi = S.players.find((p) => p.id === d.you);
      if (moi) S.username = moi.username;
      granReprise.save(P, { code: d.code, pid: d.you, token: d.token, username: S.username });
      statut.hidden = true;
      if (d.resumed && S.auto) granUI.toast(`Tu es de retour dans la salle ${d.code}`, { type: "succes" });
      S.auto = false;
      appliquerEtat(d.state || { phase: "lobby" });
    },
    "imp:room": (d) => {
      if (!S || !S.code) return;
      const avant = S.hostId;
      S.hostId = d.hostId;
      setJoueurs(d.players);
      if (avant && avant !== S.hostId) {
        granUI.toast(S.hostId === S.you ? "Tu es maintenant l'hôte." : `${nom(S.hostId)} est maintenant l'hôte.`, { type: "info" });
      }
      if (S.phase === "lobby") rafraichirSalon();
      else if (S.phase === "hints") { paintTours(); majHote(); }
      else if (S.phase === "voting") { peindreVote(); majHote(); }
      else if (S.phase === "revealed") majActions();
    },
    "imp:replaced": () => { if (S && S.code) afficherRemplace(); },
    "imp:error": (e) => {
      if (!S) return;
      const code = e && e.code;
      const msg = (e && e.message) || "Une erreur est survenue.";
      clearBusy();
      if (code === "resume_failed") {
        granReprise.clear(P);
        resetClient();
        allerEntree(null, { message: msg, focus: true });
        return;
      }
      if (!S.code) {
        currentRoomId = "";
        if (!entree) return;
        entree.setBusy(false);
        const champ = ["room_not_found", "bad_code", "game_in_progress", "room_full"].includes(code) ? "code" : code === "invalid" || code === "username_taken" ? "pseudo" : "general";
        entree.showError(champ, msg);
        entree.refreshResume();
        return;
      }
      if (S.pendingVote && !S.myVote) { S.pendingVote = null; peindreVote(); }
      const f = S.ui && S.ui.formulaire;
      if (f && f.form.isConnected) { f.poser.disabled = false; f.input.readOnly = false; }
      granUI.toast(msg, { type: "erreur" });
    },
    lobby_options_updated: (d) => {
      if (!S || !S.code || !d || !d.options) return;
      S.options = { ...OPTIONS_PAR_DEFAUT, ...d.options };
      S.totalRounds = S.options.rounds;
      if (S.phase === "lobby") syncOptions();
    },
    round_started: (d) => {
      if (!S || !S.code) return;
      setJoueurs(d.players);
      S.round = d.round; S.totalRounds = d.totalRounds; S.timer = d.timer;
      S.word = d.word == null ? null : d.word;
      S.role = d.role || "player"; S.mrWhite = !!d.mrWhite;
      S.order = Array.isArray(d.order) ? d.order : S.players.map((p) => p.id);
      S.hints = {}; S.order.forEach((pid) => { S.hints[pid] = []; });
      S.myVote = null; S.pendingVote = null; S.reveal = null; S.ranking = null; S.over = false;
      S.carteOuverte = false;
      afficherManche({ distribution: true });
    },
    next_turn: (d) => {
      if (!S || !S.code || S.phase !== "hints" || !d || !d.playerId) return;
      demarrerTour(d.playerId, S.timer * 1000);
    },
    hint_submitted: (d) => {
      if (!S || !S.code || !d) return;
      if (!S.hints[d.playerId]) S.hints[d.playerId] = [];
      S.hints[d.playerId].push({ hint: d.hint, skipped: !!d.skipped });
      if (S.phase !== "hints") return;
      ajouterIndice(d.playerId, d.hint, !!d.skipped, true);
      if (d.playerId === S.currentId) {
        if (S.stopChrono) { S.stopChrono(); S.stopChrono = null; }
        S.ui.saisie.replaceChildren();
        S.ui.formulaire = null;
        S.currentId = null;
      }
      paintTours();
    },
    all_hints_done: () => { if (S && S.code) afficherVote(); },
    vote_accepted: (d) => {
      if (!S || !S.code || S.phase !== "voting") return;
      S.myVote = (d && d.votedId) || S.pendingVote;
      S.pendingVote = null;
      peindreVote();
    },
    "imp:white_guess_start": (d) => {
      if (!S || !S.code || !d) return;
      afficherWhite(d.whiteId, d.durationMs || 0);
    },
    reveal_results: (r) => {
      if (!S || !S.code || !r) return;
      afficherReveal(r);
    },
    game_over: (d) => {
      if (!S || !S.code || !d) return;
      S.over = true;
      S.ranking = d.ranking || [];
      majGarde();
      if (S.revealDone) { montrerPodium(); majActions(); }
    },
    host_changed: () => { if (S && S.code) majHote(); },
    connect: () => {
      if (!S) return;
      statut.hidden = true;
      if (!S.code || S.replaced) return;
      const e = granReprise.get(P);
      if (e) { S.auto = true; socket.emit("imp:resume", { code: e.code, token: e.token }); }
    },
    disconnect: () => {
      if (!S || !S.code) return;
      granReprise.touch(P, GRACE_MS);
      statut.textContent = "Connexion perdue. Reconnexion en cours…";
      statut.hidden = false;
    },
  };
  const surPagehide = () => { if (S && S.code) granReprise.touch(P, GRACE_MS); };

  function attacher() {
    if (attache) return;
    attache = true;
    Object.entries(surSocket).forEach(([ev, fn]) => socket.on(ev, fn));
    window.addEventListener("pagehide", surPagehide);
  }
  function detacher() {
    if (!attache) return;
    attache = false;
    Object.entries(surSocket).forEach(([ev, fn]) => socket.off(ev, fn));
    window.removeEventListener("pagehide", surPagehide);
  }

  /* ---------- Routeur ---------- */

  granRouter.register("imposteur", {
    enter(params) {
      const point = document.querySelector('[data-vue="imposteur"] [data-montage]');
      if (!point) return;
      S = nouvelEtat();
      quitForfeit = false;
      statut = el("p", { class: "imp-statut", role: "status", hidden: true });
      vue = el("div", { class: "imp-vue" });
      point.replaceChildren(statut, vue);
      attacher();
      allerEntree(params && params.code ? params.code : null);
    },
    leave() {
      detacher();
      clearTimers();
      if (!S) return;
      clearBusy();
      if (S.code && !S.replaced) {
        if (quitForfeit || !enPartie()) {
          socket.emit("imp:leave", { forfeit: true });
          granReprise.clear(P);
        } else {
          socket.emit("imp:leave", {});
          granReprise.touch(P, GRACE_MS);
        }
      }
      const dialog = document.getElementById("imp-quitter");
      if (dialog && dialog.open) dialog.close();
      granRouter.setLeaveGuard(null);
      S = null;
      entree = null;
      quitForfeit = false;
      currentRoomId = "";
      granAuth.flushReconnect();
    },
  });
})();
