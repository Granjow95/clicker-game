// Le socket est créé dans auth.js (handshake avec le jeton du compte éventuel).
// Échappe le HTML : pseudos et indices viennent d'autres joueurs, jamais de confiance.
// (Les rendus de ce fichier passent par granUI.el / textContent ; esc() reste pour les autres scripts.)
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
const impEl = (id) => document.getElementById(id);
const MAX_JOUEURS = 8;

let currentPlayerId = "";
let connectionLost = false;
let closeLostToast = null;

let currentPlayers = [];
let currentUsername = "";
let currentRoomId = "";
let currentTurn = 0;
let activeIndex = 0;
let turnTimer = null;
let turnCountdown = 60;
let countdownInterval = null;
let joinTimer = null;
let votes = {};
let hasVoted = {};
let hasVotedFor = null;
let impostorIndex = 0;
let allHints = {};
let gameOptions = {
  totalRounds: 3,
  timer: 60,
};
let currentRound = 1;
let scores = {};

/* ---------- Petits outils d'affichage ---------- */

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const initiale = (nom) => (String(nom || "?").trim().charAt(0) || "?").toUpperCase();
const isHostMe = () => currentPlayers[0]?.id === currentPlayerId;

function avatar(nom, index, taille) {
  return granUI.el("span", {
    class: `imp-avatar imp-avatar--${taille} ${granUI.avatarClass(index)}`,
    "aria-hidden": "true",
  }, initiale(nom));
}

function setRoundInfo(texte) {
  const node = impEl("round-info");
  node.textContent = texte || "";
  node.classList.toggle("hidden", !texte);
}

function fieldError(id, message) {
  const input = impEl(id);
  const err = impEl(`${id}-err`);
  err.textContent = message;
  err.classList.remove("hidden");
  input.setAttribute("aria-invalid", "true");
  granUI.shake(input);
  input.focus();
}

function clearFieldErrors() {
  ["room-id", "username"].forEach((id) => {
    impEl(`${id}-err`).classList.add("hidden");
    impEl(id).removeAttribute("aria-invalid");
  });
}

function setJoining(busy) {
  clearTimeout(joinTimer);
  ["join-button", "create-button"].forEach((id) => {
    impEl(id).disabled = busy;
    if (busy) impEl(id).setAttribute("aria-busy", "true"); else impEl(id).removeAttribute("aria-busy");
  });
  if (busy) joinTimer = setTimeout(() => setJoining(false), 5000); // filet si le serveur ne répond pas
}

/* ---------- Remise à zéro (quitter la vue, connexion perdue) ---------- */

function resetImposteur() {
  clearInterval(turnTimer);
  clearInterval(countdownInterval);
  setJoining(false);
  clearFieldErrors();
  granRouter.setLeaveGuard(null);
  const dialog = impEl("imp-quitter");
  if (dialog.open) dialog.close();

  impEl("room-id").value = "";
  impEl("username").value = "";
  impEl("lobby-container").classList.remove("hidden");
  impEl("lobby-setup").classList.remove("hidden");
  impEl("lobby-salon").classList.add("hidden");
  impEl("impostor-title").classList.remove("hidden");
  impEl("word-bar").replaceChildren();
  impEl("word-bar").classList.add("hidden");
  setRoundInfo("");
  impEl("players-inputs").replaceChildren();
  impEl("hint-phase").replaceChildren();
  impEl("reveal-phase").replaceChildren();
  impEl("lobby-players").classList.add("hidden");
  impEl("lobby-list").replaceChildren();
  impEl("lobby-options").classList.add("hidden");
  impEl("new-game").classList.add("hidden");
  impEl("lobby-wait").classList.add("hidden");
  impEl("end-round").classList.add("hidden");

  currentPlayers = [];
  currentRoomId = "";
  currentUsername = "";
  currentTurn = 0;
  activeIndex = 0;
  currentRound = 1;
  impostorIndex = 0;
  votes = {};
  hasVoted = {};
  hasVotedFor = null;
  allHints = {};
  scores = {};
  gameOptions = { totalRounds: 3, timer: 60 };
}

/* ---------- Connexion ---------- */

