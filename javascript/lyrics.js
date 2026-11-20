// ======= 📁 javascript/lyrics.js =======

window.LYRICS_SONGS = [];

// Purge du cache de recherche si format obsolète (clés top1-top7 ou lrc1-lrc3)
try {
  const _sc = JSON.parse(localStorage.getItem('grg_search_v3') || '{}');
  const stale = Object.keys(_sc).some(k => /^(top[1-7]$|lrc[1-3]:)/.test(k));
  if (stale) localStorage.removeItem('grg_search_v3');
} catch {}

/* ============================================================
   CACHE localStorage   (v3 : fusion 3 sources)
============================================================ */
const _LYR_KEY    = 'grg_lyrics_v3';
const _SEARCH_KEY = 'grg_search_v3';
const _LYR_TTL    = 7 * 24 * 3600000;   // 7 jours
const _SRCH_TTL   = 3600000;             // 1 heure

const _lyrC = {
  r: () => { try { return JSON.parse(localStorage.getItem(_LYR_KEY)    || '{}'); } catch { return {}; } },
  w: c  => { try { localStorage.setItem(_LYR_KEY,    JSON.stringify(c)); } catch {} },
};
const _srC = {
  r: () => { try { return JSON.parse(localStorage.getItem(_SEARCH_KEY) || '{}'); } catch { return {}; } },
  w: c  => { try { localStorage.setItem(_SEARCH_KEY, JSON.stringify(c)); } catch {} },
};

/* ============================================================
   FETCH GÉNÉRIQUE
============================================================ */
async function _fetchJson(url, timeout = 10000) {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeout);
    const res  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/* ============================================================
   NORMALISATION pour déduplication inter-sources
============================================================ */
function _norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Clé de correspondance : titre (sans feat) + artiste principal
function _matchKey(title, artist) {
  const t = _norm((title  || '').replace(/\s*[\[(](?:feat|ft)[\s.].*?[\])]|\s*[\[(].*?[\])]/gi, '').trim());
  const a = _norm((artist || '').split(/\s*(?:feat\.?|ft\.?|,|×|&|\(|\/)/i)[0].trim());
  return `${t}:${a}`;
}

/* ============================================================
   MAPPERS
============================================================ */
function _deezerMap(r) {
  return {
    id:     `dz-${r.id}`,
    title:  r.title_short || r.title || '',
    artist: r.artist?.name || '',
    year:   r.release_date ? new Date(r.release_date).getFullYear() : null,
    genre:  null,
    cover:  r.album?.cover_medium || r.album?.cover || '',
  };
}

function _itunesMap(r) {
  return {
    id:     `it-${r.trackId}`,
    title:  r.trackName || '',
    artist: r.artistName || '',
    year:   r.releaseDate ? new Date(r.releaseDate).getFullYear() : null,
    genre:  r.primaryGenreName || null,
    cover:  (r.artworkUrl100 || '').replace('100x100bb', '300x300bb'),
  };
}

// lrclib.net — paroles ET timing synchronisé INCLUS dans la réponse de recherche
function _lrclibMap(r) {
  return {
    id:             `lrc-${r.id}`,
    title:          r.trackName  || '',
    artist:         r.artistName || '',
    year:           null,
    genre:          null,
    cover:          '',
    duration:       r.duration   || null,
    _lyrics:        (r.plainLyrics   || '').trim() || null,
    _syncedLyrics:  (r.syncedLyrics  || '').trim() || null,
  };
}

/* ============================================================
   SOURCES DE PAROLES
   (utilisées pour les titres Deezer/iTunes non trouvés dans lrclib)
============================================================ */
function _cleanArtist(a) {
  return (a || '').split(/\s*(?:feat\.?|ft\.?|×|&|,|with|\()/i)[0].trim();
}

// Supprime les suffixes courants qui empêchent de trouver les paroles
// ex: "Shape of You (feat. X)" → "Shape of You", "Flowers - Radio Edit" → "Flowers"
function _cleanTitle(t) {
  return (t || '')
    .replace(/\s*[\[(][^\]()]*(?:feat|ft|prod|with)[^\]()]*[\])]/gi, '')
    .replace(/\s*[\[(][^\]()]*(?:radio edit|remix|extended|acoustic|live|official|lyrics|video|clean|explicit|remaster|version|edition|deluxe|single)[^\]()]*[\])]/gi, '')
    .replace(/\s*-\s*(?:radio edit|remix|live|acoustic|official video|official audio|extended|version|single|remaster(?:ed)?)$/gi, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

async function _tryLyricsOvh(artist, title) {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 6000);
    const res  = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(_cleanArtist(artist))}/${encodeURIComponent(title)}`,
      { signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json();
    const lyr  = (data.lyrics || '').replace(/^Paroles de la chanson[^\n]*\n+/i, '').trim();
    return lyr || null;
  } catch { return null; }
}

async function _tryLrclibDirect(artist, title) {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 6000);
    const res  = await fetch(
      `https://lrclib.net/api/get?artist_name=${encodeURIComponent(_cleanArtist(artist))}&track_name=${encodeURIComponent(title)}`,
      { signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.plainLyrics || '').trim() || null;
  } catch { return null; }
}

