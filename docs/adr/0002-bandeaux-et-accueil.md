# ADR 0002 — Bandeaux de jeux à l'accueil, retrait de `#/nouveautes` et `#/jeux`

- Statut : proposé
- Date : 2026-11-22

## Contexte

L'accueil (`section[data-vue=accueil]` dans `index.html`) mène deux fois à chaque jeu : l'étagère de cartouches (`.etagere`, `.cart`, `.cart__mode`, `.etagere__glisse`) puis la liste `.ligne-jeu` (`.ligne-jeu__jouer`, `.jeux__compte`). La section `#nouveautes` (`.neuf*`), ses liens (console, pied de page), les pastilles « Nouveau » et les routes `#/jeux` et `#/nouveautes` (des ancres vers l'accueil dans `router.js`) ajoutent du texte qui n'aide ni à choisir ni à jouer. L'accueil n'a pas de `granRouter.register('accueil')`, donc aucun point d'entrée pour l'animer quand on revient sur la vue (les vues sont persistantes).

Limites mesurées dans le code : Imposteur max 8 (`MAX_IMPOSTEUR_PLAYERS`, `backend/config.js`), Karaoké max 10 (`MAX_KARAOKE_PLAYERS`), Lyrics solo, Plus ou Moins solo sur données fictives (`demo-data.js`), Course de frappe solo ou salle fictive. Aucun minimum, aucune durée.

## Décisions

1. **Un bandeau par jeu, un seul chemin.** L'étagère et `.ligne-jeu` sont supprimées et remplacées par `<ul class="bandeaux" aria-label="Les jeux">` avec 5 `<li>`. Chaque `<li>` contient un seul `<a class="bandeau bandeau--<jeu>" href="#/<jeu>">` qui englobe : la cartouche (visuel décoratif, `aria-hidden="true"`), un `<h2 id="b-<jeu>-titre">`, la description `<p id="b-<jeu>-desc">` et les repères `<ul id="b-<jeu>-reperes">`. Le lien porte `aria-labelledby="b-<jeu>-titre"` et `aria-describedby="b-<jeu>-desc b-<jeu>-reperes"`. Pas de bouton « Jouer », pas de lien imbriqué, pas d'`aria-label` qui doublerait le titre. Le `<h2>` « Les jeux » disparaît : les titres de jeux sont les `<h2>` de l'accueil.
2. **Repères.** Forme fixe, un mot par info, séparés par ` · ` (texte, jamais la couleur seule) : `max N joueurs` si le jeu a une salle réelle, puis un type parmi Bluff, Coopératif, Duel, Solo, puis `Aperçu` pour un jeu à données fictives. Pas de minimum (aucune règle ne l'impose), pas de durée. Les nombres sont écrits dans le HTML et un test (`backend/test/accueil.test.js`) les compare aux constantes de `backend/config.js` : pas de nouvelle route ni d'événement pour exposer la configuration.
3. **Retrait de `#/nouveautes` et `#/jeux`.** Section `#nouveautes`, liens console et pied de page (« Nouveautés », « Jeux », « Règles des jeux »), styles `.neuf*`, `.etagere*`, `.cart*`, `.ligne-jeu*`, `.jeux__*` et pastilles « Nouveau » sont supprimés dans `index.html`, `javascript/`, `styles/`. Les deux routes restent dans `router.js` sous forme d'alias qui font `location.replace('#/')` (pas de 404 pour un ancien lien, pas d'entrée d'historique en plus). La propriété `anchor` devient inutile et est retirée. `gran-games-design/` n'est pas modifié.
4. **La fiche joueur reste.** `aside#fiche-joueur` est aujourd'hui dans `section#nouveautes` : elle est déplacée hors de cette section avec tous ses ID (`fiche-*`, mis en cache par `account.js`). Les ID `jeu-hasard` et `lien-evitement` ne changent pas. (Le formulaire `form-rejoindre`, `h-code`, `h-pseudo` est supprimé : ADR 0003 §1, le code se saisit sur l'écran d'entrée de chaque jeu.)
5. **Animation portée par `enter()`.** `app.js` ajoute `granRouter.register('accueil', { enter, leave })`. `enter()` pose une classe qui joue « écran vers écran » (`gran-games-design/docs/systeme.md` : fondu + 8 px + flou 2 px, 200 ms, `--ease-out`) sur les bandeaux, décalés de 40 ms (5 max). L'état initial n'est jamais `opacity: 0` en CSS statique : il n'existe que pendant l'animation (`animation-fill-mode: backwards`), donc sans JS ou sans animation le contenu est visible. Si `startViewTransition` (jeu vers accueil) tourne, la cascade est sautée pour ne pas animer deux fois. Reduced-motion : fondu court, aucun déplacement (`granUI.reducedMotion()` et base.css §15).
6. **Survol et focus.** La montée de 14 px du kit (pensée pour une grille) est remplacée par un décalage latéral de la cartouche (≤ 6 px, `transform` seul) sous `@media (hover: hover) and (pointer: fine)`. Focus : `outline` 3 px, contraste ≥ 3:1, `outline-offset` hors du bord encre, aucun `overflow: hidden` sur la liste ou le `<li>` qui le couperait.
7. **Gabarit visuel.** Titre Pixelify 20/26 px, description Bricolage 14/16 px (3 lignes max), pastilles rayon 6 px, 12/14 px en `flex-wrap`. Cible ≥ 44 px. À 390 px : cartouche ≈ 96 px à gauche ; sous 640 px elle peut passer au-dessus. Aucun défilement horizontal, reflow à 320 px. Bord encre, sans violet, néon, dégradé décoratif ni emoji.

## Conséquences

- `index.html`, `javascript/router.js`, `javascript/app.js`, `styles/main-menu.css` (et `base.css` pour les règles partagées) changent. Pas de nouvelle globale, donc `eslint.config.js` reste tel quel.
- Le test statique `backend/test/accueil.test.js` (lecture de `index.html`, sans dépendance) verrouille la règle : exactement 5 liens de jeu distincts dans le corps de l'accueil, les repères correspondent à la config, et `grep -rni nouveaut index.html javascript styles` renvoie 0.
- Le type de Karaoké (salle à 10 sans règle de bluff, de duel ou de coopération) et celui de la salle de frappe fictive restent à trancher par le propriétaire : on propose `max 10 joueurs · Coopératif` et `Solo · Aperçu`.
- Les textes de `gran-games-design/docs/ecrans.md` ne respectent pas tous le gabarit (3 phrases, vouvoiement, moins de 90 caractères) : ils servent de base, les 5 versions finales sont montrées avant d'être figées.

## Conventional Commits

`docs(adr): ...`, `test(accueil): ...`, `refactor(client): ...` (retraits), `feat(accueil): ...`, `style(accueil): ...`, `feat(profil): ...`, `fix(<jeu>): ...`, `test(backend): ...`