socket.on("connect", () => {
  currentPlayerId = socket.id;
  if (!connectionLost) return;
  connectionLost = false;
  if (closeLostToast) closeLostToast();
  closeLostToast = null;
  // À la coupure le serveur nous a retiré de la salle : retour à l'entrée, code conservé.
  const code = currentRoomId;
  resetImposteur();
  impEl("room-id").value = code;
  granUI.toast("Tu n'es plus dans la salle. Rejoins-la avec le même code.", { type: "info", titre: "Reconnecté." });
});

socket.on("disconnect", (reason) => {
  if (reason === "io client disconnect" || !currentRoomId) return;
  connectionLost = true;
  if (closeLostToast) closeLostToast();
  closeLostToast = granUI.toast("On réessaie…", {
    type: "erreur",
    titre: "Connexion perdue.",
    duree: 0,
    action: { label: "Réessayer", onClick: () => socket.connect() },
  });
});

/* ---------- Salon ---------- */

function updateLobbyDisplay() {
  const host = isHostMe();
  impEl("lobby-count").textContent = `${currentPlayers.length}/${MAX_JOUEURS}`;

  const items = currentPlayers.map((p, i) => {
    const moi = p.id === currentPlayerId;
    return granUI.el("li", { class: `imp-joueur${moi ? " imp-joueur--moi" : ""}` },
      avatar(p.username || "Anonyme", i, "petit"),
      granUI.el("span", { class: "imp-joueur__nom" }, p.username || "Anonyme"),
      i === 0 ? granUI.el("span", { class: "badge badge--hote" }, "Hôte") : null,
      moi ? granUI.el("span", { class: "badge badge--moi" }, "Toi") : null);
  });
  impEl("lobby-list").replaceChildren(...items);

  impEl("lobby-options").classList.toggle("hidden", !host);
  const wait = impEl("lobby-wait");
  wait.classList.toggle("hidden", host || !currentPlayers.length);
  if (!host && currentPlayers.length) wait.textContent = `En attente de ${currentPlayers[0].username}…`;

  impEl("new-game").classList.toggle("hidden", !(host && !gameOptions._created));
  lockLobbyOptionsForNonMaster();
}

function lockLobbyOptionsForNonMaster() {
  const host = isHostMe();
  document.querySelectorAll("#lobby-options input, #lobby-options button").forEach((node) => {
    node.disabled = !host;
  });
}

function onRoomUpdate(room) {
  const ancienHote = currentPlayers[0]?.id;
  currentPlayers = room.players;
  const hote = currentPlayers[0];
  if (ancienHote && hote && hote.id !== ancienHote) {
    granUI.toast(hote.id === currentPlayerId ? "Tu es maintenant l'hôte." : `${hote.username} est maintenant l'hôte.`, { type: "info" });
  }
  updateLobbyDisplay();
}

function onRoomCreated(room) {
  currentPlayers = room.players;
  if (room.id) currentRoomId = room.id;
  setJoining(false);

  impEl("room-code-text").textContent = currentRoomId;
  const salonCache = impEl("lobby-salon").classList.contains("hidden");
  impEl("lobby-setup").classList.add("hidden");
  impEl("lobby-salon").classList.remove("hidden");
  if (salonCache) granUI.focusScreen(impEl("lobby-salon"));
  impEl("lobby-players").classList.remove("hidden");
  updateLobbyDisplay();
}

// Le leave() de la vue retire ces listeners : on les (re)pose à chaque jointure, sans doublon.
function bindRoomListeners() {
  socket.off("room_update", onRoomUpdate);
  socket.off("room-created", onRoomCreated);
  socket.on("room_update", onRoomUpdate);
  socket.on("room-created", onRoomCreated);
}
bindRoomListeners();

window.joinImpostorRoom = () => {
  bindRoomListeners();
  clearFieldErrors();

  const roomId = impEl("room-id").value.trim().slice(0, 30); // casse conservée : le serveur est sensible à la casse
  const username = impEl("username").value.trim();
  if (!roomId) return fieldError("room-id", "Entre le code de la salle.");
  if (!username) return fieldError("username", "Entre ton pseudo.");
  if (currentPlayers.length >= MAX_JOUEURS) return granUI.toast("Cette salle est pleine.", { type: "erreur" });

  currentUsername = username;
  currentRoomId = roomId;
  impEl("room-id").value = roomId;
  setJoining(true);
  socket.emit("join_or_create_room", { roomId, username });
};

