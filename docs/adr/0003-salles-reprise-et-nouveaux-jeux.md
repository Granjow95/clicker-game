# ADR 0003 — Codes de salle générés, reprise de partie, Imposteur v2, Gribouille, Petit Bac, Mot Caché, Écho

- Statut : accepté
- Date : 2026-11-24

## Contexte

- Une salle est aujourd'hui créée par **jointure** (`join_or_create_room` : nom libre de 30 caractères, créé s'il n'existe pas). Une faute de frappe crée une salle vide au lieu d'une erreur. L'accueil propose un formulaire « On t'a donné un code ? » (`#form-rejoindre`, câblé dans `javascript/app.js`) qui ne mène qu'à l'Imposteur.
- L'état Imposteur (`backend/games/imposteur.js`) est indexé par `socket.id` : `rooms[].id`, `impostorId`, `votesState`, `hints[].playerId`, `playerPoints`. Une déconnexion appelle `removePlayer` : le joueur perd pseudo, points et rôle. Un changement de compte (`granAuth.flushReconnect`) ou une coupure réseau donne un nouveau `socket.id`.
- Socket.io met jusqu'à `pingInterval + pingTimeout` (≈ 45 s par défaut) à détecter une connexion morte : un joueur peut revenir **avant** que le serveur ait vu son départ.
- Limiteur global par socket (`server.js`) : rafale 30, 15 msg/s ; au-delà, les paquets sont ignorés. Tampon max 200 Ko.
- Le client est en scripts classiques partageant des globales (`eslint.config.js`), vues `section[data-vue]` persistantes, routeur `#/`.
- `connectionStateRecovery` de Socket.io (v4.6+) a été écarté : il ne couvre qu'une coupure courte du même onglet, pas la fermeture d'onglet, le clic sur Quitter ni le nouveau handshake après changement de compte (non revérifié via Context7, indisponible dans cette session).

## Décisions

### 1. Codes de salle générés par le serveur

- Alphabet `BCDFGHJKLMNPQRSTVWXZ` (20 consonnes : pas de voyelle donc pas de mot, pas de `I/O/U/Y`), **4 lettres** (160 000 codes), tirage `crypto.randomInt`, unicité **par jeu**, 50 essais puis erreur `server_full`. Constantes dans `backend/config.js` : `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH = 4`.
- Normalisation entrante `normalizeCode(v)` : `clean(v, 10)`, majuscules, suppression de tout sauf `A-Z` ; invalide si ≠ `/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/` → erreur `bad_code` (pas de recherche).
- **Création et jointure sont deux événements distincts.** Rejoindre une salle inexistante → `room_not_found` (« Aucune salle avec ce code. Vérifie-le ou crée une salle. »). `join_or_create_room` est supprimé (voir Migration).
- Anti-énumération : en plus du limiteur global, `create`/`join`/`resume` partagent un limiteur par socket de 10 appels / 60 s (`createKeyedLimiter` sur `socket.id`) ; dépassement → `rate_limited`.
- L'accueil n'a plus de formulaire de code. Les liens `#/<jeu>/<CODE>` **pré-remplissent** le champ « Rejoindre » de l'écran d'entrée du jeu ; jamais de jointure automatique.

### 2. Module commun `backend/lib/rooms.js` (plutôt que la duplication)

Trois jeux (Imposteur, Gribouille, Petit Bac) ont besoin des mêmes garanties : code, hôte vérifié, un socket = une salle par jeu, reprise, période de grâce. Les dupliquer multiplierait les failles. Le module ne connaît aucune règle de jeu ; chaque jeu fournit des crochets.

