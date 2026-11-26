# ADR 0004 — Pseudos réservés aux comptes et durcissements

- Statut : accepté
- Date : 2026-11-26

## Contexte

Dans les salles multi, n'importe qui pouvait entrer sous le pseudo d'un compte (seul `clean()` filtrait le pseudo). La table `profiles` garantit pourtant un pseudo unique par compte (`profiles_username_key` sur `lower(username)`, format `^[a-zA-Z0-9_]{3,20}$`).

## Décisions

1. **Pseudo imposé au compte.** À la création ou la jointure d'une salle (`backend/lib/rooms.js`), le serveur résout le pseudo via `backend/lib/pseudos.js` :
   - socket connecté à un compte : pseudo de son profil (le pseudo envoyé est ignoré) ; sans profil lisible, son pseudo demandé, sauf s'il appartient à un autre compte ;
   - invité : refus (`username_taken`) si le pseudo appartient à un compte, sans tenir compte de la casse.
   Le client (`granSalle`) affiche le pseudo du compte en lecture seule ; chaque jeu reprend le pseudo renvoyé par le serveur.
2. **Laisser passer en cas de panne.** Supabase absent, en erreur ou plus lent que 3 s : le pseudo demandé est accepté. Une usurpation reste donc possible pendant une panne ; c'est préféré à une partie bloquée.
3. **Requête `ilike` plutôt qu'une fonction SQL.** Le format des pseudos de compte exclut `%` et `*` ; seul `_` est échappé, et la requête n'est lancée que pour un pseudo à ce format. Pas d'index utilisé, mais la table est petite et le résultat est mis en cache (60 s pour un pseudo pris, 10 s pour un pseudo libre, 15 s compte → pseudo ; cache borné à 2000 entrées, plus ancienne évincée, vidé à la suppression d'un compte). Si la table grossit, passer à une fonction `rpc` sur `lower(username)`.
4. **Verrou par socket** pendant la résolution : une deuxième création/jointure simultanée reçoit `rate_limited`. Après l'attente, tout est revérifié (socket encore connecté, même compte qu'avant l'attente, salle, capacité). Les handlers asynchrones capturent leurs exceptions.
   **Sosies** : la comparaison se fait sur une forme normalisée (NFKD, sans accents, minuscules, lettres cyrilliques et grecques courantes latinisées) ; `clean()` retire aussi les caractères invisibles et de direction (U+200B–U+200F, U+202A–U+202E, U+2060–U+2069, U+FEFF, U+00AD).
5. **Stats Imposteur** : comme Gribouille, Petit Bac et Karaoké, rien n'est enregistré sous 2 comptes distincts (`hasDistinctAccounts`), pour qu'un compte seul avec des onglets invités ne gonfle pas ses stats.
6. **`/yt-search`** n'accepte plus que les origines de `isOriginAllowed` (403 sinon, `Vary: Origin`). Sans en-tête Origin (curl), la route reste accessible mais limitée par IP.
7. **Mot de passe** : 8 caractères minimum à l'inscription côté client. Le réglage Supabase (Authentication > Providers > Email) doit être aligné par le propriétaire ; les anciens comptes à 6 caractères se connectent toujours.
