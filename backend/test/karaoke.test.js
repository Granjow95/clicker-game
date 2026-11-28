const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { createKaraoke, sanitizeSong, clockPos } = require("../games/karaoke");
const { MAX_KARAOKE_PLAYERS } = require("../config");

let server, io, game, port;
const clients = [];
const recorded = [];
const queries = [];
let searchDelay = 0;

test.before(async () => {
  server = http.createServer();
  io = new Server(server);
  game = createKaraoke(io, { record: (r) => recorded.push(r) }, {
    graceMs: 5000, ipLimiter: () => true, maxRoomsPerIp: 1000, leadMs: 100, endTailMs: 300, controlIntervalMs: 30,
    searchVideos: async (q) => {
      queries.push(q);
      if (searchDelay) await wait(searchDelay);
      if (q.includes("Saturee")) return null; // budget de recherche épuisé
      return q.includes("Introuvable") ? [] : ["aaaaaaaaaaa", "bad id", "bbbbbbbbbbb"];
    },
  });
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

const LRC = "[00:01.00]un\n[00:03.00]deux\n[00:05.00]trois\n[00:07.00]quatre\n[00:09.00]cinq";
const SONG = { title: "T", artist: "A", lyrics: "un\ndeux\ntrois\nquatre\ncinq", syncedLyrics: LRC };
const LINES = [1000, 3000, 5000, 7000, 9000];

async function selected(h, extra = {}, others = []) {
  const ps = [h.c, ...others].map((c) => once(c, "kk:song_selected"));
  h.c.emit("kk:select_song", { song: SONG, ...extra });
  return (await Promise.all(ps))[0];
}
async function started(h, others = []) {
  const ps = [h.c, ...others].map((c) => once(c, "kk:started"));
  h.c.emit("kk:start", {});
  return (await Promise.all(ps))[0];
}
const nextClock = (c, ms) => once(c, "kk:clock", ms);

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

test("select_song : lignes datées, vidéos cherchées par le serveur, paroles brutes non rediffusées", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  queries.length = 0;
  const s = await selected(h, { song: { ...SONG, evil: 1, videoIds: ["zzzzzzzzzzz"] }, mode: "instrumental" }, [g.c]);
  assert.deepEqual(s.song, { title: "T", artist: "A" });
  assert.equal(s.mode, "instrumental");
  assert.deepEqual(s.lines.map((l) => l.t), LINES);
  assert.deepEqual(s.lines.map((l) => l.text), ["un", "deux", "trois", "quatre", "cinq"]);
  assert.deepEqual(s.videoIds, ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  assert.equal(s.endMs, 9300);
  assert.deepEqual(queries, ["A T instrumental"]);
  assert.ok(!JSON.stringify(s).includes("syncedLyrics") && !("lyrics" in s.song));
  queries.length = 0;
  await selected(h);
  assert.deepEqual(queries, ["A T audio"]);
});

test("select_song : mode invalide, pas de LRC (no_sync), chanson invalide", async () => {
  const h = await create("h");
  h.c.emit("kk:select_song", { song: SONG, mode: "karaoke" });
  assert.equal((await once(h.c, "kk:error")).message, "Mode invalide.");
  await wait(1100); // limiteur de sélection
  h.c.emit("kk:select_song", { song: { title: "T", artist: "A", lyrics: "a\nb" } });
  assert.equal((await once(h.c, "kk:error")).code, "no_sync");
  await wait(1100);
  h.c.emit("kk:select_song", { song: { nope: 1 } });
  assert.match((await once(h.c, "kk:error")).message, /invalide/i);
});

test("select_song : seule la dernière de deux sélections concurrentes s'applique", async () => {
  const h = await create("h");
  searchDelay = 150;
  try {
    h.c.emit("kk:select_song", { song: { ...SONG, title: "Premier" } });
    await wait(20);
    h.c.emit("kk:select_song", { song: { ...SONG, title: "Second" } });
    await wait(400);
  } finally { searchDelay = 0; }
  const sel = h.c.log.filter(([e]) => e === "kk:song_selected");
  assert.equal(sel.length, 1);
  assert.equal(sel[0][1].song.title, "Second");
});

test("seuls l'hôte choisit et pilote ; invité → not_host", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  g.c.emit("kk:select_song", { song: SONG });
  assert.equal((await once(g.c, "kk:error")).code, "not_host");
  for (const ev of ["kk:start", "kk:pause", "kk:play", "kk:restart", "kk:stop"]) g.c.emit(ev, {});
  g.c.emit("kk:advance", { direction: "next" });
  await wait(150);
  assert.equal(h.c.count("kk:song_selected") + h.c.count("kk:started") + h.c.count("kk:clock"), 0);
  assert.equal(g.c.log.filter(([e, d]) => e === "kk:error" && d.code === "not_host").length, 7);
});

test("start / pause / play / restart : horloge partagée, seq croissant", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  await selected(h, {}, [g.c]);
  const s = await started(h, [g.c]);
  assert.equal(s.clock.playing, true);
  assert.equal(s.clock.baseMs, 0);
  assert.ok(s.clock.baseAt - s.serverNow >= 50 && s.clock.baseAt - s.serverNow <= 150);
  await wait(300);
  let p = nextClock(g.c);
  h.c.emit("kk:pause", {});
  const paused = (await p).clock;
  assert.equal(paused.playing, false);
  assert.ok(paused.baseMs >= 100 && paused.baseMs < 400, String(paused.baseMs));
  assert.ok(paused.seq > s.clock.seq);
  h.c.emit("kk:pause", {}); // déjà en pause : ignoré
  await wait(80);
  assert.equal(g.c.count("kk:clock"), 1);
  p = nextClock(g.c);
  h.c.emit("kk:play", {});
  const played = (await p).clock;
  assert.equal(played.playing, true);
  assert.equal(played.baseMs, paused.baseMs);
  assert.equal(clockPos(played, played.baseAt - 10), paused.baseMs); // figée jusqu'au top départ
  p = once(g.c, "kk:started");
  h.c.emit("kk:restart", {});
  const r = (await p).clock;
  assert.equal(r.baseMs, 0);
  assert.ok(r.seq > played.seq);
});

