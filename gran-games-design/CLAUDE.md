## Design Gran'Games (à respecter pour tout travail d'interface)

Le design de référence est dans `design/` (kit exporté depuis le canevas Claude).

- Avant de toucher un écran, lis `design/docs/systeme.md`, la section de l'écran dans `design/docs/ecrans.md`, et ouvre la maquette correspondante dans `design/reference/html/`. La maquette est la vérité visuelle.
- Stack imposée : HTML, CSS et JavaScript vanilla, modules ES natifs, aucun framework, aucune étape de build. Polices Google Fonts uniquement (liste dans `styles/base.css`).
- `styles/base.css` = la console commune (jetons + composants). On n'y met que ce qui sert à plusieurs jeux. Un jeu ne change que les variables `--monde-*` et son décor, dans `styles/<jeu>.css`.
- Jamais de couleur, taille, rayon ou durée en dur hors des jetons de `base.css` ou des valeurs déjà écrites dans les CSS du kit.
- Navigation : routeur `#/…` de `js/router.js`. Le bouton retour du navigateur doit marcher partout. Les écrans internes d'un jeu (indices, vote…) passent par `showScreen()` de `js/ui.js`, pas par une route.
- Texte venant d'un joueur (pseudo, indice, nom de salle) : `textContent` ou `el()` de `js/ui.js`, jamais `innerHTML`.
- Accessibilité : contraste vérifié, focus visible, vrais boutons et liens, `<label>` sur chaque champ, cibles de 44 px, `prefers-reduced-motion` respecté.
- Animations : uniquement les durées et courbes du tableau de `docs/systeme.md`. Pas d'`ease-in`, pas de `transition: all`, rien d'animé sur la frappe au clavier.
- Textes : tutoiement, sentence case, pas d'emoji, ton complice. Reprendre la copie exacte des maquettes.
- Après chaque écran : comparer côte à côte avec la maquette à 1440 px et à 390 px (capture d'écran), puis corriger les écarts.
