const test = require("node:test");
const assert = require("node:assert/strict");
const { searchVideoIds } = require("../lib/ytSearch");

// Faux YouTube : aucune requête réseau réelle.
let calls = 0;
let total = 0; // requêtes réellement envoyées depuis le début du fichier
let status = 200;
let body = '"videoId":"aaaaaaaaaaa" "videoId":"bbbbbbbbbbb" "videoId":"aaaaaaaaaaa"';
global.fetch = async () => { calls++; total++; return new Response(body, { status }); };

test("searchVideoIds : IDs dédoublonnés, cache, requêtes identiques partagées", async () => {
  calls = 0;
  const [a, b] = await Promise.all([searchVideoIds("Chanson Un", 5), searchVideoIds("chanson un", 5)]);
  assert.deepEqual(a, ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  assert.deepEqual(b, a);
  assert.deepEqual(await searchVideoIds("CHANSON UN", 1), ["aaaaaaaaaaa"]);
  assert.equal(calls, 1);
});

test("searchVideoIds : réponse HTTP en erreur → liste vide, non mise en cache", async () => {
  calls = 0;
  status = 503;
  assert.deepEqual(await searchVideoIds("erreur", 5), []);
  status = 200;
  assert.deepEqual(await searchVideoIds("erreur", 5), ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  assert.equal(calls, 2);
});

test("searchVideoIds : budget de 30 recherches par IP et par minute, le cache n'en consomme pas", async () => {
  calls = 0;
  for (let i = 0; i < 30; i++) assert.equal((await searchVideoIds("ip-a " + i, 5, { ip: "1.1.1.1" })).length, 2);
  assert.deepEqual(await searchVideoIds("ip-a encore", 5, { ip: "1.1.1.1" }), []);
  assert.equal((await searchVideoIds("ip-a 3", 5, { ip: "1.1.1.1" })).length, 2); // en cache
  assert.equal((await searchVideoIds("ip-b 0", 5, { ip: "2.2.2.2" })).length, 2);
  assert.equal(calls, 31);
});

test("searchVideoIds : plafond global (60 / min, toutes IP confondues)", async () => {
  const avant = total;
  let ok = 0;
  for (let i = 0; i < 40; i++) if ((await searchVideoIds("global " + i, 5, { ip: "3.3.3." + i })).length) ok++;
  assert.equal(ok, 60 - avant);
  assert.equal(total, 60);
});
