# Pour Claude Design — Gran'Games

Document de brief pour refaire le design de tout le site. Il décrit ce que fait le projet, à quoi il ressemble aujourd'hui, chaque écran et son comportement, ce qui ne va pas, et la direction voulue. Tout est en français : le site et ses textes sont en français.

---

## 1. Le projet en une phrase

**Gran'Games** est un site de mini-jeux à jouer entre amis, dans le navigateur, sur ordinateur comme sur téléphone. Certains jeux sont multijoueurs en direct (on rejoint une « salle » avec un code), d'autres sont solo. Un compte est **facultatif** : sans compte on joue avec un simple pseudo ; avec un compte on garde son historique et ses statistiques.

- Public : amis et famille, ambiance détendue, pas de publicité.
- Ton : complice, léger, un peu moqueur. Pas enfantin.
- En ligne : le site est sur Netlify, le serveur temps réel sur Render, la base de comptes sur Supabase.

## 2. Contraintes techniques (à respecter dans le design)

- **HTML, CSS et JavaScript « vanilla »** : pas de React, pas de framework, pas d'étape de build. Le design doit être livrable en fichiers HTML/CSS/JS simples.
- Aujourd'hui tout le HTML est dans un seul `index.html` (301 lignes) : chaque jeu est un bloc qu'on affiche ou masque. Il n'y a **pas d'URL par page** et le bouton « retour » du navigateur ne fonctionne pas. Le nouveau design doit prévoir de vraies pages ou un routage par `#hash` (ex. `#/imposteur`), avec un fichier de style commun et un fichier de style par jeu.
- Chaque jeu a son propre fichier de style (`styles/imposteur.css`, `lyrics.css`, `karaoke.css`), chargé quand on entre dans le jeu. Le menu a `main-menu.css`.
- Les polices viennent de Google Fonts. Toute police du design doit en faire partie (ou être auto-hébergée).
- Tout texte venant d'un joueur (pseudo, indice, nom de salle) est affiché de façon sécurisée : le design ne doit pas dépendre de HTML dans ces textes.
- Responsive obligatoire : téléphone (390 px) et ordinateur (1440 px). Les jeux se jouent beaucoup sur téléphone.
- Accessibilité : contrastes suffisants, navigation au clavier avec focus visible, respect de `prefers-reduced-motion` (animations réduites), libellés sur tous les champs.

## 3. Aspect actuel (ce qu'on veut remplacer)

Style « cartoon » : fond crème à pois jaunes, texte blanc avec un gros contour noir et une ombre décalée, boutons ronds avec bordure noire, polices **Fredoka One** (titres) et **Nunito** (texte), emojis comme icônes (🕵️ 🎤 🎵 👤).

Chaque jeu a un style un peu différent et sans règle commune :
- **Menu et Lyrics** : cartoon crème et jaune, bordures noires épaisses, ombres décalées (`4px 4px 0`).
- **Imposteur** : dégradé bleu clair, boutons bleus, police système (Segoe UI), cartes blanches.
- **Karaoké** : fond violet très sombre (`#0f0824`) avec dégradés violets, texte blanc.
- Les couleurs sont recopiées dans chaque fichier, sans variables partagées.

**Ce qui ne va pas :**
- Trop générique et trop « enfantin ».
- Aucune cohérence entre le menu, l'Imposteur et le Karaoké : on a l'impression de trois sites différents.
- Peu d'animations et de transitions (un fondu ou un rebond par endroit).
- Pas de vraie page d'accueil : c'est directement une grille de cartes.
- Navigation par un bouton « Gran.Menu » en haut à gauche, rien d'autre.

## 4. Direction souhaitée

- **Ambiance Neal.fun** : ludique, curieux, très visuel, chaque page est un petit univers. Coloré et beau, **sans être enfantin**.
- **Une identité originale, pas générique.** Surtout pas le look « site fait par IA » : pas de dégradé violet, pas de fond sombre néon, pas de trois cartes identiques alignées avec une icône.
- **Typographie audacieuse** : de grands écarts de tailles (titres géants à côté de petits textes), des polices inhabituelles qu'on n'ose pas d'habitude sur le web, mais utilisées avec cohérence (un petit nombre de polices bien choisies, qui se répondent).
- **Couleurs** : moins « palette d'IA ». Pas de violet. Des couleurs franches et un peu inattendues, inspirées du papier imprimé, de l'affiche, du jouet vintage.
- **Une vraie page d'accueil** (pas juste un menu) : présentation, jeux, ce qui est nouveau, compte.
- **Chaque jeu a son ambiance propre** (couleurs, typographie, décor, sons visuels), tout en restant dans une même famille grâce à des éléments communs (en-tête, boutons, façon d'entrer et de sortir d'un jeu, espacements).
- **Animations et transitions soignées** : entrée de page, passage d'un écran à l'autre, survol des cartes, retours visuels quand on gagne ou qu'on perd. Fluides, pas gadget, et désactivables (`prefers-reduced-motion`).
- **Navigation fluide et claire** : savoir toujours où on est, revenir facilement à l'accueil, boutons retour du navigateur qui fonctionnent.

