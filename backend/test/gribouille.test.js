const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { createGribouille, _globalValues } = require("../games/gribouille");
const { GRIBOUILLE_WORDS } = require("../games/gribouille-mots");
const { normalizeWord } = require("../lib/util");

let server, io, game, port;
const clients = [];

test.before(async () => {
  server = http.createServer();
  io = new Server(server);
  game = createGribouille(io, { record() {} }, { graceMs: 5000 });
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (c, ev) => new Promise((r) => c.once(ev, r));

function client() {
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true });
  c.log = [];
  c.onAny((ev, data) => c.log.push([ev, data]));
  c.count = (ev) => c.log.filter(([e]) => e === ev).length;
  clients.push(c);
  return new Promise((resolve) => c.on("connect", () => resolve(c)));
}

// Salle de n joueurs (u1 = hôte) ; chaque client reçoit .joined (charge de gri:joined).
async function setup(n) {
  const cs = [];
  for (let i = 0; i < n; i++) {
    const c = await client();
    const p = once(c, "gri:joined");
    if (i === 0) c.emit("gri:create", { username: "u1" });
    else c.emit("gri:join", { code: cs[0].joined.code, username: `u${i + 1}` });
    c.joined = await p;
    cs.push(c);
  }
  return cs;
}

// Lance la partie ; le dessinateur (hôte) choisit un mot et le renvoie.
async function startDrawing(cs) {
  const [host] = cs;
  const choices = once(host, "gri:choices");
  host.emit("gri:start", {});
  const { words } = await choices;
  assert.equal(words.length, 3);
  const w = once(host, "gri:word");
  host.emit("gri:choose", { index: 0 });
  const { word } = await w;
  assert.equal(word, words[0]);
  await wait(50);
  return word;
}

const seg = (over = {}) => ({ id: 1, c: 2, w: 1, p: [10, 10, 20, 20], ...over });

test("mots : au moins 200, uniques, 4 à 30 caractères", () => {
  assert.ok(GRIBOUILLE_WORDS.length >= 200);
  assert.equal(new Set(GRIBOUILLE_WORDS.map(normalizeWord)).size, GRIBOUILLE_WORDS.length);
  for (const w of GRIBOUILLE_WORDS) assert.ok(w.length <= 30 && normalizeWord(w).length >= 4, w);
});

test("options : hôte seul, valeurs bornées ; start réservé à l'hôte", async () => {
  const [a, b] = await setup(2);
  assert.deepEqual(a.joined.state.options, { rounds: 3, drawTime: 80 });
  b.emit("gri:options", { rounds: 5, drawTime: 30 });
  await wait(80);
  assert.equal(a.count("gri:options"), 0);
  const p = once(b, "gri:options");
  a.emit("gri:options", { rounds: 99, drawTime: 1 });
  assert.deepEqual(await p, { rounds: 5, drawTime: 30 });
  b.emit("gri:start", {});
  await wait(80);
  assert.equal(a.count("gri:choosing"), 0);
});

test("seul le dessinateur dessine ; segments invalides ignorés", async () => {
  const cs = await setup(3);
  const [a, b, c] = cs;
  await startDrawing(cs);
  b.emit("gri:draw", seg());
  b.emit("gri:clear", {});
  await wait(80);
  assert.equal(a.count("gri:draw"), 0);
  assert.equal(c.count("gri:draw"), 0);
  assert.equal(c.count("gri:clear"), 0);

  const bad = [
    seg({ id: -1 }), seg({ id: 65536 }), seg({ id: 1.5 }), seg({ c: 80 }), seg({ c: -1 }), seg({ w: 4 }),
    seg({ f: 2 }), seg({ f: true }), seg({ f: 1, p: [1, 2, 3, 4] }), seg({ f: 1, p: [1001, 5] }),
    seg({ p: [1, 2, 3] }), seg({ p: [] }), seg({ p: [1] }), seg({ p: new Array(130).fill(5) }),
    seg({ p: [0, 0, 1001, 5] }), seg({ p: [0, 0, -1, 5] }), seg({ p: [0, 0, 1.5, 5] }),
    seg({ p: ["1", "2"] }), seg({ p: "abcd" }), null, "x", 42,
  ];
  for (const s of bad) a.emit("gri:draw", s);
  await wait(400); // le limiteur de débit (12/s) se recharge
  assert.equal(b.count("gri:draw"), 0);

  a.emit("gri:draw", seg({ p: new Array(128).fill(1000) }));
  a.emit("gri:draw", seg({ id: 2 }));
  await wait(100);
  assert.equal(b.count("gri:draw"), 2);
  assert.equal(c.count("gri:draw"), 2);
  assert.equal(a.count("gri:draw"), 0); // pas d'écho

  a.emit("gri:undo", { id: 2 });
  await wait(80);
  assert.deepEqual(b.log.filter(([e]) => e === "gri:undo")[0][1], { id: 2 });
});

