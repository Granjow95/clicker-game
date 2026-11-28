const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { createPetitBac } = require("../games/petit-bac");

let server, io, game, port;
const clients = [];

test.before(async () => {
  server = http.createServer();
  io = new Server(server);
  game = createPetitBac(io, {}, { collectMs: 80, ipLimiter: () => true, maxRoomsPerIp: 1000 });
  io.on("connection", (socket) => {
    game.register(socket);
    socket.on("disconnect", () => game.onDisconnect(socket));
  });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});

test.after(() => {
  clients.forEach((c) => c.close());
  game.dispose();
  io.close();
});

const once = (c, ev) => new Promise((r) => c.once(ev, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true });
  clients.push(c);
  return new Promise((resolve) => c.on("connect", () => resolve(c)));
}

async function room(names = ["Hote", "Ami"]) {
  const cs = [];
  const h = await client();
  cs.push(h);
  const p = once(h, "pb:joined");
  h.emit("pb:create", { username: names[0] });
  const first = await p;
  const infos = [first];
  for (const n of names.slice(1)) {
    const c = await client();
    cs.push(c);
    const j = once(c, "pb:joined");
    c.emit("pb:join", { code: first.code, username: n });
    infos.push(await j);
  }
  return { cs, infos, code: first.code };
}

// Attend la revue puis valide les suggestions telles quelles (hôte = cs[0]) ; renvoie pb:results.
async function endReview(host, watcher = host) {
  await once(watcher, "pb:review");
  const res = once(watcher, "pb:results");
  host.emit("pb:review_done", {});
  return res;
}

const ALL = [0, 1, 2, 3, 4, 5];
const { CATEGORIES } = require("../games/petit-bac");
const words = (L, suffix) => ALL.map((i) => `${L}${suffix}${i}`);

test("options hôte : bornes et catégories distinctes", async () => {
  const { cs } = await room();
  const bad = once(cs[0], "pb:error");
  cs[0].emit("pb:options", { rounds: 3, duration: 90, categories: [0, 0, 1, 2, 3, 4] });
  assert.equal((await bad).code, "bad_categories");
  const ok = once(cs[0], "pb:options");
  cs[0].emit("pb:options", { rounds: 99, duration: 5, categories: [6, 7, 8, 9, 10, 11] }); // ancien format : index
  assert.deepEqual(await ok, {
    rounds: 10, duration: 60, custom: [],
    categories: ["Marque", "Sport", "Personnage célèbre", "Film ou série", "Plat", "Couleur"],
  });
  const notHost = once(cs[1], "pb:error");
  cs[1].emit("pb:options", { rounds: 1, duration: 60, categories: ALL });
  assert.equal((await notHost).code, "not_host");
});

test("Stop refusé si une réponse manque ou est invalide, accepté sinon", async () => {
  const { cs } = await room();
  cs[0].emit("pb:start", {});
  const rs = await once(cs[1], "pb:round_start");
  const L = rs.letter;
  assert.equal(rs.categories.length, 6);
  const tryStop = async (answers) => {
    const e = once(cs[0], "pb:error");
    cs[0].emit("pb:stop", { answers });
    return (await e).code;
  };
  const w = words(L, "ab");
  assert.equal(await tryStop([...w.slice(0, 5), ""]), "invalid");
  assert.equal(await tryStop([...w.slice(0, 5), "zzz"]), "invalid"); // mauvaise lettre
  assert.equal(await tryStop(w.slice(0, 5)), "invalid"); // 5 réponses
  const stopped = once(cs[1], "pb:stopped");
  cs[0].emit("pb:stop", { answers: w });
  assert.equal((await stopped).graceMs, 80);
  await endReview(cs[0], cs[1]);
});

