const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { createGribouille, parseCustomWords, MAX_CUSTOM } = require("../games/gribouille");

// Listes fixes : on sait de quelle réserve vient chaque mot proposé.
const EASY = ["facileun", "faciledeux", "faciletrois", "facilequatre", "facilecinq", "facilesix"];
const HARD = ["durun", "durdeux", "durtrois", "durquatre", "durcinq", "dursix"];

let server, io, game, port;
const clients = [];
const recorded = [];

test.before(async () => {
  server = http.createServer();
  io = new Server(server);
  game = createGribouille(io, { record: (r) => recorded.push(r) }, { graceMs: 5000, words: EASY, hardWords: HARD, timings: { turnEndMs: 50 } });
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
const once = (c, ev, ms = 2000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("timeout " + ev)), ms);
  c.once(ev, (d) => { clearTimeout(t); res(d); });
});

function client() {
  const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true });
  c.log = [];
  c.onAny((ev, data) => c.log.push([ev, data]));
  c.count = (ev) => c.log.filter(([e]) => e === ev).length;
  clients.push(c);
  return new Promise((resolve) => c.on("connect", () => resolve(c)));
}

async function setup(n) {
  const cs = [];
  for (let i = 0; i < n; i++) {
    const c = await client();
    const p = once(c, "gri:joined");
    if (i === 0) c.emit("gri:create", { username: "u1" });
    else c.emit("gri:join", { code: cs[0].joined.code, username: `u${i + 1}` });
    c.joined = await p;
    cs.push(c);
  }
  return cs;
}

async function saveWords(host, words) {
  const p = once(host, "gri:words_saved");
  host.emit("gri:words", { words });
  return p;
}
async function setOptions(host, opts) {
  const p = once(host, "gri:options");
  host.emit("gri:options", { rounds: 1, drawTime: 30, ...opts });
  return p;
}
async function firstChoices(host) {
  const p = once(host, "gri:choices");
  host.emit("gri:start", {});
  return p;
}

test("parseCustomWords : nettoyage, bornes, dédoublonnage, caractères autorisés", () => {
  const r = parseCustomWords([
    "  Tour   de  Pise ", "tour de pise", "Le Louvre", "Louvre", "l'arc-en-ciel", "pomme’d’api",
    "x", "a".repeat(31), "R2D2", "hé!", "<b>gras</b>", 42, null, "", "   ",
  ]);
  assert.deepEqual(r.words, ["Tour de Pise", "Le Louvre", "l'arc-en-ciel", "pomme’d’api"]);
  assert.equal(r.rejected, 7); // x, 31 caractères, R2D2, hé!, <b>gras</b> (« / » restant), 42, null
  assert.equal(parseCustomWords("pas un tableau"), null);
  assert.deepEqual(parseCustomWords(["e\u0301te\u0301"]).words, ["été"]); // accents décomposés (NFD) acceptés
  const many = Array.from({ length: 300 }, (_, i) => "mot" + "abcdefghijklmnopqrstuvwxyz"[i % 26] + "abcdefghijklmnopqrstuvwxyz"[Math.floor(i / 26) % 26]);
  assert.equal(parseCustomWords(many).words.length, MAX_CUSTOM);
});

test("gri:words : hôte seul, liste renvoyée à l'hôte seul, la salle ne reçoit que le nombre", async () => {
  const [h, g] = await setup(2);
  g.emit("gri:words", { words: ["secret"] });
  assert.equal((await once(g, "gri:error")).message, "Réservé à l'hôte.");
  const opt = once(g, "gri:options");
  const saved = await saveWords(h, ["raclette", "tour de Pise", "R2D2"]);
  assert.deepEqual(saved, { words: ["raclette", "tour de Pise"], rejected: 1 });
  const o = await opt;
  assert.equal(o.customCount, 2);
  await wait(50);
  assert.equal(g.count("gri:words_saved"), 0);
  assert.ok(!JSON.stringify(g.log).includes("raclette"));
  // Snapshot : l'hôte voit ses mots, l'invité non
  const g2 = await client();
  const j = once(g2, "gri:joined");
  g2.emit("gri:join", { code: h.joined.code, username: "u3" });
  const st = (await j).state;
  assert.equal(st.customWords, undefined);
  assert.equal(st.options.customCount, 2);
  const h2 = await client();
  const r = once(h2, "gri:joined");
  h2.emit("gri:resume", { code: h.joined.code, token: h.joined.token });
  assert.deepEqual((await r).state.customWords, ["raclette", "tour de Pise"]);
});

