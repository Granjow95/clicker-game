# Système de design Gran'Games : « le coffre à cartouches »

Référence visuelle : `reference/html/Main.html`, `Composants.html`, `Motion.html`.

## Le concept

Chaque jeu est une **cartouche** : son étiquette, sa palette, sa police d'accent, son décor. Le site est la **console** qui les fait tourner : en-tête, touches, champs, fenêtres, toasts, espacements et transitions sont **communs** et ne changent jamais d'un jeu à l'autre.

Trois règles :

1. **La console ne change jamais.** Un joueur qui sait utiliser un jeu sait utiliser tous les autres.
2. **La cartouche décide de l'ambiance.** Un jeu change le fond, une police d'accent et un motif. Il ne touche ni aux touches ni à l'en-tête.
3. **Tout se touche comme un jouet.** Les boutons ont une épaisseur et s'enfoncent, les cartouches se soulèvent, les panneaux ont des coins en escalier de pixels. Pas de dégradé décoratif, pas de néon, pas de violet, pas d'emoji.

## Couleurs de la console

| Nom | Hex | Rôle | Contraste |
| --- | --- | --- | --- |
| Mousse | `#22261C` | Fond de console (damier 8 px avec `#262A1F`) | Parchemin dessus : 12,5:1 |
| Lichen | `#333828` | Surfaces sombres | Parchemin dessus : 9,8:1 |
| Bord lichen | `#4A5139` | Bords sur fond sombre | |
| Parchemin | `#EFE8CC` | Panneaux, texte clair | Encre dessus : 13,9:1 |
| Papier ombré | `#D8CFAC` | Bords, zones calmes sur clair | Encre dessus : 10,9:1 |
| Encre | `#1B1D16` | Texte, bords, épaisseurs | |
| Bouton d'or | `#F2B630` | Action principale | Encre dessus : 9,3:1 |
| Faïence | `#2E63B8` | Focus, liens, info | Blanc dessus : 5,8:1 |
| Bonbon | `#F28AA6` | Toi, nouveautés | Encre dessus : 7,3:1 |
| Pomme | `#7FB342` | Juste, gagné, prêt | Encre dessus : 6,8:1 |
| Brique | `#B83A24` | Faux, danger, imposteur | Parchemin dessus : 4,7:1 |

Texte secondaire : `#B9B596` sur fond sombre, `#5A5A45` sur parchemin. Erreur de champ : `#F4A08E` sur fond sombre, `#9A2E1B` sur parchemin.

## Les cinq mondes

| Jeu | Monde | Fond | Accent | Police d'accent | Décor | Moment fort |
| --- | --- | --- | --- | --- | --- | --- |
| Imposteur | Le salon des soupçons | `#1E4D3B` feutre | `#B83A24`, `#EFE8CC` | Special Elite | Fiches tapées à la machine, tampon | Le tampon « Démasqué » |
| Lyrics | Le carnet de paroles | `#2E63B8` | `#F2B630` | Shrikhand | Vinyles, cahier ligné | Les mots qui se retournent |
| Karaoké | La scène | `#6E1A1F` velours | `#F2B630`, `#FFF4D6` | Bungee | Rideaux, ampoules, projecteur | La ligne courante géante |
| Plus ou Moins | La Une | `#E4E0D4` trame | `#F28AA6` | Anton | Journal, colonnes | Le chiffre compté |
| Course de frappe | Le circuit | `#2F3134` asphalte | `#F2B630` | VT323 | Couloirs, damier, feux | 3, 2, 1 et l'arrivée |

Les variables `--monde-*` de chaque monde sont dans `styles/base.css` (section 16). Le décor est dans `styles/<jeu>.css`.

## Typographie

- **Pixelify Sans** (400, 600, 700) : titres, chiffres, noms de jeux, touches principales. Jamais sous 16 px, jamais en paragraphe.
- **Bricolage Grotesque** (400, 600, 800, axe `opsz`) : tout le texte courant et l'interface.
- Une police d'accent par monde (tableau ci-dessus), uniquement pour les titres et les éléments de décor du jeu.
- Échelle : 12, 14, 16, 20, 26, 34, 48, 72, 120 px. Titre d'affiche : `clamp(80px, 13vw, 208px)`.
- Pas de majuscules forcées sur les libellés, pas de mot isolé en couleur dans un titre.

## Formes

