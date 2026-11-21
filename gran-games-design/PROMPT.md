# Message à coller dans Claude Code

Copie tout ce qui est sous la ligne.

---

Contexte : Gran'Games est mon site de mini-jeux entre amis (HTML/CSS/JS vanilla, aujourd'hui tout dans un seul `index.html`, avec `styles/imposteur.css`, `lyrics.css`, `karaoke.css`, `main-menu.css`). J'ai un nouveau design complet dans `design/` : lis d'abord `design/README.md`, `design/docs/systeme.md` et `design/docs/ecrans.md`, et utilise le skill `gran-games-design`.

Tâche : refaire toute l'interface pour qu'elle soit identique aux maquettes de `design/reference/html/`, sans casser la logique de jeu existante (temps réel Render, comptes Supabase, lecteur YouTube, API de paroles).

Contraintes :
- Vanilla, pas de framework, pas de build. Garder le déploiement Netlify tel quel.
- Copier `design/styles/*` dans `styles/` (remplacer `main-menu.css`, `imposteur.css`, `lyrics.css`, `karaoke.css` ; ajouter `base.css`, `compte.css`, `plus-ou-moins.css`, `frappe.css`) et `design/js/*` dans `js/`.
- Mettre en place le routeur par `#/…` de `js/router.js` ; chaque vue dans un `<template id="vue-…">` ou son propre module. Le bouton retour doit marcher.
- Supprimer la carte « Infinite Runner ».
- Ne pas implémenter la logique de Plus ou Moins et de Course de frappe pour l'instant : seulement les écrans, branchés sur des données factices clairement marquées.
- Textes des joueurs : `textContent` uniquement.

Plan de travail, un commit par étape, et montre-moi une capture comparée à la maquette (1440 et 390 px) à la fin de chaque étape :
1. Socle : `index.html` (polices, `base.css`, `<main>`, en-tête console, conteneur de toasts), routeur, 404.
2. Accueil (ordinateur et téléphone) + pied de page.
3. Fenêtre de compte (6 états) + page Profil, branchées sur Supabase.
4. Imposteur (entrée, salon, indices, vote, révélation, fin + états de connexion).
5. Lyrics (choix, partie, victoire, défaite + états).
6. Karaoké (mode, salle, choix, tiroir solo, scène, fin).
7. Écrans de Plus ou Moins et de Course de frappe.
8. Passe finale : clavier, `prefers-reduced-motion`, contrastes, retour navigateur, téléphone 390 px.

Format : avant de coder, propose-moi la nouvelle arborescence des fichiers et attends mon accord.