// « Créer une nouvelle salle » : le serveur crée une salle quand le nom n'existe pas, on tire donc un code de 4 consonnes.
function randomRoomCode() {
  const lettres = "BCDFGHJKLMNPRSTVWXZ";
  const tirage = new Uint32Array(4);
  crypto.getRandomValues(tirage);
  return Array.from(tirage, (n) => lettres[n % lettres.length]).join("");
}

impEl("join-button").addEventListener("click", () => window.joinImpostorRoom());
impEl("create-button").addEventListener("click", () => {
  impEl("room-id").value = randomRoomCode();
  window.joinImpostorRoom();
});
["room-id", "username"].forEach((id) => {
  impEl(id).addEventListener("keydown", (e) => { if (e.key === "Enter") window.joinImpostorRoom(); });
});

impEl("copy-link").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#/imposteur/${encodeURIComponent(currentRoomId)}`;
  try {
    await navigator.clipboard.writeText(url);
    granUI.toast("Lien copié.");
  } catch {
    granUI.toast(`Copie impossible. Donne le code ${currentRoomId} à tes amis.`, { type: "erreur" });
  }
});

// Réglages : les boutons +/- passent par l'événement « input » des champs.
const roundsInput = impEl("round-count");
const timerInput = impEl("round-timer");
[roundsInput, timerInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (!isHostMe() || !currentRoomId) return;

    const rounds = parseInt(roundsInput.value || "3");
    const timer = parseInt(timerInput.value || "60");

    gameOptions.totalRounds = rounds;
    gameOptions.timer = timer;

    socket.emit("update_lobby_options", {
      roomId: currentRoomId,
      options: { rounds, timer },
    });
  });
});
document.querySelectorAll("[data-step-for]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = impEl(btn.dataset.stepFor);
    const min = Number(input.min);
    const max = Number(input.max);
    const next = (parseInt(input.value) || min) + Number(btn.dataset.step);
    input.value = Math.min(max, Math.max(min, next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

function startImpostorGame() {
  if (!currentRoomId) return granUI.toast("Aucune salle.", { type: "erreur" });
  if (!currentPlayers.length) return granUI.toast("Aucun joueur détecté.", { type: "erreur" });

  const rounds = parseInt(roundsInput.value || "3");
  const timer = parseInt(timerInput.value || "60");

  gameOptions.totalRounds = rounds;
  gameOptions.timer = timer;

  if (isHostMe() && !gameOptions._created) {
    gameOptions._created = true;

    socket.emit("update_lobby_options", {
      roomId: currentRoomId,
      options: { rounds, timer },
    });
  }
  socket.emit("start_round", currentRoomId);
}
impEl("new-game").addEventListener("click", startImpostorGame);

/* ---------- Quitter pendant une manche ---------- */

function confirmLeave() {
  const dialog = impEl("imp-quitter");
  const rester = impEl("imp-rester");
  const partir = impEl("imp-partir");
  return new Promise((resolve) => {
    let quitter = false;
    const onStay = () => granUI.closeDialog(dialog);
    const onLeave = () => { quitter = true; granUI.closeDialog(dialog); };
    rester.addEventListener("click", onStay);
    partir.addEventListener("click", onLeave);
    dialog.addEventListener("close", () => {
      rester.removeEventListener("click", onStay);
      partir.removeEventListener("click", onLeave);
      resolve(quitter);
    }, { once: true });
    granUI.openDialog(dialog);
  });
}

/* ---------- Indices ---------- */

function paintTurns() {
  currentPlayers.forEach((player, index) => {
    const line = impEl(`player-${index}`);
    if (!line) return;
    const actif = index === activeIndex;
    line.classList.toggle("imp-tour--actif", actif);
    const hasHint = (allHints[player.id] || []).length > 0;
    line.querySelector(".imp-tour__etat").textContent = actif ? "écrit…" : hasHint ? "a joué" : "attend";
    if (!actif) impEl(`timer-${index}`)?.classList.add("hidden");
  });
}

function startImpostorRound(_, displayedWord) {
  currentTurn = 0;
  activeIndex = 0;
  votes = {};
  hasVotedFor = null;
  hasVoted = {};
  allHints = {};
  clearInterval(turnTimer);
  clearInterval(countdownInterval);

  impEl("lobby-container").classList.add("hidden");
  impEl("impostor-title").classList.add("hidden");

  const wordBar = impEl("word-bar");
  wordBar.replaceChildren(
    granUI.el("span", { class: "imp-mot__etiquette" }, "Ton mot"),
    granUI.el("p", { class: "imp-mot__valeur" }, displayedWord),
    granUI.el("span", { class: "imp-mot__tampon", "aria-hidden": "true" }, "Confidentiel"));
  wordBar.classList.remove("hidden");
  setRoundInfo(`Manche ${currentRound}/${gameOptions.totalRounds}`);

  const playersContainer = impEl("players-inputs");
  playersContainer.replaceChildren();
  const template = impEl("player-template");

  currentPlayers.forEach((player, index) => {
    allHints[player.id] = [];

    const clone = template.content.cloneNode(true);
    const playerDiv = clone.querySelector(".imp-tour");
    playerDiv.id = `player-${index}`;

    const av = clone.querySelector(".imp-avatar");
    av.textContent = initiale(player.username);
    av.classList.add(granUI.avatarClass(index));
    clone.querySelector(".imp-tour__nom").textContent =
      player.id === currentPlayerId ? `${player.username} (toi)` : player.username;
    clone.querySelector(".imp-tour__timer").id = `timer-${index}`;
    clone.querySelector(".imp-tour__indices").id = `hints-${index}`;

    playersContainer.appendChild(clone);
  });
  paintTurns();

  impEl("hint-phase").replaceChildren();
  impEl("reveal-phase").replaceChildren();

  const endBtn = impEl("end-round");
  if (isHostMe()) {
    endBtn.classList.remove("hidden");
    endBtn.onclick = () => {
      socket.emit("force_vote", currentRoomId);
      endBtn.classList.add("hidden");
    };
  } else {
    endBtn.classList.add("hidden");
  }
}

function launchTurn() {
  turnCountdown = gameOptions.timer;
  const line = impEl(`player-${currentTurn}`);
  if (!line) return;

  const input = granUI.el("input", {
    type: "text",
    id: "hint-input",
    class: "imp-saisie__champ",
    maxlength: "40",
    autocomplete: "off",
    spellcheck: "false",
  });
  const validateBtn = granUI.el("button", { type: "submit", class: "key key--sombre imp-saisie__poser" }, "Poser");
  const form = granUI.el("form", { class: "imp-saisie arrive" },
    granUI.el("label", { class: "imp-saisie__label", for: "hint-input" }, "À toi : un mot pour ton indice"),
    granUI.el("div", { class: "imp-saisie__ligne" }, input, validateBtn));

  const timerDisplay = impEl(`timer-${currentTurn}`);
  if (timerDisplay) {
    timerDisplay.classList.remove("hidden");
    timerDisplay.textContent = mmss(turnCountdown);

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      turnCountdown--;
      timerDisplay.textContent = mmss(Math.max(0, turnCountdown));
      if (turnCountdown <= 0) {
        clearInterval(countdownInterval);
        if (document.body.contains(input)) form.requestSubmit();
      }
    }, 1000);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (validateBtn.disabled || !document.body.contains(input)) return; // requestSubmit contourne disabled
    const value = input.value.trim() || "(aucun mot)";
    socket.emit("submit_hint", {
      roomId: currentRoomId,
      playerId: currentPlayerId,
      hint: value,
    });

    clearInterval(countdownInterval);
    validateBtn.disabled = true;
    timerDisplay?.classList.add("hidden");
  });

  impEl("hint-phase").replaceChildren(form);
  input.focus();

  if (turnTimer) clearTimeout(turnTimer);
  turnTimer = setTimeout(() => {
    if (document.body.contains(input)) form.requestSubmit();
  }, gameOptions.timer * 1000);
}

