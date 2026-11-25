const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { createRoomRegistry } = require("../lib/rooms");
const { createKeyedLimiter } = require("../lib/util");
const { normalizeCode, normalizeWord } = require("../lib/util");

const GRACE = 200;
let server, io, reg, port;
let inGame = false;
const hooks = [];
const clients = [];

test.before(async () => {
  server = http.createServer();
  io = new Server(server);
  reg = createRoomRegistry(io, {
    prefix: "tst",
    maxPlayers: 2,
    graceMs: GRACE,
    inGame: () => inGame,
    snapshotFor: (room, p) => ({ me: p.username }),
    onRemove: (room, p, reason) => hooks.push(["remove", p.username, reason]),
    onHostChange: (room, h) => hooks.push(["host", h.username]),
  });
  io.on("connection", (socket) => {
    reg.register(socket);
    socket.on("disconnect", () => reg.onSocketDisconnect(socket));
  });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});

test.after(() => {
  clients.forEach((c) => c.close());
  reg.dispose();
  io.close();
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (c, ev) => new Promise((r) => c.once(ev, r));

function client() {
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true });
  clients.push(c);
  return new Promise((resolve) => c.on("connect", () => resolve(c)));
}

async function create(c, username = "hote") {
  const p = once(c, "tst:joined");
  c.emit("tst:create", { username });
  return p;
}

async function join(c, code, username) {
  const p = once(c, "tst:joined");
  c.emit("tst:join", { code, username });
  return p;
}

async function errorOf(c, emitEv, payload) {
  const p = once(c, "tst:error");
  c.emit(emitEv, payload);
  return (await p).code;
}

test("normalizeCode et normalizeWord", () => {
  assert.equal(normalizeCode(" bcdf "), "BCDF");
  assert.equal(normalizeCode("b-c d.f"), "BCDF");
  assert.equal(normalizeCode("ABCD"), null); // voyelle
  assert.equal(normalizeCode("BCD"), null);
  assert.equal(normalizeCode(42), null);
  assert.equal(normalizeWord("L'Éléphant"), "elephant");
  assert.equal(normalizeWord("Une  Pomme-de-terre"), "pomme de terre");
  assert.equal(normalizeWord("les"), "les");
});