test("gri:words : liste invalide refusée, limiteur par joueur", async () => {
  const [h] = await setup(1);
  h.emit("gri:words", { words: "raclette" });
  assert.equal((await once(h, "gri:error")).message, "Liste de mots invalide.");
  for (let i = 0; i < 4; i++) h.emit("gri:words", { words: ["raclette"] });
  await wait(150);
  assert.equal(h.count("gri:words_saved"), 2); // rafale de 3, dont la liste invalide
  assert.ok(h.log.some(([e, d]) => e === "gri:error" && /Doucement/.test(d.message)));
});

test("options : difficulté et « seulement mes mots » validées et diffusées", async () => {
  const [h, g] = await setup(2);
  const o = once(g, "gri:options");
  h.emit("gri:options", { rounds: 2, drawTime: 60, difficulty: "difficile", customOnly: true });
  assert.deepEqual(await o, { rounds: 2, drawTime: 60, difficulty: "difficile", customOnly: true, customCount: 0 });
  const o2 = once(g, "gri:options");
  h.emit("gri:options", { rounds: 2, drawTime: 60, difficulty: "extrême", customOnly: "oui" });
  const r = await o2;
  assert.equal(r.difficulty, "difficile");
  assert.equal(r.customOnly, true);
});

test("seulement mes mots : refusé sous 3 mots, puis 3 mots perso proposés", async () => {
  const [h] = await setup(2);
  await setOptions(h, { customOnly: true });
  await saveWords(h, ["raclette", "fondue"]);
  h.emit("gri:start", {});
  assert.match((await once(h, "gri:error")).message, /au moins 3 mots/);
  await wait(2100); // limiteur de gri:words
  await saveWords(h, ["raclette", "fondue", "tartiflette"]);
  const c = await firstChoices(h);
  assert.deepEqual([...c.words].sort(), ["fondue", "raclette", "tartiflette"]);
  assert.deepEqual(c.tags, ["perso", "perso", "perso"]);
});

test("difficulté : facile, mixte (2 + 1), difficile ; étiquettes au dessinateur seul", async () => {
  for (const [difficulty, attendu] of [["facile", { facile: 3 }], ["mixte", { facile: 2, difficile: 1 }], ["difficile", { difficile: 3 }]]) {
    const [h, g] = await setup(2);
    await setOptions(h, { difficulty });
    const c = await firstChoices(h);
    const compte = {};
    c.words.forEach((w, i) => {
      const tag = c.tags[i];
      compte[tag] = (compte[tag] || 0) + 1;
      assert.ok((tag === "facile" ? EASY : HARD).includes(w), `${w} ${tag}`);
    });
    assert.deepEqual(compte, attendu, difficulty);
    assert.equal(new Set(c.words).size, 3);
    await wait(50);
    assert.ok(!g.log.some(([e, d]) => e === "gri:choices" || JSON.stringify(d || {}).includes('"tags"')));
  }
});

test("mélange : un mot perso proposé tant qu'il en reste de jamais joués", async () => {
  const [h, g] = await setup(2);
  await setOptions(h, { difficulty: "mixte" });
  await saveWords(h, ["raclette"]);
  const c = await firstChoices(h);
  assert.equal(c.tags.filter((t) => t === "perso").length, 1);
  assert.equal(c.tags.filter((t) => t === "difficile").length, 1);
  assert.ok(c.words.includes("raclette"));
  // Le dessinateur choisit le mot perso ; au tour suivant, il n'y en a plus de neuf : 2 faciles + 1 difficile.
  const w = once(h, "gri:word");
  h.emit("gri:choose", { index: c.words.indexOf("raclette") });
  await w;
  const next = once(g, "gri:choices", 3000);
  const turnEnd = once(h, "gri:turn_end");
  g.emit("gri:guess", { text: "raclette" });
  await turnEnd;
  const c2 = await next;
  assert.deepEqual([...c2.tags].sort(), ["difficile", "facile", "facile"]);
});

