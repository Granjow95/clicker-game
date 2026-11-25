const test = require("node:test");
const assert = require("node:assert/strict");
const g = require("../../javascript/mot-cache-logique.js");
const { MOT_CACHE_SOLUTIONS: SOL, MOT_CACHE_ACCEPTES: ACC } = require("../../javascript/mot-cache-mots.js");

// Choix de conception : ACCEPTES est disjoint de SOLUTIONS ; estValide() accepte l'union des deux.

test("evaluer : tout juste, tout faux", () => {
  assert.deepEqual(g.evaluer("ALLEE", "ALLEE"), ["exact", "exact", "exact", "exact", "exact"]);
  assert.deepEqual(g.evaluer("ABCDE", "FGHIJ"), Array(5).fill("absent"));
});

test("evaluer : lettres en double, solution ALLEE / essai LILAS", () => {
  // L(0): présent ; I: absent ; L(2): exact ; A(3): présent ; S: absent
  assert.deepEqual(g.evaluer("LILAS", "ALLEE"), ["present", "absent", "exact", "present", "absent"]);
});

test("evaluer : un exact consomme son occurrence avant les présents", () => {
  // Solution ABBEY-like : une seule 'E' dans la solution, essai avec deux 'E'
  assert.deepEqual(g.evaluer("EERIE", "CHOSE"), ["absent", "absent", "absent", "absent", "exact"]);
  assert.deepEqual(g.evaluer("EEEEE", "ALLEE"), ["absent", "absent", "absent", "exact", "exact"]);
  // Deux 'L' dans l'essai, un seul 'L' dans la solution : seul le premier est présent
  assert.deepEqual(g.evaluer("LLXXX", "AXLXX").slice(0, 2), ["present", "absent"]);
});

test("normaliser : accents, casse, ligatures, caractères parasites", () => {
  assert.equal(g.normaliser("élève"), "ELEVE");
  assert.equal(g.normaliser("cœur"), "COEUR");
  assert.equal(g.normaliser(" ca-fé "), "CAFE");
  assert.equal(g.normaliser(null), "");
  assert.equal(g.normaliser("Ça1"), "CA");
});

test("listes : tailles, format A-Z sur 5 lettres, sans doublon", () => {
  assert.ok(SOL.length >= 400, `solutions: ${SOL.length}`);
  assert.ok(ACC.length <= 4000, `acceptés: ${ACC.length}`);
  for (const w of [...SOL, ...ACC]) assert.match(w, /^[A-Z]{5}$/, w);
  assert.equal(new Set(SOL).size, SOL.length, "doublon dans SOLUTIONS");
  assert.equal(new Set(ACC).size, ACC.length, "doublon dans ACCEPTES");
  for (const w of ACC) assert.ok(!SOL.includes(w), `${w} dans les deux listes`);
});

test("estValide : solutions et acceptés oui, le reste non", () => {
  assert.ok(g.estValide(SOL[0]));
  assert.ok(g.estValide(ACC[0]));
  assert.ok(!g.estValide("ZZZZZ"));
  assert.ok(!g.estValide("ABC"));
  assert.ok(!g.estValide(undefined));
});

test("motDuJour : déterministe par jour, change d'un jour à l'autre", () => {
  const d = new Date(2026, 5, 10, 8);
  assert.equal(g.motDuJour(d), g.motDuJour(new Date(2026, 5, 10, 22)));
  assert.ok(SOL.includes(g.motDuJour(d)));
  assert.notEqual(g.motDuJour(d), g.motDuJour(new Date(2026, 5, 11)));
  assert.equal(g.cleDuJour(new Date(2026, 0, 5)), "2026-01-05");
});

test("motAleatoire : toujours une solution, bornes incluses", () => {
  assert.equal(g.motAleatoire(() => 0), SOL[0]);
  assert.equal(g.motAleatoire(() => 0.999999), SOL[SOL.length - 1]);
});
