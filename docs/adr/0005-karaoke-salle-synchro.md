# ADR 0005 — Karaoké en salle : musique synchronisée sur tous les appareils

- Statut : accepté (implémenté)
- Date : 2026-11-27

## Contexte

- En salle (`backend/games/karaoke.js`, préfixe `kk`), aucun audio : l'hôte fait défiler les lignes (`kk:advance`, borné à `MAX_LINE = 5000`, pas au nombre de lignes). Le solo a déjà un moteur YouTube (`kkStartAudio`, `kkOnYTError`, `kkAudioSyncStep`) alimenté par `GET /yt-search` (`backend/lib/ytSearch.js`, scraping, 10 candidats).
- Voulu : l'hôte choisit chanson + mode (`full` / `instrumental`), seules les chansons LRC sont proposées, musique jouée et synchronisée sur chaque appareil, volume/muet locaux, l'hôte peut pause / reprendre / recommencer / ligne ±1, les paroles défilent même sans vidéo.
- Bugs du même code : clavier (dépassement de la dernière ligne, touche A en salle, pas de test des modificateurs, Espace qui bloque les boutons et le dialog `kk-garde`), `kkPickSong` qui écrit `kk.song` avant la confirmation serveur et sans garde de concurrence, `endTimer` qui affiche la fin même après être revenu en arrière.

## Décisions

### 1. Le serveur détient une horloge de lecture ; tout le reste en dérive

```
st.clock = { playing, baseMs, baseAt, seq }   // baseAt = heure serveur (Date.now())
pos(now) = playing && now >= baseAt ? baseMs + (now - baseAt) : baseMs   // figée sur baseMs jusqu'au top départ
```
- `kk:start` / `kk:restart` : `playing = true, baseMs = 0, baseAt = now + LEAD_MS` (3000, `opts.leadMs` en test).
- `kk:pause` : `baseMs = max(0, pos(now))`, `playing = false`. `kk:play` : `baseAt = now + 800` (laisse les lecteurs bufferiser).
- `kk:advance {direction, from?}` : ligne courante = dernière `lines[i].t <= pos(now) + 50` (-1 pendant l'intro) ; `from` (ligne vue par l'hôte) est retenu s'il diffère d'au plus 1. Cible bornée à `[-1, lines.length - 1]` (-1 = retour au début de l'intro), `baseMs = lines[cible].t` (0 pour -1), `baseAt = now + 500` si `playing`. Pas de décalage de 300 ms : la ligne recalculée tomberait sur la précédente et « suivante » resterait bloquée.
- Chaque changement incrémente `seq` et diffuse `kk:clock { playing, baseMs, baseAt, seq, serverNow }`. Le client ignore un `seq` inférieur au dernier reçu.
- **Les paroles sont calculées depuis l'horloge partagée, jamais depuis `getCurrentTime()`** : mêmes lignes chez tous, et elles continuent si la vidéo échoue. Le lecteur YouTube est asservi à l'horloge.
- Fin de chanson décidée **par le serveur seul** (on ne fait pas confiance au client) : minuteur `unref()` à `endMs = max(song.duration * 1000, dernière ligne + 6 s)`, replanifié à chaque `kk:clock`, annulé en pause, `stop`, `onEmpty`. À échéance : `st.ended = true`, `kk:ended`. Un `ENDED` YouTube côté client coupe seulement l'audio local.
- Changement d'hôte : rien à faire, l'horloge vit dans la salle ; le nouvel hôte reçoit les contrôles via `kk:room`. `onEmpty` vide le minuteur.

### 2. Horaires LRC parsés côté serveur

- Nouveau `backend/lib/lrc.js` : `parseLrc(text) -> [{ t /* ms */, text }]`, horaires strictement croissants ≤ 1 h, plusieurs horaires par ligne gérés, fusion à moins d'1 s limitée à une fois par ligne (contrairement au solo, pas d'enchaînement sur tout un couplet), texte via `clean(…, 200)`, 500 lignes max.
- `kk:select_song` refuse (`no_sync`) si moins de 5 lignes datées. La diffusion envoie `{ song: méta, mode, lines, videoIds, endMs }` ; `lyrics` / `syncedLyrics` bruts ne sont plus rediffusés. En salle, le client utilise `lines` du serveur (indices identiques partout) ; le solo garde `parseLRC`.

### 3. Même vidéo pour tous : le serveur fait la recherche

