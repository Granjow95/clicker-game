# Textes des bandeaux de l'accueil

Gabarit : 2 phrases, 90 à 140 caractères, tutoiement, sentence case, sans tiret long ni mot interdit. Repères : nombre de joueurs (pour les jeux multi, bornes issues de `backend/config.js` et des minimums serveur), puis type ; durée indicative pour les jeux solo courts. Les jeux sont rangés en deux groupes : « On joue à plusieurs » et « On joue tout seul ».

## On joue à plusieurs

| Jeu | Description | Repères |
|---|---|---|
| Imposteur | Chacun reçoit le même mot, sauf un. Donne un indice et démasque l’imposteur avant qu’il te démasque. | `3 à 8 joueurs` · `Bluff` · `Mr White` |
| Gribouille | Un joueur dessine le mot. Les autres devinent dans le chat, le plus rapide gagne. | `2 à 8 joueurs` · `Dessin` |
| Petit Bac | Une lettre, des catégories, un chrono. Les réponses valides et uniques rapportent des points. | `2 à 10 joueurs` · `Mots` |
| Karaoké | Lance une chanson et suis les paroles qui défilent. En salle, tout le monde chante la même chanson en même temps. | `Solo ou salle` · `jusqu’à 10 joueurs` · `Coopératif` |

## On joue tout seul

| Jeu | Description | Repères |
|---|---|---|
| Lyrics | Tous les mots de la chanson sont cachés. Tape ceux que tu connais pour les dévoiler un à un. | `Solo` · `~5 min` |
| Mot Caché | Trouve le mot de 5 lettres en 6 essais. Les couleurs te disent où chercher. | `Solo` · `~5 min` |
| Écho | Retiens la séquence de couleurs et de sons, puis rejoue-la. Elle s’allonge à chaque tour. | `Solo` · `~3 min` · `Mémoire` |
| Potager | Plante, récolte, vends et agrandis ta ferme. Ton potager pousse même quand tu n’es pas là, et ta partie est sauvegardée. | `Solo` · `Farming` · `Sauvegarde` |
| Course de frappe | Tape la phrase plus vite que les robots et que ton propre record. Une faute te bloque tant que tu ne l’as pas corrigée. | `Solo` · `Rapidité` |

## Sources des repères

- Imposteur : `MAX_IMPOSTEUR_PLAYERS = 8`, au moins 3 joueurs connectés pour lancer, Mr White à partir de 4 (`backend/games/imposteur.js`).
- Gribouille : `MAX_GRIBOUILLE_PLAYERS = 8`, au moins 2 joueurs. Petit Bac : `MAX_PETITBAC_PLAYERS = 10`, au moins 2.
- Karaoké : `MAX_KARAOKE_PLAYERS = 10`, salle sur le registre commun (`kk:*`), l'hôte fait défiler les lignes ; mode solo disponible.
- Potager : jeu de farming incrémental (`javascript/potager.js`, `potager-donnees.js`), sauvegarde locale + code d'export.
- Course de frappe : solo contre trois robots et le fantôme de ton record (`javascript/frappe-donnees.js`).
