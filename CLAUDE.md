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