// Récupère UNIQUEMENT le timing synchronisé (LRC) depuis lrclib.
// Utilisé par le karaoké quand une chanson n'a que des paroles brutes :
// permet d'obtenir la vraie synchronisation propre à chaque musique.
async function getSyncedLyrics(artist, title) {
  const fetchSynced = async (a, t) => {
    const data = await _fetchJson(
      `https://lrclib.net/api/get?artist_name=${encodeURIComponent(a)}&track_name=${encodeURIComponent(t)}`,
      6000
    );
    return (data?.syncedLyrics || '').trim() || null;
  };
  let synced = await fetchSynced(_cleanArtist(artist), title);
  if (!synced) {
    const clean = _cleanTitle(title);
    if (clean && clean.toLowerCase() !== (title || '').toLowerCase())
      synced = await fetchSynced(_cleanArtist(artist), clean);
  }
  return synced;
}

// Essaie deux sources en parallèle, avec fallback sur le titre nettoyé
async function getLyricsWithCache(artist, title) {
  const cache = _lyrC.r();
  const key   = `${(artist || '').toLowerCase().trim()}:${(title || '').toLowerCase().trim()}`;
  const now   = Date.now();
  if (cache[key] && now - cache[key].ts < _LYR_TTL) return cache[key].lyrics || null;

  const _try = (a, t) => Promise.any([
    _tryLyricsOvh(a, t),
    _tryLrclibDirect(a, t),
  ].map(p => p.then(l => l || Promise.reject(new Error())))).catch(() => null);

  let lyrics = await _try(artist, title);

  // Fallback : titre sans feat./remix/radio edit/etc.
  if (!lyrics) {
    const clean = _cleanTitle(title);
    if (clean && clean.toLowerCase() !== title.toLowerCase()) {
      lyrics = await _try(artist, clean);
    }
  }

  cache[key] = { lyrics, ts: now };
  _lyrC.w(cache);
  return lyrics;
}

// Pré-enregistre les paroles en cache (pour les titres lrclib déjà résolus)
function _cacheStoreLyrics(artist, title, lyrics) {
  const cache = _lyrC.r();
  const key   = `${(artist || '').toLowerCase().trim()}:${(title || '').toLowerCase().trim()}`;
  if (!cache[key]?.lyrics) {
    cache[key] = { lyrics, ts: Date.now() };
    _lyrC.w(cache);
  }
}

/* ============================================================
   SOURCES DE RECHERCHE
============================================================ */
function _cleanQ(s) {
  return (s || '').replace(/[.,!?;:'"()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Deezer : bonne couverture, bonnes covers, pas de genre
async function _searchDeezer(parts) {
  const seen = new Set(), out = [];
  const res  = await Promise.all(
    parts.map(p => _fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(p)}&limit=50`))
  );
  for (const d of res)
    for (const r of (d?.data || []))
      if (r.id && !seen.has(r.id)) { seen.add(r.id); out.push(_deezerMap(r)); }
  return out;
}

// iTunes : genre inclus, bonne couverture anglophone
async function _searchItunes(parts) {
  const seen = new Set(), out = [];
  const fetches = parts.flatMap(p => {
    const f = [_fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(p)}&entity=musicTrack&media=music&limit=25`)];
    const words = p.split(/\s+/);
    if (words.length >= 3)
      f.push(_fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(words.slice(0, -1).join(' '))}&entity=musicTrack&media=music&limit=15`));
    return f;
  });
  const res = await Promise.all(fetches);
  for (const d of res)
    for (const r of (d?.results || []))
      if (r.trackId && !seen.has(r.trackId)) { seen.add(r.trackId); out.push(_itunesMap(r)); }
  return out;
}

// lrclib.net : paroles incluses dans les résultats de recherche → zéro appel supplémentaire
async function _searchLrclib(parts) {
  const seen = new Set(), out = [];
  const res  = await Promise.all(
    parts.map(p => _fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(p)}`))
  );
  for (const d of res)
    for (const r of (Array.isArray(d) ? d : []))
      if (!r.instrumental && r.plainLyrics && r.id && !seen.has(r.id)) {
        seen.add(r.id);
        out.push(_lrclibMap(r));
      }
  return out;
}

// lyrics.ovh /suggest/ : retourne uniquement les chansons disponibles dans leur base
// (endpoint non documenté mais stable — renvoie le format Deezer avec covers incluses)
// Couvre bien la musique française/rap là où lrclib est lacunaire
async function _searchOvhSuggest(parts) {
  const seen = new Set(), out = [];
  const res  = await Promise.all(
    parts.map(p => _fetchJson(`https://api.lyrics.ovh/suggest/${encodeURIComponent(p)}`))
  );
  for (const d of res)
    for (const r of (d?.data || []))
      if (r.id && !seen.has(`ovh-${r.id}`)) {
        seen.add(`ovh-${r.id}`);
        out.push({
          id:     `dz-${r.id}`,
          title:  r.title_short || r.title || '',
          artist: r.artist?.name || '',
          year:   null,
          genre:  null,
          cover:  r.album?.cover_medium || r.album?.cover || '',
          _confirmedOvh: true, // paroles garanties via lyrics.ovh
        });
      }
  return out;
}

