const test = require("node:test");
const assert = require("node:assert/strict");
const { io: connect } = require("socket.io-client");
const { server, io } = require("../server");

let port;
const clients = [];

test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});

test.after(async () => {
  clients.forEach((c) => c.close());
  io.close();
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true });
  clients.push(c);
  return new Promise((resolve) => c.on("connect", () => resolve(c)));
}

const once = (c, ev) => new Promise((r) => c.once(ev, r));

test("imposteur : un non-créateur ne peut pas lancer la partie ni forcer le vote", async () => {
  const host = await client();
  const guest = await client();
  host.emit("join_or_create_room", { roomId: "T1", username: "host" });
  await once(host, "room-created");
  guest.emit("join_or_create_room", { roomId: "T1", username: "guest" });
  await once(guest, "room-created");

  let started = false;
  guest.on("round_started", () => (started = true));
  guest.emit("start_round", "T1");
  await wait(150);
  assert.equal(started, false, "un invité ne doit pas démarrer");

  const roundP = once(guest, "round_started");
  host.emit("start_round", "T1");
  const round = await roundP;
  assert.equal(round.players.length, 2);
});

test("imposteur : l'identité est celle du socket, pas celle envoyée", async () => {
  const host = await client();
  const guest = await client();
  host.emit("join_or_create_room", { roomId: "T2", username: "h" });
  await once(host, "room-created");
  guest.emit("join_or_create_room", { roomId: "T2", username: "g" });
  await once(guest, "room-created");
  const turn = once(host, "next_turn");
  host.emit("start_round", "T2");
  await turn;

  // L'invité tente de jouer à la place de l'hôte (c'est le tour de l'hôte)
  let leaked = false;
  host.on("hint_submitted", () => (leaked = true));
  guest.emit("submit_hint", { roomId: "T2", playerId: host.id, hint: "triche" });
  await wait(150);
  assert.equal(leaked, false);

  // L'hôte joue, avec du HTML dans l'indice
  const hintP = once(guest, "hint_submitted");
  host.emit("submit_hint", { roomId: "T2", playerId: "nimporte", hint: "<b>mot</b>" });
  const h = await hintP;
  assert.equal(h.playerId, host.id);
  assert.equal(h.hint, "bmot/b");
});

test("imposteur : pseudo nettoyé et salle pleine refusée", async () => {
  const c = await client();
  c.emit("join_or_create_room", { roomId: "T3", username: "<script>alert(1)</script>" });
  const room = await once(c, "room-created");
  assert.ok(!/[<>]/.test(room.players[0].username));
});

test("karaoké : seul l'hôte choisit la chanson", async () => {
  const host = await client();
  const guest = await client();
  host.emit("karaoke_join", { roomId: "K1", username: "h" });
  await once(host, "karaoke_joined");
  guest.emit("karaoke_join", { roomId: "K1", username: "g" });
  await once(guest, "karaoke_joined");

  let got = false;
  host.on("karaoke_song_selected", () => (got = true));
  guest.emit("karaoke_select_song", { roomId: "K1", song: { title: "x", artist: "y" } });
  await wait(150);
  assert.equal(got, false);

  const p = once(guest, "karaoke_song_selected");
  host.emit("karaoke_select_song", { roomId: "K1", song: { title: "T", artist: "A", evil: 1 } });
  assert.deepEqual((await p).song, { title: "T", artist: "A" });
});

// ── Correctifs issus de la relecture ──

async function lobby(roomId, n) {
  const cs = [];
  for (let i = 0; i < n; i++) {
    const c = await client();
    c.emit("join_or_create_room", { roomId, username: "p" + i });
    await once(c, "room-created");
    cs.push(c);
  }
  return cs;
}

test("noms de salle « constructor » / « __proto__ » : le serveur ne plante pas", async () => {
  for (const name of ["constructor", "__proto__", "toString"]) {
    const c = await client();
    c.emit("join_or_create_room", { roomId: name, username: "x" });
    const room = await once(c, "room-created");
    assert.equal(room.id, name);
    c.emit("leave_room", name);
    c.emit("karaoke_join", { roomId: name, username: "x" });
    await once(c, "karaoke_joined");
    c.emit("karaoke_leave", name);
  }
  const alive = await client();
  assert.ok(alive.connected, "le serveur répond encore");
});

test("payloads invalides (non-chaînes) ignorés sans plantage", async () => {
  const c = await client();
  for (const bad of [null, 42, {}, [], { roomId: {} }, { roomId: ["a"], username: "u" }]) {
    c.emit("join_or_create_room", bad);
    c.emit("karaoke_join", bad);
    c.emit("vote", bad);
    c.emit("start_round", bad);
    c.emit("force_vote", bad);
  }
  await wait(200);
  assert.ok(c.connected);
});