### Deux pistes déjà imaginées (pistes, pas des décisions)

À titre d'exemple de l'esprit recherché ; ne pas s'y limiter.

- **A — Affiche de kermesse imprimée :** papier crème, bleu encre, rouge vermillon, moutarde, vert sapin ; titre en **Caprasimo**, noms de jeux géants en **Dela Gothic One**, phrases en **Fraunces** italique ; les jeux sous forme de grandes lignes typographiques qui s'ouvrent au survol.
- **B — Jaune acide brutaliste :** page entière jaune vif avec noir, rose et bleu électrique ; titre gigantesque en **Bricolage Grotesque** condensé, détails en **Rubik Mono One**.

## 5. Les écrans, un par un

### 5.1 Accueil (menu)
Aujourd'hui : titre « 🎮 Gran'Games » centré, sous-titre « Choisis ton jeu et joue ! », une rangée de cartes (icône emoji, nom, description d'une phrase). Une carte « Infinite Runner — Bientôt » est grisée : **à supprimer** (le jeu n'existera pas). Un bouton « 👤 Compte » en haut à droite ouvre la fenêtre de compte.

À concevoir : une vraie page d'accueil avec présentation, la liste des jeux (avec le type solo / multijoueur et le nombre de joueurs), les nouveautés, l'accès au compte, et un pied de page.

### 5.2 Fenêtre de compte (une boîte de dialogue)
- **Déconnecté :** formulaire de connexion ou d'inscription (email, mot de passe de 6 caractères minimum, pseudo à l'inscription), bouton « Continuer avec Discord », lien pour passer de connexion à inscription, phrase « Le compte est facultatif : sans lui, tu joues toujours avec un pseudo. »
- **Connecté :** profil (pseudo modifiable, avatar par URL), statistiques par jeu (parties jouées, victoires, score total, meilleur score), historique des 20 dernières parties avec suppression d'une partie, déconnexion, suppression du compte avec confirmation.
- États à prévoir : chargement, erreur (sous le champ concerné), message de confirmation par email, compte supprimé.

### 5.3 Jeu de l'Imposteur (multijoueur en direct, jusqu'à 8 joueurs)
Principe : chaque joueur reçoit un mot, sauf l'imposteur qui en reçoit un proche mais différent. À tour de rôle, chacun écrit un indice. Puis on vote pour désigner l'imposteur.