test("pot de peinture : relayé, présent dans l'instantané, plafonné par tour même après annulation", async () => {
  const { MAX_FILLS } = require("../games/gribouille");
  const cs = await setup(3);
  const [a, b] = cs;
  await startDrawing(cs);
  a.emit("gri:draw", { id: 1, c: 79, f: 1, p: [500, 400], w: 3 });
  await wait(80);
  const recu = b.log.filter(([e]) => e === "gri:draw").map(([, d]) => d);
  assert.deepEqual(recu, [{ id: 1, c: 79, w: 0, f: 1, p: [500, 400] }]); // w forcé à 0

  // L'instantané (arrivée en cours de tour) garde f.
  const d = await client();
  const jd = once(d, "gri:joined");
  d.emit("gri:join", { code: a.joined.code, username: "tard" });
  const etat = (await jd).state;
  assert.deepEqual(etat.segments, [{ id: 1, c: 79, w: 0, f: 1, p: [500, 400] }]);
  assert.equal(etat.fills, 1);

  for (let i = 2; i <= MAX_FILLS + 3; i++) {
    a.emit("gri:draw", { id: i, c: 4, f: 1, p: [i, i] });
    await wait(90); // sous le limiteur de débit
  }
  assert.equal(b.count("gri:draw"), MAX_FILLS);
  a.emit("gri:undo", { id: 2 });
  await wait(80);
  a.emit("gri:draw", { id: 500, c: 4, f: 1, p: [1, 1] });
  a.emit("gri:draw", seg({ id: 501 })); // les traits restent permis
  await wait(100);
  const ids = b.log.filter(([e]) => e === "gri:draw").map(([, x]) => x.id);
  assert.equal(ids.includes(500), false);
  assert.equal(ids.includes(501), true);
});

test("débit : au-delà du limiteur, les segments sont ignorés", async () => {
  const cs = await setup(2);
  const [a, b] = cs;
  await startDrawing(cs);
  for (let i = 0; i < 80; i++) a.emit("gri:draw", seg({ id: i }));
  await wait(300);
  const n = b.count("gri:draw");
  assert.ok(n >= 15 && n <= 30, `relayés : ${n}`);
});

test("le mot ne fuit pas ; bonne réponse = points + gri:correct ; gri:close", async () => {
  const cs = await setup(3);
  const [a, b, c] = cs;
  const word = await startDrawing(cs);
  const leaks = (cl) => cl.log
    .filter(([e]) => e !== "gri:turn_end" && e !== "gri:joined")
    .some(([, d]) => JSON.stringify(d || {}).toLowerCase().includes(word.toLowerCase()));

  const ts = b.log.find(([e]) => e === "gri:turn_start");
  assert.equal(ts[1].mask.replace(/[^_]/g, "").length, Array.from(word).filter((ch) => /\p{L}/u.test(ch)).length);

  b.emit("gri:guess", { text: "zzzz" });
  await wait(80);
  assert.equal(c.log.filter(([e]) => e === "gri:chat").length, 1);

  b.emit("gri:guess", { text: `${word}x` }); // une lettre de trop
  await wait(80);
  assert.equal(b.count("gri:close"), 1);
  assert.equal(c.count("gri:close"), 0);
  assert.equal(c.log.filter(([e]) => e === "gri:chat").length, 1); // la quasi-réponse n'est pas relayée

  const corr = once(c, "gri:correct");
  b.emit("gri:guess", { text: word.toUpperCase() });
  const { playerId, points } = await corr;
  assert.equal(playerId, b.joined.you);
  assert.ok(points >= 480 && points <= 500 && points % 10 === 0, `points ${points}`);
  assert.equal(c.log.filter(([e]) => e === "gri:chat").length, 1); // jamais diffusé en chat

  // un trouveur parle : seuls dessinateur et trouveurs le reçoivent, et jamais le mot
  b.emit("gri:guess", { text: "bien joue" });
  b.emit("gri:guess", { text: word });
  await wait(100);
  assert.ok(a.log.some(([e, d]) => e === "gri:chat" && d.text === "bien joue"));
  assert.equal(c.log.filter(([e]) => e === "gri:chat").length, 1);
  assert.equal(leaks(b), false);
  assert.equal(leaks(c), false);

  // fin de tour quand tous ont trouvé : le mot est alors révélé
  const end = once(c, "gri:turn_end");
  c.emit("gri:guess", { text: word });
  const te = await end;
  assert.equal(te.reason, "all_found");
  assert.equal(te.word, word);
  assert.equal(te.gained[b.joined.you], points);
  assert.equal(te.gained[a.joined.you], 50 + 50);
  assert.equal(te.scores[a.joined.you], 100);
});