```js
const reg = createRoomRegistry(io, {
  prefix: "gri",                 // salle Socket.io `gri:<CODE>`, événements `gri:*`, socket.data.rooms.gri
  maxPlayers: MAX_GRIBOUILLE_PLAYERS,
  graceMs: RESUME_GRACE_MS,      // 120 000
  canJoin(room) -> null | { code, message },     // ex. Imposteur : refus pendant hints/voting
  snapshotFor(room, player) -> object,           // état visible par CE joueur (reprise et arrivée)
  onJoin(room, player), onDisconnect(room, player), onResume(room, player),
  onRemove(room, player, reason /* "left" | "expired" | "forfeit" */),
  onHostChange(room, newHost), onEmpty(room),
});
reg.register(socket);            // câble P:create, P:join, P:resume, P:leave
reg.onSocketDisconnect(socket);  // appelé depuis server.js
reg.bySocket(socket) -> { room, player } | null   // SEULE source d'identité des handlers de jeu
reg.hostOf(room), reg.connected(room), reg.toPlayer(player, ev, data), reg.toRoom(room, ev, data)
reg.forgetUser(uid), reg.dispose()
```

- `room = { code, players: [], hostPid, state: Object.create(null), createdAt }` dans une `Map` (pas de prototype, insensible à `__proto__`).
- `player = { pid, username, connected, socketId }` + propriétés **non énumérables** `userId`, `tokenHash`, `graceTimer`.
- Les handlers de jeu **ignorent tout `roomId` envoyé par le client** : la salle vient de `reg.bySocket(socket)`.
- Tous les minuteurs (grâce, phases) sont `unref()` et purgés par `dispose()`/`onEmpty` (sinon `node --test` ne se termine pas).

### 3. Identité stable : `pid` serveur, distinct du socket