function clearTurnUI() {
  clearTimeout(turnTimer);
  clearInterval(countdownInterval);
  impEl("hint-phase").replaceChildren();
}

/* ---------- Vote ---------- */

function showVotingPhase() {
  clearTurnUI();
  impEl("players-inputs").replaceChildren();
  impEl("word-bar").classList.add("hidden");
  impEl("end-round").classList.add("hidden");
  setRoundInfo(`Manche ${currentRound}/${gameOptions.totalRounds}, vote`);

  const revealPhase = impEl("reveal-phase");
  const grid = granUI.el("div", { class: "imp-votes", role: "radiogroup", "aria-label": "Suspect" });
  const status = granUI.el("div", { class: "imp-bilan hidden", role: "status" });
  const template = impEl("vote-button-template");

  currentPlayers.forEach((player, index) => {
    if (player.id === currentPlayerId) return; // pas de vote pour soi
    const btn = template.content.cloneNode(true).querySelector("button");
    const av = btn.querySelector(".imp-avatar");
    av.textContent = initiale(player.username);
    av.classList.add(granUI.avatarClass(index));
    btn.querySelector(".imp-vote__nom").textContent = player.username;

    btn.onclick = () => {
      if (hasVotedFor) return;
      hasVotedFor = player.id;
      hasVoted[currentPlayerId] = true;

      socket.emit("vote", {
        roomId: currentRoomId,
        voterId: currentPlayerId,
        votedId: player.id,
      });

      grid.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      btn.setAttribute("aria-checked", "true");
      btn.classList.add("voted", "imp-vote--choisi");
      btn.append(granUI.el("span", { class: "imp-vote__marque" }, "ton vote"));

      status.replaceChildren(
        `Tu as voté pour : ${player.username}.`,
        granUI.el("br"),
        granUI.el("span", { class: "imp-bilan__suite" }, "On attend les autres joueurs."));
      status.classList.remove("hidden");
    };

    grid.appendChild(btn);
  });

  granUI.showScreen(revealPhase, granUI.el("div", { class: "imp-vote-ecran" },
    granUI.el("h2", { class: "imp-titre-ecran" }, "Qui ment ?"),
    granUI.el("p", { class: "imp-intro imp-intro--doux" }, "Désigne un suspect. Tu ne peux pas voter pour toi."),
    grid,
    status));
}