test("devineur sans droit : le dessinateur ne devine pas", async () => {
  const cs = await setup(2);
  const [a, b] = cs;
  const word = await startDrawing(cs);
  a.emit("gri:guess", { text: word });
  await wait(80);
  assert.equal(b.count("gri:correct"), 0);
});

test("reprise : le devineur garde ses points et reçoit les segments, sans le mot", async () => {
  const cs = await setup(3);
  const [a, b, c] = cs;
  const word = await startDrawing(cs);
  a.emit("gri:draw", seg({ id: 7 }));
  a.emit("gri:draw", seg({ id: 8, p: [1, 2, 3, 4, 5, 6] }));
  const corr = once(a, "gri:correct");
  b.emit("gri:guess", { text: word });
  const { points } = await corr;

  const token = b.joined.token;
  const code = b.joined.code;
  b.disconnect();
  await wait(100);
  const b2 = await client();
  const jp = once(b2, "gri:joined");
  b2.emit("gri:resume", { code, token });
  const j = await jp;
  assert.equal(j.resumed, true);
  assert.equal(j.you, b.joined.you);
  assert.equal(j.state.phase, "drawing");
  assert.equal(j.state.scores[b.joined.you], points);
  assert.equal(j.state.youFound, true);
  assert.deepEqual(j.state.segments.map((s) => s.id), [7, 8]);
  assert.equal(j.state.word, undefined);
  assert.equal(JSON.stringify(j.state).includes(word), false);

  // arrivée tardive : voit le dessin, pas le mot
  const d = await client();
  const jd = once(d, "gri:joined");
  d.emit("gri:join", { code, username: "u4" });
  const late = (await jd).state;
  assert.equal(late.segments.length, 2);
  assert.equal(JSON.stringify(late).includes(word), false);

  // le dessinateur repris sur un autre socket retrouve son mot
  const a2 = await client();
  const ja = once(a2, "gri:joined");
  a2.emit("gri:resume", { code, token: a.joined.token });
  const ra = await ja;
  assert.equal(ra.state.word, word);
  assert.ok(c.joined); // c reste connecté
});

test("dessinateur parti : fin de tour immédiate", async () => {
  const cs = await setup(3);
  const [a, b] = cs;
  await startDrawing(cs);
  const end = once(b, "gri:turn_end");
  a.disconnect();
  const te = await end;
  assert.equal(te.reason, "drawer_left");
});

test("order : pas de doublon, et les joueurs sortis sont retirés", async () => {
  const cs = await setup(3);
  await startDrawing(cs);
  const room = game.reg._rooms.get(cs[0].joined.code);
  const before = room.state.order.length;
  const d = await client();
  const jp = once(d, "gri:joined");
  d.emit("gri:join", { code: cs[0].joined.code, username: "late" });
  await jp;
  assert.equal(room.state.order.length, before + 1);
  assert.equal(new Set(room.state.order).size, room.state.order.length);
  d.emit("gri:leave", { forfeit: true });
  await wait(80);
  assert.equal(room.state.order.length, before);
});

