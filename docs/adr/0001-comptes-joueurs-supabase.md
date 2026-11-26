# ADR 0001 — Comptes joueurs et historique via Supabase

- Statut : proposé
- Date : 2026-11-20

## Contexte

Les invités jouent avec un pseudo. On ajoute des comptes optionnels (email/mot de passe de 8 caractères minimum depuis le 2026-11-26, 6 auparavant, Discord ; Google écarté : configuration trop lourde) pour conserver l'historique des parties. La base Supabase existe déjà : `profiles`, `game_results`, la vue `player_stats`, la RLS (lecture, modification et suppression de ses propres lignes ; `game_results` n'a aucune policy INSERT ni UPDATE, seul le DELETE de ses propres lignes est permis) et le trigger `handle_new_user`.

## Décisions

1. **Le compte est optionnel.** Sans jeton, le socket est invité (`socket.data.userId = null`) et rien n'est enregistré.
2. **L'identité est fixée au handshake.** Un middleware `io.use` lit `socket.handshake.auth.token` et le vérifie côté serveur avec `supabase.auth.getUser(token)` (ou `getClaims` si les clés JWT sont asymétriques), puis écrit `socket.data.userId`. Un jeton invalide fait retomber en invité et déclenche l'événement `auth_error`. Aucun `userId` venant d'un payload n'est lu.
3. **Seul le serveur écrit dans `game_results`, avec la clé `service_role`.** Il écrit à la fin de manche :
   - imposteur : dans `tryFinalizeVotes` après `reveal_results`, une ligne par joueur connecté. Le `userId` est figé dans `room.players` au moment du `join`.
   - karaoke : le serveur ne détecte pas la fin d'une chanson, donc on enregistre la participation au `karaoke_start` (`score` nul, `rounds` = 1).
   - lyrics : le jeu tourne côté client et le serveur ne peut pas vérifier le score. Il passe par l'événement `lyrics_result` (sockets authentifiés uniquement, limité en débit, valeurs bornées) avec `meta.unverified = true`.
   L'écriture se fait sans attendre la réponse (`catch` + log) : un échec Supabase ne bloque jamais la partie.
4. **CRUD côté client.** Le client lit et modifie son profil, lit son historique et supprime une partie directement via supabase-js et la RLS, avec la clé publishable. La suppression du compte passe par l'événement socket `account_delete` : le serveur appelle `auth.admin.deleteUser(socket.data.userId)`. On reste sur Socket.io pour ne pas ajouter de CORS sur les routes Express.
5. **Route `/health`.** Elle fait une vraie requête : `profiles` en `head` + `count`, `limit 1`, avec un timeout de 5 s. Elle renvoie 200 `{ok:true}` ou 503, sans détail d'erreur. Sans configuration, elle renvoie aussi 503 `{ok:false}`.
6. **Ping quotidien.** Le workflow `.github/workflows/supabase-keepalive.yml` (cron quotidien + `workflow_dispatch`) appelle directement l'API REST Supabase avec la clé publishable, puis `/health` en `continue-on-error`, car Render peut être en veille.
7. **Configuration.** `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont lues dans `backend/config.js`. Si l'une manque, les fonctions de compte sont désactivées et les tests passent sans réseau. Le client Supabase est injectable pour les tests.

## Conséquences

- Nouvelle dépendance serveur `@supabase/supabase-js` et script CDN côté client (version figée + SRI) : audit `security` requis.
- Le socket client est créé après `auth.js` avec `auth: (cb) => cb({ token })`. À la connexion ou déconnexion d'un compte, on refait le handshake hors partie uniquement.
- Les scores lyrics ne sont pas fiables et sont marqués comme tels.
- GitHub suspend les cron après 60 jours sans activité sur le dépôt.
- Note : Gribouille et Petit Bac enregistrent leurs parties (une ligne par compte, au moins 2 comptes distincts ; Imposteur aussi depuis l'ADR 0004). La migration `docs/sql/0002-game-results-nouveaux-jeux.sql` élargit la contrainte `game_results_game_check` ; elle est appliquée depuis le 2026-11-26.
- Note : les jeux solo (Mot Caché, Écho, Course de frappe, Potager, Lyrics) enregistrent aussi leurs parties. Le client les garde toujours en local (`granGames:stats:<id>`, via `granStats` dans `javascript/jeux.js`) et, si un compte est connecté, émet `solo_result { game, score, won, rounds, meta }`. Le serveur (`registerSolo`, `backend/lib/results.js`) exige un compte, limite à 6 par minute et 150 par jour et par compte, plafonne le score à 1000 et marque `meta.unverified`. La liste des jeux vit dans `GRAN_JEUX` (client) et `GAMES` / `SOLO_GAMES` (serveur) ; la migration 0002 couvre les neuf jeux (appliquée le 2026-11-26).

## Conventional Commits

`feat(auth): ...`, `feat(account): ...`, `feat(backend): ...`, `ci: ...`, `test(backend): ...`, `docs(adr): ...`, `chore(deps): ...`
