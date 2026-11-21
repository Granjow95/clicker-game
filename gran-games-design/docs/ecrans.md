# Les écrans, un par un

Pour chaque écran : la route, la maquette à ouvrir (`reference/html/…`), ce qu'il contient, ses états. Les maquettes téléphone montrent plusieurs écrans côte à côte dans des cadres de 390 × 844 : **le cadre de téléphone n'est pas à reproduire**, seulement son contenu.

Toutes les pages ont l'en-tête de la console (`.console`). Pendant une partie, il passe en version réduite (`.console--jeu`) : retour, fil d'Ariane, compte.

---

## Accueil

**Route** `#/` (ancres `#/jeux`, `#/nouveautes`). **Maquettes** `Accueil.html` (1440), `Accueil-mobile.html` (390). **CSS** `main-menu.css`.

Dans l'ordre :

1. En-tête : logo cartouche + « Gran'Games », onglets Accueil / Jeux / Nouveautés, bouton Compte (devient pseudo + avatar quand connecté).
2. Hero : « Gran'Games » en titre d'affiche sur deux lignes, à droite « Des petits jeux pour se chamailler entre amis, directement dans le navigateur. » et « Pas de pub. Pas de compte obligatoire : un pseudo suffit. Prends une cartouche. »
3. Étagère : les 5 cartouches penchées (-5°, 3°, -2°, 4°, -3°) posées sur une planche. Clic = entrer dans le jeu. Survol = elle se soulève. Téléphone : défilement horizontal aimanté + « Glisse pour voir les 5 cartouches. »
4. Bandeau or « On t'a donné un code ? » : champ Code (4 lettres) + Ton pseudo + « Rejoindre ». Le code trouve le jeu tout seul.
5. « Les jeux » : une grande ligne par jeu, aux couleurs et dans la police du jeu, avec ses pastilles (Solo, En salle, Jusqu'à 8 joueurs, Nouveau) et « Jouer ». Au survol, la ligne s'ouvre et montre la règle en une phrase. Sur téléphone, la règle est toujours visible.
6. « Quoi de neuf » (liste datée) et la fiche de joueur invité (« ? » partout, « Créer mon compte », « J'ai déjà un compte »).
7. Pied de page : « GG » géant, « Bien joué. Reviens quand tu veux. », liens Règles des jeux, Mon profil, Nouveautés, Confidentialité, Crédits, À propos.

La carte « Infinite Runner » disparaît.

Règles en une phrase (copie exacte) :

- Imposteur : « Tout le monde a le même mot. Sauf un. Donnez chacun un indice, puis votez pour démasquer l'imposteur. »
- Lyrics : « Tous les mots d'une chanson sont cachés. Tape ceux que tu connais. »
- Karaoké : « Les paroles défilent en rythme. Toi, tu chantes. Les autres subissent. »
- Plus ou Moins : « Deux choses. Laquelle a le plus ? Une erreur et la série s'arrête. »
- Course de frappe : « Une phrase, un chrono. Sans faute, et plus vite que les autres. »

## Fenêtre de compte

**Maquette** `Compte.html` (6 états). **CSS** `compte.css` + `dialog.fenetre` de `base.css`. Ordinateur : fenêtre centrée de 440 px. Téléphone : tiroir plein écran depuis le bas.

1. Connexion : onglets Connexion / Inscription, Email, Mot de passe, « Me connecter », séparateur « ou », « Continuer avec Discord », « Le compte est facultatif : sans lui, tu joues toujours avec un pseudo. »
2. Inscription avec erreurs : Pseudo, Email, Mot de passe ; erreur sous le champ en phrase complète (« Il manque la fin de l'adresse, par exemple .fr ou .com. », « 6 caractères minimum. Il en manque 3. »). Vérification à la sortie du champ ; à l'envoi, focus sur le premier champ en erreur.
3. Chargement : champs en lecture seule et atténués, bouton « Connexion… » avec les trois pixels. Erreur serveur dans un encadré brique au-dessus du bouton.
4. Email de confirmation envoyé : bandeau pomme « Regarde tes mails », « Renvoyer le lien », « Retour aux jeux ».
5. Connecté : bandeau bonbon avec avatar et pseudo, une ligne par jeu, « Voir ma fiche complète » (vers `#/profil`), « Me déconnecter ».
6. Compte supprimé : « Ton compte, tes stats et ton historique sont effacés. Tu peux toujours jouer avec un pseudo. », « Retour à l'accueil ».

## Profil

**Route** `#/profil` (si non connecté : ouvre la fenêtre de compte). **Maquette** `Profil.html`.

- Colonne gauche : grand avatar (lettre sur bonbon, ou l'image si une URL est donnée), pseudo, « Joueur depuis… », champs Pseudo et Avatar (adresse d'une image), « Enregistrer », « Me déconnecter », zone danger « Supprimer mon compte » avec **appui long de 2 s** (`holdToConfirm`).
- Droite : « Tes stats », une carte par jeu à ses couleurs (Parties, Victoires, Score total, Meilleur score ou Meilleure série ou Record mpm) ; « Tes 20 dernières parties », tableau filtrable par jeu, suppression d'une ligne sans confirmation mais toast « Partie supprimée. » avec « Annuler » pendant 6 s.

## 404

**Route** tout le reste. **Maquette** `Erreur404.html`. Cartouche « ? » coincée dans une fente, « 404 » géant en or, « Cette cartouche n'est pas dans le coffre. », « Retour à l'accueil », « Un jeu au hasard ».

---

## Imposteur

**Routes** `#/imposteur`, `#/imposteur/KRAB`. **Maquettes** `Imposteur.html` (5 écrans téléphone), `Imposteur-desktop.html`. **CSS** `imposteur.css`.

1. Entrée : étiquette « Dossier n° 1 », titre « Imposteur », « Tout le monde a le même mot. Sauf un. À toi de le trouver, ou de ne pas te faire prendre. », Code de salle, Ton pseudo, « Rejoindre la salle », « Créer une nouvelle salle », lien « Comment on joue ? ».
2. Salon : fiche avec le code + « Copier le lien », « Joueurs » x/8, liste avec pastilles Hôte / Toi. Hôte : steppers Manches (1 à 10, défaut 3) et Temps par tour (10 à 120 s par pas de 10, défaut 60), « Lancer la partie ». Invités : « En attente de [hôte]… » à la place des réglages.
3. Indices : chrono en haut, fiche « Ton mot » + tampon « Confidentiel », une ligne par joueur avec ses indices en fiches tapées. Joueur actif : liseré or et « écrit… 0:42 ». Ton tour : encadré or « À toi : un mot pour ton indice » + « Poser ». Hôte : « Passer aux votes ». Ordinateur : fiches de suspects en grille, celle du joueur actif soulevée, colonne de droite avec ton mot, bouton hôte et « Journal de la salle ».
4. Vote : « Qui ment ? », grille 2 colonnes de boutons radio (avatar + nom), pas de vote pour soi, puis « Tu as voté pour : Yanis. On attend encore Sofia et Malik. »
5. Révélation : « L'imposteur était » + nom + tampon « Démasqué » (ou « Raté » si personne ne l'a trouvé), « Son mot » en brique, « Votre mot » en pomme, classement avec +100, « Manche suivante (2/3) ». Après la dernière manche : classement final + « Rejouer » / « Accueil ».

États : en attente de joueurs ; l'hôte change (toast info « Léa est maintenant l'hôte. » + ligne du journal) ; joueur qui quitte (fiche grisée, pastille « Revient ? », place gardée 30 s) ; connexion perdue (toast erreur persistant « Connexion perdue. On réessaie… » + « Réessayer ») ; code inexistant (secousse du champ + « Ce code de salle n'existe pas. Vérifie les 4 lettres avec l'hôte. »).

## Lyrics

**Routes** `#/lyrics`, `#/lyrics/<id>`. **Maquettes** `Lyrics.html` (4 écrans), `Lyrics-desktop.html`. **CSS** `lyrics.css`.

1. Choix : titre « Lyrics », recherche avec loupe pixel, filtres en pastilles défilantes (genre, artiste, année, tri), grille 2 colonnes (4 à 6 sur ordinateur) de cartes chanson (pochette réelle ou vinyle généré, titre, artiste, année).
2. Partie : bandeau chanson (vinyle, titre, artiste, « Abandonner »), barre or collée en haut (« 12/180 », barre de progression, champ, bouton effacer, message), cahier ligné avec les mots cachés en barres bleues de la longueur du mot. Ordinateur : pochette et commandes à gauche, cahier en 2 colonnes à droite.
3. Victoire : fond or, vinyle, « Disque d'or », « Tu as retrouvé les 180 mots de [titre]. », temps, mots tapés pour rien, « Une autre chanson », « Revoir les paroles ».
4. Défaite : « Rayé. », « Tu en as trouvé 134 sur 180. Les 46 manquants sont en brique. », paroles complètes avec les manquants en brique, « Retenter cette chanson », « Choisir une autre chanson ».

États : recherche en cours (pochettes fantômes) ; aucun résultat ; paroles introuvables ; erreur réseau avec « Réessayer » ; mot déjà trouvé (« « minuit » est déjà trouvé (3 fois dans le texte). ») ; mot inexistant (secousse + bord brique + « « brouette » n'est pas dans la chanson. », champ vidé).

## Karaoké

**Routes** `#/karaoke`, `#/karaoke/salle/FADO`. **Maquettes** `Karaoke.html` (4 écrans), `Karaoke-scene.html`. **CSS** `karaoke.css`.

1. Mode : ampoules, titre « Karaoké », deux billets de théâtre « Solo » (or) et « Salle » (crème).
2. Salle : formulaire pseudo + code (vide = créer), puis salon : code + « Copier », « Dans la salle (n) », pastilles Hôte / Toi. Invités : projecteur + micro pixel + « En attente que [hôte] choisisse une musique… ». Hôte : recherche et grille de chansons.
3. Choix de la chanson : recherche + grille. En solo, tiroir « Tu chantes avec quoi ? » : Musique complète / Instrumentale / Sans musique (boutons radio), « En scène ».
4. Scène (plein écran) : rideaux, ampoules, projecteur ; barre « Quitter », titre, « Ligne 14/42 » ; ligne précédente discrète, **ligne courante énorme** (partie chantée en or), ligne suivante ; contrôles « Précédente », « Auto », « Suivante » (hôte ; flèches et Espace au clavier) ; les spectateurs voient « [hôte] contrôle les paroles » ; barre des joueurs.
5. Fin : « Fin de la chanson », « Le public est encore sous le choc. Dans le bon sens, on suppose. », « Recommencer », « Changer de musique ».

## Plus ou Moins

**Route** `#/plus-ou-moins`. **Maquettes** `PlusOuMoins.html` (3 écrans), `PlusOuMoins-desktop.html`. **CSS** `plus-ou-moins.css`.

1. Départ : « Édition du jour / Prix : gratuit », titre « Plus ou Moins » (« ou » surligné bonbon), règle, record perso, thèmes, « Lancer une série ».
2. Jeu : en-tête avec « Série 7 » ; deux panneaux face à face (empilés sur téléphone, côte à côte sur ordinateur) séparés par une pastille « ou ». Panneau 1 : catégorie, nom, valeur révélée, **source**. Panneau 2 : catégorie, nom, « ? », boutons « Plus [haut/long/cher…] » et « Moins … ». Après le choix : le chiffre se compte (700 ms), le panneau passe pomme ou brique, puis glisse à gauche et un nouveau arrive. Clavier : flèches haut et bas.
3. Fin : « La série s'arrête à 7 », l'explication de l'erreur, Cette série / Ton record (record battu : bloc or, ancien chiffre barré), « Rejouer », « Autre jeu ».

## Course de frappe

**Routes** `#/frappe`, `#/frappe/ZOOM`. **Maquettes** `Frappe.html` (3 écrans), `Frappe-desktop.html`. **CSS** `frappe.css`.

1. Ligne de départ : damier, titre « Course de frappe_ », onglets Solo / En salle, code + « Copier », couloirs numérotés avec pastilles Prêt / Pas prêt, « Je suis prêt », « Départ automatique quand tout le monde est prêt. »
2. Compte à rebours : feux, chiffre géant 3, 2, 1, « Doigts sur le clavier. »
3. Course : piste avec une voiture par joueur qui avance selon sa progression (la tienne entourée de crème), phrase en VT323 (justes en vert, faute sur fond brique, curseur or, reste gris), vitesse en mots par minute, précision, position. Une faute bloque : il faut corriger.
4. Résultats : « Arrivée_ », podium, classement (mpm, précision), « Revanche », « Quitter la salle ».