test("advance : saute à l'horaire de la ligne, borné aux deux extrémités", async () => {
  const h = await create("h");
  await selected(h);
  await started(h);
  let p = nextClock(h.c);
  h.c.emit("kk:pause", {});
  await p;
  const seen = [];
  for (let i = 0; i < 5; i++) {
    p = nextClock(h.c);
    h.c.emit("kk:advance", { direction: "next" });
    seen.push((await p).clock.baseMs);
    await wait(110); // limiteur de contrôles
  }
  assert.deepEqual(seen, LINES);
  h.c.emit("kk:advance", { direction: "next" }); // déjà sur la dernière ligne
  h.c.emit("kk:advance", { direction: "sideways" });
  await wait(120);
  assert.equal(h.c.count("kk:clock"), 6);
  p = nextClock(h.c);
  h.c.emit("kk:advance", { direction: "prev" });
  assert.equal((await p).clock.baseMs, 7000);
  for (let i = 0; i < 4; i++) {
    await wait(110);
    p = nextClock(h.c);
    h.c.emit("kk:advance", { direction: "prev" });
    await p;
  }
  assert.equal(h.c.log.filter(([e]) => e === "kk:clock").pop()[1].clock.baseMs, 0); // intro
  await wait(110);
  h.c.emit("kk:advance", { direction: "prev" }); // déjà au début
  await wait(120);
  assert.equal(h.c.count("kk:clock"), 11);
});

test("fin de chanson décidée par le serveur ; la pause l'annule", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  await selected(h, {}, [g.c]);
  await started(h, [g.c]);
  for (let i = 0; i < 5; i++) { const p = nextClock(h.c); h.c.emit("kk:advance", { direction: "next" }); await p; await wait(110); }
  // Sur la dernière ligne (9 s) en lecture : fin à 9,3 s, soit ~0,3 s + 0,5 s de délai de saut.
  let p = nextClock(h.c);
  h.c.emit("kk:pause", {});
  await p;
  await wait(1000);
  assert.equal(g.c.count("kk:ended"), 0);
  p = once(g.c, "kk:ended", 3000);
  h.c.emit("kk:play", {});
  const e = await p;
  assert.equal(e.clock.playing, false);
  assert.equal(e.clock.baseMs, 9300);
  h.c.emit("kk:advance", { direction: "prev" }); // terminée : ignoré
  await wait(120);
  assert.equal(g.c.log.filter(([ev]) => ev === "kk:clock").length, 7);
  // Après la fin, la salle n'est plus « en partie » : un départ n'utilise pas la période de grâce.
  const room = once(h.c, "kk:room");
  g.c.emit("kk:leave", {});
  assert.equal((await room).players.length, 1);
});