test("points 10 / 5 / 0, accents et casse", async () => {
  const { cs, infos } = await room(["A", "B", "C"]);
  cs[0].emit("pb:start", {});
  const L = (await once(cs[0], "pb:round_start")).letter;
  const l = L.toLowerCase();
  const full = (...cells) => [...cells, ...Array(6 - cells.length).fill("")];
  // cat0 : « Élan » et « elan » partagés ; cat1 : unique ; cat2 : invalide pour C.
  const a0 = full(`${L}Élan`, `${L}solo`, `${L}pareil`);
  const a1 = full(`${l}elan`, `${L}autre`, `${L}pareil`);
  const a2 = full(`${L}ÉLAN`, `${L}troisieme`, "mauvaise");
  cs[1].emit("pb:answers", { answers: a1 });
  cs[2].emit("pb:answers", { answers: a2 });
  await wait(50);
  // Le stop exige 6 réponses valides : A envoie le tout complet.
  const complete = [...a0.slice(0, 3), `${L}d`, `${L}e`, `${L}f`].map((s, i) => (i < 3 ? s : `${L}z${i}`));
  cs[0].emit("pb:stop", { answers: complete });
  const r = await endReview(cs[0]);
  const [a, b, c] = infos.map((i) => i.you);
  assert.equal(r.letter, L);
  assert.deepEqual(r.table[a].map((x) => x.points).slice(0, 3), [5, 10, 5]);
  assert.deepEqual(r.table[b].map((x) => x.points).slice(0, 3), [5, 10, 5]);
  assert.deepEqual(r.table[c].map((x) => x.points).slice(0, 3), [5, 10, 0]);
  assert.equal(r.table[c][2].valid, false);
  assert.equal(r.table[c][3].points, 0); // vide
  assert.equal(r.gained[a], 5 + 10 + 5 + 30);
  assert.equal(r.scores[b], r.gained[b]);
  assert.equal(r.isLastRound, false);
});

test("fin de partie : lettres sans remise hors KQWXYZ, classement complet", async () => {
  const { cs, infos } = await room(["A", "B", "C"]);
  cs[0].emit("pb:options", { rounds: 10, duration: 60, categories: ALL });
  await once(cs[1], "pb:options");
  cs[0].emit("pb:start", {});
  const letters = [];
  for (let i = 0; i < 10; i++) {
    const rs = await once(cs[0], "pb:round_start");
    letters.push(rs.letter);
    cs[0].emit("pb:stop", { answers: words(rs.letter, "ab") });
    const r = await endReview(cs[0]);
    assert.equal(r.isLastRound, i === 9);
    if (i < 9) cs[0].emit("pb:next", {});
  }
  assert.equal(new Set(letters).size, 10);
  for (const l of letters) assert.match(l, /^[ABCDEFGHIJLMNOPRSTUV]$/);
  const over = once(cs[2], "pb:game_over");
  cs[0].emit("pb:next", {});
  const { ranking } = await over;
  assert.equal(ranking.length, 3); // joueurs à 0 inclus
  assert.equal(ranking[0].id, infos[0].you);
  assert.equal(ranking[0].score, 600);
  assert.equal(ranking[2].score, 0);
  // Relance après over.
  const again = once(cs[1], "pb:round_start");
  cs[0].emit("pb:start", {});
  assert.equal((await again).round, 1);
});

test("arrivée refusée pendant writing, reprise renvoie les réponses saisies", async () => {
  const { cs, infos, code } = await room();
  cs[0].emit("pb:start", {});
  const L = (await once(cs[1], "pb:round_start")).letter;
  const mine = ["", `${L}pomme`, "", "", "", ""];
  cs[1].emit("pb:answers", { answers: mine });
  await wait(100);
  const late = await client();
  const err = once(late, "pb:error");
  late.emit("pb:join", { code, username: "Retard" });
  assert.equal((await err).code, "game_in_progress");

  const token = infos[1].token;
  cs[1].close();
  await wait(100);
  const back = await client();
  const joined = once(back, "pb:joined");
  back.emit("pb:resume", { code, token });
  const j = await joined;
  assert.equal(j.resumed, true);
  assert.equal(j.you, infos[1].you);
  assert.equal(j.state.phase, "writing");
  assert.equal(j.state.letter, L);
  assert.deepEqual(j.state.myAnswers, mine);
  assert.equal(j.state.categories.length, 6);
  assert.ok(j.state.remainingMs > 0 && j.state.remainingMs <= 90000);
});

