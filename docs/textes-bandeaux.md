# Textes des bandeaux de l'accueil (lot B)

Gabarit : 2 phrases, 90 à 140 caractères (espace entre phrases compris), tutoiement, sentence case, sans tiret long ni mot interdit. Repères : forme fixe `max N joueurs · Type`, jamais de durée. Les nombres viennent de `backend/config.js` ou du client.

| Jeu | Titre | Description (phrases / total) | Repères |
|---|---|---|---|
| Imposteur | Imposteur | Chacun reçoit le même mot, sauf un. Donne un indice et démasque l’imposteur avant qu’il te démasque. (35 + 64 / 100) | `max 8 joueurs` · `Bluff` |
| Lyrics | Lyrics | Tous les mots de la chanson sont cachés. Tape ceux que tu connais pour les dévoiler un à un. (40 + 51 / 92) | `Solo` |
| Karaoké | Karaoké | Lance une chanson et suis les paroles qui défilent. En salle, tout le monde chante la même chanson en même temps. (64 + 53 / 118) | `max 10 joueurs` · `Coopératif` |
| Plus ou Moins | Plus ou Moins | Compare deux choses et dis laquelle en a le plus. Une seule erreur et ta série s’arrête net. (49 + 42 / 92) | `Solo` · `Aperçu` |
| Course de frappe | Course de frappe | Tape la phrase plus vite que les autres voitures. Une faute te bloque tant que tu ne l’as pas corrigée. (49 + 53 / 103) | `Course` · `Aperçu` |

## Types tranchés (d'après le code)

- Imposteur : Bluff. Mot commun, un imposteur, indices puis vote (`imposteur.js`, `MAX_JOUEURS = 8` = `MAX_IMPOSTEUR_PLAYERS`).
- Lyrics : Solo. Aucun socket, un seul joueur devine les mots d'une chanson (paroles réelles via lrclib/ovh), donc pas « Aperçu ».
- Karaoké : Coopératif. En salle, l'hôte fait défiler les lignes (`karaoke_advance`) et chacun chante la même chanson, sans score ni adversaire ; il existe aussi un mode solo. Max 10 = `MAX_KARAOKE_PLAYERS`.
- Plus ou Moins : Solo. Série et record personnels, données de `demo-data.js` (fictives), donc « Aperçu ». Pas de max joueurs.
- Course de frappe : Course (pas Duel : une salle compte plusieurs voitures, pas deux). Aucun socket, les autres voitures viennent de `DEMO_FRAPPE_JOUEURS` (4 joueurs fictifs), donc « Aperçu ». Pas de nombre affiché : aucune limite réelle dans le code.

## Points à valider

- Le type « Course » s'ajoute aux types listés dans l'ADR (Bluff, Coopératif, Duel, Solo) ; si refusé, repli sur `Solo · Aperçu`.
- Le test du lot A ne compte que les repères Imposteur (8) et Karaoké (10) : cohérent avec ce tableau.
- Karaoké propose aussi du solo : si le propriétaire préfère l'afficher, `Solo` en second repère.

## Autres textes redondants de l'accueil

Non audités dans ce lot (périmètre : les 5 descriptions). À examiner au lot D : `.jeux__compte`, `.etagere__glisse`, `.rejoindre__texte`. Ils disparaissent avec `.etagere` et `section.jeux` ; `.rejoindre__texte` est à garder s'il reste utile au formulaire « Rejoindre ».