test("advance : la ligne vue par l'hôte (from) est retenue à ±1 près", async () => {
  const h = await create("h");
  await selected(h);
  await started(h);
  let p = nextClock(h.c);
  h.c.emit("kk:pause", {});
  await p;
  await wait(40);
  p = nextClock(h.c);
  h.c.emit("kk:advance", { direction: "next", from: 0 }); // horloge à 0 (intro, ligne -1), l'hôte voit déjà la ligne 0
  assert.equal((await p).clock.baseMs, 3000);
  await wait(40);
  p = nextClock(h.c);
  h.c.emit("kk:advance", { direction: "next", from: 4 }); // écart de 3 : ignoré, on part de la ligne réelle (1)
  assert.equal((await p).clock.baseMs, 5000);
});

test("start / stop limités : l'hôte est prévenu", async () => {
  const h = await create("h");
  await selected(h);
  for (let i = 0; i < 6; i++) h.c.emit("kk:restart", {});
  await wait(100);
  assert.equal(h.c.count("kk:started"), 4);
  assert.equal(h.c.log.filter(([e, d]) => e === "kk:error" && d.code === "rate_limited").length, 2);
});

test("contrôles de lecture : rafale de 4 par salle, excès ignorés sans message", async () => {
  const h = await create("h");
  await selected(h);
  await started(h);
  await wait(200);
  for (let i = 0; i < 10; i++) h.c.emit("kk:advance", { direction: i % 2 ? "prev" : "next" });
  await wait(100);
  assert.equal(h.c.count("kk:clock"), 4);
  assert.equal(h.c.count("kk:error"), 0);
});

test("stop : retour au salon, horloge effacée", async () => {
  const h = await create("h");
  await selected(h);
  await started(h);
  const p = once(h.c, "kk:stopped");
  h.c.emit("kk:stop", {});
  await p;
  const g = await join(h.j.code, "g");
  assert.equal(g.j.state.started, false);
  assert.equal(g.j.state.clock, null);
  assert.equal(g.j.state.song.title, "T"); // la chanson reste choisie
});

test("changer de musique en pleine chanson : la nouvelle remplace l'ancienne, retour au salon", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  await selected(h, {}, [g.c]);
  await started(h, [g.c]);
  await wait(1100); // limiteur de sélection
  const p = once(g.c, "kk:song_selected");
  h.c.emit("kk:select_song", { song: { ...SONG, title: "Nouvelle" }, mode: "instrumental" });
  const s = await p;
  assert.equal(s.song.title, "Nouvelle");
  assert.equal(s.mode, "instrumental");
  const late = await join(h.j.code, "tard");
  assert.equal(late.j.state.started, false);
  assert.equal(late.j.state.clock, null);
  assert.equal(late.j.state.song.title, "Nouvelle");
  await started(h, [g.c]); // l'hôte relance la nouvelle chanson
});

test("recherche saturée ou sans musique en pleine chanson : refus, la chanson en cours continue", async () => {
  const h = await create("h");
  await selected(h);
  await started(h);
  await wait(1100);
  h.c.emit("kk:select_song", { song: { ...SONG, title: "Saturee" } });
  assert.equal((await once(h.c, "kk:error")).code, "search_unavailable");
  await wait(1100);
  h.c.emit("kk:select_song", { song: { ...SONG, title: "Introuvable" } }); // mode complet, aucune vidéo
  assert.equal((await once(h.c, "kk:error")).code, "no_audio");
  const late = await join(h.j.code, "tard");
  assert.equal(late.j.state.started, true);
  assert.equal(late.j.state.song.title, "T");
});

test("instrumentale introuvable : refus, la chanson en cours continue", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  await selected(h, {}, [g.c]);
  await started(h, [g.c]);
  await wait(1100);
  h.c.emit("kk:select_song", { song: { ...SONG, title: "Introuvable" }, mode: "instrumental" });
  assert.equal((await once(h.c, "kk:error")).code, "no_instrumental");
  const late = await join(h.j.code, "tard");
  assert.equal(late.j.state.started, true);
  assert.equal(late.j.state.song.title, "T");
  assert.equal(g.c.count("kk:song_selected"), 1);
});

test("kk:time : accusé avec l'heure serveur, limité par socket", async () => {
  const c = await client();
  const r = await new Promise((res) => c.emit("kk:time", { c: 123 }, res));
  assert.equal(r.c, 123);
  assert.ok(Math.abs(r.s - Date.now()) < 1000);
  c.emit("kk:time", { c: 1 }); // sans accusé : ignoré
  let answered = 0;
  await Promise.all(Array.from({ length: 40 }, () => new Promise((res) => {
    c.emit("kk:time", { c: "x" }, (d) => { answered++; assert.equal(d.c, 0); res(); });
    setTimeout(res, 300);
  })));
  assert.equal(answered, 29);
});

