const test = require("node:test");
const assert = require("node:assert/strict");
const g = require("../../javascript/gribouille-outils.js");

// Toile blanche w × h (RGBA) ; trace() met des pixels en noir.
function toile(w, h) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const px = (x, y) => (y * w + x) * 4;
  const trace = (x, y, rgb = [27, 29, 22]) => { const i = px(x, y); data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; };
  const lire = (x, y) => Array.from(data.slice(px(x, y), px(x, y) + 3));
  return { data, w, h, trace, lire };
}
const ROUGE = [214, 58, 47];

test("client et serveur alignés : nombre de couleurs et plafond de pots", () => {
  const serveur = require("../games/gribouille");
  assert.equal(g.PALETTE.length, serveur.NB_COULEURS);
  assert.equal(g.MAX_POTS, serveur.MAX_FILLS);
});

test("palette : 80 couleurs, noir et blanc aux bons index, hex valides", () => {
  assert.equal(g.PALETTE.length, 80);
  assert.equal(g.PALETTE[g.NOIR].v, "#1B1D16");
  assert.equal(g.PALETTE[g.BLANC].v, "#FFFFFF");
  assert.equal(g.indexDe(1, 2), 7);
  assert.equal(g.PALETTE[g.indexDe(1, 2)].n, "Rouge");
  for (const c of g.PALETTE) assert.match(c.v, /^#[0-9A-F]{6}$/);
  assert.equal(new Set(g.PALETTE.map((c) => c.v)).size, 80);
});

test("remplir : la zone fermée seulement, l'extérieur intact", () => {
  const t = toile(20, 20);
  for (let i = 5; i <= 14; i++) { t.trace(i, 5); t.trace(i, 14); t.trace(5, i); t.trace(14, i); } // carré
  const n = g.remplir(t.data, t.w, t.h, 10, 10, ROUGE);
  assert.ok(n > 0);
  assert.deepEqual(t.lire(10, 10), ROUGE);
  assert.deepEqual(t.lire(6, 6), ROUGE);
  assert.deepEqual(t.lire(2, 2), [255, 255, 255]); // dehors
  assert.deepEqual(t.lire(17, 10), [255, 255, 255]);
  assert.deepEqual(t.lire(5, 10), ROUGE); // débord d'1 px sur le trait (couvre l'anticrénelage)
  assert.deepEqual(t.lire(4, 10), [255, 255, 255]); // jamais au-delà
});

test("remplir : toile vide entière, et rien si la couleur est déjà la bonne", () => {
  const t = toile(30, 10);
  assert.equal(g.remplir(t.data, t.w, t.h, 0, 0, ROUGE), 300);
  assert.deepEqual(t.lire(29, 9), ROUGE);
  assert.equal(g.remplir(t.data, t.w, t.h, 3, 3, ROUGE), 0);
});

test("remplir : une brèche laisse passer la peinture", () => {
  const t = toile(20, 20);
  for (let i = 0; i < 20; i++) if (i !== 10) t.trace(10, i); // mur vertical troué en y = 10
  g.remplir(t.data, t.w, t.h, 2, 2, ROUGE);
  assert.deepEqual(t.lire(18, 18), ROUGE);
});

test("remplir : bords anticrénelés (gris clair) absorbés par la tolérance", () => {
  const t = toile(20, 20);
  for (let i = 0; i < 20; i++) { t.trace(10, i); t.trace(9, i, [230, 230, 228]); } // trait + halo clair
  g.remplir(t.data, t.w, t.h, 2, 2, ROUGE);
  assert.deepEqual(t.lire(9, 5), ROUGE); // le halo est peint
  assert.deepEqual(t.lire(15, 5), [255, 255, 255]); // l'autre côté du trait non
});

test("remplir : hors toile ou coordonnées décimales", () => {
  const t = toile(10, 10);
  assert.equal(g.remplir(t.data, t.w, t.h, -1, 3, ROUGE), 0);
  assert.equal(g.remplir(t.data, t.w, t.h, 10, 3, ROUGE), 0);
  assert.equal(g.remplir(t.data, t.w, t.h, 4.7, 4.2, ROUGE), 100);
});

test("remplir : 1600 × 1200 en moins d'une seconde, même sous la charge des autres tests", () => {
  const t = toile(1600, 1200);
  const debut = performance.now();
  g.remplir(t.data, t.w, t.h, 800, 600, ROUGE);
  assert.ok(performance.now() - debut < 1000); // seul : environ 50 ms
});
