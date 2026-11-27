const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLrc, MAX_LINES, MAX_TEXT } = require("../lib/lrc");

test("parseLrc : horaires en ms, lignes vides et texte sans horaire ignorés", () => {
  const l = parseLrc("[ar:X]\n[00:01.50] un \n[00:02.75]\nsans horaire\n[01:03.2]deux <00:03.10>mots\r\n");
  assert.deepEqual(l, [{ t: 1500, text: "un" }, { t: 63200, text: "deux mots" }]);
});

test("parseLrc : fusion des lignes à moins d'1 s, sans enchaîner tout un couplet", () => {
  const l = parseLrc("[00:01.00]a\n[00:01.50]b\n[00:01.90]c\n[00:02.40]d\n[00:05.00]e");
  assert.deepEqual(l.map((x) => x.text), ["a b", "c d", "e"]);
  assert.deepEqual(l.map((x) => x.t), [1000, 1900, 5000]);
});

test("parseLrc : plusieurs horaires sur une ligne, tri chronologique", () => {
  const l = parseLrc("[00:20.00][00:05.00]refrain\n[00:10.00]couplet");
  assert.deepEqual(l, [{ t: 5000, text: "refrain" }, { t: 10000, text: "couplet" }, { t: 20000, text: "refrain" }]);
});

test("parseLrc : bornes (lignes, longueur, entrées non textuelles, balises)", () => {
  const big = Array.from({ length: 900 }, (_, i) => `[${String(Math.floor(i * 2 / 60)).padStart(2, "0")}:${String((i * 2) % 60).padStart(2, "0")}.00]l${i}`).join("\n");
  assert.equal(parseLrc(big).length, MAX_LINES);
  assert.equal(parseLrc("[00:01.00]" + "x".repeat(500))[0].text.length, MAX_TEXT);
  assert.deepEqual(parseLrc(null), []);
  assert.deepEqual(parseLrc({}), []);
  assert.equal(parseLrc("[00:01.00]<b>gras</b>")[0].text, "bgras/b");
});

test("parseLrc : horaires au-delà d'une heure ignorés", () => {
  assert.deepEqual(parseLrc("[00:01.00]a\n[59:59.00]b\n[60:00.01]c\n[999:00.00]d").map((l) => l.text), ["a", "b"]);
});

test("parseLrc : jamais deux lignes au même horaire", () => {
  const l = parseLrc("[00:01.00]a\n[00:01.00]b\n[00:01.00]c\n[00:05.00]d");
  assert.deepEqual(l, [{ t: 1000, text: "a b c" }, { t: 5000, text: "d" }]);
});