test("les réponses d'un joueur déconnecté comptent", async () => {
  const { cs, infos } = await room();
  cs[0].emit("pb:start", {});
  const L = (await once(cs[1], "pb:round_start")).letter;
  cs[1].emit("pb:answers", { answers: [`${L}aa`, "", "", "", "", ""] });
  await wait(100);
  cs[1].close();
  await wait(100);
  cs[0].emit("pb:stop", { answers: words(L, "zz") });
  const r = await endReview(cs[0]);
  assert.equal(r.table[infos[1].you][0].points, 10);
});

test("pb:answers envoyé en collecting (après le limiteur) est conservé", async () => {
  const { cs, infos } = await room();
  cs[0].emit("pb:start", {});
  const L = (await once(cs[1], "pb:round_start")).letter;
  for (let i = 0; i < 8; i++) cs[1].emit("pb:answers", { answers: words(L, `a${i}`) }); // épuise le limiteur
  await wait(50);
  const stopped = once(cs[1], "pb:stopped");
  cs[0].emit("pb:stop", { answers: words(L, "zz") });
  await stopped;
  cs[1].emit("pb:answers", { answers: words(L, "final") });
  const r = await endReview(cs[0]);
  assert.equal(r.table[infos[1].you][0].text, `${L}final0`);
});

// Lance une manche à 3 joueurs (A hôte, B, C), arrête avec A, et renvoie la première fiche (A).
async function toReview(answersB, answersC) {
  const { cs, infos, code } = await room(["A", "B", "C"]);
  cs[0].emit("pb:start", {});
  const L = (await once(cs[0], "pb:round_start")).letter;
  cs[1].emit("pb:answers", { answers: answersB(L) });
  cs[2].emit("pb:answers", { answers: answersC(L) });
  await wait(50);
  const rv = cs.map((c) => once(c, "pb:review"));
  cs[0].emit("pb:stop", { answers: [0, 1, 2, 3, 4, 5].map((i) => `${L}z${i}`) });
  return { cs, infos, code, L, first: (await Promise.all(rv))[0] };
}

test("revue : suggestion automatique (vide, mauvaise lettre, doublon) et doublons", async () => {
  const { cs, infos, L, first } = await toReview(
    (l) => [`${l}elan`, "", "zzz", `${l}`, `${l}ab`, `${l}ab`],
    (l) => [`${l.toLowerCase()}ÉLAN`, `${l}x`, "", "", "", ""],
  );
  assert.equal(first.index, 0);
  assert.equal(first.total, 3);
  assert.equal(first.playerId, infos[0].you);
  assert.equal(first.letter, L);
  assert.deepEqual(first.decided, []);
  assert.ok(first.sheet.every((c) => c.status === "unique"));
  const go = once(cs[1], "pb:review");
  cs[0].emit("pb:review_goto", { index: 1 });
  const b = await go; // B voit la fiche suivante en direct
  assert.equal(b.playerId, infos[1].you);
  assert.deepEqual(b.sheet.map((c) => c.status), ["partage", "refuse", "refuse", "refuse", "unique", "unique"]);
  assert.deepEqual(b.decided, [infos[0].you]);
  assert.deepEqual(b.doublons[0], [infos[2].you]);
  assert.deepEqual(b.doublons[1], []);
});

test("revue : seul l'hôte tranche et navigue, entrées validées", async () => {
  const { cs, infos } = await toReview((l) => words(l, "b"), (l) => words(l, "c"));
  const A = infos[0].you;
  for (const [ev, data] of [
    ["pb:verdict", { playerId: A, cat: 0, status: "refuse" }],
    ["pb:review_goto", { index: 1 }],
    ["pb:review_done", {}],
  ]) {
    const e = once(cs[1], "pb:error");
    cs[1].emit(ev, data);
    assert.equal((await e).code, "not_host");
  }
  for (const data of [
    { playerId: A, cat: 6, status: "refuse" },
    { playerId: A, cat: 0, status: "gratuit" },
    { playerId: "inconnu", cat: 0, status: "refuse" },
    { playerId: A, cat: "0", status: "refuse" },
    null,
  ]) {
    const e = once(cs[0], "pb:error");
    cs[0].emit("pb:verdict", data);
    assert.equal((await e).code, "invalid");
  }
  const e = once(cs[0], "pb:error");
  cs[0].emit("pb:review_goto", { index: 3 });
  assert.equal((await e).code, "invalid");
});