/* ============================================================
   FUSION DES QUATRE SOURCES
   lrclib (paroles immédiates) > ovh suggest (paroles garanties)
   > Deezer (cover+year) > iTunes (genre)
============================================================ */
function _mergeSongs(deezerSongs, itunesSongs, lrclibSongs, ovhSongs = []) {
  const dzMap = new Map(deezerSongs.map(s => [_matchKey(s.title, s.artist), s]));
  const itMap = new Map(itunesSongs.map(s => [_matchKey(s.title, s.artist), s]));
  const seen  = new Set();
  const out   = [];

  function push(base, dz, it) {
    out.push({
      ...base,
      cover:  dz?.cover  || it?.cover  || base.cover  || '',
      year:   dz?.year   || it?.year   || base.year   || null,
      genre:  it?.genre  || dz?.genre  || base.genre  || null,
      artist: base.artist || dz?.artist || it?.artist || '',
    });
  }

  // 1. lrclib (paroles déjà dans _lyrics)
  for (const s of lrclibSongs) {
    const k = _matchKey(s.title, s.artist);
    if (seen.has(k)) continue; seen.add(k);
    push(s, dzMap.get(k), itMap.get(k));
  }

  // 2. lyrics.ovh suggest (paroles garanties, bon pour le rap FR)
  for (const s of ovhSongs) {
    const k = _matchKey(s.title, s.artist);
    if (seen.has(k)) continue; seen.add(k);
    push(s, dzMap.get(k), itMap.get(k));
  }

  // 3. Deezer (paroles à vérifier)
  for (const s of deezerSongs) {
    const k = _matchKey(s.title, s.artist);
    if (seen.has(k)) continue; seen.add(k);
    push(s, null, itMap.get(k));
  }

  // 4. iTunes exclusifs
  for (const s of itunesSongs) {
    const k = _matchKey(s.title, s.artist);
    if (seen.has(k)) continue; seen.add(k);
    push(s, null, null);
  }

  return out;
}

/* ============================================================
   RECHERCHE + CACHE
   lrclib renvoie les paroles DANS la réponse de recherche →
   aucune vérification supplémentaire, résultats immédiats.
   Deezer est utilisé en parallèle uniquement pour enrichir les covers.
============================================================ */
async function searchWithCache(rawQuery) {
  const cache    = _srC.r();
  const cacheKey = `lrc4:${rawQuery.toLowerCase().trim()}`;
  const now      = Date.now();
  // Ne pas utiliser le cache s'il est vide (résultat empoisonné d'une tentative ratée)
  if (cache[cacheKey] && cache[cacheKey].results?.length > 0 && now - cache[cacheKey].ts < _SRCH_TTL)
    return cache[cacheKey].results;

  const q = _cleanQ(rawQuery);
  if (q.length < 2) return [];

  // lrclib retourne les paroles DANS la réponse de recherche → résultats immédiats
  const lrcData = await _fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);

  const lrcSeen = new Set();
  const lrcSongs = [];
  for (const r of (Array.isArray(lrcData) ? lrcData : []))
    if (!r.instrumental && r.plainLyrics && r.id && !lrcSeen.has(r.id)) {
      lrcSeen.add(r.id);
      lrcSongs.push(_lrclibMap(r));
    }

  const results = lrcSongs; // Deezer bloqué par CORS → on se passe des covers ici
  if (results.length > 0) { cache[cacheKey] = { results, ts: now }; _srC.w(cache); }
  return results;
}

