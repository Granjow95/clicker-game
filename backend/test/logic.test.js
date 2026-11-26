const test = require("node:test");
const assert = require("node:assert/strict");
const { clean, clampInt, createRateLimiter } = require("../lib/util");
const { scoreVotes, sanitizeOptions, pickWordPair, buildRanking, WORD_PAIRS } = require("../games/imposteur");
const { sanitizeSong } = require("../games/karaoke");
const { isOriginAllowed } = require("../config");

test("clean retire balises, contrôles et borne la longueur", () => {
  assert.equal(clean("<img onerror=x>", 50), "img onerror=x");
  assert.equal(clean("  Amir\n", 20), "Amir");
  assert.equal(clean("a".repeat(100), 20).length, 20);
  assert.equal(clean({ a: 1 }, 20), "");
  assert.equal(clean(undefined, 20), "");
});

test("clampInt borne et gère les valeurs invalides", () => {
  assert.equal(clampInt("5", 1, 10, 3), 5);
  assert.equal(clampInt(999, 1, 10, 3), 10);
  assert.equal(clampInt(-4, 1, 10, 3), 1);
  assert.equal(clampInt("abc", 1, 10, 3), 3);
});

test("sanitizeOptions impose des valeurs raisonnables", () => {
  assert.deepEqual(sanitizeOptions({ rounds: 9999, timer: 1 }), { rounds: 10, timer: 10, mrWhite: false });
  assert.deepEqual(sanitizeOptions(null), { rounds: 3, timer: 60, mrWhite: false });
  assert.equal(sanitizeOptions({ mrWhite: true }).mrWhite, true);
  assert.equal(sanitizeOptions({ mrWhite: "true" }).mrWhite, false);
});

test("scoreVotes : l'imposteur démasqué ne gagne rien, les bons votants +100", () => {
  const points = {};
  scoreVotes({ a: "imp", b: "imp", imp: "a" }, "imp", points);
  assert.equal(points.a, 100);
  assert.equal(points.b, 100);
  assert.equal(points.imp, 0);
});

test("scoreVotes : l'imposteur non démasqué gagne 100", () => {
  const points = {};
  scoreVotes({ a: "b", b: "a", imp: "a" }, "imp", points);
  // a et b se désignent, a est le plus voté (2) : l'imposteur s'en sort
  assert.equal(points.imp, 100);
  assert.equal(points.a, 0);
});

test("scoreVotes : égalité en tête = personne éliminé, l'imposteur gagne 100", () => {
  const points = {};
  const { mostVoted } = scoreVotes({ a: "b", b: "a", c: "imp" }, { impostorId: "imp" }, points);
  assert.equal(mostVoted, null);
  assert.equal(points.imp, 100);
});

test("scoreVotes : barème Mr White (+50 / +100 / +150)", () => {
  // White non éliminé : +100 ; votants pour White : +50 ; imposteur démasqué : +100 aux votants
  let p = {};
  scoreVotes({ a: "imp", b: "w", c: "imp", w: "imp", imp: "a" }, { impostorId: "imp", whiteId: "w" }, p);
  assert.deepEqual([p.a, p.b, p.c, p.w, p.imp], [100, 50, 100, 200, 0]);
  // White éliminé : 0 sans mot trouvé, +150 avec
  p = {};
  scoreVotes({ a: "w", b: "w", imp: "w" }, { impostorId: "imp", whiteId: "w" }, p);
  assert.deepEqual([p.a, p.imp, p.w], [50, 150, undefined]);
  p = {};
  scoreVotes({ a: "w", b: "w", imp: "w" }, { impostorId: "imp", whiteId: "w", whiteGuessCorrect: true }, p);
  assert.equal(p.w, 150);
});

test("WORD_PAIRS : paires avec thème, mots distincts", () => {
  assert.ok(WORD_PAIRS.length >= 20);
  assert.ok(WORD_PAIRS.every((w) => w.normal && w.impostor && w.normal !== w.impostor));
});

test("pickWordPair utilise le générateur fourni", () => {
  assert.equal(pickWordPair(() => 0), WORD_PAIRS[0]);
  assert.ok(pickWordPair().normal);
});

test("buildRanking trie par score décroissant", () => {
  const r = buildRanking({ x: 10, y: 50 }, [{ id: "x", username: "X" }, { id: "y", username: "Y" }]);
  assert.deepEqual(r.map((e) => e.username), ["Y", "X"]);
  assert.deepEqual(r.map((e) => e.id), ["y", "x"]);
});

test("rate limiter coupe après la rafale", () => {
  const allow = createRateLimiter({ capacity: 3, perSecond: 0 });
  assert.deepEqual([allow(), allow(), allow(), allow()], [true, true, true, false]);
});

test("sanitizeSong rejette l'invalide et filtre les champs", () => {
  assert.equal(sanitizeSong(null), null);
  assert.equal(sanitizeSong({ title: "x" }), null);
  const s = sanitizeSong({ title: "T", artist: "A", evil: "<script>", lyrics: "la", cover: "javascript:alert(1)" });
  assert.deepEqual(s, { title: "T", artist: "A", lyrics: "la" });
});

test("CORS : prod autorisée, origine inconnue refusée", () => {
  assert.equal(isOriginAllowed("https://granjow.netlify.app"), true);
  assert.equal(isOriginAllowed("https://evil.example"), false);
  assert.equal(isOriginAllowed(undefined), true);
});

test("limiteur par clé : bloque au-delà du quota puis repart avec la fenêtre", async () => {
  const { createKeyedLimiter } = require("../lib/util");
  const allow = createKeyedLimiter({ max: 2, windowMs: 50 });
  assert.deepEqual([allow("ip"), allow("ip"), allow("ip"), allow("autre")], [true, true, false, true]);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(allow("ip"), true);
});

test("clean : retire les caractères invisibles et de direction", () => {
  const { clean } = require("../lib/util");
  assert.equal(clean("am​ir‮_t﻿", 20), "amir_t");
});
