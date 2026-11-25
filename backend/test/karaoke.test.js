const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { createKaraoke } = require("../games/karaoke");
const { MAX_KARAOKE_PLAYERS } = require("../config");

let server, io, game, port;
const clients = [];
const recorded = [];

test.before(async () => {
  server = http.createServer();
  io = new Server(server);
  game = createKaraoke(io, { record: (r) => recorded.push(r) }, { graceMs: 5000, ipLimiter: () => true, maxRoomsPerIp: 1000 });
  io.use((socket, next) => {
    if (socket.handshake.auth && typeof socket.handshake.auth.uid === "string") socket.data.userId = socket.handshake.auth.uid;
    next();
  });
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
const once = (c, ev, ms = 2000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout " + ev)), ms);
    c.once(ev, (d) => { clearTimeout(t); res(d); });
  });

function client(uid) {
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true, auth: uid ? { uid } : {} });
  c.log = [];
  c.onAny((ev, data) => c.log.push([ev, data]));
  c.count = (ev) => c.log.filter(([e]) => e === ev).length;
  clients.push(c);
  return new Promise((resolve) => c.on("connect", () => resolve(c)));
}

async function create(name = "hote", uid) {
  const c = await client(uid);
  const p = once(c, "kk:joined");
  c.emit("kk:create", { username: name });
  return { c, j: await p };
}
async function join(code, name, uid) {
  const c = await client(uid);
  const p = once(c, "kk:joined");
  c.emit("kk:join", { code, username: name });
  return { c, j: await p };
}

const SONG = { title: "T", artist: "A", lyrics: "l1\nl2\nl3" };

test("create/join : code de 4 lettres, hôte, liste des joueurs sans socket.id", async () => {
  const h = await create("h");
  assert.match(h.j.code, /^[A-Z]{4}$/);
  assert.equal(h.j.hostId, h.j.you);
  assert.equal(h.j.state.song, null);
  assert.equal(h.j.state.started, false);
  const g = await join(h.j.code.toLowerCase(), "g");
  assert.equal(g.j.players.length, 2);
  assert.notEqual(g.j.you, h.j.you);
  assert.ok(!JSON.stringify([h.j, g.j]).includes(h.c.id));
});

test("code inconnu : room_not_found, code mal formé : bad_code", async () => {
  const c = await client();
  let p = once(c, "kk:error");
  c.emit("kk:join", { code: "ZZZZ", username: "x" });
  assert.equal((await p).code, "room_not_found");
  p = once(c, "kk:error");
  c.emit("kk:join", { code: "1", username: "x" });
  assert.equal((await p).code, "bad_code");
});

test("salle pleine : room_full", async () => {
  const h = await create("h");
  for (let i = 1; i < MAX_KARAOKE_PLAYERS; i++) await join(h.j.code, "p" + i);
  const c = await client();
  const p = once(c, "kk:error");
  c.emit("kk:join", { code: h.j.code, username: "de trop" });
  assert.equal((await p).code, "room_full");
});

test("seul l'hôte choisit, lance et fait avancer", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  g.c.emit("kk:select_song", { song: SONG });
  assert.equal((await once(g.c, "kk:error")).code, "not_host");
  g.c.emit("kk:start", {});
  g.c.emit("kk:advance", { direction: "next" });
  await wait(150);
  assert.equal(h.c.count("kk:song_selected") + h.c.count("kk:started") + h.c.count("kk:line_changed"), 0);

  const sel = once(g.c, "kk:song_selected");
  h.c.emit("kk:select_song", { song: { ...SONG, evil: 1 } });
  assert.deepEqual((await sel).song, SONG);
  const st = once(g.c, "kk:started");
  h.c.emit("kk:start", {});
  assert.deepEqual(await st, { currentLine: 0 });
  const ln = once(g.c, "kk:line_changed");
  h.c.emit("kk:advance", { direction: "next" });
  assert.deepEqual(await ln, { currentLine: 1 });
});

test("chanson invalide : erreur renvoyée à l'hôte", async () => {
  const h = await create("h");
  h.c.emit("kk:select_song", { song: { nope: 1 } });
  assert.match((await once(h.c, "kk:error")).message, /invalide/i);
});