- Grille d'espacement de 4 px : 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Rayons : 6 px (champs, pastilles), 10 px (touches), 16 px (fenêtres), coin coupé de 28 px (cartouches).
- Trait : 3 px encre. Épaisseur des touches : `0 4px 0 #000` (3 px en compact, 8 px pour les fenêtres).
- Coins en escalier (`.px`) : grands panneaux et pastilles seulement, jamais les champs (le clip-path couperait l'anneau de focus).

## Animations (résumé, détail dans `reference/html/Motion.html`)

| Élément | Mouvement | Durée | Courbe | Mouvement réduit |
| --- | --- | --- | --- | --- |
| Touche | descend de 3 px | 120 ms | ease-out fort | identique |
| Cartouche (survol souris) | monte de 14 px, se redresse | 220 ms | ease-out fort | contour or seul |
| Accueil vers jeu | cartouche qui sort puis monde qui se déroule de bas en haut | 180 + 320 ms | out puis in-out | fondu 150 ms |
| Retour à l'accueil | le monde s'enroule vers le haut | 180 ms | in-out | fondu |
| Écran vers écran (jeu) | fondu + 8 px + flou 2 px | 200 ms | ease-out fort | fondu 120 ms |
| Fenêtre | scale 0,96 vers 1 + opacité, centrée | 200 ms (sortie 150) | ease-out fort | opacité |
| Tiroir téléphone | translateY(100%) vers 0 | 320 ms (sortie 200) | tiroir | opacité |
| Toast | monte du bas, sort par le bas | 300 ms (sortie 200) | ease | opacité |
| Tampon imposteur | scale 1,3 vers 1, rotation -8° | 240 ms | ease-out fort | direct |
| Compte à rebours | chaque chiffre : scale 1,15 vers 1 | 400 ms | ease-out fort | chiffre seul |
| Chiffre compté | de 0 à la valeur | 700 ms | ease-out fort | valeur directe |
| Ligne karaoké | la suivante monte | 280 ms | in-out fort | direct |
| Frappe | couleur seule | 0 ms | aucune | identique |

Courbes : `--ease-out: cubic-bezier(.23,1,.32,1)`, `--ease-in-out: cubic-bezier(.77,0,.175,1)`, `--ease-tiroir: cubic-bezier(.32,.72,0,1)`.

Principes : jamais d'`ease-in` ; jamais de `transition: all` ; on n'anime que `transform`, `opacity`, `clip-path`, `filter` ; jamais d'animation sur une action au clavier répétée (frappe, saisie) ; les survols sont dans `@media (hover: hover) and (pointer: fine)` ; transitions CSS plutôt que keyframes pour ce qui peut être interrompu (toasts) ; on ne part jamais de `scale(0)`.

## Ton des textes

On tutoie. Phrases courtes, verbes simples, pas d'emoji. Une pique de temps en temps, jamais sur une erreur technique : là, on dit ce qui s'est passé et quoi faire.

| Plutôt | Plutôt pas |
| --- | --- |
| Choisis ton jeu. On ne juge pas. Enfin, un peu. | Bienvenue sur notre plateforme de divertissement ! |
| Ce code de salle n'existe pas. Vérifie les 4 lettres avec l'hôte. | Oups ! Une erreur est survenue. |
| Démasqué. Léa avait « Pain au chocolat ». | Félicitations !!! Vous avez gagné 🎉 |
| Raté. Il te manquait 23 mots, on te les montre. | 💔 Dommage ! |
| Aucune chanson pour « zzz ». Essaie un artiste ou un mot du titre. | Aucun résultat. |

Un bouton dit ce qui se passe et garde le même mot partout : « Rejoindre la salle » produit « Tu as rejoint la salle KRAB ».

## Accessibilité (non négociable)

- Contraste 4,5:1 minimum pour le texte (3:1 au-dessus de 24 px). Les paires du tableau sont vérifiées.
- Focus visible partout : anneau 3 px (faïence, ou couleur `--monde-focus` sur les fonds de jeu).
- Vrais `<button>`, `<a href>`, `<input>` + `<label>`. Boutons-icônes avec `aria-label`.
- Cibles tactiles de 44 px minimum.
- Une couleur ne porte jamais seule une information : toujours un mot (Hôte, Toi, Prêt, Revient ?).
- `prefers-reduced-motion` : moins de mouvement, pas zéro. Voir section 15 de `base.css`.
- Textes des joueurs (pseudo, indice, nom de salle) : `textContent` uniquement.
