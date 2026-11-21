# Plan : appliquer le design « coffre à cartouches » à granGames

Statut : proposé. Source : `gran-games-design/` (kit), maquettes `reference/html/` = vérité visuelle.
Contrainte : ne rien casser (Socket.io, Supabase, YouTube, API paroles, globales, `esc()`/`clean()`, `eslint.config.js`, `npm run check`, `npm test`).

## 1. Constats qui pilotent le plan

- Le kit CSS/JS est un squelette (~950 lignes en tout) ; les maquettes (345 Ko) portent ~150 `style=""` par écran. Le gros du travail est de transformer ces styles en classes dans `styles/*.css`.
- Le code actuel fait 3 000 lignes de JS en scripts classiques, avec des éléments mis en cache au chargement (`lyrics.js:433` `els`, listeners `#round-count`/`#round-timer` dans `imposteur.js:114`, `kkWireSocket`) et des `onclick="..."` dans `index.html`. Détruire/recréer le DOM à chaque route (templates du kit) casserait ces références.
- `index.html` charge 7 scripts dans un ordre qui compte ; ESLint les traite en `sourceType: "script"` avec la liste `SHARED_GLOBALS`.
- Supabase `detectSessionInUrl: true` (flux implicite) renvoie les jetons dans `#access_token=...` : conflit avec un routeur `#/`.
- Le serveur Imposteur utilise `join_or_create_room` avec un nom libre (30 car.) ; le design suppose un code de 4 lettres, « Créer une nouvelle salle » distinct de « Rejoindre » et l'erreur « Ce code de salle n'existe pas ». Idem Karaoké (code de 6 car.). C'est un manque côté backend.
- `styles/style.css` n'est référencé nulle part (orphelin). `styles/account.css` sera remplacé par `compte.css`.

## 2. Décision d'architecture