test("revue : verdicts appliqués au score (unique 10, partage 5, refuse 0)", async () => {
  const { cs, infos } = await toReview((l) => words(l, "b"), (l) => words(l, "c"));
  const [A, B] = infos.map((i) => i.you);
  const upd = once(cs[2], "pb:review"); // diffusé à toute la salle
  cs[0].emit("pb:verdict", { playerId: A, cat: 0, status: "refuse" });
  const v = await upd;
  assert.equal(v.sheet[0].status, "refuse");
  assert.deepEqual(v.decided, [A]);
  cs[0].emit("pb:verdict", { playerId: A, cat: 1, status: "partage" });
  cs[0].emit("pb:verdict", { playerId: B, cat: 2, status: "refuse" });
  await wait(50);
  const res = once(cs[0], "pb:results");
  cs[0].emit("pb:review_done", {});
  const r = await res;
  assert.equal(r.gained[A], 0 + 5 + 10 * 4);
  assert.equal(r.gained[B], 10 * 5);
  assert.deepEqual(r.table[A][0], { text: r.table[A][0].text, status: "refuse", valid: false, points: 0 });
  assert.equal(r.table[A][1].status, "partage");
  assert.equal(r.scores[A], r.gained[A]);
});

test("revue : reprise renvoie l'état complet, arrivée refusée", async () => {
  const { cs, infos, code } = await toReview((l) => words(l, "b"), (l) => words(l, "c"));
  const A = infos[0].you;
  cs[0].emit("pb:verdict", { playerId: A, cat: 3, status: "refuse" });
  await wait(50);
  const late = await client();
  const err = once(late, "pb:error");
  late.emit("pb:join", { code, username: "Retard" });
  assert.equal((await err).code, "game_in_progress");
  const token = infos[1].token;
  cs[1].close();
  await wait(100);
  const back = await client();
  const joined = once(back, "pb:joined");
  back.emit("pb:resume", { code, token });
  const j = await joined;
  assert.equal(j.state.phase, "review");
  assert.equal(j.state.review.playerId, A);
  assert.equal(j.state.review.total, 3);
  assert.equal(j.state.review.sheet[3].status, "refuse");
  assert.deepEqual(j.state.review.decided, [A]);
  assert.equal(j.state.review.doublons.length, 6);
});

test("revue : l'hôte déconnecté est remplacé et garde l'état", async () => {
  const { cs, infos } = await toReview((l) => words(l, "b"), (l) => words(l, "c"));
  const A = infos[0].you;
  cs[0].emit("pb:verdict", { playerId: A, cat: 0, status: "refuse" });
  await wait(50);
  const rv = once(cs[1], "pb:review");
  cs[0].close();
  await wait(100);
  cs[1].emit("pb:review_goto", { index: 0 }); // B est maintenant hôte
  const state = await rv;
  assert.equal(state.sheet[0].status, "refuse"); // état conservé
  assert.equal(state.playerId, A); // fiche du déconnecté (avec réponses) toujours présente
  const res = once(cs[1], "pb:results");
  cs[1].emit("pb:review_done", {});
  const r = await res;
  assert.equal(r.gained[A], 50);
});

test("revue : une case vide ne peut pas etre validee (verdict refuse, 0 point)", async () => {
  const { cs, infos } = await toReview((l) => ["", ...words(l, "b").slice(1)], (l) => words(l, "c"));
  const B = infos[1].you;
  cs[0].emit("pb:review_goto", { index: 1 });
  await wait(50);
  const err = once(cs[0], "pb:error");
  cs[0].emit("pb:verdict", { playerId: B, cat: 0, status: "unique" });
  assert.equal((await err).code, "invalid");
  const res = once(cs[0], "pb:results");
  cs[0].emit("pb:review_done", {});
  const r = await res;
  assert.equal(r.table[B][0].points, 0);
  assert.equal(r.table[B][0].valid, false);
});

