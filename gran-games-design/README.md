# Kit de design Gran'Games pour Claude Code

Ce dossier contient tout ce qu'il faut pour que Claude Code reproduise le nouveau design de Gran'Games dans l'app existante (HTML, CSS, JS vanilla, sans build).

## Contenu

| Dossier / fichier | Rôle |
| --- | --- |
| `CLAUDE.md` | Règles à fusionner dans le `CLAUDE.md` à la racine de ton dépôt (Claude Code le lit à chaque session). |
| `.claude/skills/gran-games-design/SKILL.md` | Skill Claude Code : la méthode pour construire ou modifier un écran dans ce design. |
| `PROMPT.md` | Le message à coller dans Claude Code pour lancer la migration. |
| `styles/base.css` | La console commune : jetons (couleurs, polices, espacements, rayons, courbes), en-tête, touches, champs, fenêtres, toasts, joueurs, classement, minuteur, états, transitions, mouvement réduit. |
| `styles/main-menu.css` | Accueil, étagère de cartouches, lignes de jeux, nouveautés, pied de page, 404. |
| `styles/compte.css` | Fenêtre de compte et page Profil. |
| `styles/imposteur.css`, `lyrics.css`, `karaoke.css`, `plus-ou-moins.css`, `frappe.css` | Le décor de chaque monde. |
| `js/router.js` | Routeur `#/…` : retour navigateur, chargement du CSS du jeu, titre, focus, transition « insertion de cartouche ». |
| `js/ui.js` | Toasts, fenêtres, changement d'écran, secousse, chiffre compté, révélation des mots, minuteur, appui long, pochettes. |
| `docs/systeme.md` | Direction artistique et règles du système. |
| `docs/ecrans.md` | Chaque écran : route, fichier de référence, structure, états, textes. |
| `reference/html/*.html` | Les 18 maquettes en HTML statique. **C'est la vérité visuelle** : à ouvrir dans un navigateur pour comparer. |
| `reference/dc/*.dc.html` | Les sources originales du canevas Claude (pour mémoire). |

## Installation

1. Copie tout le dossier dans ton dépôt, par exemple dans `design/` à la racine.
2. Déplace `design/.claude/skills/gran-games-design/` vers `.claude/skills/gran-games-design/` à la racine du dépôt (c'est là que Claude Code cherche les skills du projet).
3. Ajoute le contenu de `design/CLAUDE.md` à ton `CLAUDE.md` (ou crée-le).
4. Ouvre Claude Code dans le dépôt et colle le contenu de `PROMPT.md`.

## Remarques

- Les maquettes chargent leurs polices depuis Google Fonts : ouvre-les avec une connexion internet.
- Les chansons, artistes, paroles et la phrase de la Course de frappe sont **fictifs** (écrits pour les maquettes). Les `[n]`, `[date]`, `[score]` sont des emplacements pour les vraies données.
- Plus ou Moins : les quatre chiffres des maquettes (tour Eiffel 330 m, Big Ben 96 m, Titanic 194 min, Le Retour du roi 201 min) sont des exemples **non vérifiés**. Chaque fait du jeu doit avoir une source affichée.
- Le logo Discord n'est pas dessiné : utiliser le fichier officiel de leur kit de marque.
