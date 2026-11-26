const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { createPseudos, ERR_TAKEN } = require("../lib/pseudos");
const { createRoomRegistry } = require("../lib/rooms");

const U1 = "aaaaaaaa-2222-3333-4444-555555555551";
const U2 = "aaaaaaaa-2222-3333-4444-555555555552";
const PROFILES = [{ id: U1, username: "Amir_T" }, { id: U2, username: "zoe" }];

// Faux client Supabase : profiles.select(...).ilike(...).limit() et .eq(...).maybeSingle().
function fakeClient({ fail = false, slow = false } = {}) {
  const calls = { ilike: [], eq: [] };
  const later = (v) => (slow ? new Promise(() => {}) : Promise.resolve(v));
  const client = {
    from: () => ({
      select: () => ({
        ilike: (_col, pattern) => ({
          limit: () => {
            calls.ilike.push(pattern);
            if (fail) return later({ data: null, error: { message: "boom" } });
            const re = new RegExp("^" + pattern.replace(/\\_/g, "_") + "$", "i");
            return later({ data: PROFILES.filter((p) => re.test(p.username)).map((p) => ({ id: p.id })), error: null });
          },
        }),
        eq: (_col, id) => ({
          maybeSingle: () => {
            calls.eq.push(id);
            if (fail) return later({ data: null, error: { message: "boom" } });
            const p = PROFILES.find((x) => x.id === id);
            return later({ data: p ? { username: p.username } : null, error: null });
          },
        }),
      }),
    }),
  };
  return { client, calls };
}
const sock = (userId = null) => ({ data: { userId } });

test("invité : pseudo d'un compte refusé (sans casse), pseudo libre accepté", async () => {
  const { client, calls } = fakeClient();
  const p = createPseudos(() => client);
  assert.deepEqual(await p.resolve(sock(), "amir_t"), { error: ERR_TAKEN });
  assert.deepEqual(await p.resolve(sock(), "AMIR_T"), { error: ERR_TAKEN });
  assert.deepEqual(await p.resolve(sock(), "Bob"), { username: "Bob" });
  assert.equal(calls.ilike[0], "amir\\_t"); // « _ » échappé
  // Format impossible pour un compte (espace, accent) : aucune requête.
  const before = calls.ilike.length;
  assert.deepEqual(await p.resolve(sock(), "Zoé la reine"), { username: "Zoé la reine" });
  assert.equal(calls.ilike.length, before);
});

test("invité : sosies et accents ramenés au pseudo du compte", async () => {
  const { client } = fakeClient();
  const p = createPseudos(() => client);
  assert.deepEqual(await p.resolve(sock(), "zоe"), { error: ERR_TAKEN }); // « о » cyrillique
  assert.deepEqual(await p.resolve(sock(), "Zoé"), { error: ERR_TAKEN });
  assert.deepEqual(await p.resolve(sock(), "ＡＭＩＲ＿Ｔ"), { error: ERR_TAKEN }); // pleine chasse
});

test("compte : le pseudo du profil remplace celui envoyé, même s'il est d'un autre compte", async () => {
  const { client } = fakeClient();
  const p = createPseudos(() => client);
  assert.deepEqual(await p.resolve(sock(U1), "nimporte"), { username: "Amir_T" });
  assert.deepEqual(await p.resolve(sock(U2), "Amir_T"), { username: "zoe" });
});

test("compte sans profil : garde son pseudo, mais pas celui d'un autre compte", async () => {
  const { client } = fakeClient();
  const p = createPseudos(() => client);
  const U3 = "aaaaaaaa-2222-3333-4444-555555555553";
  assert.deepEqual(await p.resolve(sock(U3), "Libre"), { username: "Libre" });
  assert.deepEqual(await p.resolve(sock(U3), "zoe"), { error: ERR_TAKEN });
});

test("cache : une seule requête par pseudo, forget() vide le cache", async () => {
  const { client, calls } = fakeClient();
  const p = createPseudos(() => client);
  await p.resolve(sock(), "zoe");
  await p.resolve(sock(), "ZOE");
  assert.equal(calls.ilike.length, 1);
  p.forget();
  await p.resolve(sock(), "zoe");
  assert.equal(calls.ilike.length, 2);
});

test("Supabase absent ou en erreur : le pseudo demandé passe (la partie n'est jamais bloquée)", async () => {
  assert.deepEqual(await createPseudos(() => null).resolve(sock(U1), "zoe"), { username: "zoe" });
  const { client } = fakeClient({ fail: true });
  assert.deepEqual(await createPseudos(() => client).resolve(sock(), "zoe"), { username: "zoe" });
  const broken = { from: () => { throw new Error("x"); } };
  assert.deepEqual(await createPseudos(() => broken).resolve(sock(), "zoe"), { username: "zoe" });
});

// Registre de salles avec un résolveur injecté.
test("registre : pseudo imposé, refus routé en username_taken, double requête refusée, déconnexion pendant l'attente", async () => {
  const server = http.createServer();
  const io = new Server(server);
  let delay = 0;
  const reg = createRoomRegistry(io, {
    prefix: "ps",
    maxPlayers: 4,
    resolveUsername: async (_s, name) => {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (name === "pris") return { error: ERR_TAKEN };
      return { username: name === "moi" ? "Profil" : name };
    },
  });
  io.on("connection", (s) => { reg.register(s); s.on("disconnect", () => reg.onSocketDisconnect(s)); });
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const clients = [];
  const client = () => new Promise((r) => {
    const c = connect(url, { transports: ["websocket"], forceNew: true });
    clients.push(c);
    c.on("connect", () => r(c));
  });
  const once = (c, ev) => new Promise((r) => c.once(ev, r));
  try {
    const a = await client();
    let p = once(a, "ps:joined");
    a.emit("ps:create", { username: "moi" });
    const j = await p;
    assert.equal(j.players[0].username, "Profil");

    const b = await client();
    p = once(b, "ps:error");
    b.emit("ps:join", { code: j.code, username: "pris" });
    const e = await p;
    assert.equal(e.code, "username_taken");
    assert.equal(e.message, ERR_TAKEN);

    delay = 100;
    p = once(b, "ps:error");
    b.emit("ps:join", { code: j.code, username: "bob" });
    b.emit("ps:join", { code: j.code, username: "bob" });
    assert.equal((await p).code, "rate_limited");
    await new Promise((r) => setTimeout(r, 200));

    // Déconnecté pendant la résolution : aucun joueur fantôme.
    const c = await client();
    c.emit("ps:join", { code: j.code, username: "fantome" });
    c.close();
    await new Promise((r) => setTimeout(r, 200));
    const room = reg._rooms.get(j.code);
    assert.deepEqual(room.players.map((x) => x.username).sort(), ["Profil", "bob"]);
  } finally {
    clients.forEach((c) => c.close());
    reg.dispose();
    io.close();
  }
});