/* ---------- Événements de partie ---------- */

socket.on("hint_submitted", ({ playerId, hint, players }) => {
  if (players) currentPlayers = players;
  const index = currentPlayers.findIndex((p) => p.id === playerId);
  if (index === -1) return;

  if (!allHints[playerId]) allHints[playerId] = [];
  allHints[playerId].push(hint);

  const hintZone = impEl(`hints-${index}`);
  if (hintZone) hintZone.appendChild(granUI.el("span", { class: "imp-indice" }, hint));

  activeIndex = (index + 1) % currentPlayers.length;
  paintTurns();

  if (playerId === currentPlayerId) clearTurnUI();
});

socket.on("next_turn", (turnNumber) => {
  clearTurnUI();
  currentTurn = turnNumber;
  activeIndex = turnNumber;
  paintTurns();

  const currentPlayer = currentPlayers[currentTurn];
  if (currentPlayer?.id === currentPlayerId) launchTurn();
});

socket.on("all_hints_done", showVotingPhase);

socket.on(
  "round_started",
  ({ word, players, impostorIndex: index, round, totalRounds, timer }) => {
    currentPlayers = players;
    impostorIndex = index;
    currentRound = round;
    turnCountdown = timer;
    gameOptions.totalRounds = totalRounds;
    gameOptions.timer = timer;
    if (round === 1) scores = {};
    granRouter.setLeaveGuard(confirmLeave);
    startImpostorRound(true, word);
  }
);

/* ---------- Révélation ---------- */

// Boutons de l'hôte sous la révélation (manche suivante, ou rejouer / accueil après la dernière manche).
function renderRevealActions(isLastRound) {
  const revealPhase = impEl("reveal-phase");
  revealPhase.querySelector(".imp-actions")?.remove();
  const box = granUI.el("div", { class: "imp-actions" });
  const host = isHostMe();

  if (!isLastRound) {
    if (host) {
      box.append(granUI.el("button", {
        type: "button",
        class: "key key--principal key--bloc next-round-button",
        onclick: () => socket.emit("start_next_round", currentRoomId),
      }, `Manche suivante (${currentRound + 1}/${gameOptions.totalRounds})`));
    } else if (currentPlayers[0]) {
      box.append(granUI.el("p", { class: "imp-attente" }, `En attente de ${currentPlayers[0].username}…`));
    }
  } else {
    if (host) {
      box.append(granUI.el("button", {
        type: "button",
        class: "key key--principal key--bloc imp-rejouer",
        onclick: () => socket.emit("start_round", currentRoomId),
      }, "Rejouer"));
    } else if (currentPlayers[0]) {
      box.append(granUI.el("p", { class: "imp-attente" }, `En attente de ${currentPlayers[0].username} pour rejouer…`));
    }
    box.append(granUI.el("a", { class: "key key--secondaire key--bloc", href: "#/" }, "Accueil"));
  }
  revealPhase.querySelector(".imp-revele")?.append(box);
}

