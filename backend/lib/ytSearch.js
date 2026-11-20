// Recherche audio YouTube (karaoké) : renvoie les IDs des premières vidéos trouvées.
function ytSearchHandler() {
  return async (req, res) => {
    // Recherche publique sans authentification → CORS ouvert (aucun cookie/credential)
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET");

    const q = (req.query.q || "").toString().slice(0, 200).trim();
    if (!q) return res.json({ videoId: null });

    try {
      // sp=EgIQAQ%3D%3D → filtre « Vidéos » uniquement (exclut chaînes / playlists)
      const url = "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(q) + "&sp=EgIQAQ%253D%253D";
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = await r.text();
      // Plusieurs candidats : certaines vidéos refusent l'intégration (erreur 101/150),
      // le front essaie la suivante jusqu'à en trouver une lisible.
      const ids = [];
      const re = /"videoId":"([\w-]{11})"/g;
      let m;
      while ((m = re.exec(html)) !== null && ids.length < 10) {
        if (!ids.includes(m[1])) ids.push(m[1]);
      }
      return res.json({ videoIds: ids, videoId: ids[0] || null });
    } catch (e) {
      console.error("yt-search error:", e.message);
      return res.json({ videoIds: [], videoId: null });
    }
  };
}

module.exports = { ytSearchHandler };