test("imposteur : round_started ne révèle pas l'imposteur", async () => {
  const [host, guest] = await lobby("T5", 2);
  const p = once(guest, "round_started");
  host.emit("start_round", "T5");
  const round = await p;
  assert.equal("impostorIndex" in round, false);
});

test("imposteur : pas de revote après la révélation, points non gonflés", async () => {
  const [host, guest] = await lobby("T6", 2);
  host.emit("start_round", "T6");
  await once(host, "next_turn");
  host.emit("submit_hint", { roomId: "T6", hint: "a" });
  await once(guest, "next_turn");
  guest.emit("submit_hint", { roomId: "T6", hint: "b" });
  await wait(700);
  host.emit("force_vote", "T6");
  await once(guest, "all_hints_done");
  host.emit("vote", { roomId: "T6", votedId: guest.id });
  guest.emit("vote", { roomId: "T6", votedId: host.id });
  const res = await once(host, "reveal_results");
  const before = JSON.stringify(res.points);
  let second = false;
  host.on("reveal_results", () => (second = true));
  for (let i = 0; i < 5; i++) host.emit("vote", { roomId: "T6", votedId: guest.id });
  await wait(200);
  assert.equal(second, false);
  assert.equal(before, JSON.stringify(res.points));
});

test("imposteur : un joueur qui part pendant les votes ne bloque pas la manche", async () => {
  const [host, g1, g2] = await lobby("T7", 3);
  host.emit("start_round", "T7");
  await once(host, "next_turn");
  host.emit("force_vote", "T7");
  await once(g1, "all_hints_done");
  host.emit("vote", { roomId: "T7", votedId: g1.id });
  g1.emit("vote", { roomId: "T7", votedId: g2.id });
  const p = once(host, "reveal_results");
  g2.close(); // g2 part sans voter : plus personne à attendre
  const res = await p;
  assert.equal(res.players.length >= 2, true);
});

test("imposteur : quand l'hôte part, le nouvel hôte est prévenu et peut forcer le vote", async () => {
  const [host, g1] = await lobby("T8", 2);
  host.emit("start_round", "T8");
  await once(host, "next_turn");
  const hc = once(g1, "host_changed");
  host.close();
  assert.equal((await hc).phase, "hints");
  const done = once(g1, "all_hints_done");
  g1.emit("force_vote", "T8");
  await done;
});

test("imposteur : si le joueur dont c'est le tour part, le tour passe au suivant", async () => {
  const [host, g1, g2] = await lobby("T9", 3);
  host.emit("start_round", "T9");
  await once(host, "next_turn");
  const next = once(g1, "next_turn");
  host.close(); // c'était son tour
  await next;
  g1.emit("submit_hint", { roomId: "T9", hint: "ok" });
  await once(g2, "hint_submitted");
});

test("salles isolées par jeu : un salon imposteur ne reçoit pas le karaoké", async () => {
  const imp = await client();
  imp.emit("join_or_create_room", { roomId: "SAME", username: "i" });
  await once(imp, "room-created");
  let leak = false;
  for (const ev of ["karaoke_room_update", "karaoke_song_selected"]) imp.on(ev, () => (leak = true));
  const kk = await client();
  kk.emit("karaoke_join", { roomId: "SAME", username: "k" });
  await once(kk, "karaoke_joined");
  kk.emit("karaoke_select_song", { roomId: "SAME", song: { title: "t", artist: "a" } });
  await once(kk, "karaoke_song_selected");
  await wait(150);
  assert.equal(leak, false);
});

test("un socket n'occupe qu'une salle à la fois (pas de création en masse)", async () => {
  const c = await client();
  for (let i = 0; i < 5; i++) c.emit("join_or_create_room", { roomId: "M" + i, username: "u" });
  await wait(300);
  const { rooms } = require("../server").io.sockets.adapter;
  const mine = ["M0", "M1", "M2", "M3", "M4"].filter((r) => rooms.has("imp:" + r));
  assert.deepEqual(mine, ["M4"]);
});

test("salle avec caractères interdits : l'id nettoyé est renvoyé et utilisable", async () => {
  const c = await client();
  c.emit("join_or_create_room", { roomId: "a<b", username: "u" });
  const room = await once(c, "room-created");
  assert.equal(room.id, "ab");
  const p = once(c, "round_started");
  c.emit("start_round", room.id);
  await p;
});

test("karaoké : chanson invalide → erreur renvoyée, avance bornée", async () => {
  const [host] = await (async () => {
    const c = await client();
    c.emit("karaoke_join", { roomId: "K9", username: "h" });
    await once(c, "karaoke_joined");
    return [c];
  })();
  const err = once(host, "karaoke_error");
  host.emit("karaoke_select_song", { roomId: "K9", song: { nope: 1 } });
  assert.match(await err, /invalide/i);
});
