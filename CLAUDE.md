# granGames

9 mini-jeux : Imposteur, Gribouille, Petit Bac, Karaoké en multi ; Lyrics, Mot Caché, Écho, Plus ou Moins et Course de frappe en solo. Front : HTML/CSS/JS vanilla (`index.html`, `javascript/`, `styles/`). Back : `backend/server.js` (Express 5 + Socket.io 4, `cd backend && npm start`).

## Équipe

Sous-agents définis dans `.claude/agents/`.

- Au-delà de quelques fichiers ou si plusieurs couches sont touchées : passer par `tech-lead` pour le plan avant de coder.
- Avant de déclarer une tâche terminée ou de committer : faire relire par `code-reviewer`.
- Solliciter `security` dès que les entrées utilisateur, les événements Socket.io ou les dépendances changent.
- Bug ou comportement inattendu : `debugger` avant de corriger.
- Délégation ciblée : `frontend` (client), `backend` (serveur), `ui-designer` (styles et textes), `qa` (tests).
- Les sous-agents n'utilisent jamais `git stash`, `checkout`, `reset` ni `restore` (un stash a déjà effacé temporairement le travail de l'équipe).
- Audit de consommation : dire « audit tokens ».

## Commandes

- `npm install` (racine) puis `npm run check` : ESLint (client + serveur) et `node --check` du backend.
- `npm test` : tests du backend (`node:test` + `socket.io-client`, vrai serveur sur port aléatoire). Il fixe `ROOM_IP_ACTIONS_PER_MIN` et `ROOM_IP_MAX_ROOMS` (limiteur par IP des salles). Utiles en test : `IMP_WHITE_GUESS_MS`, `IMP_TURN_TIMER_MS`, `RESUME_GRACE_MS`.
- Backend : `cd backend && npm start`. Variables : `PORT`, `ALLOWED_ORIGINS` (origines CORS séparées par des virgules), `NODE_ENV=production` ou `RENDER` défini (désactive l'accès localhost).

## Conventions

- Le client est en scripts classiques qui partagent des globales (ordre des `<script>` dans `index.html`, config dans `javascript/config.js`). Toute nouvelle globale partagée doit être déclarée dans `eslint.config.js`.
- Le serveur ne fait jamais confiance à l'identité envoyée par le client. Les actions de l'hôte sont vérifiées côté serveur. Toute chaîne reçue passe par `clean()`.
- Salles des jeux multi (Imposteur, Gribouille, Petit Bac, Karaoké) : `backend/lib/rooms.js` (`createRoomRegistry`), codes de 4 lettres générés par le serveur, événements préfixés `imp:` / `gri:` / `pb:` / `kk:` (create/join/resume/leave). Identité = `pid` serveur obtenu par `reg.bySocket(socket)` (plus jamais `socket.id` dans les charges utiles) ; hôte = `room.hostPid`. Jeton de reprise secret (sha256 côté serveur), période de grâce `RESUME_GRACE_MS`.
- Client : écran d'entrée commun `granSalle.mount` (`javascript/salle.js`), stockage de reprise `granReprise` (`javascript/reprise.js`). Les nouveaux jeux injectent leur markup depuis leur JS dans `section[data-vue] .jeu-montage`.
- Minuteurs serveur : toujours `unref()`.
- Côté client, tout pseudo ou indice affiché via `innerHTML` doit passer par `esc()` (ou utiliser `textContent`).
- États serveur dans des dictionnaires sans prototype (`Object.create(null)`), un socket = une salle par jeu.
- Imposteur : `impostorId` et `whiteId` sont des `pid`, jamais divulgués avant `reveal_results` ; Mr White à partir de 4 joueurs. La phase de manche (`hints` / `voting` / `white_guess` / `revealed`) est vérifiée côté serveur ; le départ définitif d'un joueur en cours de manche est géré dans `onPlayerRemove` (crochet `onRemove` du registre).
