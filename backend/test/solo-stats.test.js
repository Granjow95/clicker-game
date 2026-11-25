const test = require("node:test");
const assert = require("node:assert/strict");
const { io: connect } = require("socket.io-client");
const { setSupabase } = require("../lib/supabase");
const { GAMES, SOLO_GAMES } = require("../lib/results");
const { server, io } = require("../server");

const U1 = "bbbbbbbb-2222-3333-4444-555555555551";
let inserts = [];
const fake = {
  auth: { getUser: async (t) => (t === "t1" ? { data: { user: { id: U1 } }, error: null } : { data: {}, error: { message: "bad" } }) },
  from: () => ({ insert: async (row) => (inserts.push(row), { error: null }) }),
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
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true, auth: token ? { token } : {} });
  clients.push(c);
  return new Promise((r) => c.on("connect", () => r(c)));
}

test("registre : les jeux solo sont tous des jeux connus", () => {
  for (const g of SOLO_GAMES) assert.ok(GAMES.has(g), g);
  assert.equal(GAMES.size, 9);
});

test("solo_result : compte requis, liste blanche, score plafonné, meta nettoyée", async () => {
  inserts = [];
  const guest = await client();
  guest.emit("solo_result", { game: "echo", score: 5, won: true, rounds: 1 });
  const c = await client("t1");
  c.emit("solo_result", { game: "imposteur", score: 5 }); // jeu multi : refusé
  c.emit("solo_result", { game: "__proto__", score: 5 });
  c.emit("solo_result", { game: "echo", score: 7, won: true, rounds: 1, meta: { mode: "chrono", bad: { x: 1 } } });
  c.emit("solo_result", { game: "frappe", score: 5e6, won: false });
  await wait(300);
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts.map((r) => r.game), ["echo", "frappe"]);
  assert.equal(inserts[0].user_id, U1);
  assert.equal(inserts[0].score, 7);
  assert.equal(inserts[0].won, true);
  assert.deepEqual(inserts[0].meta, { mode: "chrono", unverified: true });
  assert.equal(inserts[1].score, 1000);
});

test("solo_result : limite par compte sur plusieurs sockets", async () => {
  inserts = [];
  const cs = [await client("t1"), await client("t1"), await client("t1")];
  cs.forEach((c) => { for (let i = 0; i < 5; i++) c.emit("solo_result", { game: "potager", score: 1 }); });
  await wait(400);
  assert.ok(inserts.length > 0 && inserts.length <= 6, String(inserts.length));
});