Écrans, dans l'ordre :
1. **Entrée / salle :** champs « Code de salle » et « Ton pseudo », bouton « Rejoindre la salle ». Une fois dans la salle : liste des joueurs (x/8) ; le premier joueur est l'**hôte** et règle le **nombre de manches** (1 à 10, 3 par défaut) et le **temps par tour** (10 à 120 s, 60 par défaut), puis lance la partie.
2. **Manche, phase d'indices :** barre avec le mot du joueur (« ton mot »), une ligne par joueur (nom, minuteur, indices déjà donnés). Le joueur dont c'est le tour a un champ de saisie ; les autres attendent. Bouton « Passer aux votes » pour l'hôte.
3. **Vote :** grille de boutons, un par joueur ; une fois voté, message « Tu as voté pour : … ». On attend les autres.
4. **Révélation :** « L'imposteur était … », le mot de l'imposteur (en rouge) et le mot des autres (en vert), points gagnés par joueur (+100 pour qui a démasqué l'imposteur), classement. Bouton « Manche suivante », ou fin de partie après la dernière manche avec le classement final.
- États : en attente de joueurs, hôte qui change, joueur qui quitte en cours de manche, erreurs de connexion.

### 5.4 Lyrics (solo)
Principe : on voit les paroles d'une chanson où tous les mots sont cachés ; on tape des mots, ceux qui existent se dévoilent partout dans le texte.

1. **Choix de la musique :** barre d'outils (recherche titre ou artiste, filtres genre, artiste, année, tri), puis grille de cartes (pochette, titre, artiste, année).
2. **Partie :** bandeau avec la chanson (pochette, titre, artiste), barre collée en haut avec la progression (« 12/180 »), le champ de saisie, les boutons « Abandonner » et « ✖ » pour effacer, puis le tableau des paroles avec les mots cachés qui se dévoilent.
3. **Fin :** écran de victoire, ou de défaite (« 💔 Dommage ! ») avec les mots manquants révélés.
- États : recherche en cours, aucun résultat, paroles introuvables, erreur réseau, mot déjà trouvé, mot inexistant (petite secousse).

### 5.5 Karaoké (solo ou multijoueur)
Principe : les paroles défilent ligne par ligne, synchronisées sur la musique (lecteur YouTube caché).

1. **Choix du mode :** deux grosses cartes, « Solo » et « Salle » (multijoueur).
2. **Salle (multijoueur) :** formulaire pseudo + code (vide pour créer une salle) ; salon avec le code de salle et un bouton pour le copier, la liste des joueurs ; l'hôte choisit la musique et lance, les invités attendent (« En attente que l'hôte choisisse une musique… »).
3. **Choix de la chanson :** champ de recherche et grille de chansons.
4. **En solo, une fenêtre propose :** musique complète, instrumentale ou sans musique.
5. **Écran de chant (plein écran) :** barre du haut (bouton « ✕ Quitter », titre de la chanson, compteur de lignes), puis trois lignes : précédente (discrète), **ligne courante (énorme)**, suivante ; en bas, contrôles « ◀ Préc. », « ▶ Auto », « Suiv. ▶ » (l'hôte contrôle ; les spectateurs voient « 🎤 L'hôte contrôle les paroles »), et une barre des joueurs.
6. **Fin :** « Fin de la chanson ! » avec « Recommencer » et « Changer de musique ».
- Ambiance actuelle : très sombre et violette ; c'est l'écran qui doit sentir « scène et projecteurs ».

### 5.6 Deux nouveaux jeux à ajouter (à la place d'« Infinite Runner » et d'un ancien « clicker »)

Propositions, à confirmer ou remplacer. Les deux doivent être courts, addictifs, et avoir chacun leur ambiance visuelle.

- **Plus ou Moins (solo) :** deux choses du quotidien s'affichent côte à côte, on devine laquelle a le plus (population, prix, durée…). Une bonne réponse prolonge la série, une erreur arrête la partie. Écran de départ, écran de jeu à deux grands panneaux qui se font face avec le chiffre qui se dévoile en compté, écran de fin avec série, record perso et bouton « Rejouer ». Ambiance : cartes d'éditorial, humour.
- **Course de frappe (solo et multijoueur en salle) :** une phrase s'affiche, on la tape le plus vite possible sans faute. En multijoueur (même principe de salle avec code que l'Imposteur), on voit en direct la progression de chacun sur une piste, puis le classement. Écran de salle, compte à rebours « 3, 2, 1 », écran de frappe (texte, lettres justes et fausses colorées, vitesse en mots par minute), écran de résultats. Ambiance : terminal, vitesse, circuit.

## 6. Éléments communs à concevoir

- **En-tête et navigation** : logo, accès à l'accueil, au compte, retour au jeu précédent ; présent partout, discret pendant la partie.
- **Boutons** (principal, secondaire, danger, désactivé, chargement), **champs de formulaire**, **cartes**, **fenêtres modales**, **notifications** (toasts de succès et d'erreur), **liste de joueurs avec pastilles** (hôte, moi, prêt), **classement**, **minuteur**, **états vides, de chargement et d'erreur**.
- **Transitions** entre l'accueil et un jeu, et entre les écrans d'un même jeu.
- **Pied de page** : crédits, lien vers la confidentialité (à prévoir si besoin).
- **Pages à ajouter si utile** : à propos / règles de chaque jeu, page profil dédiée (au lieu d'une simple fenêtre), page 404.

## 7. Ce qu'on attend de toi

1. Une **direction artistique** claire : palette (sans violet), polices (originales mais cohérentes), formes, ombres, motifs, ton des textes.
2. Le design de la **page d'accueil** (ordinateur et téléphone).
3. Le design de **chaque écran** listé ci-dessus, avec les états (chargement, erreur, vide, victoire, défaite).
4. Une **ambiance propre à chaque jeu**, dans la même famille.
5. Un **système de design** : couleurs, typographie, espacements, composants.
6. Les **animations et transitions** : comportement, durée, courbes.

Livrable idéal : maquettes + un système de design assez précis pour être transformé en HTML/CSS/JS vanilla sans interprétation.