**Scripts classiques conservés, routeur `#/` du kit adapté, vues persistantes dans `index.html`.** À consigner dans `docs/adr/0002-design-routeur-scripts-classiques.md` (rédigé à l'étape 0).

| Option | Risque | Verdict |
| --- | --- | --- |
| A. Modules ES + templates clonés (kit tel quel) | Réécriture de 3 000 lignes (imports, fin des globales, `onclick`), caches DOM invalidés, ordre de chargement différé, nouvelle config ESLint, tests manuels lourds | Rejetée |
| B. Scripts classiques + routeur en IIFE + sections persistantes | Faible : le code de jeu n'est pas réécrit, seulement son habillage et ses rendus | **Retenue** |

Détails de B :
- `gran-games-design/js/ui.js` et `router.js` sont copiés dans `javascript/` en retirant `export` et en les enveloppant en IIFE : `const granUI = (() => {...})()` et `const granRouter = (() => {...})()` (même style que `granAuth`/`granAccount`). Déclarer `granUI`, `granRouter` dans `SHARED_GLOBALS` (`eslint.config.js`).
- Chaque vue est une `<section data-vue="imposteur" hidden>` dans `<main>`, jamais détruite. Le routeur bascule `hidden`, pose `data-monde`, `document.title`, le focus sur `<h1>`, charge `styles/<jeu>.css` (une fois), garde la transition View Transitions du kit (désactivée en `prefers-reduced-motion`).
- Chaque jeu enregistre `granRouter.register('imposteur', { enter(params), leave() })` ; `leave()` reprend le contenu de l'ancien `goBack()` (émettre `leave_room`/`karaoke_leave`, `socket.off`, `clearInterval`, arrêt YouTube via `kkCleanup`, `granAuth.flushReconnect()`). `setLeaveGuard` affiche « Quitter la partie ? » pendant une manche (le retour navigateur est donc géré).
- Hash non routable (`#access_token=`, `#error=`) : le routeur les ignore (affiche l'accueil, ne fait ni 404 ni `replaceState`) ; Supabase nettoie lui-même le hash. Ne pas passer en PKCE (changerait la confirmation d'email).
- Les fonctions globales existantes gardent leur nom (`joinImpostorRoom`, `karaokeStartSolo`, ...) ; le nouveau HTML peut garder `onclick` pour elles, le nouveau code utilise `addEventListener`. `startGame`/`goBack` disparaissent (`navigation.js` supprimé ou réduit à l'accessibilité clavier des cartes, devenue inutile avec de vrais `<a href>`).
- Itinéraires : `#/imposteur/KRAB` et `#/karaoke/salle/FADO` pré-remplissent le champ code (jamais de jointure automatique). `#/lyrics/<id>` : hors périmètre initial (écran de partie interne).
- Plus ou Moins / Course de frappe : `javascript/plus-ou-moins.js` et `frappe.js` sans Socket.io, données dans `javascript/demo-data.js` (constantes `DEMO_*`), bandeau visible « Aperçu : données fictives » sur chaque écran, source des faits Plus ou Moins affichée « Exemple non vérifié ». Aucune de ces données ne part au serveur.
- Tous les textes de joueurs : `textContent`/`granUI.el()` ; `esc()` reste pour l'existant tant qu'il y a des `innerHTML`, à supprimer au passage dans les rendus réécrits. Plus aucun emoji dans l'UI (retirer ceux des chaînes JS : `👥`, `🏅`, `🎵`, `💔`, `▶`...).

## 3. Arborescence cible

```
index.html                 coquille : polices, base.css, .console (en-tête), <main> + sections data-vue,
                           <dialog class="fenetre"> compte, .toasts, scripts
styles/  base.css  main-menu.css  compte.css  imposteur.css  lyrics.css  karaoke.css
         plus-ou-moins.css  frappe.css          (style.css et account.css supprimés)
javascript/  config.js  auth.js  ui.js(new)  router.js(new)  imposteur.js  lyrics.js  karaoke.js
             account.js  demo-data.js(new)  plus-ou-moins.js(new)  frappe.js(new)  app.js(new : register + startRouter)
             navigation.js (supprimé)
design/                    = gran-games-design/ renommé (chemins attendus par son CLAUDE.md et le skill)
.claude/skills/gran-games-design/   skill déplacé ; règles de design/CLAUDE.md fusionnées dans CLAUDE.md racine
```
Ordre des scripts : socket.io, supabase, config, auth, ui, router, imposteur, lyrics, karaoke, account, demo-data, plus-ou-moins, frappe, app (dernier : `startRouter()`).
`eslint.config.js` : ignorer `design/**` ; ajouter `granUI`, `granRouter` aux globales.

## 4. Cartographie existant -> maquettes (hooks à conserver)

| Existant (ID / classe / fonction) | Nouveau | Note |
| --- | --- | --- |
| `#menu`, `.game-card`, `startGame()` | `section[data-vue=accueil]`, `.cart` en `<a href="#/jeu">` | Infinite Runner et `#runner-game` supprimés |
| `#account-btn` (`granAccount.refreshButton`) | bouton `.console__compte` | garder l'ID |
| `ensureDialog()` + `.acc-*`, `#acc-email/-password/-username/-title/-p-*` | `dialog.fenetre` + `compte.css` (6 états) | API `granAccount` inchangée ; Google déjà retiré, Discord seul ; 6 car. mini ; profil -> vue `#/profil` |
| `#impostor-game`, `#impostor-title`, `#word-bar` | section imposteur, `.imp-titre`, `.fiche--mot` | `#word-bar` : le mot (avec « Confidentiel ») |
| `#room-id`, `#username`, `joinImpostorRoom()` | champs `.field` Code / Pseudo | `maxlength` 30 conservé tant que le lot backend (§6 B1) n'est pas livré |
| `#lobby-setup`, `#lobby-players`, `#lobby-options`, `#round-count`, `#round-timer` | salon : liste `.joueurs` + steppers | garder les `<input>` (types number) et leur événement `input` ; les boutons +/- le déclenchent |
| `#new-game`, `#end-round`, `.next-round-button` | `.key--principal` « Lancer la partie », « Passer aux votes », « Manche suivante (n/N) » | une seule action principale par écran |
| `#players-inputs`, `#player-template`, `.player-line/-name/-timer/.hints`, `#hint-input` | `.tour` / `.tour--actif`, `.fiche--indice`, `.minuteur` | templates réécrits, ids `player-<i>`, `hints-<i>`, `timer-<i>` conservés |
| `#vote-button-template`, `.vote-grid`, `.vote-button`, `.voted`, `.vote-info` | grille 2 col. de radios (`avatar-touche` + nom) | `esc()` -> `textContent` |
| `#hint-phase`, `#reveal-phase`, `.score-gain` | écrans indices / vote / révélation (`granUI.showScreen`), `.classement` | ne jamais lire `impostorIndex` avant `reveal_results` |
| `#lyrics-select`, `#ls-search`, `#ls-genre/-artist/-year/-sort`, `#ls-grid`, `.ls-card`, `.ls-cover(-wrap/-empty)`, `.ls-title/-sub` | écran Choix : `.chip` (selects natifs stylés en pastille, zéro changement JS), `.carte-chanson`, `.pochette` + `.vinyle` | `lyrics.js` met `els` en cache : ces ID restent |
| `#lyrics-game`, `#lyrics-song-info`, `.lyrics-sticky-bar`, `.lyrics-input`, `#lyrics-progress`, `#lyrics-guess`, `#lyrics-submit`, `#lyrics-clear`, `#lyrics-board`, `.lyrics-token(.revealed/.out)`, `#lyrics-feedback`, `.ld-shake` | partie : barre or collée, cahier ligné, barres bleues ; `.secousse` | `lyrics-sticky-sentinel` à conserver |
| `#lyrics-defeat-overlay` (`.ld-*`, innerHTML `lyrics.js:812`), confetti canvas (`:1019`) | écrans Victoire (fond or) et Défaite « Rayé. » | réécrire le rendu en DOM ; confetti à garder seulement si le design le permet (sinon retirer) |
| `showToast()`, `#ls-toast`, `#ls-loading-banner` | `granUI.toast`, `.skel` / `.etat` | `showToast` reste un alias (globale ESLint) |
| `#karaoke-mode`, `.kk-mode-card`, `karaokeStartSolo/ShowRoom` | écran Mode : deux billets Solo / Salle | libellé « Multijoueur » -> « Salle » |
| `#karaoke-room`, `#kk-join-form`, `#kk-username`, `#kk-roomcode`, `#kk-join-error`, `#kk-lobby`, `#kk-players-list`, `#kk-room-code-text`, `.kk-copy-btn`, `#kk-host-panel`, `#kk-guest-panel`, `#kk-start-btn` | salon : `.joueurs` + badges Hôte/Toi, projecteur invité | `kkRenderLobby` réécrit |
| `#karaoke-select`, `#kk-search`, `#kk-songs-grid`, `.kk-song-card/-cover/-info` | grille `.carte-chanson` | |
| `#kk-audio-modal` (innerHTML `karaoke.js:366`), `#kk-audio-start`, `#kk-banner` | tiroir « Tu chantes avec quoi ? » (`dialog.fenetre`, radios) | |
| `#karaoke-game`, `.kk-stage`, `#kk-line-prev/-curr/-next`, `#kk-line-counter`, `#kk-song-title-bar`, `#kk-controls`, `#kk-prev/-play/-next-btn`, `#kk-spectator-msg`, `#kk-players-bar`, `#kk-gap`, `.kk-gap-count/-label` | scène plein écran (`Karaoke-scene.html`) | `#kk-yt-host` / `#kk-yt-player` : **ne pas toucher** (lecteur YouTube), rester dans le DOM |
| `#kk-end-overlay`, `.kk-end-box` | écran Fin | |
| `karaoke.js:76-77` (`#dynamic-style`, `#menu`) | `granRouter.navigate('/')` | seul vrai couplage à l'ancienne navigation |

## 5. Découpage en étapes

Branche `feat/design`. Un commit Conventional par étape (`feat(client): ...`, `style(client): ...`, `docs: ...`). Validation commune à chaque étape : `npm run check` et `npm test` verts ; captures 1440 px et 390 px comparées à la maquette ; test manuel du flux concerné (§7). Étapes 4 à 7 sont indépendantes une fois l'étape 1 faite (CSS de jeu en parallèle ; `index.html` fusionné en séquence pour éviter les conflits).

| # | Rôle | Étape | Fichiers touchés | Validation |
| --- | --- | --- | --- | --- |
| 0 | tech-lead, devops | Branche, ADR 0002, renommer `gran-games-design/` -> `design/`, déplacer le skill, fusionner les règles design dans `CLAUDE.md`, ignorer `design/**` dans ESLint ; captures de référence de l'existant | `docs/adr/0002-*.md`, `CLAUDE.md`, `.claude/skills/...`, `eslint.config.js` | `npm run check` vert, ADR relu |
| 1 | frontend (+ ui-designer) | Socle : `index.html` (polices, `base.css`, `.console`, `<main>`, `.toasts`), `ui.js`/`router.js` en IIFE, `app.js`, `register/enter/leave` des 3 jeux, 404, retrait Infinite Runner et `navigation.js`/`startGame`/`goBack`, `style.css` supprimé | `index.html`, `styles/base.css`, `javascript/{ui,router,app,navigation,karaoke}.js`, `eslint.config.js` | Accueil provisoire -> chaque jeu -> retour (bouton navigateur inclus) sans erreur console ; `leave_room` émis au départ ; retour OAuth `#access_token` ne donne pas de 404 |
| 2 | ui-designer (CSS), frontend (câblage) | Accueil 1440/390 + pied de page ; champ « On t'a donné un code ? » (mène à `#/imposteur/CODE` ; tant que backend B1 absent : un seul jeu cible, Imposteur) ; « Quoi de neuf » avec contenu réel ou retiré | `styles/main-menu.css`, `index.html` | Comparaison Accueil/Accueil-mobile ; cartouches cliquables clavier ; aucun texte fictif non marqué |
| 3 | frontend, ui-designer, security | Fenêtre de compte (6 états) + vue Profil (stats, 20 dernières parties, appui long de suppression, annulation 6 s) | `javascript/account.js`, `styles/compte.css`, `index.html`, suppression `styles/account.css` | Connexion/inscription/Discord/suppression testés sur Supabase ; avatar via `safeAvatar` (https seul) ; erreurs en `textContent` ; revue `security` |
| 4 | frontend, ui-designer | Imposteur : salon, indices, vote, révélation, fin, états (hôte change, connexion perdue, code inexistant) | `index.html`, `javascript/imposteur.js`, `styles/imposteur.css` | Partie complète à 3 onglets (hôte, invité, départ en cours de manche) ; `npm test` (socket) vert ; aucune fuite d'`impostorIndex` avant révélation |
| 5 | frontend, ui-designer | Lyrics : choix, partie, victoire, défaite, états | `index.html`, `javascript/lyrics.js`, `styles/lyrics.css` | Recherche, filtres, partie jouée, victoire et abandon ; `lyrics_result` toujours émis |
| 6 | frontend, ui-designer | Karaoké : mode, salle, choix, tiroir solo, scène, fin | `index.html`, `javascript/karaoke.js`, `styles/karaoke.css` | Solo avec musique + salle à 2 onglets ; YouTube démarre et se détruit au quitter ; watchdog audio intact |
| 7 | frontend, ui-designer | Plus ou Moins (3 écrans) et Course de frappe (4 écrans) sur données factices | `javascript/{demo-data,plus-ou-moins,frappe}.js`, `styles/{plus-ou-moins,frappe}.css`, `index.html` | Bandeau « données fictives » partout ; aucun appel réseau ; clavier (flèches, saisie) OK |
| 8 | accessibility, qa, code-reviewer | Passe finale : clavier, focus 3 px, contrastes, cibles 44 px, `prefers-reduced-motion`, retour navigateur, 390 px, grep emoji / `innerHTML` / `style=` / `transition: all` | tous | Checklist §7 cochée ; `npm run check`, `npm test` verts ; relecture `code-reviewer` |

## 6. Lots annexes (non bloquants pour le visuel)

- **B1 (backend, security, qa)** : codes de salle de 4 lettres générés par le serveur, événements distincts créer / rejoindre, erreur `room_not_found` pour « Ce code n'existe pas », un seul espace de codes entre jeux pour que le champ d'accueil route seul ; Karaoké : `maxlength` 6 -> 4. Tests dans `backend/test/socket.test.js`. ADR 0003. Sans B1, l'écran affiche le champ mais le comportement actuel (nom libre, jointure ou création implicite) est conservé.
- **B2 (backend)** : écarts d'états du design non couverts aujourd'hui : place gardée 30 s (« Revient ? »), journal de la salle, nouvel hôte notifié, indice « écrit… ». À traiter seulement si l'utilisateur les veut ; sinon omis de l'UI plutôt que simulés.

## 7. Risques et vérifications

| Risque | Mesure |
| --- | --- |
| Caches DOM/listeners cassés | Vues persistantes (pas de clonage) ; les ID de §4 ne bougent pas |
| Fuite de salle Socket.io en changeant de route | `leave()` obligatoire par jeu + garde de sortie ; test à 2 onglets |
| Retour OAuth/confirmation d'email vs routeur | Hash non `#/` ignoré ; tester Discord et le lien email |
| `index.html` conflits entre étapes parallèles | Un bloc `<section>` par jeu ; fusion séquentielle |
| Lecteur YouTube masqué/détruit | `#kk-yt-host` hors du flux de design, non retiré, non `display:none` si le lecteur doit démarrer |
| Données fictives prises pour vraies | `DEMO_*` + bandeau ; faits Plus ou Moins « non vérifiés » |
| Divergence visuelle (maquettes à styles en ligne) | Classes uniquement (aucun `style=""` copié) ; jetons de `base.css` ; comparaison côte à côte à chaque étape |
| Pas de tests front | Captures Playwright hors dépôt (aucune dépendance ajoutée) + checklist manuelle ; backend couvert par `npm test` |
| Polices Google Fonts (réseau, perf) | `preconnect` + `display=swap`, seules les familles utilisées ; revue `performance` à l'étape 8 |
| Netlify / hébergement statique | Routage par hash : aucune règle de redirection à ajouter |