test("reprise et arrivée en pleine chanson : horloge, lignes et vidéos dans le snapshot", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  await selected(h, {}, [g.c]);
  await started(h, [g.c]);
  g.c.emit("kk:leave", {}); // départ non forfait en pleine chanson : période de grâce
  await wait(50);
  const p = nextClock(h.c);
  h.c.emit("kk:advance", { direction: "next" });
  const clock = (await p).clock;
  g.c.close();
  await wait(100);
  const g2 = await client();
  const pj = once(g2, "kk:joined");
  g2.emit("kk:resume", { code: h.j.code, token: g.j.token });
  const j = await pj;
  assert.equal(j.you, g.j.you);
  assert.equal(j.resumed, true);
  assert.equal(j.state.started, true);
  assert.equal(j.state.ended, false);
  assert.deepEqual(j.state.clock, clock);
  assert.deepEqual(j.state.lines.map((l) => l.t), LINES);
  assert.deepEqual(j.state.videoIds, ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  assert.equal(j.state.mode, "full");
  assert.ok(Math.abs(j.state.serverNow - Date.now()) < 5000);
  const late = await join(h.j.code, "tard");
  assert.deepEqual(late.j.state.clock, clock);
});

test("passage d'hôte en pleine lecture : le nouvel hôte pilote la même horloge", async () => {
  const h = await create("h");
  const g = await join(h.j.code, "g");
  await selected(h, {}, [g.c]);
  const s = await started(h, [g.c]);
  const room = once(g.c, "kk:room");
  h.c.emit("kk:leave", { forfeit: true });
  assert.equal((await room).hostId, g.j.you);
  const p = nextClock(g.c);
  g.c.emit("kk:pause", {});
  const c = (await p).clock;
  assert.equal(c.playing, false);
  assert.ok(c.seq > s.clock.seq);
});

test("payloads invalides ignorés", async () => {
  const c = await client();
  for (const bad of [null, 42, [], "x", { code: {} }, { song: 3 }, { direction: {} }]) {
    for (const ev of ["kk:create", "kk:join", "kk:resume", "kk:select_song", "kk:start", "kk:advance", "kk:pause", "kk:play", "kk:restart", "kk:stop", "kk:time", "kk:leave"]) c.emit(ev, bad);
  }
  await wait(200);
  assert.ok(c.connected);
});

test("participation : compte + invité = rien, 2 comptes distincts = enregistré", async () => {
  recorded.length = 0;
  const h = await create("h", "u-a");
  await join(h.j.code, "invite");
  await selected(h);
  await started(h);
  assert.equal(recorded.length, 0);

  const h2 = await create("h2", "u-b");
  await join(h2.j.code, "g2", "u-c");
  await selected(h2);
  await started(h2);
  assert.deepEqual(recorded.map((r) => r.userId).sort(), ["u-b", "u-c"]);
});

test("select_song : limité par salle (rafale 2)", async () => {
  const h = await create("h");
  for (let i = 0; i < 4; i++) h.c.emit("kk:select_song", { song: { ...SONG, title: "S" + i } });
  await wait(300);
  assert.equal(h.c.log.filter(([e, d]) => e === "kk:error" && d.code === "rate_limited").length, 2);
  assert.equal(h.c.count("kk:song_selected"), 1); // la seconde sélection acceptée remplace la première
});

test("sanitizeSong : paroles tronquées, contrôles retirés, durée/année bornées, cover http refusée", () => {
  const s = sanitizeSong({
    ...SONG,
    lyrics: "a\u0000b\u0007\nc\td" + "x".repeat(25000),
    syncedLyrics: "y".repeat(40000),
    duration: 99999,
    year: 1500,
    cover: "http://e-cdns-images.dzcdn.net/a.jpg",
  });
  assert.ok(s.lyrics.length <= 20000 && s.lyrics.length > 19900);
  assert.ok(s.lyrics.startsWith("ab\nc\td"));
  assert.equal(s.syncedLyrics.length, 30000);
  assert.equal(s.duration, 3600);
  assert.equal(s.year, 1900);
  assert.equal(s.cover, undefined);
  assert.equal(sanitizeSong({ ...SONG, cover: "https://e-cdns-images.dzcdn.net/a.jpg" }).cover, "https://e-cdns-images.dzcdn.net/a.jpg");
});
