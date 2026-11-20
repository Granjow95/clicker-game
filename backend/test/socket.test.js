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