socket.on(
  "reveal_results",
  ({
    votes: votesCast,
    impostorIndex,
    players,
    wordPair,
    scores: updatedScores,
    isLastRound,
    round,
    totalRounds,
  }) => {
    const previous = scores;
    scores = updatedScores;
    if (round) currentRound = round;
    if (totalRounds) gameOptions.totalRounds = totalRounds;

    impEl("word-bar").classList.add("hidden");
    impEl("end-round").classList.add("hidden");
    impEl("players-inputs").replaceChildren();
    setRoundInfo(`Manche ${currentRound}/${gameOptions.totalRounds}, ${isLastRound ? "fin de partie" : "révélation"}`);
    if (isLastRound) granRouter.setLeaveGuard(null);

    const impostor = players?.[impostorIndex];

    // Démasqué si l'imposteur a le plus de votes (même règle que le serveur).
    const counts = {};
    Object.values(votesCast || {}).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    const mostVoted = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const demasque = Boolean(impostor) && mostVoted === impostor.id;

    const impostorPos = Math.max(0, currentPlayers.findIndex((p) => p.id === impostor?.id));
    const fiche = granUI.el("div", { class: "imp-fiche imp-fiche--revele" },
      avatar(impostor?.username || "?", impostorPos, "enorme"),
      granUI.el("div", { class: "imp-fiche__texte" },
        granUI.el("span", { class: "imp-fiche__etiquette" }, "L'imposteur était"),
        granUI.el("span", { class: "imp-fiche__nom" }, impostor?.username || "???")),
      granUI.el("span", { class: "imp-tampon" }, demasque ? "Démasqué" : "Raté"));

    const mots = granUI.el("div", { class: "imp-mots" },
      granUI.el("div", { class: "imp-mots__case imp-mots__case--faux" },
        granUI.el("span", {}, "Son mot"),
        granUI.el("p", {}, wordPair?.impostor || "(inconnu)")),
      granUI.el("div", { class: "imp-mots__case imp-mots__case--juste" },
        granUI.el("span", {}, "Votre mot"),
        granUI.el("p", {}, wordPair?.normal || "(inconnu)")));

    const lignes = players.map((p) => ({
      username: p.username || "???",
      total: updatedScores?.[p.id] || 0,
      gain: (updatedScores?.[p.id] || 0) - (previous?.[p.id] || 0),
    }));
    lignes.sort((a, b) => b.total - a.total);
    const classement = granUI.el("ol", { class: "imp-classement" },
      lignes.map((l) => {
        const rang = 1 + lignes.filter((x) => x.total > l.total).length;
        return granUI.el("li", { class: rang === 1 ? "imp-classement__tete" : null },
          granUI.el("span", { class: "imp-classement__rang" }, rang),
          granUI.el("span", { class: "imp-classement__nom" }, l.username),
          granUI.el("span", { class: "imp-classement__gain" }, l.gain > 0 ? `+${l.gain}` : ""),
          granUI.el("span", { class: "imp-classement__total" }, l.total));
      }));

    granUI.showScreen(impEl("reveal-phase"), granUI.el("div", { class: "imp-revele" },
      fiche,
      mots,
      granUI.el("h2", { class: "imp-h2" }, isLastRound ? "Classement final" : "Classement"),
      classement));
    renderRevealActions(isLastRound);
  }
);

socket.on("lobby_options_updated", ({ options }) => {
  gameOptions.totalRounds = options.rounds;
  gameOptions.timer = options.timer;

  // Met à jour visuellement les champs si l'utilisateur n'est pas l'hôte
  if (!isHostMe()) {
    roundsInput.value = options.rounds;
    timerInput.value = options.timer;
  }
});

socket.on("error_message", (msg) => {
  setJoining(false);
  granUI.toast(msg, { type: "erreur" });
});

// L'hôte a quitté en cours de partie : le nouvel hôte récupère les boutons de la phase en cours.
socket.on("host_changed", ({ phase, isLastRound }) => {
  if (phase === "hints") {
    const endBtn = impEl("end-round");
    endBtn.classList.remove("hidden");
    endBtn.onclick = () => {
      socket.emit("force_vote", currentRoomId);
      endBtn.classList.add("hidden");
    };
  } else if (phase === "revealed") {
    renderRevealActions(Boolean(isLastRound));
  }
});