test("snapshot du dessinateur : choix et étiquettes ; invité : rien", async () => {
  const [h, g] = await setup(2);
  await setOptions(h, { difficulty: "difficile" });
  const c = await firstChoices(h);
  const h2 = await client();
  const r = once(h2, "gri:joined");
  h2.emit("gri:resume", { code: h.joined.code, token: h.joined.token });
  const st = (await r).state;
  assert.deepEqual(st.choices, c.words);
  assert.deepEqual(st.choiceTags, c.tags);
  const g2 = await client();
  const r2 = once(g2, "gri:joined");
  g2.emit("gri:resume", { code: g.joined.code, token: g.joined.token });
  const sg = (await r2).state;
  assert.equal(sg.choices, undefined);
  assert.equal(sg.choiceTags, undefined);
});

test("changement d'hôte au salon : la liste est retirée, jamais envoyée au nouvel hôte", async () => {
  const [h, g] = await setup(2);
  await setOptions(h, { customOnly: true });
  await saveWords(h, ["raclette", "fondue", "tartiflette"]);
  await wait(50); // diffusion des options de l'enregistrement déjà reçue
  const saved = once(g, "gri:words_saved");
  const opt = once(g, "gri:options");
  h.emit("gri:leave", { forfeit: true });
  assert.deepEqual((await saved).words, []);
  const o = await opt;
  assert.equal(o.customCount, 0);
  assert.equal(o.customOnly, false);
  assert.ok(!JSON.stringify(g.log).includes("raclette"));
});

test("hôte déconnecté en pleine partie : le nouvel hôte ne voit jamais les mots perso", async () => {
  const [h, g, t] = await setup(3);
  await setOptions(h, { customOnly: true });
  await saveWords(h, ["raclette", "fondue", "tartiflette"]);
  const c = await firstChoices(h);
  const w = once(h, "gri:word");
  h.emit("gri:choose", { index: 0 });
  await w;
  const room = once(g, "gri:room");
  h.disconnect(); // grâce : l'hôte passe à g pendant le dessin
  assert.equal((await room).hostId, g.joined.you);
  await wait(100);
  const g2 = await client();
  const r = once(g2, "gri:joined");
  g2.emit("gri:resume", { code: g.joined.code, token: g.joined.token });
  const st = (await r).state;
  assert.equal(st.customWords, undefined);
  // Le prochain dessinateur reçoit normalement ses 3 propositions ; la liste complète, elle, ne part jamais.
  const fuite = (c2) => c2.log.some(([e, d]) => e === "gri:words_saved" || (e === "gri:joined" && d.state && d.state.customWords));
  assert.ok(!fuite(g) && !fuite(g2) && !fuite(t));
  assert.ok(c.words.length === 3);
});

test("mots perso joués : classement absent de l'historique ; sans mot perso, enregistré", async () => {
  // Deux comptes distincts sont exigés par recordRanking : on simule via l'auth du handshake.
  const comptes = async (perso) => {
    const mk = async (uid) => {
      const c = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true, auth: { uid } });
      c.log = []; c.onAny((ev, d) => c.log.push([ev, d])); c.count = (ev) => c.log.filter(([e]) => e === ev).length;
      clients.push(c);
      await new Promise((r) => c.on("connect", r));
      return c;
    };
    const h = await mk("ua"); const pj = once(h, "gri:joined"); h.emit("gri:create", { username: "a" }); h.joined = await pj;
    const g = await mk("ub"); const pg = once(g, "gri:joined"); g.emit("gri:join", { code: h.joined.code, username: "b" }); g.joined = await pg;
    await setOptions(h, { rounds: 1, drawTime: 30, customOnly: perso });
    if (perso) await saveWords(h, ["raclette", "fondue", "tartiflette"]);
    // 1 manche, 2 tours : chacun dessine, l'autre trouve tout de suite
    for (let tour = 0; tour < 2; tour++) {
      const dessinateur = tour === 0 ? h : g;
      const devineur = tour === 0 ? g : h;
      const c = await (tour === 0 ? firstChoices(h) : once(g, "gri:choices", 3000));
      const w = once(dessinateur, "gri:word");
      dessinateur.emit("gri:choose", { index: 0 });
      await w;
      const fin = once(devineur, "gri:turn_end");
      devineur.emit("gri:guess", { text: c.words[0] });
      await fin;
    }
    await once(h, "gri:game_over", 3000);
  };
  recorded.length = 0;
  await comptes(true);
  assert.equal(recorded.length, 0);
  await comptes(false);
  assert.ok(recorded.length > 0);
});
