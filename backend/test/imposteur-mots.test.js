const test = require("node:test");
const assert = require("node:assert/strict");
const { WORD_PAIRS, THEMES } = require("../games/imposteur-mots");
const { normalizeWord } = require("../lib/util");

test("au moins 100 paires et 10 thèmes", () => {
  assert.ok(WORD_PAIRS.length >= 100, `paires: ${WORD_PAIRS.length}`);
  assert.ok(THEMES.length >= 10, `thèmes: ${THEMES.length}`);
});

test("chaque mot est une chaîne non vide de 30 caractères maximum", () => {
  for (const { normal, impostor } of WORD_PAIRS) {
    for (const w of [normal, impostor]) {
      assert.equal(typeof w, "string");
      assert.ok(w.trim().length > 0, "mot vide");
      assert.ok(w.length <= 30, `trop long : ${w}`);
    }
  }
});

test("les mots `normal` sont uniques", () => {
  const seen = new Set();
  for (const { normal } of WORD_PAIRS) {
    const k = normalizeWord(normal);
    assert.ok(!seen.has(k), `doublon : ${normal}`);
    seen.add(k);
  }
});

test("normal et impostor diffèrent dans chaque paire", () => {
  for (const { normal, impostor } of WORD_PAIRS) {
    assert.notEqual(normalizeWord(normal), normalizeWord(impostor), normal);
  }
});

test("chaque thème appartient à THEMES", () => {
  for (const { theme } of WORD_PAIRS) {
    assert.ok(THEMES.includes(theme), `thème inconnu : ${theme}`);
  }
});
