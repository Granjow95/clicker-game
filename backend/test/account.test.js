const test = require("node:test");
const assert = require("node:assert/strict");
const { io: connect } = require("socket.io-client");
const { setSupabase } = require("../lib/supabase");
const { server, io, resetHealthCache } = require("../server");

const UID = "11111111-2222-3333-4444-555555555555";
const inserts = [];
const deleted = [];
const fake = {
  auth: {
    getUser: async (t) => (t === "good" ? { data: { user: { id: UID } }, error: null } : { data: {}, error: { message: "bad" } }),
    admin: { deleteUser: async (id) => (deleted.push(id), { error: null }) },
  },
  from: (table) => ({
    insert: async (row) => (inserts.push({ table, row }), { error: null }),
    select: () => ({ limit: () => ({ abortSignal: async () => ({ error: null }) }) }),
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
function client(token) {
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true, auth: token === undefined ? {} : { token } });
  clients.push(c);
  const errs = [];
  c.on("auth_error", () => errs.push(1));
  return new Promise((r) => c.on("connect", () => r({ c, errs })));
}

test("jeton invalide : invité + auth_error, lyrics_result refusé", async () => {
  const { c, errs } = await client("nope");
  c.emit("lyrics_result", { score: 10, rounds: 1 });
  await wait(150);
  assert.equal(errs.length, 1);
  assert.equal(inserts.length, 0);
});

test("jeton valide : lyrics_result borné et marqué unverified, userId du payload ignoré", async () => {
  const { c, errs } = await client("good");
  c.emit("lyrics_result", { score: 9e9, rounds: 5, userId: "x", durationS: 12 });
  await wait(150);
  assert.equal(errs.length, 0);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].row.user_id, UID);
  assert.equal(inserts[0].row.score, 1000);
  assert.equal(inserts[0].row.meta.unverified, true);
});

test("account_delete : invité ignoré, compte authentifié supprimé", async () => {
  const guest = (await client()).c;
  guest.emit("account_delete");
  await wait(100);
  assert.equal(deleted.length, 0);
  const { c } = await client("good");
  c.emit("account_delete");
  await wait(150);
  assert.deepEqual(deleted, [UID]);
});

test("GET /health : 200 avec client, 503 sans", async () => {
  resetHealthCache();
  assert.equal((await fetch(`http://localhost:${port}/health`)).status, 200);
  resetHealthCache();
  setSupabase(null);
  assert.equal((await fetch(`http://localhost:${port}/health`)).status, 503);
  resetHealthCache();
  setSupabase(fake);
});
