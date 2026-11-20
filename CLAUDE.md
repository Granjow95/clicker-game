# granGames

Mini-jeux multijoueur. Front : HTML/CSS/JS vanilla (`index.html`, `javascript/`, `styles/`). Back : `backend/server.js` (Express 5 + Socket.io 4, `cd backend && npm start`).

## Équipe

Sous-agents définis dans `.claude/agents/`.

- Au-delà de quelques fichiers ou si plusieurs couches sont touchées : passer par `tech-lead` pour le plan avant de coder.
- Avant de déclarer une tâche terminée ou de committer : faire relire par `code-reviewer`.
- Solliciter `security` dès que les entrées utilisateur, les événements Socket.io ou les dépendances changent.
- Bug ou comportement inattendu : `debugger` avant de corriger.
- Délégation ciblée : `frontend` (client), `backend` (serveur), `ui-designer` (styles et textes), `qa` (tests).
- Audit de consommation : dire « audit tokens ».

## Commandes

- `npm install` (racine) puis `npm run check` : ESLint (client + serveur) et `node --check` du backend.
- `npm test` : tests du backend (`node:test` + `socket.io-client`, vrai serveur sur port aléatoire).
- Backend : `cd backend && npm start`. Variables : `PORT`, `ALLOWED_ORIGINS` (origines CORS séparées par des virgules), `NODE_ENV=production` ou `RENDER` défini (désactive l'accès localhost).

## Conventions

- Le client est en scripts classiques qui partagent des globales (ordre des `<script>` dans `index.html`, config dans `javascript/config.js`). Toute nouvelle globale partagée doit être déclarée dans `eslint.config.js`.
- Le serveur ne fait jamais confiance à l'identité envoyée par le client : utiliser `socket.id`. Les actions de l'hôte (premier joueur de la salle) sont vérifiées côté serveur. Toute chaîne reçue passe par `clean()`.
- Côté client, tout pseudo ou indice affiché via `innerHTML` doit passer par `esc()` (ou utiliser `textContent`).
- Salles Socket.io préfixées par jeu (`imp:`, `kk:`), états serveur dans des dictionnaires sans prototype (`Object.create(null)`), un socket = une salle par jeu. Ne pas envoyer `impostorIndex` avant `reveal_results`.
- L'imposteur est stocké par `impostorId` (pas par index) et la phase de manche (`hints` / `voting` / `revealed`) est vérifiée côté serveur ; le départ d'un joueur en cours de manche est géré dans `removePlayer`.
