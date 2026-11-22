const test = require("node:test");
const assert = require("node:assert/strict");
const { io: connect } = require("socket.io-client");
const { setSupabase } = require("../lib/supabase");
const { createResults } = require("../lib/results");
const { server, io, resetHealthCache } = require("../server");

const U1 = "aaaaaaaa-2222-3333-4444-555555555551";
const U2 = "aaaaaaaa-2222-3333-4444-555555555552";
const U3 = "aaaaaaaa-2222-3333-4444-555555555553";
const TOKENS = { t1: U1, t2: U2, t3: U3 };
let inserts = [];
let deleted = [];
let healthCalls = 0;
const fake = {
  auth: {
    getUser: async (t) => (TOKENS[t] ? { data: { user: { id: TOKENS[t] } }, error: null } : { data: {}, error: { message: "bad" } }),
    admin: { deleteUser: async (id) => (deleted.push(id), { error: null }) },
  },
  from: () => ({
    insert: async (row) => (inserts.push(row), { error: null }),
    select: () => ({ limit: () => ({ abortSignal: async () => (healthCalls++, { error: null }) }) }),
  }),
};

let port;
const clients = [];
test.before(async () => {
  setSupabase(fake);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
test.after(() => { clients.forEach((c) => c.close()); io.close(); setSupabase(undefined); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (c, ev) => new Promise((r) => c.once(ev, r));
function client(token) {
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true, auth: token ? { token } : {} });
  clients.push(c);
  return new Promise((r) => c.on("connect", () => r(c)));
}
async function room(roomId, tokens) {
  const cs = [];
  for (const t of tokens) {
    const c = await client(t);
    c.emit("join_or_create_room", { roomId, username: "p" + cs.length });
    await once(c, "room-created");
    cs.push(c);
  }
  return cs;
}
async function playRound(roomId, cs) {
  const [host, ...rest] = cs;
  host.emit("start_round", roomId);
  await once(host, "next_turn");
  host.emit("force_vote", roomId);
  await once(rest[0], "all_hints_done");
  const p = once(host, "reveal_results");
  cs.forEach((c) => c.emit("vote", { roomId, votedId: c === host ? rest[0].id : host.id }));
  await p;
  await wait(100);
}

test("results.record : plafond de score et limite par userId", () => {
  const rows = [];
  const r = createResults(() => ({ from: () => ({ insert: async (row) => (rows.push(row), { error: null }) }) }));
  r.record({ userId: U3, game: "karaoke", score: 99999 });
  assert.equal(rows[0].score, 1000);
  for (let i = 0; i < 50; i++) r.record({ userId: U3, game: "karaoke", score: 1 });
  assert.equal(rows.length, 30);
});

test("imposteur : un compte avec 2 sockets ne compte qu'une fois, <3 identités = rien", async () => {
  inserts = [];
  const cs = await room("S1", ["t1", "t1", undefined]); // 2 identités distinctes
  await playRound("S1", cs);
  assert.equal(inserts.length, 0);
  const cs2 = await room("S2", ["t2", "t2", undefined, undefined]); // 3 identités, un compte doublé
  await playRound("S2", cs2);
  assert.equal(inserts.filter((r) => r.game === "imposteur").length, 1);
});

test("lyrics_result : limite par compte sur plusieurs sockets, score <= 1000", async () => {
  inserts = [];
  const cs = [await client("t3"), await client("t3"), await client("t3")];
  cs.forEach((c) => { for (let i = 0; i < 3; i++) c.emit("lyrics_result", { score: 5e6, rounds: 1 }); });
  await wait(300);
  assert.equal(inserts.length, 3);
  assert.ok(inserts.every((r) => r.score === 1000));
});

test("account_delete : userId remis à null sur tous les sockets du compte", async () => {
  deleted = [];
  inserts = [];
  const a = await client("t1");
  const b = await client("t1");
  a.emit("account_delete");
  await once(a, "account_deleted");
  await wait(50);
  assert.deepEqual(deleted, [U1]);
  b.emit("lyrics_result", { score: 5, rounds: 1 });
  await wait(150);
  assert.equal(inserts.length, 0);
});

test("/health : cache 30 s, pas de mot not_configured", async () => {
  resetHealthCache();
  healthCalls = 0;
  const url = `http://localhost:${port}/health`;
  await fetch(url); await fetch(url);
  assert.equal(healthCalls, 1);
  resetHealthCache();
  setSupabase(null);
  const res = await fetch(url);
  assert.equal(res.status, 503);
  assert.equal(await res.text(), '{"ok":false}');
  resetHealthCache();
  setSupabase(fake);
});