test("revue : le depart d'un joueur avant la fiche courante garde la meme fiche", async () => {
  const { cs, infos } = await toReview((l) => words(l, "b"), (l) => words(l, "c"));
  const C = infos[2].you;
  cs[0].emit("pb:review_goto", { index: 2 });
  await wait(50);
  const upd = once(cs[0], "pb:review");
  cs[1].emit("pb:leave", { forfeit: true });
  const st = await upd;
  assert.equal(st.playerId, C);
  assert.equal(st.index, 1);
  assert.equal(st.total, 2);
  assert.ok(!st.decided.includes(infos[1].you));
});

test("catégories : autant qu'on veut (1 à 20) et perso (10 au plus), bornes", async () => {
  const { cs } = await room();
  const err = async (opts) => {
    const e = once(cs[0], "pb:error");
    cs[0].emit("pb:options", { rounds: 1, duration: 60, ...opts });
    return (await e).code;
  };
  assert.equal(await err({ categories: [] }), "bad_categories");
  const perso = Array.from({ length: 10 }, (_, i) => `Perso ${"abcdefghij"[i]}`);
  const tout = [...CATEGORIES, ...perso];
  assert.equal(await err({ custom: perso, categories: tout.slice(0, 21) }), "bad_categories"); // 21
  assert.equal(await err({ custom: [...perso, "Onzième"], categories: ["Animal"] }), "bad_categories");
  assert.equal(await err({ custom: ["x"], categories: ["Animal"] }), "bad_categories"); // trop courte
  assert.equal(await err({ custom: ["y".repeat(31)], categories: ["Animal"] }), "bad_categories");
  assert.equal(await err({ custom: ["animal"], categories: ["Animal"] }), "bad_categories"); // doublon d'une intégrée
  assert.equal(await err({ custom: ["Chose", "chose"], categories: ["Animal"] }), "bad_categories");
  assert.equal(await err({ custom: [], categories: ["Inventée"] }), "bad_categories"); // ni intégrée ni perso
  assert.equal(await err({ custom: "Chose", categories: ["Animal"] }), "bad_categories");
  const ok = once(cs[1], "pb:options");
  cs[0].emit("pb:options", { rounds: 1, duration: 300, custom: ["  Chose  qui pique "], categories: ["Chose qui pique", "Animal"] });
  assert.deepEqual(await ok, { rounds: 1, duration: 300, custom: ["Chose qui pique"], categories: ["Chose qui pique", "Animal"] });
  const one = once(cs[1], "pb:options");
  cs[0].emit("pb:options", { rounds: 1, duration: 60, categories: ["Animal"] }); // custom omis : conservé
  assert.deepEqual((await one).custom, ["Chose qui pique"]);
  const vingt = once(cs[1], "pb:options");
  cs[0].emit("pb:options", { rounds: 1, duration: 60, custom: perso, categories: tout.slice(0, 20) });
  assert.equal((await vingt).categories.length, 20);
});

test("manche à 20 catégories (dont perso) jouée jusqu'au bout ; réponses de longueur exacte", async () => {
  const { cs, infos, code } = await room();
  const perso = Array.from({ length: 8 }, (_, i) => `Perso ${"abcdefgh"[i]}`);
  const cats = [...CATEGORIES, ...perso];
  const o = once(cs[1], "pb:options");
  cs[0].emit("pb:options", { rounds: 1, duration: 60, custom: perso, categories: cats });
  await o;
  cs[0].emit("pb:start", {});
  const rs = await once(cs[1], "pb:round_start");
  assert.deepEqual(rs.categories, cats);
  const L = rs.letter;
  const e = once(cs[1], "pb:error");
  cs[1].emit("pb:answers", { answers: [`${L}aa`] }); // 1 réponse pour 20 catégories
  assert.equal((await e).code, "invalid");
  // Reprise : les catégories perso sont dans le snapshot
  cs[1].close();
  await wait(100);
  const r = await client();
  const j = once(r, "pb:joined");
  r.emit("pb:resume", { code, token: infos[1].token });
  const snap = (await j).state;
  assert.deepEqual(snap.categories, cats);
  assert.deepEqual(snap.options.custom, perso);
  const rev = once(cs[0], "pb:review", 5000);
  cs[0].emit("pb:stop", { answers: cats.map((_, i) => `${L}z${i}`) });
  const review = await rev;
  assert.equal(review.sheet.length, 20);
});