- À la création/jointure, le serveur tire `pid = crypto.randomBytes(9).toString("base64url")` (public, remplace `socket.id` dans toutes les charges utiles et tous les états : `impostorId`, votes, `hints[].playerId`, points, scores) et `token = crypto.randomBytes(32).toString("base64url")` (secret, envoyé au seul propriétaire). Le serveur ne garde que `sha256(token)`, comparé par `crypto.timingSafeEqual`.
- Choix retenu face au **remappage** des dictionnaires indexés par `socket.id` : un remappage doit toucher chaque structure (actuelle et future) au bon moment et crée des courses (vote reçu pendant le remappage). Avec un `pid`, la reprise ne change qu'un pointeur `player.socketId`. Conséquence : `socket.id` n'est plus jamais envoyé aux autres joueurs.
- Le jeton est **renouvelé à chaque reprise** (`P:joined.token`) ; l'ancien devient invalide.
- `userId` reste celui figé à la première jointure (pas d'écrasement à la reprise).

### 4. Reprise de partie

- **Départ accidentel** = `disconnect` du socket **ou** `P:leave` sans `forfeit` pendant une partie (hors salon et hors fin de partie). Le joueur reste dans `room.players` avec `connected: false` pendant `RESUME_GRACE_MS` (120 s). Pendant la grâce : son tour d'indice est sauté, les votes et « tout le monde a trouvé » ne l'attendent pas, ses votes et réponses déjà envoyés comptent. À l'expiration → `onRemove(..., "expired")` (logique actuelle de `removePlayer`).
- **Départ définitif** = `P:leave { forfeit: true }`, ou n'importe quel départ en salon / après `game_over` → retrait immédiat.
- **Hôte** : `room.hostPid` explicite (et non plus « premier du tableau »). S'il se déconnecte ou part, l'hôte passe au **prochain joueur connecté** dans l'ordre d'arrivée ; il ne revient pas à l'ancien hôte à sa reprise (pas de bascule). Une salle sans joueur connecté garde son état jusqu'à la dernière expiration.
- **`P:resume { code, token }`** : code normalisé, salle existante, joueur trouvé par hachage du jeton, période non expirée. Si le joueur est **encore marqué connecté** (le serveur n'a pas vu la coupure), la reprise **remplace** l'ancien socket : il reçoit `P:replaced`, quitte la salle Socket.io et perd l'association. Échec → `P:error { code: "resume_failed" }` (message unique, on ne dit pas pourquoi).
- **Client** (`javascript/reprise.js`, globale `granReprise`) : `localStorage["granGames:reprise:<prefix>"] = { code, pid, token, username, exp }`. `exp = now + graceMs` écrit sur `disconnect`, `pagehide` et `P:leave` doux ; plafond absolu 6 h après la jointure ; effacé sur `P:error resume_failed`, `forfeit`, `game_over` suivi d'une sortie. Reprise **automatique** sur l'événement `connect` du socket si la vue du jeu est active et l'entrée valide ; sinon bouton « Reprendre la partie » sur l'écran d'entrée du jeu (et toast avec action sur l'accueil au chargement). Un seul onglet reprend à la fois : la reprise remplace l'autre socket (`P:replaced` → écran « Partie reprise dans un autre onglet »).

### 5. Protocole commun (préfixe `P` ∈ `imp`, `gri`, `pb`)

| Sens | Événement | Charge utile | Validation |
|---|---|---|---|
| C→S | `P:create` | `{ username }` | `clean(…, 20)` non vide ; `MAX_ROOMS` par jeu |
| C→S | `P:join` | `{ code, username }` | code normalisé, salle existante, `maxPlayers`, `canJoin` |
| C→S | `P:resume` | `{ code, token }` | `clean(token, 64)`, voir §4 |
| C→S | `P:leave` | `{ forfeit?: boolean }` | — |
| S→C | `P:joined` | `{ code, you: pid, token, hostId, players, resumed, state }` | au seul socket concerné |
| S→C | `P:room` | `{ code, hostId, players: [{ id: pid, username, connected }] }` | à la salle |
| S→C | `P:error` | `{ code, message }` ; codes : `bad_code`, `room_not_found`, `room_full`, `server_full`, `game_in_progress`, `resume_failed`, `rate_limited`, `invalid` | |
| S→C | `P:replaced` | `{}` | |

Rejoindre une autre salle du même jeu quitte la précédente (départ définitif). Un socket peut être dans une salle de chaque jeu.

### 6. Imposteur v2 (`imp:`)

- Remplacements : `join_or_create_room` → `imp:create`/`imp:join` ; `room-created` → `imp:joined` ; `room_update` → `imp:room` ; `error_message` → `imp:error`. Les événements de jeu gardent leur nom (`update_lobby_options`, `start_round`, `submit_hint`, `force_vote`, `vote`, `force_reveal`, `start_next_round`) ; leur `roomId` est ignoré.
- Joueurs : `players[].id` = `pid`. `next_turn` reste un index dans `players` (liste courante, joueurs déconnectés inclus).
- Options : `{ rounds 1–10, timer 10–120, mrWhite: boolean }` (`sanitizeOptions` : `mrWhite === true`).
- **Mr White** : actif si `mrWhite` et **≥ 4 joueurs connectés** au lancement de la manche (sinon manche sans lui, `round_started.mrWhite = false`). Tirage : 1 imposteur, 1 Mr White distinct, le reste civils. `round_started` par joueur : `{ word: string | null, role: "player" | "white", mrWhite, players, order, timer, round, totalRounds }` ; l'imposteur reçoit `role: "player"` (il ne sait pas qu'il est l'imposteur) ; seul Mr White reçoit `word: null`.
- **Ordre de parole** : `st.order` (liste de `pid`) tourne pour que le premier soit un joueur connecté **non Mr White** tiré au hasard. `nextPlayerToHint` suit `order` et saute les déconnectés ; un joueur sauté est consigné `{ playerId, hint: null, skipped: true }` (diffusé via `hint_submitted`) pour ne pas revenir dans le tour.
- **Phases** : `hints` → `voting` → (`white_guess`) → `revealed`. Vote : cible = `pid` présent dans la salle (connecté ou non), jamais soi-même, un vote. Finalisation quand tous les **connectés** ont voté (ou `force_reveal`).
- **Plus voté** : majorité stricte ; **égalité en tête → personne n'est éliminé** (`mostVoted = null`).
- Si Mr White est le plus voté : phase `white_guess`, `imp:white_guess_start { whiteId, durationMs: 30000 }` à la salle ; Mr White envoie `imp:white_guess { guess }` (`clean(…, 40)`, une seule tentative). Expiration, départ ou `force_reveal` de l'hôte = échec. Comparaison par `normalizeWord` (`backend/lib/util.js`) : NFD, suppression des diacritiques, minuscules, apostrophes/tirets/espaces multiples réduits, suppression d'un article initial (`le la les l' un une des`).
- **Barème** (par manche) : votant → imposteur **+100** ; votant → Mr White **+50** ; imposteur non éliminé **+100** ; Mr White non éliminé **+100** ; Mr White éliminé et mot trouvé **+150**, sinon 0. `scoreVotes(votes, { impostorId, whiteId, whiteGuessCorrect }, points)` reste pure ; un 2ᵉ argument chaîne vaut `{ impostorId }` (compatibilité des tests).
- `reveal_results` ajoute `whiteId` (ou `null`), `whiteGuess`, `whiteGuessCorrect` ; `impostorIndex` conservé. Historique : `meta.role ∈ impostor | white | player`.
- Reprise : `snapshotFor` renvoie phase, mot/rôle **du joueur**, `order`, indices, son vote, options, manche, scores, `whiteId` seulement après la révélation. Jamais l'imposteur avant `reveal_results`.
- Arrivées : `canJoin` refuse en `hints`, `voting`, `white_guess` (inchangé) ; la reprise est toujours permise.
- **Mots** : `backend/games/imposteur-mots.js` exporte `WORD_PAIRS = [{ theme, normal, impostor }]`, **≥ 80 paires**, ≥ 8 thèmes, chaque mot ≤ 30 caractères, `normal` uniques, `normalizeWord(normal) !== normalizeWord(impostor)`.

### 7. Gribouille (`gri:`)

- 2 à 8 joueurs (`MAX_GRIBOUILLE_PLAYERS = 8`). Options hôte en salon : `{ rounds 1–5 (3), drawTime 30–120 (80) }`. Une manche = chaque joueur connecté dessine une fois, dans l'ordre d'arrivée ; arrivée possible à tout moment (devine tout de suite, dessinera si l'ordre l'atteint).
- Phases : `lobby` → `choosing` (15 s) → `drawing` (`drawTime`) → `turn_end` (5 s) → … → `over`.
- Événements C→S :
  - `gri:options { rounds, drawTime }` (hôte, `lobby`) ; `gri:start {}` (hôte, ≥ 2 connectés).
  - `gri:choose { index }` (dessinateur, `choosing`, entier 0–2 ; à l'expiration : tirage au hasard).
  - `gri:draw { id, c, w, p }` (dessinateur, `drawing`) : `id` entier 0–65535 (trait ; même `id` = suite du trait), `c` index de palette 0–11, `w` index d'épaisseur 0–3, `p` tableau **plat** d'entiers `[x0, y0, x1, y1, …]`, coordonnées **normalisées 0–1000** (indépendantes de la taille du canvas), longueur paire, 2 à 128 valeurs (≤ 64 points). Tout écart → message ignoré.
  - `gri:undo { id }`, `gri:clear {}` (dessinateur, `drawing`).
  - `gri:guess { text }` (non-dessinateur connecté, `drawing`) : `clean(…, 40)`, non vide.
- **Débit des traits** : limiteur dédié par dessinateur `createRateLimiter({ capacity: 20, perSecond: 12 })` sous le plafond global (15/s), partagé par `draw`/`undo`/`clear`. Le client regroupe les points et envoie au plus **un segment toutes les 80 ms**. Plafond par tour : 3 000 segments ou 150 000 valeurs ; au-delà, ignoré. Le serveur garde les segments du tour (même plafond) pour le `snapshotFor` (reprise, arrivée). Relais par `socket.to("gri:<CODE>")`, jamais `volatile` (un trait perdu désynchronise).
- **Devinettes** : limiteur 2/s (rafale 4) par joueur. Bonne réponse (`normalizeWord` égal) : texte **jamais diffusé** ; `gri:correct { playerId, points }` à la salle. Réponse à une lettre près (distance de Levenshtein 1, mot ≥ 4 lettres) : `gri:close {}` au seul auteur. Sinon `gri:chat { playerId, text }`. Les messages de qui a déjà trouvé ne vont qu'au dessinateur et aux autres trouveurs.
- **Points** : devineur `50 + round(450 × restant / drawTime)` arrondi à 10 ; dessinateur **+50 par trouveur**. Fin de tour : temps écoulé, tous les connectés non dessinateurs ont trouvé, ou **dessinateur déconnecté** (fin immédiate, `reason: "drawer_left"`, pas de grâce pour le tour en cours).
- **Indices** : masque `_` par lettre (espaces, tirets, apostrophes visibles) ; une lettre révélée à 50 % puis à 75 % du temps si le mot a ≥ 4 lettres.
- Événements S→C : `gri:choosing { drawerId, round, totalRounds, durationMs }` (salle) ; `gri:choices { words: [3] }` (dessinateur) ; `gri:turn_start { drawerId, mask, durationMs }` (salle) ; `gri:word { word }` (dessinateur) ; `gri:hint { mask }` ; `gri:draw`, `gri:undo`, `gri:clear` (relais) ; `gri:chat`, `gri:correct`, `gri:close` ; `gri:turn_end { word, reason, gained: { pid: pts }, scores }` ; `gri:game_over { ranking: [{ id, username, score }] }`. Le mot n'est envoyé aux devineurs qu'au `turn_end`.
- Mots : `backend/games/gribouille-mots.js`, ≥ 200 noms faciles à dessiner, uniques après `normalizeWord`.

### 8. Petit Bac (`pb:`)

- 2 à 10 joueurs (`MAX_PETITBAC_PLAYERS = 10`). Options hôte en salon : `{ rounds 1–10 (5), duration 60–180 (90), categories: [6 index distincts] }` parmi une liste serveur de 12 (défaut : Prénom, Pays ou ville, Animal, Métier, Fruit ou légume, Objet). Lettres tirées sans remise dans `A–Z` privé de `K Q W X Y Z`.
- Phases : `lobby` → `writing` → `collecting` (3 s) → `results` → … → `over`. Arrivée refusée en `writing`/`collecting` (`game_in_progress`), permise entre deux manches.
- C→S :
  - `pb:options { rounds, duration, categories }` (hôte, `lobby`) ; `pb:start {}` (hôte, ≥ 2 connectés) ; `pb:next {}` (hôte, `results`).
  - `pb:answers { answers }` : tableau de 6 chaînes `clean(…, 30)` ; le client envoie au plus toutes les 2 s pendant `writing` et immédiatement à `pb:stopped` ; accepté en `writing`/`collecting` ; limiteur 2/s. Le serveur garde la dernière version par `pid`.
  - `pb:stop { answers }` : accepté si les 6 réponses sont **toutes valides** (règle ci-dessous) ; sinon `pb:error { code: "invalid" }`.
- **Validation** : `normalizeWord(r)` de ≥ 2 caractères dont la première lettre est la lettre de la manche. **Points** par catégorie : 10 si la réponse normalisée est unique parmi les réponses valides, 5 si partagée, 0 si vide ou invalide. Les réponses d'un joueur déconnecté envoyées avant la coupure comptent.
- S→C : `pb:round_start { round, totalRounds, letter, categories: [noms], durationMs }` ; `pb:stopped { by: pid | null, graceMs: 3000 }` (`null` = temps écoulé) ; `pb:results { letter, categories, table: { pid: [{ text, valid, points }] }, gained, scores, isLastRound }` ; `pb:game_over { ranking }`.
- v2 (réservé, non implémenté) : `pb:contest { playerId, category }`, `pb:contest_vote { accept }`.

### 9. Jeux solo sans serveur

- **Mot Caché** (`#/mot-cache`) : 5 lettres, 6 essais. Liste intégrée `javascript/mot-cache-mots.js` : ≥ 400 solutions et ≤ 4 000 mots acceptés (sans accents, `A–Z`, < 40 Ko). Logique pure dans `javascript/mot-cache-logique.js` (globale `granMotCache` et `module.exports` si `typeof module !== "undefined"`, testable par `node:test`) : coloration en deux passes (exacts d'abord, puis présents dans la limite des occurrences restantes). Clavier AZERTY à l'écran + physique ; état non transmis par la couleur seule (lettre + motif + texte pour lecteurs d'écran). Statistiques en `localStorage["granGames:mot-cache"]`.
- **Écho** (`#/echo`) : 4 pavés (couleur + forme + son), séquence +1 par niveau, vitesse croissante bornée. WebAudio : un seul `AudioContext` créé au premier geste, `OscillatorNode` + enveloppe `GainNode` (pas de clic), mode muet. Touches 1–4. Reduced-motion : pas de pulsation, seulement un contour. Record `localStorage["granGames:echo-record"]`.

### 10. Client : intégration

- Vues : `section[data-vue=gribouille|petit-bac|mot-cache|echo]` créées une seule fois (lot fondations) avec un point de montage ; le markup interne est **injecté par le JS du jeu** au premier `enter()` (chaînes constantes ; toute donnée joueur passe par `textContent` ou `esc()`). Imposteur garde son markup statique.
- Écran d'entrée commun : `javascript/salle.js` (globale `granSalle.mount(container, { prefix, titre, onCreate, onJoin })`) : pseudo, « Créer une salle », « Rejoindre avec un code », « Reprendre la partie » si `granReprise` a une entrée valide, champ code pré-rempli par la route.
- Routes : `/gribouille`, `/gribouille/CODE`, `/petit-bac`, `/petit-bac/CODE`, `/mot-cache`, `/echo` ; les routes à code acceptent `[A-Za-z]{4}`.
- Le `granRouter.register('imposteur')` quitte `app.js` pour `javascript/imposteur.js` ; son `leave()` émet `imp:leave` doux en partie.

## Écarts à l'implémentation

- Limiteur par IP partagé entre tous les jeux (`sharedIpLimiter`, `backend/lib/rooms.js`) : `ROOM_IP_ACTIONS_PER_MIN` (60 par défaut) et `ROOM_IP_MAX_ROOMS` (5). Le script `npm test` les relève (1 000 000) pour ne pas bloquer les tests.
- Gribouille : budget de traits par tour de 40 000 valeurs et 1 500 segments, 8 M de valeurs au total pour le processus ; snapshot lourd limité à 1 par socket toutes les 2 s.
- Reprise refusée si le compte diffère (ou si l'on passe d'invité à compte).
- Imposteur : 3 tours d'indices maximum puis vote automatique ; minuteur de tour côté serveur ; `game_over` émis juste après la dernière révélation.

## Migration

Front (Netlify) et back (Render) se déploient séparément : le serveur est déployé d'abord avec `join_or_create_room` **maintenu en alias** (jointure d'une salle existante ou création avec code généré), puis le client, puis l'alias est retiré dans un commit `refactor(imposteur)!`.

## Conséquences

- `CLAUDE.md` (Conventions) doit être mis à jour : identité = `reg.bySocket(socket).player.pid` (plus `socket.id`), hôte = `room.hostPid`, salles `gri:`/`pb:`, événements préfixés `P:`.
- Tests backend : `rooms.test.js`, `imposteur-reprise.test.js`, `imposteur-white.test.js`, `imposteur-mots.test.js`, `gribouille.test.js`, `petit-bac.test.js`, `mot-cache.test.js` ; `socket.test.js` et `imposteur-fixes.test.js` réécrits avec un helper `createRoom()`/`joinRoom(code)`. `accueil.test.js` passe à 9 liens et vérifie `MAX_GRIBOUILLE_PLAYERS` et `MAX_PETITBAC_PLAYERS`. Les repères de l'ADR 0002 gagnent les types `Dessin` et `Mots`.
- Le karaoké garde son entrée actuelle ; sa migration vers `rooms.js` est un lot ultérieur.
- Risques : jeton en `localStorage` (lisible en cas de XSS : portée limitée à une place de salle, 120 s, renouvelé à chaque reprise) ; volume de traits ; minuteurs serveur non libérés en test.

## Conventional Commits

`docs(adr): ...`, `feat(rooms): ...`, `feat(reprise): ...`, `feat(imposteur): ...`, `feat(gribouille): ...`, `feat(petit-bac): ...`, `feat(mot-cache): ...`, `feat(echo): ...`, `refactor(accueil): ...`, `test(<portée>): ...`, `style(<jeu>): ...`, `refactor(imposteur)!: ...` (retrait de l'alias, avec pied `BREAKING CHANGE:`).
