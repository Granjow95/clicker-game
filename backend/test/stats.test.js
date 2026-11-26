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
// Protocole imp:* : le premier crée (code généré), les suivants rejoignent ; c.pid = identité publique.
async function room(_label, tokens) {
  const cs = [];
  let code = null;
  for (const t of tokens) {
    const c = await client(t);
    const joined = once(c, "imp:joined");
    if (code) c.emit("imp:join", { code, username: "p" + cs.length });
    else c.emit("imp:create", { username: "p" + cs.length });
    const j = await joined;
    code = j.code;
    c.pid = j.you;
    cs.push(c);
  }
  return cs;
}
async function playRound(_label, cs) {
  const [host, ...rest] = cs;
  host.emit("start_round");
  await once(host, "next_turn");
  host.emit("force_vote");
  await once(rest[0], "all_hints_done");
  const p = once(host, "reveal_results");
  cs.forEach((c) => c.emit("vote", { votedId: c === host ? rest[0].pid : host.pid }));
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

test("imposteur : rien sous 2 comptes distincts, un compte avec 2 sockets ne compte qu'une fois", async () => {
  inserts = [];
  const cs = await room("S1", ["t1", "t1", undefined, undefined]); // un seul compte (doublé) + invités
  await playRound("S1", cs);
  assert.equal(inserts.length, 0);
  const cs2 = await room("S2", ["t2", "t2", "t3", undefined]); // 2 comptes, t2 doublé
  await playRound("S2", cs2);
  assert.deepEqual(inserts.filter((r) => r.game === "imposteur").map((r) => r.user_id).sort(), [U2, U3]);
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

// Gribouille et Petit Bac : une ligne par compte, rien pour les invités (serveur dédié, auth simulée).
test("gribouille et petit-bac : historique par compte, invités ignorés", async () => {
  const http = require("http");
  const { Server } = require("socket.io");
  const { createGribouille } = require("../games/gribouille");
  const { createPetitBac } = require("../games/petit-bac");
  const rows = [];
  const results = createResults(() => ({ from: () => ({ insert: async (row) => (rows.push(row), { error: null }) }) }));
  const srv = http.createServer();
  const sio = new Server(srv);
  sio.use((s, next) => { s.data.userId = TOKENS[s.handshake.auth?.token] || null; next(); });
  const gri = createGribouille(sio, results, { timings: { choosingMs: 3000, turnEndMs: 20 } });
  const pb = createPetitBac(sio, results, { collectMs: 50 });
  sio.on("connection", (s) => { gri.register(s); pb.register(s); });
  await new Promise((r) => srv.listen(0, r));
  const url = `http://localhost:${srv.address().port}`;
  const mk = (token) => {
    const c = connect(url, { transports: ["websocket"], forceNew: true, auth: token ? { token } : {} });
    clients.push(c);
    return new Promise((r) => c.on("connect", () => r(c)));
  };
  try {
    // Petit Bac : t1 (deux sockets), t2, invité ; 1 manche.
    const cs = [];
    let code;
    for (const t of ["t1", "t1", "t2", undefined]) {
      const c = await mk(t);
      const j = once(c, "pb:joined");
      if (code) c.emit("pb:join", { code, username: "p" + cs.length });
      else c.emit("pb:create", { username: "p0" });
      code = (await j).code;
      cs.push(c);
    }
    cs[0].emit("pb:options", { rounds: 1, duration: 60, categories: [0, 1, 2, 3, 4, 5] });
    await once(cs[1], "pb:options");
    cs[0].emit("pb:start", {});
    const rs = await once(cs[0], "pb:round_start");
    const rev = once(cs[0], "pb:review");
    cs[0].emit("pb:stop", { answers: [0, 1, 2, 3, 4, 5].map((i) => `${rs.letter}ab${i}`) });
    await rev;
    const res = once(cs[0], "pb:results");
    cs[0].emit("pb:review_done", {});
    await res;
    const over = once(cs[0], "pb:game_over");
    cs[0].emit("pb:next", {});
    await over;
    await wait(100);
    const pbRows = rows.filter((r) => r.game === "petit-bac");
    assert.deepEqual(pbRows.map((r) => r.user_id).sort(), [U1, U2]);
    assert.ok(pbRows.every((r) => r.rounds === 1 && r.meta.players === 3 && typeof r.won === "boolean"));

    // Gribouille : t1, t2, invité ; 1 manche, chaque tour est deviné par le suivant.
    rows.length = 0;
    const gs = [];
    let gcode;
    for (const t of ["t1", "t2", undefined]) {
      const c = await mk(t);
      const j = once(c, "gri:joined");
      if (gcode) c.emit("gri:join", { code: gcode, username: "g" + gs.length });
      else c.emit("gri:create", { username: "g0" });
      gcode = (await j).code;
      gs.push(c);
    }
    gs.forEach((c, i) => {
      c.on("gri:choices", () => c.emit("gri:choose", { index: 0 }));
      c.on("gri:word", ({ word }) => setTimeout(() => {
        // les deux autres joueurs devinent : le tour se termine aussitôt (« all_found »)
        gs[(i + 1) % 3].emit("gri:guess", { text: word });
        gs[(i + 2) % 3].emit("gri:guess", { text: word });
      }, 50));
    });
    gs[0].emit("gri:options", { rounds: 1, drawTime: 30 });
    await once(gs[1], "gri:options");
    const gover = once(gs[2], "gri:game_over");
    gs[0].emit("gri:start", {});
    await gover;
    await wait(100);
    const gRows = rows.filter((r) => r.game === "gribouille");
    assert.deepEqual(gRows.map((r) => r.user_id).sort(), [U1, U2]);
    assert.ok(gRows.every((r) => r.rounds >= 1 && r.score >= 0 && r.score <= 1000 && r.meta.players === 3));
    assert.ok(gRows.some((r) => r.won) || gRows.every((r) => !r.won));
  } finally {
    gri.dispose();
    pb.dispose();
    sio.close();
  }
});

test("recordRanking : compte + invité = rien, tous à 0 = aucun gagnant", () => {
  const { recordRanking } = require("../lib/results");
  const got = [];
  const results = { record: (r) => got.push(r) };
  const scoreOf = (pid) => ({ a: 5, b: 1, g: 0 })[pid];
  recordRanking(results, { game: "x", players: [{ pid: "a", userId: "u1" }, { pid: "g" }], scoreOf, rounds: 3 });
  recordRanking(results, { game: "x", players: [{ pid: "a", userId: "u1" }, { pid: "a2", userId: "u1" }], scoreOf, rounds: 3 });
  assert.equal(got.length, 0);
  recordRanking(results, { game: "x", players: [{ pid: "g", userId: "u1" }, { pid: "g2", userId: "u2" }], scoreOf: () => 0, rounds: 3 });
  assert.equal(got.length, 2);
  assert.ok(got.every((r) => r.won === false));
});

test("/yt-search : origine étrangère refusée, origine du site autorisée", async () => {
  const url = `http://localhost:${port}/yt-search?q=`; // q vide : aucune requête vers YouTube
  const evil = await fetch(url, { headers: { Origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  const ok = await fetch(url, { headers: { Origin: "https://granjow.netlify.app" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://granjow.netlify.app");
  assert.match(ok.headers.get("vary") || "", /Origin/);
});