async function topSongsWithCache() {
  const cache = _srC.r();
  const now   = Date.now();
  // Ne pas utiliser le cache s'il est vide (résultat empoisonné d'une tentative ratée)
  if (cache.top8 && cache.top8.results?.length > 0 && now - cache.top8.ts < _SRCH_TTL)
    return cache.top8.results;

  // Artistes dont lrclib a une bonne couverture → paroles incluses directement dans la réponse
  const lrcArtists = [
    // Internationaux
    'taylor swift', 'the weeknd', 'drake', 'ed sheeran', 'billie eilish',
    'rihanna', 'eminem', 'coldplay', 'dua lipa', 'ariana grande',
    'post malone', 'olivia rodrigo', 'harry styles', 'bad bunny', 'sabrina carpenter',
    // Francophones
    'aya nakamura', 'stromae', 'angele', 'maes', 'kendji girac',
    'bigflo oli', 'soprano', 'gims', 'ninho', 'jul',
  ];

  // Toutes les requêtes lrclib en parallèle
  const lrcDatas = await Promise.all(
    lrcArtists.map(a => _fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(a)}`))
  );

  // lrclib : paroles incluses → affichage instantané, aucun appel supplémentaire
  const lrcSeen = new Set();
  const results = [];
  for (const data of lrcDatas)
    for (const r of (Array.isArray(data) ? data : []))
      if (!r.instrumental && r.plainLyrics && r.id && !lrcSeen.has(r.id)) {
        lrcSeen.add(r.id);
        results.push(_lrclibMap(r));
      }

  if (results.length > 0) { cache.top8 = { results, ts: now }; _srC.w(cache); }
  return results;
}

/* ============================================================
   UTILITAIRE PARTAGÉ
============================================================ */
function normalizeLyricsWord(str) {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
}

/* ============================================================
   TOAST
============================================================ */
function showToast(msg, isError = true) {
  let t = document.getElementById('ls-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'ls-toast';
    t.className = 'ls-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className   = `ls-toast${isError ? ' ls-toast-error' : ''} show`;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ============================================================
   PAGE SÉLECTION
   Affichage progressif : les chansons apparaissent au fur et à mesure
   que les paroles sont confirmées (lrclib = immédiat, ovh = ~1-3s)
============================================================ */
(function selectionModule() {
  const $ = q => document.querySelector(q);

  const els = {
    root:   $('#lyrics-select'),
    grid:   $('#ls-grid'),
    search: $('#ls-search'),
    genre:  $('#ls-genre'),
    artist: $('#ls-artist'),
    year:   $('#ls-year'),
    sort:   $('#ls-sort'),
  };

  let _debounce = null;
  let _gen      = 0;
  let _loading  = false;
  let _topSongs = []; // chansons du top chargées au démarrage → recherche locale instantanée

  /* ---- COVER LAZY : iTunes en fallback pour les chansons sans image ---- */
  const _coverCache = new Map(); // "artist:title" → url | null | 'loading'

  async function _fetchCoverLazy(song) {
    if (song.cover) return;
    const key = `${song.artist.toLowerCase()}:${song.title.toLowerCase()}`;
    if (_coverCache.has(key)) {
      const url = _coverCache.get(key);
      if (url && url !== 'loading') _applyCover(song, url);
      return;
    }
    _coverCache.set(key, 'loading');
    const data = await _fetchJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(song.artist + ' ' + song.title)}&entity=musicTrack&media=music&limit=1`,
      5000
    );
    const url = data?.results?.[0]?.artworkUrl100?.replace('100x100bb', '300x300bb') || null;
    _coverCache.set(key, url);
    if (url) _applyCover(song, url);
  }

  function _applyCover(song, url) {
    song.cover = url;
    const card = els.grid.querySelector(`[data-id="${song.id}"]`);
    if (!card) return;
    const wrap = card.querySelector('.ls-cover-wrap');
    if (!wrap) return;
    const img = document.createElement('img');
    img.className = 'ls-cover';
    img.src = url;
    img.alt = '';
    img.onerror = () => { img.remove(); wrap.classList.add('ls-cover-empty'); };
    wrap.classList.remove('ls-cover-empty');
    wrap.innerHTML = '';
    wrap.appendChild(img);
  }

  /* ---- BANNIÈRE ---- */
  function setBanner(msg) {
    let b = document.getElementById('ls-loading-banner');
    if (msg) {
      if (!b) {
        b = document.createElement('p');
        b.id = 'ls-loading-banner';
        b.className = 'ls-loading-banner';
        els.grid.parentNode.insertBefore(b, els.grid);
      }
      b.textContent = msg;
    } else if (b) { b.remove(); }
  }

  /* ---- FILTRES ---- */
  function initFilters() {
    const genres = new Set(), artists = new Set(), years = new Set();
    window.LYRICS_SONGS.forEach(s => {
      if (s.genre)  genres.add(s.genre);
      if (s.artist) artists.add(s.artist);
      if (s.year)   years.add(s.year);
    });

    function fill(sel, values, labelAll) {
      const prev = sel.value;
      sel.innerHTML = '';
      const all = document.createElement('option');
      all.value = ''; all.textContent = labelAll; sel.appendChild(all);
      [...values].sort((a, b) => ('' + a).localeCompare('' + b, 'fr', { numeric: true })).forEach(v => {
        const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o);
      });
      if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
    }

    fill(els.genre,  genres,  'Tous les genres');
    fill(els.artist, artists, 'Tous les artistes');

    const prev = els.year.value;
    els.year.innerHTML = '';
    const all = document.createElement('option'); all.value = ''; all.textContent = 'Toutes années';
    els.year.appendChild(all);
    [...years].sort((a, b) => b - a).forEach(y => {
      const o = document.createElement('option'); o.value = y; o.textContent = y; els.year.appendChild(o);
    });
    if ([...els.year.options].some(o => o.value === prev)) els.year.value = prev;
  }

  /* ---- GRILLE ---- */
  function getFiltered() {
    const genre = els.genre.value, artist = els.artist.value,
          year  = els.year.value,  sort   = els.sort.value;
    let list = window.LYRICS_SONGS.slice();
    if (genre)  list = list.filter(s => s.genre  === genre);
    if (artist) list = list.filter(s => s.artist === artist);
    if (year)   list = list.filter(s => String(s.year) === String(year));
    switch (sort) {
      case 'title-asc':   list.sort((a, b) => a.title.localeCompare(b.title,   'fr')); break;
      case 'title-desc':  list.sort((a, b) => b.title.localeCompare(a.title,   'fr')); break;
      case 'artist-asc':  list.sort((a, b) => a.artist.localeCompare(b.artist, 'fr')); break;
      case 'artist-desc': list.sort((a, b) => b.artist.localeCompare(a.artist, 'fr')); break;
      case 'year-desc':   list.sort((a, b) => (b.year || 0) - (a.year || 0)); break;
      case 'year-asc':    list.sort((a, b) => (a.year || 0) - (b.year || 0)); break;
    }
    return list;
  }

  function renderGrid() {
    initFilters();
    const data = getFiltered();
    els.grid.innerHTML = '';

    if (data.length === 0) {
      const div = document.createElement('div');
      div.className = 'ls-empty';
      if (_loading) {
        div.textContent = '🎵 Chargement en cours…';
      } else {
        const q = els.search.value.trim();
        div.textContent = q
          ? 'Aucune chanson avec paroles disponibles pour cette recherche.'
          : 'Tape un titre ou un artiste pour commencer.';
      }
      els.grid.appendChild(div);
      return;
    }

    data.forEach(s => {
      const card = document.createElement('button');
      card.className = 'ls-card';
      card.type = 'button';
      card.dataset.id = s.id;
      card.onclick = () => handleCardClick(s);

      const coverWrap = document.createElement('div');
      coverWrap.className = 'ls-cover-wrap';
      if (s.cover) {
        const img = document.createElement('img');
        img.className = 'ls-cover';
        img.src = s.cover;
        img.alt = '';
        img.onerror = () => { img.remove(); coverWrap.classList.add('ls-cover-empty'); };
        coverWrap.appendChild(img);
      } else {
        coverWrap.classList.add('ls-cover-empty');
      }

      const mid = document.createElement('div');
      mid.className = 'ls-mid';

      const title = document.createElement('div');
      title.className = 'ls-title';
      title.textContent = s.title;

      const sub = document.createElement('div');
      sub.className = 'ls-sub';
      const parts = [s.artist, s.genre, s.year].filter(Boolean);
      sub.textContent = parts.join(' • ');

      mid.appendChild(title); mid.appendChild(sub);

      const right = document.createElement('div');
      right.className = 'ls-right';
      const chip = document.createElement('span');
      chip.className = 'ls-chip';
      chip.textContent = 'Jouer';
      right.appendChild(chip);

      card.appendChild(coverWrap); card.appendChild(mid); card.appendChild(right);
      els.grid.appendChild(card);

      // Fetch cover en arrière-plan si manquante (lrclib n'en fournit pas)
      if (!s.cover) _fetchCoverLazy(s);
    });
  }

  /* ---- CLIC : paroles déjà en mémoire, démarrage instantané ---- */
  function handleCardClick(song) {
    const lyrics = song._lyrics;
    if (!lyrics) { showToast(`Paroles indisponibles pour "${song.title}"`); return; }
    document.getElementById('lyrics-select').style.display = 'none';
    document.getElementById('lyrics-game').style.display   = 'block';
    if (typeof window.loadLyricsDirectly === 'function')
      window.loadLyricsDirectly(lyrics, song.title, song.artist);
  }

  /* ---- VÉRIFICATION DES PAROLES (arrière-plan, progressif) ---- */
  async function loadWithLyrics(songs, gen) {
    window.LYRICS_SONGS = [];
    let checked = 0;
    const total = songs.length;

    // Debounce pour éviter de rebuilder le DOM à chaque chanson (200 songs = 200 renders sinon)
    let _renderTimer = null;
    function queueRender() {
      if (_renderTimer) return;
      _renderTimer = setTimeout(() => { _renderTimer = null; renderGrid(); }, 60);
    }

    setBanner(`Vérification des paroles… 0 / ${total}`);
    renderGrid();

    await Promise.all(songs.map(async song => {
      let lyrics;

      if (song._lyrics) {
        // lrclib : paroles déjà dans l'objet, aucun appel réseau
        lyrics = song._lyrics;
        _cacheStoreLyrics(song.artist, song.title, lyrics);
      } else if (song._confirmedOvh) {
        // lyrics.ovh suggest : on sait que ovh les a, on va directement
        lyrics = await _tryLyricsOvh(song.artist, song.title);
        // En cas d'échec réseau rare, on essaie lrclib en fallback
        if (!lyrics) lyrics = await _tryLrclibDirect(song.artist, song.title);
        _cacheStoreLyrics(song.artist, song.title, lyrics);
      } else {
        // Deezer : on essaie lrclib + ovh en parallèle
        lyrics = await getLyricsWithCache(song.artist, song.title);
      }

      checked++;
      if (gen !== _gen) return;

      if (lyrics) {
        window.LYRICS_SONGS.push({ ...song, _lyrics: lyrics });
        queueRender();
      }
    }));

    if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }
    if (gen !== _gen) return;
    _loading = false;
    setBanner(null);
    if (window.LYRICS_SONGS.length === 0)
      setBanner('Aucune chanson avec paroles trouvée. Essaie un autre terme.');
    renderGrid();
  }

  /* ---- LOGIQUE DE RECHERCHE ---- */
  async function doSearch(query) {
    const gen = ++_gen;
    const ql  = query.toLowerCase();
    _loading  = true;

    // 1. Résultats locaux immédiats : filtre sur les chansons déjà en mémoire (0ms)
    const local = _topSongs.filter(s =>
      (s.title  || '').toLowerCase().includes(ql) ||
      (s.artist || '').toLowerCase().includes(ql)
    );
    window.LYRICS_SONGS = local;
    renderGrid();

    // 2. Recherche lrclib en parallèle (toutes les chansons retournées ont déjà _lyrics)
    const apiSongs = await searchWithCache(query);
    if (gen !== _gen) return;

    // 3. Fusionner API + local sans doublons
    const seen = new Set(local.map(s => _matchKey(s.title, s.artist)));
    for (const s of apiSongs)
      if (!seen.has(_matchKey(s.title, s.artist))) {
        seen.add(_matchKey(s.title, s.artist));
        window.LYRICS_SONGS.push(s);
      }

    _loading = false;
    setBanner(null);
    if (window.LYRICS_SONGS.length === 0)
      setBanner('Aucune chanson avec paroles trouvée. Essaie un autre terme.');
    renderGrid();
  }

  async function doLoadTop() {
    const gen = ++_gen;
    window.LYRICS_SONGS = [];
    _loading = true;
    setBanner('Chargement des tendances…');
    renderGrid();

    const songs = await topSongsWithCache();
    if (gen !== _gen) return;
    _topSongs = songs; // Stockage pour la recherche locale instantanée
    await loadWithLyrics(songs, gen);
  }

  function onSearchInput() {
    clearTimeout(_debounce);
    const q = els.search.value.trim();
    if (!q) {
      // Recherche effacée : restaurer le top immédiatement si dispo
      if (_topSongs.length > 0) {
        ++_gen;
        window.LYRICS_SONGS = _topSongs;
        _loading = false;
        setBanner(null);
        renderGrid();
      } else {
        _debounce = setTimeout(doLoadTop, 200);
      }
    } else if (q.length >= 2) {
      _debounce = setTimeout(() => doSearch(q), 250);
    }
  }

  function wire() {
    els.search.placeholder = 'Titre, artiste… (virgule pour plusieurs)';
    els.search.addEventListener('input', onSearchInput);
    els.genre.addEventListener('change',  renderGrid);
    els.artist.addEventListener('change', renderGrid);
    els.year.addEventListener('change',   renderGrid);
    els.sort.addEventListener('change',   renderGrid);
    doLoadTop();
  }

  (function observeView() {
    if (!els.root) return;
    let wired = false;
    new MutationObserver(() => {
      if (els.root.style.display !== 'none' && !wired) { wire(); wired = true; }
    }).observe(els.root, { attributes: true, attributeFilter: ['style'] });
  })();

  // Appelé par navigation.js à chaque ouverture de la page Lyrics
  window.renderLyricsSelection = () => {
    if (window.LYRICS_SONGS.length === 0 && !_loading) doLoadTop();
    else renderGrid();
  };
})();