test("reprise en pleine chanson : snapshot et même pid", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  h.c.emit("kk:select_song", { song: SONG });
  await once(g.c, "kk:song_selected");
  h.c.emit("kk:start", {});
  await once(g.c, "kk:started");
  g.c.emit("kk:leave", {}); // départ non forfait en pleine chanson : période de grâce
  for (let i = 0; i < 2; i++) { const l = once(g.c, "kk:line_changed", 300).catch(() => null); h.c.emit("kk:advance", { direction: "next" }); await l; }
  g.c.close();
  await wait(100);
  const g2 = await client();
  const p = once(g2, "kk:joined");
  g2.c = g2;
  g2.emit("kk:resume", { code: h.j.code, token: g.j.token });
  const j = await p;
  assert.equal(j.you, g.j.you);
  assert.equal(j.resumed, true);
  assert.equal(j.state.started, true);
  assert.equal(j.state.currentLine, 2);
  assert.deepEqual(j.state.song, SONG);
  assert.ok(Math.abs(j.state.serverTime - Date.now()) < 5000);
  assert.equal(j.players.length, 2);
});

test("passage d'hôte : l'hôte part, un autre devient hôte et pilote", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  const room = once(g.c, "kk:room");
  h.c.emit("kk:leave", {});
  const r = await room;
  assert.equal(r.hostId, g.j.you);
  assert.equal(r.players.length, 1);
  const sel = once(g.c, "kk:song_selected");
  g.c.emit("kk:select_song", { song: SONG });
  assert.equal((await sel).song.title, "T");
});

test("participation enregistrée une fois par minute, payloads invalides ignorés", async () => {
  const c = await client();
  for (const bad of [null, 42, [], "x", { code: {} }, { song: 3 }]) {
    for (const ev of ["kk:create", "kk:join", "kk:resume", "kk:select_song", "kk:start", "kk:advance", "kk:leave"]) c.emit(ev, bad);
  }
  await wait(200);
  assert.ok(c.connected);
});

test("participation : compte + invité = rien, 2 comptes distincts = enregistré", async () => {
  recorded.length = 0;
  const h = await create("h", "u-a");
  await join(h.j.code, "invite");
  h.c.emit("kk:select_song", { song: SONG });
  await once(h.c, "kk:song_selected");
  h.c.emit("kk:start", {});
  await once(h.c, "kk:started");
  assert.equal(recorded.length, 0);

  const h2 = await create("h2", "u-b");
  await join(h2.j.code, "g2", "u-c");
  h2.c.emit("kk:select_song", { song: SONG });
  await once(h2.c, "kk:song_selected");
  h2.c.emit("kk:start", {});
  await once(h2.c, "kk:started");
  assert.deepEqual(recorded.map((r) => r.userId).sort(), ["u-b", "u-c"]);
});

test("select_song : limité par salle (rafale 2)", async () => {
  const h = await create("h");
  for (let i = 0; i < 4; i++) h.c.emit("kk:select_song", { song: SONG });
  await wait(300);
  assert.equal(h.c.count("kk:song_selected"), 2);
  assert.equal(h.c.log.filter(([e, d]) => e === "kk:error" && d.code === "rate_limited").length, 2);
});

test("select_song : paroles tronquées, contrôles retirés, durée/année bornées, cover http refusée", async () => {
  const h = await create("h");
  const song = {
    ...SONG,
    lyrics: "a\u0000b\u0007\nc\td" + "x".repeat(25000),
    syncedLyrics: "y".repeat(40000),
    duration: 99999,
    year: 1500,
    cover: "http://e-cdns-images.dzcdn.net/a.jpg",
  };
  let p = once(h.c, "kk:song_selected");
  h.c.emit("kk:select_song", { song });
  let s = (await p).song;
  assert.ok(s.lyrics.length <= 20000 && s.lyrics.length > 19900);
  assert.ok(s.lyrics.startsWith("ab\nc\td"));
  assert.equal(s.syncedLyrics.length, 30000);
  assert.equal(s.duration, 3600);
  assert.equal(s.year, 1900);
  assert.equal(s.cover, undefined);
  p = once(h.c, "kk:song_selected");
  h.c.emit("kk:select_song", { song: { ...SONG, cover: "https://e-cdns-images.dzcdn.net/a.jpg" } });
  assert.equal((await p).song.cover, "https://e-cdns-images.dzcdn.net/a.jpg");
});
