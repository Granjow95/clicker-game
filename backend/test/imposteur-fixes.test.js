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
test.after(() => {
  clients.forEach((c) => c.close());
  io.close();
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (c, ev) => new Promise((r) => c.once(ev, r));
function client() {
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true });
  clients.push(c);
  return new Promise((resolve) => c.on("connect", () => resolve(c)));
}
async function join(c, roomId, name) {
  c.emit("join_or_create_room", { roomId, username: name });
  await once(c, "room-created");
}

test("next_turn envoie l'index du joueur dans la liste courante après un départ", async () => {
  const [a, b, c] = [await client(), await client(), await client()];
  await join(a, "FX1", "A");
  await join(b, "FX1", "B");
  await join(c, "FX1", "C");
  const t0 = once(a, "next_turn");
  a.emit("start_round", "FX1");
  assert.equal(await t0, 0);

  const tB = once(b, "next_turn");
  a.emit("submit_hint", { roomId: "FX1", hint: "un" });
  assert.equal(await tB, 1);
  a.emit("leave_room");
  await wait(100);

  const tC = once(c, "next_turn");
  b.emit("submit_hint", { roomId: "FX1", hint: "deux" });
  assert.equal(await tC, 1, "C est à l'index 1 de [B, C]");
});

test("join refusé pendant une manche en cours", async () => {
  const a = await client();
  const b = await client();
  await join(a, "FX2", "A");
  a.emit("start_round", "FX2");
  await once(a, "next_turn");
  const err = once(b, "error_message");
  b.emit("join_or_create_room", { roomId: "FX2", username: "B" });
  assert.match(await err, /manche est en cours/);
});

test("vote pour soi-même rejeté, start_round refusé en cours de manche", async () => {
  const a = await client();
  const b = await client();
  await join(a, "FX3", "A");
  await join(b, "FX3", "B");
  a.emit("start_round", "FX3");
  await once(a, "next_turn");

  let restarted = false;
  a.on("round_started", () => (restarted = true));
  a.emit("start_round", "FX3");
  await wait(150);
  assert.equal(restarted, false);

  a.emit("force_vote", "FX3");
  await once(b, "all_hints_done");
  let revealed = false;
  a.on("reveal_results", () => (revealed = true));
  a.emit("vote", { roomId: "FX3", votedId: a.id });
  b.emit("vote", { roomId: "FX3", votedId: a.id });
  await wait(200);
  assert.equal(revealed, false, "le vote de A pour lui-même ne compte pas");
  a.emit("vote", { roomId: "FX3", votedId: b.id });
  await once(a, "reveal_results");
});

test("force_reveal : hôte seulement, phase voting, finalise avec les votes reçus", async () => {
  const [a, b, c] = [await client(), await client(), await client()];
  await join(a, "FX4", "A");
  await join(b, "FX4", "B");
  await join(c, "FX4", "C");
  a.emit("start_round", "FX4");
  await once(a, "next_turn");
  let early = false;
  a.on("reveal_results", () => (early = true));
  a.emit("force_reveal", "FX4"); // phase hints : refusé
  await wait(100);
  assert.equal(early, false);
  a.emit("force_vote", "FX4");
  await once(b, "all_hints_done");
  b.emit("vote", { roomId: "FX4", votedId: a.id });
  b.emit("force_reveal", "FX4"); // non hôte : refusé
  await wait(150);
  assert.equal(early, false);
  const res = once(c, "reveal_results");
  a.emit("force_reveal", "FX4");
  const r = await res;
  assert.deepEqual(r.votes, { [b.id]: a.id });
});

test("le départ du dernier votant restant finalise la manche", async () => {
  const a = await client();
  const b = await client();
  await join(a, "FX5", "A");
  await join(b, "FX5", "B");
  a.emit("start_round", "FX5");
  await once(a, "next_turn");
  a.emit("force_vote", "FX5");
  await once(b, "all_hints_done");
  const res = once(a, "reveal_results");
  b.emit("leave_room");
  await res;
});

test("start_round en phase revealed refusé en pleine partie, accepté après game_over", async () => {
  const a = await client();
  const b = await client();
  await join(a, "FX6", "A");
  await join(b, "FX6", "B");
  a.emit("update_lobby_options", { roomId: "FX6", options: { rounds: 1, timer: 60 } });
  a.emit("start_round", "FX6");
  await once(a, "next_turn");
  a.emit("force_vote", "FX6");
  await once(b, "all_hints_done");
  a.emit("vote", { roomId: "FX6", votedId: b.id });
  b.emit("vote", { roomId: "FX6", votedId: a.id });
  await once(a, "reveal_results");
  let restarted = false;
  a.on("round_started", () => (restarted = true));
  a.emit("start_round", "FX6");
  await wait(150);
  assert.equal(restarted, false);
  const over = once(a, "game_over");
  a.emit("start_next_round", "FX6");
  await over;
  const again = once(a, "round_started");
  a.emit("start_round", "FX6");
  await again;
});

test("force_reveal sans aucun vote ignoré", async () => {
  const [a, b, c] = [await client(), await client(), await client()];
  await join(a, "FX7", "A");
  await join(b, "FX7", "B");
  await join(c, "FX7", "C");
  a.emit("start_round", "FX7");
  await once(a, "next_turn");
  a.emit("force_vote", "FX7");
  await once(b, "all_hints_done");
  let revealed = false;
  a.on("reveal_results", () => (revealed = true));
  a.emit("force_reveal", "FX7");
  await wait(150);
  assert.equal(revealed, false);
  b.emit("vote", { roomId: "FX7", votedId: a.id });
  await wait(50);
  const res = once(a, "reveal_results");
  a.emit("force_reveal", "FX7");
  await res;
});

test("start_next_round ignoré après game_over", async () => {
  const a = await client();
  const b = await client();
  await join(a, "FX8", "A");
  await join(b, "FX8", "B");
  a.emit("update_lobby_options", { roomId: "FX8", options: { rounds: 1, timer: 60 } });
  a.emit("start_round", "FX8");
  await once(a, "next_turn");
  a.emit("force_vote", "FX8");
  await once(b, "all_hints_done");
  a.emit("vote", { roomId: "FX8", votedId: b.id });
  b.emit("vote", { roomId: "FX8", votedId: a.id });
  await once(a, "reveal_results");
  const over = once(a, "game_over");
  a.emit("start_next_round", "FX8");
  await over;
  let again = false;
  a.on("game_over", () => (again = true));
  a.on("round_started", () => (again = true));
  a.emit("start_next_round", "FX8");
  await wait(150);
  assert.equal(again, false);
});

test("update_lobby_options refusé en pleine partie", async () => {
  const a = await client();
  const b = await client();
  await join(a, "FX9", "A");
  await join(b, "FX9", "B");
  a.emit("start_round", "FX9");
  await once(a, "next_turn");
  let updated = false;
  b.on("lobby_options_updated", () => (updated = true));
  a.emit("update_lobby_options", { roomId: "FX9", options: { rounds: 9, timer: 60 } });
  await wait(150);
  assert.equal(updated, false);
});