/* ============================================================
   PAGE JEU + FEUX D'ARTIFICES
============================================================ */
(function gameModule() {
  const $ = q => document.querySelector(q);

  let st = {
    tokens: [], isWord: [], revealed: [], map: new Map(),
    totalWords: 0, title: '', artist: '',
    finishedCelebrated: false, wasAbandoned: false,
  };

  function safeFocus(el) {
    if (!el || document.activeElement === el) return;
    try { el.focus({ preventScroll: true }); } catch (_) {}
  }

  function revealAllLyrics() {
    if (st.wasAbandoned) return;
    if (!st.finishedCelebrated) sendResult(false);
    st.wasAbandoned = true;
    st.finishedCelebrated = true;
    for (let i = 0; i < st.revealed.length; i++) if (st.isWord[i]) st.revealed[i] = true;
    updateProgress(); renderBoard();
  }

  // Résultat envoyé au serveur (joueurs connectés seulement ; le serveur ignore l'identité du client).
  function sendResult(won) {
    if (!granAuth.user() || !socket.connected) return;
    const found = st.revealed.reduce((n, v, i) => n + (v && st.isWord[i] ? 1 : 0), 0);
    socket.emit('lyrics_result', {
      score: found, won, rounds: 1,
      durationS: Math.max(0, Math.round((Date.now() - (st.startedAt || Date.now())) / 1000)),
    });
  }

  function showDefeatAnimation() {
    if (document.getElementById('lyrics-defeat-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'lyrics-defeat-overlay';
    overlay.innerHTML = `<div class="ld-center"><div class="ld-icon">💔</div><div class="ld-title">Dommage !</div><div class="ld-sub">Tu peux réessayer ou changer de chanson.</div></div>`;
    document.body.appendChild(overlay);
    const board = $('#lyrics-board');
    board?.classList.add('ld-shake');
    setTimeout(() => board?.classList.remove('ld-shake'), 700);
    setTimeout(() => overlay.classList.add('out'), 1800);
    setTimeout(() => overlay.remove(), 2400);
  }

  function tokenize(text) {
    const clean = (text || '').replace(/\r\n/g, '\n');
    const regex = /(\n)|([A-Za-zÀ-ÖØ-öø-ÿ0-9']+)|([^\sA-Za-zÀ-ÖØ-öø-ÿ0-9']+)|(\s+)/g;
    const toks  = [];
    let m;
    while ((m = regex.exec(clean)) !== null) {
      if      (m[1]) toks.push('\n');
      else if (m[2]) toks.push(m[2]);
      else if (m[3]) toks.push(m[3]);
      else if (m[4]) toks.push(' ');
    }
    return toks;
  }

  const isWord = tok => /^[A-Za-zÀ-ÖØ-öø-ÿ0-9']+$/.test(tok);

  function buildIndex() {
    st.map.clear(); st.totalWords = 0;
    st.finishedCelebrated = false; st.wasAbandoned = false;
    st.tokens.forEach((tok, i) => {
      const w = isWord(tok) ? normalizeLyricsWord(tok) : null;
      st.isWord[i] = !!w;
      if (w) {
        st.totalWords++;
        if (!st.map.has(w)) st.map.set(w, []);
        st.map.get(w).push(i);
      } else { st.revealed[i] = true; }
    });
    updateProgress();
  }

  function updateProgress() {
    const found = st.revealed.reduce((n, v, i) => n + (v && st.isWord[i] ? 1 : 0), 0);
    const el    = document.getElementById('lyrics-progress');
    if (el) el.textContent = `${found}/${st.totalWords}`;
    if (st.totalWords > 0 && found === st.totalWords && !st.finishedCelebrated && !st.wasAbandoned) {
      st.finishedCelebrated = true;
      launchFireworks(2500);
      sendResult(true);
    }
  }

  function renderBoard() {
    const container = document.getElementById('lyrics-board');
    if (!container) return;
    container.innerHTML = '';
    st.tokens.forEach((tok, i) => {
      if (tok === '\n') { container.appendChild(document.createElement('br')); return; }
      const span = document.createElement('span');
      span.className = 'lyrics-token';
      if (st.revealed[i]) {
        span.classList.add('revealed'); span.textContent = tok;
      } else if (st.isWord[i]) {
        const len = tok.replace(/'/g, '').length;
        span.classList.add('hidden');
        span.textContent = '_'.repeat(Math.max(1, len));
        span.title = `${len} lettre(s)`;
        span.dataset.nword = normalizeLyricsWord(tok);
      } else { span.textContent = tok; }
      container.appendChild(span);
    });
  }

  function setError(msg) {
    let fb = document.getElementById('lyrics-feedback');
    if (!fb) {
      fb = document.createElement('div');
      fb.id = 'lyrics-feedback';
      fb.className = 'lyrics-feedback hidden';
      document.querySelector('.lyrics-input')?.parentNode?.insertBefore(fb, document.querySelector('.lyrics-input')?.nextSibling);
    }
    if (!msg) { fb.textContent = ''; fb.classList.add('hidden'); }
    else       { fb.textContent = msg; fb.classList.remove('hidden'); }
  }

  function revealWordNormalized(nWord) {
    const indices = st.map.get(nWord);
    if (!indices) return 0;
    let newly = 0;
    for (const i of indices) if (!st.revealed[i]) { st.revealed[i] = true; newly++; }
    return newly;
  }

  function processGuessLive() {
    const input = document.getElementById('lyrics-guess');
    const raw   = input?.value || '';
    if (!raw) { setError(''); return; }

    const endsWithBoundary = /\s$/.test(raw);
    const words = normalizeLyricsWord(raw).split(/\s+/).filter(Boolean);
    if (!words.length) { setError(''); return; }

    let gained = 0;
    for (const w of words) gained += revealWordNormalized(w);

    if (gained > 0) { updateProgress(); renderBoard(); input.value = ''; setError(''); }
    else if (endsWithBoundary) { setError('Mot incorrect'); input.value = ''; }
    else setError('');
  }

  function initWithLyrics(raw, optTitle, optArtist) {
    st.tokens   = tokenize(raw);
    st.isWord   = new Array(st.tokens.length).fill(false);
    st.revealed = new Array(st.tokens.length).fill(false);
    st.startedAt = Date.now();
    st.title    = optTitle  || '';
    st.artist   = optArtist || '';

    buildIndex(); renderBoard();

    const input = document.getElementById('lyrics-guess');
    if (input) {
      const t = st.title || 'Paroles';
      const a = st.artist;
      input.placeholder = `Tape un mot… (${t}${a ? ' — ' + a : ''})`;
      safeFocus(input);
    }
    setError('');

    const infoEl = document.getElementById('lyrics-song-info');
    if (infoEl) infoEl.textContent = st.title ? `${st.title}${st.artist ? ' — ' + st.artist : ''}` : '';

    const sb = document.getElementById('lyrics-submit');
    if (sb) { sb.disabled = false; sb.classList.remove('disabled'); sb.textContent = 'Abandonner'; }
  }

  function backToSelection() {
    document.getElementById('lyrics-game').style.display   = 'none';
    document.getElementById('lyrics-select').style.display = 'block';
    if (window.renderLyricsSelection) window.renderLyricsSelection();
  }

  function wireGameUI() {
    const submitBtn = document.getElementById('lyrics-submit');
    const clearBtn  = document.getElementById('lyrics-clear');
    const backBtn   = document.getElementById('lyrics-back-select');
    const input     = document.getElementById('lyrics-guess');
    const board     = document.getElementById('lyrics-board');

    // Sentinelle + IntersectionObserver : ajoute l'ombre cartoon quand la barre colle en haut
    const stickyBar = document.querySelector('.lyrics-sticky-bar');
    if (stickyBar) {
      const sentinel = document.createElement('div');
      sentinel.className = 'lyrics-sticky-sentinel';
      stickyBar.before(sentinel);
      new IntersectionObserver(
        ([entry]) => stickyBar.classList.toggle('is-stuck', !entry.isIntersecting),
        { threshold: 0 }
      ).observe(sentinel);
    }

    if (submitBtn) {
      submitBtn.textContent = 'Abandonner';
      submitBtn.classList.add('btn-danger');
      submitBtn.onclick = e => {
        e.preventDefault();
        revealAllLyrics(); showDefeatAnimation();
        submitBtn.disabled = true; submitBtn.classList.add('disabled');
      };
    }
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    input?.addEventListener('input', processGuessLive);
    clearBtn?.addEventListener('click', () => { if (input) input.value = ''; setError(''); });
    backBtn?.addEventListener('click', backToSelection);

    board?.addEventListener('click', e => {
      const t = e.target;
      if (!t.classList.contains('lyrics-token') || !t.classList.contains('hidden')) return;
      const gained = revealWordNormalized(t.dataset.nword || '');
      if (gained > 0) { updateProgress(); renderBoard(); setError(''); }
    });
  }

  (function observeView() {
    const root = document.getElementById('lyrics-game');
    if (!root) return;
    let wired = false;
    new MutationObserver(() => {
      if (root.style.display !== 'none' && !wired) { wireGameUI(); wired = true; }
    }).observe(root, { attributes: true, attributeFilter: ['style'] });
  })();

  // Appelé par la page sélection après confirmation des paroles
  window.loadLyricsDirectly = function(lyrics, title, artist) {
    initWithLyrics(lyrics, title, artist);
  };

  /* ---- FEUX D'ARTIFICES ---- */
  function launchFireworks(durationMs) {
    const canvas = document.createElement('canvas');
    canvas.id = 'lyrics-fireworks-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let W, H, start = performance.now();

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:9999;width:${W}px;height:${H}px`;
      canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    const particles = [];
    function burst(x, y) {
      const n = 55 + Math.floor(Math.random() * 25);
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        const speed = 2 + Math.random() * 4;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 0, maxLife: 55 + Math.random() * 35,
          color: `hsl(${Math.floor(Math.random() * 360)},85%,60%)`, size: 2 + Math.random() * 2 });
      }
    }
    function randomBurst() { burst(W * (0.1 + Math.random() * 0.8), H * (0.1 + Math.random() * 0.5)); }
    for (let i = 0; i < 3; i++) randomBurst();

    let lastT = start;
    function tick(t) {
      const elapsed = t - start, dt = Math.min(33, t - lastT); lastT = t;
      ctx.clearRect(0, 0, W, H);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt / 16; p.x += p.vx; p.y += p.vy; p.vy += 0.04;
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        if (p.life >= p.maxLife) particles.splice(i, 1);
      }
      ctx.globalAlpha = 1;
      if (elapsed < durationMs) { if (Math.random() < 0.07) randomBurst(); requestAnimationFrame(tick); }
      else if (particles.length > 0) requestAnimationFrame(tick);
      else { window.removeEventListener('resize', resize); canvas.remove(); }
    }
    requestAnimationFrame(tick);
  }
})();