test("snapshot lourd : un second snapshot < 2 s pour le même socket est refusé", async () => {
  const cs = await setup(2);
  await startDrawing(cs);
  cs[0].emit("gri:draw", seg());
  await wait(50);
  const d = await client();
  const code = cs[0].joined.code;
  const jp = once(d, "gri:joined");
  d.emit("gri:join", { code, username: "x" });
  await jp;
  const err = once(d, "gri:error");
  d.emit("gri:join", { code, username: "x" });
  assert.equal((await err).code, "rate_limited");
});

test("budget global de valeurs : segments refusés au-delà", async () => {
  const s2 = http.createServer();
  const io2 = new Server(s2);
  const g2 = createGribouille(io2, { record() {} }, { graceMs: 5000, valueBudget: _globalValues() + 8 });
  io2.on("connection", (sk) => {
    g2.register(sk);
    sk.on("disconnect", () => g2.onDisconnect(sk));
  });
  await new Promise((r) => s2.listen(0, r));
  const mk = () => {
    const c = connect(`http://localhost:${s2.address().port}`, { transports: ["websocket"], forceNew: true });
    clients.push(c);
    return new Promise((res) => c.on("connect", () => res(c)));
  };
  const a = await mk();
  const b = await mk();
  const ja = once(a, "gri:joined");
  a.emit("gri:create", { username: "a" });
  const { code } = await ja;
  const jb = once(b, "gri:joined");
  b.emit("gri:join", { code, username: "b" });
  await jb;
  const ch = once(a, "gri:choices");
  a.emit("gri:start", {});
  await ch;
  const w = once(a, "gri:word");
  a.emit("gri:choose", { index: 0 });
  await w;
  await wait(50);
  let got = 0;
  b.on("gri:draw", () => got++);
  for (let i = 1; i <= 4; i++) a.emit("gri:draw", seg({ id: i }));
  await wait(150);
  assert.equal(got, 2); // 4 valeurs par segment, budget de 8
  g2.dispose();
  io2.close();
});

test("reprise : exemptée du délai de snapshot lourd", async () => {
  const cs = await setup(2);
  await startDrawing(cs);
  cs[0].emit("gri:draw", seg());
  await wait(50);
  const { code } = cs[1].joined;
  const token = cs[1].joined.token;
  const d = await client();
  const jp = once(d, "gri:joined");
  d.emit("gri:join", { code, username: "x" });
  await jp; // consomme le délai du socket d
  const b = cs[1].joined;
  d.emit("gri:resume", { code, token: b.token });
  const ev = await Promise.race([once(d, "gri:joined").then(() => "joined"), once(d, "gri:error").then((e) => e.code)]);
  assert.notEqual(ev, "rate_limited");
  assert.ok(token);
});

test("coupure brève pendant turn_end à 2 joueurs : la partie attend la reprise", async () => {
  const s2 = http.createServer();
  const io2 = new Server(s2);
  const g2 = createGribouille(io2, { record() {} }, { graceMs: 3000, timings: { turnEndMs: 200 } });
  io2.on("connection", (sk) => {
    g2.register(sk);
    sk.on("disconnect", () => g2.onDisconnect(sk));
  });
  await new Promise((r) => s2.listen(0, r));
  const mk = () => {
    const c = connect(`http://localhost:${s2.address().port}`, { transports: ["websocket"], forceNew: true });
    clients.push(c);
    return new Promise((res) => c.on("connect", () => res(c)));
  };
  const a = await mk();
  const b = await mk();
  const ja = once(a, "gri:joined");
  a.emit("gri:create", { username: "a" });
  const { code } = await ja;
  const jb = once(b, "gri:joined");
  b.emit("gri:join", { code, username: "b" });
  const bj = await jb;
  const ch = once(a, "gri:choices");
  a.emit("gri:start", {});
  await ch;
  const w = once(a, "gri:word");
  a.emit("gri:choose", { index: 0 });
  const { word } = await w;
  await wait(50);
  const te = once(a, "gri:turn_end");
  b.emit("gri:guess", { text: word });
  await te;
  b.disconnect();
  await wait(400); // au-delà de turnEndMs
  let over = false;
  a.on("gri:game_over", () => (over = true));
  assert.equal(over, false);
  const b2 = await mk();
  const ch2 = once(b2, "gri:choosing");
  b2.emit("gri:resume", { code, token: bj.token });
  await ch2;
  assert.equal(over, false);
  g2.dispose();
  io2.close();
});
