/* global module */
// Gribouille : palette (16 teintes × 5 nuances = 80 couleurs) et pot de peinture.
// Logique pure, sans DOM : globale granGribouille dans le navigateur, module.exports sous Node (tests).
// L'index de couleur c = teinte × 5 + nuance est partagé avec le serveur (backend/games/gribouille.js : 0 à 79).
const granGribouille = (() => {
  const NUANCES = 5;
  const NOMS_NUANCES = ['très clair', 'clair', '', 'foncé', 'très foncé'];
  // Le gris fixe ses 5 nuances à la main : blanc (gomme) → noir.
  const TEINTES = [
    { n: 'Gris', fixe: [['#FFFFFF', 'Blanc'], ['#C9C9C1', 'Gris clair'], ['#7A7A72', 'Gris'], ['#3D3F38', 'Gris foncé'], ['#1B1D16', 'Noir']] },
    { n: 'Rouge', v: '#D63A2F' }, { n: 'Orange', v: '#E8762B' }, { n: 'Jaune', v: '#F2C230' }, { n: 'Citron', v: '#B5D334' },
    { n: 'Vert', v: '#3FA34D' }, { n: 'Sapin', v: '#1E6B45' }, { n: 'Turquoise', v: '#22A6A0' }, { n: 'Ciel', v: '#5BC0DE' },
    { n: 'Bleu', v: '#2E63B8' }, { n: 'Indigo', v: '#4B3FB0' }, { n: 'Violet', v: '#8E44AD' }, { n: 'Magenta', v: '#D23C8C' },
    { n: 'Rose', v: '#F28AA6' }, { n: 'Marron', v: '#8A5A2B' }, { n: 'Peau', v: '#F1C29B' },
  ];

  const enRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const enHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  const melange = (hex, vers, t) => { const a = enRgb(hex); const b = enRgb(vers); return enHex(a.map((v, i) => v + (b[i] - v) * t)); };

  // Nuances d'une teinte : éclaircie vers le blanc, assombrie vers le noir de la palette.
  const PALETTE = TEINTES.flatMap((t) => (t.fixe
    ? t.fixe.map(([v, n]) => ({ v, n }))
    : [melange(t.v, '#FFFFFF', 0.6), melange(t.v, '#FFFFFF', 0.3), t.v, melange(t.v, '#1B1D16', 0.3), melange(t.v, '#1B1D16', 0.55)]
      .map((v, i) => ({ v, n: NOMS_NUANCES[i] ? `${t.n} ${NOMS_NUANCES[i]}` : t.n }))));

  const MAX_POTS = 30; // pots de peinture par tour (serveur : MAX_FILLS)
  const NOIR = 4; // gris, nuance 4
  const BLANC = 0; // gris, nuance 0 : couleur du fond, sert de gomme
  const indexDe = (teinte, nuance) => teinte * NUANCES + nuance;

  // Pot de peinture sur des pixels RGBA (ImageData.data). Remplit la zone contiguë (4-connexité) de la couleur
  // du pixel (x, y), à `tolerance` près par canal (bords anticrénelés des traits), puis déborde d'1 px sur
  // les pixels voisins pour ne pas laisser de liseré clair contre les traits. Renvoie le nombre de pixels peints.
  function remplir(data, largeur, hauteur, x, y, rgb, tolerance = 48) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= largeur || y >= hauteur) return 0;
    const debut = (y * largeur + x) * 4;
    const cible = [data[debut], data[debut + 1], data[debut + 2], data[debut + 3]];
    if (Math.abs(cible[0] - rgb[0]) <= 2 && Math.abs(cible[1] - rgb[1]) <= 2 && Math.abs(cible[2] - rgb[2]) <= 2 && cible[3] === 255) return 0;
    const proche = (i) => Math.abs(data[i] - cible[0]) <= tolerance && Math.abs(data[i + 1] - cible[1]) <= tolerance
      && Math.abs(data[i + 2] - cible[2]) <= tolerance && Math.abs(data[i + 3] - cible[3]) <= tolerance;
    const vu = new Uint8Array(largeur * hauteur); // 1 : dans la zone
    const pile = [x, y];
    while (pile.length) {
      const py = pile.pop();
      let px = pile.pop();
      // Balayage de ligne : on recule jusqu'au bord gauche, puis on avance en empilant les lignes voisines.
      while (px > 0 && !vu[py * largeur + px - 1] && proche((py * largeur + px - 1) * 4)) px--;
      let hautOuvert = false;
      let basOuvert = false;
      for (; px < largeur; px++) {
        const k = py * largeur + px;
        if (vu[k] || !proche(k * 4)) break;
        vu[k] = 1;
        if (py > 0) {
          const h = k - largeur;
          const ok = !vu[h] && proche(h * 4);
          if (ok && !hautOuvert) pile.push(px, py - 1);
          hautOuvert = ok;
        }
        if (py < hauteur - 1) {
          const b = k + largeur;
          const ok = !vu[b] && proche(b * 4);
          if (ok && !basOuvert) pile.push(px, py + 1);
          basOuvert = ok;
        }
      }
    }
    let n = 0;
    const peindre = (k) => { const i = k * 4; data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; n++; };
    for (let k = 0; k < vu.length; k++) {
      if (vu[k] !== 1) continue;
      peindre(k);
      const px = k % largeur;
      // Débord d'1 px (marqué 2 pour ne pas se propager).
      for (const v of [px > 0 ? k - 1 : -1, px < largeur - 1 ? k + 1 : -1, k - largeur, k + largeur]) {
        if (v >= 0 && v < vu.length && vu[v] === 0) { vu[v] = 2; peindre(v); }
      }
    }
    return n;
  }

  return { NUANCES, TEINTES, PALETTE, MAX_POTS, NOIR, BLANC, indexDe, enRgb, remplir };
})();
if (typeof module !== 'undefined') module.exports = granGribouille;
