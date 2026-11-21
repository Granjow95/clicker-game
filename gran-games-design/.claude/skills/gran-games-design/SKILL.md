---
name: gran-games-design
description: Construire, migrer ou modifier un écran de Gran'Games selon le design « coffre à cartouches » (console commune + un monde par jeu), en HTML/CSS/JS vanilla, à l'identique des maquettes de design/reference/html.
---

# Construire un écran Gran'Games

Le kit de design est dans `design/` à la racine du dépôt. La maquette HTML de `design/reference/html/` est la vérité visuelle : on la reproduit, on n'invente pas.

## Méthode (à suivre dans l'ordre)

1. **Lire** `design/docs/systeme.md` (une fois par session), puis la section de l'écran dans `design/docs/ecrans.md`.
2. **Ouvrir la maquette** (`design/reference/html/<Écran>.html`) et en faire une capture à 1440 px et à 390 px (Playwright ou navigateur). Les maquettes téléphone montrent plusieurs écrans dans des cadres de 390 × 844 : reproduire le contenu, pas le cadre.
3. **Repérer les composants communs** déjà dans `styles/base.css` (`.console`, `.key` et variantes, `.field`, `.stepper`, `.badge`, `.joueurs`, `.classement`, `.minuteur`, `dialog.fenetre`, `.toast`, `.etat`, `.cart`) et le décor du monde dans `styles/<jeu>.css`. Les réutiliser tels quels.
4. **Écrire le HTML** sémantique : `<main data-monde="<jeu>">`, un seul `<h1>` par écran, vrais `<button>` / `<a href>`, `<label>` liés, `aria-label` sur les boutons-icônes, `aria-live` pour les messages. Les maquettes ont leurs styles en ligne : les transformer en classes, jamais copier les `style="…"`.
5. **Compléter le CSS** dans le bon fichier : commun à plusieurs jeux → `base.css` ; propre au jeu → `styles/<jeu>.css`. Utiliser les jetons (`var(--…)`). Si une valeur de la maquette n'a pas de jeton, la reprendre exactement.
6. **Brancher le comportement** avec `js/ui.js` : `showScreen`, `toast`, `openDialog`/`closeDialog`, `shake`, `countUp`, `revealWords`, `segmentedTimer`, `holdToConfirm`, `el`. Les routes sont dans `js/router.js` (`registerView`, `setLeaveGuard` pour « Quitter la partie ? »).
7. **Couvrir les états** listés dans `docs/ecrans.md` : vide, chargement, erreur, victoire, défaite, attente, déconnexion.
8. **Vérifier** : capture à 1440 et 390 px comparée à la maquette ; navigation au clavier (Tab, focus visible, Échap ferme les fenêtres) ; `prefers-reduced-motion: reduce` émulé ; bouton retour du navigateur ; aucun `innerHTML` avec un texte de joueur.

## Règles qui ne se discutent pas

- Vanilla : pas de framework, pas de build, modules ES natifs.
- Pas de violet, pas de néon, pas de dégradé décoratif, pas d'emoji dans l'interface.
- Touches : bord 3 px encre, rayon 10 px, épaisseur `0 4px 0 #000`, descente de 3 px à l'appui (120 ms).
- Une seule action principale (bouton d'or) par écran.
- Animations : uniquement celles du tableau de `docs/systeme.md`, avec leurs durées et courbes. Survols dans `@media (hover: hover) and (pointer: fine)`.
- Contraste minimum 4,5:1 (3:1 au-dessus de 24 px). Ne jamais signaler un état par la couleur seule.
- Copie : reprendre les textes exacts des maquettes ; tutoiement ; pas de majuscules forcées.
- Données de maquette fictives (chansons, `[n]`, `[date]`) : à remplacer par les vraies données, jamais à afficher telles quelles.