test("rooms : code invalide, salle inexistante, salle pleine", async () => {
  const a = await client();
  assert.equal(await errorOf(a, "tst:join", { code: "AEIO", username: "x" }), "bad_code");
  assert.equal(await errorOf(a, "tst:join", { code: "BCDF", username: "x" }), "room_not_found");

  const j = await create(a, "a");
  assert.match(j.code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  assert.equal(j.hostId, j.you);
  assert.equal(j.resumed, false);
  assert.deepEqual(j.state, { me: "a" });

  const b = await client();
  await join(b, j.code.toLowerCase(), "b");
  const c = await client();
  assert.equal(await errorOf(c, "tst:join", { code: j.code, username: "c" }), "room_full");
});

test("rooms : reprise avec mauvais jeton, puis reprise valide (pid, pseudo, nouveau jeton)", async () => {
  inGame = true;
  const a = await client();
  const j = await create(a, "alice");
  const b = await client();
  await join(b, j.code, "bob");

  const stranger = await client();
  assert.equal(await errorOf(stranger, "tst:resume", { code: j.code, token: "faux" }), "resume_failed");

  const gone = once(b, "tst:room");
  a.close();
  const room = await gone;
  assert.equal(room.players.find((p) => p.id === j.you).connected, false);
  assert.equal(room.hostId, room.players.find((p) => p.username === "bob").id, "l'hôte passe au joueur connecté");

  const a2 = await client();
  const r = await (async () => {
    const p = once(a2, "tst:joined");
    a2.emit("tst:resume", { code: j.code, token: j.token });
    return p;
  })();
  assert.equal(r.resumed, true);
  assert.equal(r.you, j.you);
  assert.notEqual(r.token, j.token);
  assert.equal(r.players.find((p) => p.id === r.you).username, "alice");
  assert.notEqual(r.hostId, r.you, "pas de bascule d'hôte à la reprise");

  // L'ancien jeton ne fonctionne plus.
  const a3 = await client();
  assert.equal(await errorOf(a3, "tst:resume", { code: j.code, token: j.token }), "resume_failed");
  inGame = false;
});

test("rooms : expiration de la grâce", async () => {
  inGame = true;
  hooks.length = 0;
  const a = await client();
  const j = await create(a, "gone");
  const b = await client();
  await join(b, j.code, "stay");
  a.close();
  await wait(GRACE + 250);
  assert.ok(hooks.some((h) => h[0] === "remove" && h[1] === "gone" && h[2] === "expired"));
  const late = await client();
  assert.equal(await errorOf(late, "tst:resume", { code: j.code, token: j.token }), "resume_failed");
  inGame = false;
});

test("rooms : hors partie, un départ retire immédiatement", async () => {
  inGame = false;
  hooks.length = 0;
  const a = await client();
  const j = await create(a, "h");
  const b = await client();
  await join(b, j.code, "g");
  const upd = once(b, "tst:room");
  a.close();
  const room = await upd;
  assert.equal(room.players.length, 1);
  assert.equal(room.hostId, room.players[0].id);
  assert.ok(hooks.some((h) => h[0] === "remove" && h[1] === "h" && h[2] === "left"));
  assert.ok(hooks.some((h) => h[0] === "host" && h[1] === "g"));
});

test("rooms : la reprise remplace un socket encore connecté (P:replaced)", async () => {
  const a = await client();
  const j = await create(a, "dup");
  const b = await client();
  const replaced = once(a, "tst:replaced");
  const p = once(b, "tst:joined");
  b.emit("tst:resume", { code: j.code, token: j.token });
  const r = await p;
  await replaced;
  assert.equal(r.you, j.you);
  assert.equal(r.resumed, true);
  assert.equal(reg.bySocket(await sockOf(a)), null);
});

function sockOf(c) {
  return io.sockets.sockets.get(c.id);
}

test("rooms : forfait en partie = retrait immédiat, limiteur create/join/resume", async () => {
  inGame = true;
  hooks.length = 0;
  const a = await client();
  const j = await create(a, "quit");
  const b = await client();
  await join(b, j.code, "rest");
  const upd = once(b, "tst:room");
  a.emit("tst:leave", { forfeit: true });
  const room = await upd;
  assert.equal(room.players.length, 1);
  assert.ok(hooks.some((h) => h[0] === "remove" && h[2] === "forfeit"));
  inGame = false;

  const spam = await client();
  let limited = false;
  spam.on("tst:error", (e) => e.code === "rate_limited" && (limited = true));
  for (let i = 0; i < 12; i++) spam.emit("tst:join", { code: "BCDF", username: "s" });
  await wait(200);
  assert.equal(limited, true);
});

// Serveur isolé : deux registres (deux jeux) partageant un limiteur IP ; userId injecté via handshake.auth.
async function isolated(regOpts = {}) {
  const srv = http.createServer();
  const sio = new Server(srv);
  const ipLimiter = createKeyedLimiter({ max: 4, windowMs: 60000 });
  const a = createRoomRegistry(sio, { prefix: "aa", ipLimiter, graceMs: 5000, inGame: () => true, ...regOpts });
  const b = createRoomRegistry(sio, { prefix: "bb", ipLimiter, graceMs: 5000, ...regOpts });
  sio.use((s, next) => {
    s.data.userId = s.handshake.auth.uid || null;
    next();
  });
  sio.on("connection", (s) => {
    a.register(s);
    b.register(s);
    s.on("disconnect", () => {
      a.onSocketDisconnect(s);
      b.onSocketDisconnect(s);
    });
  });
  await new Promise((r) => srv.listen(0, r));
  const open = (uid) => {
    const c = connect(`http://localhost:${srv.address().port}`, { transports: ["websocket"], forceNew: true, auth: { uid } });
    clients.push(c);
    return new Promise((res) => c.on("connect", () => res(c)));
  };
  return { open, close: () => { a.dispose(); b.dispose(); sio.close(); } };
}

test("rooms : le limiteur IP est partagé entre jeux et entre sockets", async () => {
  const env = await isolated();
  const cs = [await env.open(), await env.open(), await env.open()];
  const errs = [];
  cs.forEach((c) => c.onAny((ev, d) => ev.endsWith(":error") && errs.push(d.code)));
  // 4 actions autorisées par IP : 2 sur "aa", 2 sur "bb", via des sockets différents.
  cs[0].emit("aa:join", { code: "BBBB", username: "x" });
  cs[1].emit("aa:join", { code: "BBBB", username: "x" });
  cs[1].emit("bb:join", { code: "BBBB", username: "x" });
  cs[2].emit("bb:join", { code: "BBBB", username: "x" });
  await wait(100);
  assert.deepEqual(errs.filter((c) => c === "rate_limited"), []);
  cs[2].emit("aa:join", { code: "BBBB", username: "x" });
  await wait(100);
  assert.deepEqual(errs.filter((c) => c === "rate_limited"), ["rate_limited"]);
  env.close();
});

test("rooms : plafond de salles vivantes par IP", async () => {
  const env = await isolated({ maxRoomsPerIp: 1 });
  const [c1, c2] = [await env.open(), await env.open()];
  const e = once(c2, "aa:error");
  const j = once(c1, "aa:joined");
  c1.emit("aa:create", { username: "a" });
  await j;
  c2.emit("aa:create", { username: "b" });
  assert.equal((await e).code, "rate_limited");
  env.close();
});

test("rooms : reprise refusée avec un autre compte, ou depuis un invité sur salle de compte", async () => {
  const env = await isolated();
  const owner = await env.open("user-1");
  const j = once(owner, "aa:joined");
  owner.emit("aa:create", { username: "a" });
  const { code, token } = await j;
  owner.disconnect();
  await wait(100);
  for (const uid of ["user-2", undefined]) {
    const c = await env.open(uid);
    const e = once(c, "aa:error");
    c.emit("aa:resume", { code, token });
    assert.equal((await e).code, "resume_failed");
  }
  const ok = await env.open("user-1");
  const r = once(ok, "aa:joined");
  ok.emit("aa:resume", { code, token });
  assert.equal((await r).resumed, true);
  env.close();
});