- `ytSearch.js` expose `searchVideoIds(query, limit)` (le handler HTTP l'utilise), avec un cache mémoire (200 entrées, 30 min) et une déduplication des requêtes en cours.
- Au `kk:select_song`, le serveur construit lui-même la requête (`artist title` + `audio` ou `instrumental`), garde 5 IDs `/^[\w-]{11}$/`. L'hôte n'envoie jamais d'ID : pas de contenu YouTube arbitraire imposé à la salle. Injection en test : `opts.searchVideos` (pas de réseau).
- Le handler est asynchrone : jeton `st.selectSeq` (seule la dernière sélection s'applique), revérification après `await` que la salle existe, que l'émetteur est toujours hôte et que la partie n'a pas démarré. Liste vide : sélection acceptée, `videoIds: []`, paroles sur l'horloge seule.
- Chaque client essaie les candidats **dans le même ordre** (101/150 → suivant) : on converge vers la même vidéo sauf blocage régional. Pas de pré-validation par l'hôte (complexité sans garantie régionale).

- Budget de recherche (revue sécurité) : `searchVideoIds` refuse au-delà de 30 recherches / min par IP (salles et route HTTP confondues, `clientIp` / `req.ip`), 60 / min pour tout le serveur et 4 simultanées ; le cache n'en consomme pas. Réponse YouTube : `r.ok` vérifié, lecture coupée à 2 Mo.

### 4. Décalage d'horloge client/serveur

- `kk:time` avec accusé Socket.io : client `emit('kk:time', { c }, ack)`, serveur `ack({ c, s: Date.now() })` si `typeof ack === 'function'`. Limiteur par socket : 30 / 60 s. La série de 5 n'est pas refaite si la dernière mesure a moins d'une minute.
- Client : 5 échantillons espacés de 150 ms à l'entrée en salle et à la reprise, on garde celui de plus petit RTT : `offset = s - (c + rtt / 2)`. Puis 1 échantillon toutes les 30 s pendant la lecture (remplacé seulement si RTT plus petit ou âge > 2 min). Avant le premier échantillon : `offset ≈ serverNow - Date.now()`.

### 5. Recalage du lecteur YouTube

- Boucle 125 ms : `cible = pos(Date.now() + offset)`. En attente (avant `baseAt`, ou en pause) : lecteur en pause sur `baseMs` ; s'il n'est pas encore chargé (états -1 / 5), un `seekTo` son coupé lance le chargement puis le pas suivant met en pause. Intro : « La chanson démarre… » avec compte à rebours. En pause, les paroles restent visibles (« En pause » dans le compteur).
- En lecture : `dérive = getCurrentTime() * 1000 - cible`. Si `|dérive| > 250 ms` sur **2 mesures consécutives** → `seekTo(cible / 1000 + 0.15, true)`, puis 2 s sans recalage. Pause serveur → `pauseVideo()` + `seekTo(baseMs)`.
- **Pas de `setPlaybackRate`** : pas de 0,25 et variation de tempo audible ; le seek ponctuel suffit à 250 ms.
- Volume et muet locaux : `setVolume` / `mute`, mémorisés dans `localStorage['granKaraokeAudio'] = { volume, muted }`, appliqués à `onReady` (solo compris). Aucun événement serveur.
- Échec (aucun candidat lisible, API YT absente, délai dépassé) : badge « Sans musique sur cet appareil », paroles sur l'horloge. Autoplay bloqué (pas `PLAYING` 1,5 s après `playVideo`) : bouton « Lancer la musique » existant ; le tap fait `seekTo(cible)` + `playVideo()`.

### 6. Événements (tous via `asHost` sauf `kk:time`, état vérifié côté serveur)

| Client → serveur | Charge | Contrôles |
|---|---|---|
| `kk:select_song` | `{ song, mode }` | `mode ∈ {full, instrumental}` sinon `invalid` ; limiteur actuel 2 / 2 s ; refusé si `started` |
| `kk:start`, `kk:restart` | `{}` | chanson présente |
| `kk:pause`, `kk:play` | `{}` | `started`, état opposé requis (sinon ignoré) |
| `kk:advance` | `{ direction: "next" \| "prev" }` | énumération stricte, bornes réelles |
| `kk:stop` | `{}` | `started` |
| `kk:time` | `{ c }` + ack | `c` fini, limiteur par socket |

Contrôles de lecture : seau par salle `createKeyedLimiterBurst(400, 4)`. Pause / lecture / saut en excès sont ignorés sans message ; start / restart / stop renvoient `rate_limited`. Serveur → client : `song_selected`, `clock`, `started` (horloge incluse), `ended`, `stopped`. `line_changed` et `st.currentLine` disparaissent.

Snapshot (reprise et arrivée en cours) : `{ song, mode, lines, videoIds, endMs, started, ended, clock, serverNow }`. Le client lance la synchro d'horloge, puis le lecteur sur `pos`, avec repli sur le bouton si l'autoplay est refusé.

### 7. Client (`javascript/karaoke.js`)

- Grille en salle : uniquement les chansons avec `_syncedLyrics` ; tiroir de choix à 2 options en salle (`kkAskAudioChoice`), 3 en solo.
- `kkPickSong` : en salle, n'écrit plus `kk.song` ; drapeau `kk.picking` (grille désactivée, appels suivants ignorés) levé sur `kk:song_selected`, `kk:error`, perte du rôle d'hôte ou après 12 s. En solo : jeton `kk.pickSeq` contre les réponses `getSyncedLyrics` tardives.
- Clavier : ignorer si `ctrlKey/metaKey/altKey`, si la cible est `input, textarea, select, button, [contenteditable]` ou si un `dialog[open]` existe. Salle : flèches → `kk:advance` (hôte, désactivé aux bornes), Espace → `kk:pause`/`kk:play` (hôte) ; `A` réservé au solo.
- `endTimer` : effacé dès que `currentLine < total - 1` ; en salle, l'écran de fin n'apparaît que sur `kk:ended`.

## Plan (ordre d'implémentation)

| # | Rôle | Tâche | Validation |
|---|---|---|---|
| 1 | backend | `backend/lib/lrc.js` + `backend/test/lrc.test.js` | `npm test` : fusion < 1 s, ms, bornes 500 lignes / 200 car. |
| 2 | backend | `searchVideoIds` + cache dans `ytSearch.js`, handler inchangé | `/yt-search?q=…` renvoie le même JSON ; `npm run check` |
| 3 | backend | `karaoke.js` : horloge, événements §6, minuteur de fin, snapshot, `kk:time`, `opts.searchVideos` / `leadMs` | tests de la tâche 4 au vert |
| 4 | qa | `backend/test/karaoke.test.js` : mode invalide, `no_sync`, requête `instrumental`, sélections concurrentes (dernière gagne), start/pause/play/restart (`seq` croissant, `baseMs`), `advance` borné aux 2 extrémités, invité → `not_host`, `kk:time` ack + limite, reprise en pleine chanson (clock + lines), passage d'hôte en lecture, `kk:ended` puis annulation par pause, `stop` | `npm test` |
| 5 | security | Revue des nouveaux événements, du handler async et du cache de recherche | aucun point bloquant |
| 6 | frontend | Synchro d'horloge + paroles pilotées par `kk:clock` (sans audio) | 2 onglets : même ligne à ±1 tick, pause/ligne ±1 propagées |
| 7 | frontend | Lecteur asservi (§5), repli, volume/muet en `localStorage` | dérive < 300 ms entre 2 navigateurs ; vidéo forcée invalide → paroles continuent |
| 8 | frontend | Contrôles hôte, choix 2 modes, filtre LRC, `kkPickSong`, clavier, `endTimer` | `npm run check` ; recette manuelle des 3 bugs |
| 9 | ui-designer | `styles/karaoke.css` + textes : volume, muet, badge sans musique, boutons hôte | lisible mobile, couleurs `--monde-*` |
| 10 | qa + code-reviewer | Recette Chrome, Firefox, Safari iOS, Android ; relecture avant commit | checklist cochée |

Commits (Conventional Commits) : `feat(karaoke): parser LRC côté serveur`, `refactor(yt-search): extraire searchVideoIds avec cache`, `feat(karaoke): horloge de lecture partagée en salle`, `test(karaoke): …`, `feat(karaoke): musique synchronisée en salle`, `fix(karaoke): clavier, choix de chanson et écran de fin`, `style(karaoke): …`, `docs(adr): 0005 karaoké synchronisé`.

## Conséquences et risques

- **iOS / autoplay mobile** : Safari refuse `playVideo()` hors geste dans l'iframe cross-origin ; sur iOS, le bouton « Lancer la musique » sera la norme, pas l'exception. Le volume est contrôlé par le système sur iOS (`setVolume` sans effet) : seul le muet y fonctionne.
- **Région** : le scraping se fait depuis la région du serveur (Render) ; une vidéo bloquée chez un joueur le fait passer au candidat suivant, possiblement une version avec un autre décalage. Accepté : paroles toujours justes sur l'horloge, seul l'audio de ce joueur décale.
- **Décalage LRC / vidéo** (intro de clip différente) : même limite qu'en solo, hors périmètre.
- Plusieurs appareils dans la même pièce : 250 ms d'écart s'entendent ; le texte d'aide suggère de couper le son sur les autres appareils.
- Scraping YouTube fragile (changement de HTML) : dégradation propre vers « sans musique ».
- API IFrame YouTube non revérifiée via Context7 dans cette session (pas une librairie npm) : `playbackRate` discret, erreurs 2/5/100/101/150 et `ENDED = 0` tirés de la doc officielle connue.
