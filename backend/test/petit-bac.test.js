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
  game = createPetitBac(io, {}, { collectMs: 80 });
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

const ALL = [0, 1, 2, 3, 4, 5];
const words = (L, suffix) => ALL.map((i) => `${L}${suffix}${i}`);

test("options hôte : bornes et catégories distinctes", async () => {
  const { cs } = await room();
  const bad = once(cs[0], "pb:error");
  cs[0].emit("pb:options", { rounds: 3, duration: 90, categories: [0, 0, 1, 2, 3, 4] });
  assert.equal((await bad).code, "invalid");
  const ok = once(cs[0], "pb:options");
  cs[0].emit("pb:options", { rounds: 99, duration: 5, categories: [6, 7, 8, 9, 10, 11] });
  assert.deepEqual(await ok, { rounds: 10, duration: 60, categories: [6, 7, 8, 9, 10, 11] });
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
  assert.equal(await tryStop([...w.slice(0, 5), `${L}`]), "invalid"); // 1 caractère
  assert.equal(await tryStop([...w.slice(0, 5), "zzz"]), "invalid"); // mauvaise lettre
  assert.equal(await tryStop(w.slice(0, 5)), "invalid"); // 5 réponses
  const stopped = once(cs[1], "pb:stopped");
  cs[0].emit("pb:stop", { answers: w });
  assert.equal((await stopped).graceMs, 80);
  await once(cs[1], "pb:results");
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
  const res = once(cs[0], "pb:results");
  cs[1].emit("pb:answers", { answers: a1 });
  cs[2].emit("pb:answers", { answers: a2 });
  await wait(50);
  // Le stop exige 6 réponses valides : A envoie le tout complet.
  const complete = [...a0.slice(0, 3), `${L}d`, `${L}e`, `${L}f`].map((s, i) => (i < 3 ? s : `${L}z${i}`));
  cs[0].emit("pb:stop", { answers: complete });
  const r = await res;
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
    const res = once(cs[0], "pb:results");
    cs[0].emit("pb:stop", { answers: words(rs.letter, "ab") });
    const r = await res;
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
  const res = once(cs[0], "pb:results");
  cs[0].emit("pb:stop", { answers: words(L, "zz") });
  const r = await res;
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
  const res = once(cs[0], "pb:results");
  cs[1].emit("pb:answers", { answers: words(L, "final") });
  const r = await res;
  assert.equal(r.table[infos[1].you][0].text, `${L}final0`);
});
