// Aides communes aux tests Imposteur (non collectées par `node --test "test/*.test.js"`).
const assert = require("node:assert/strict");
const { io: connect } = require("socket.io-client");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// File d'événements par client : pas de course entre l'émission et l'attente.
function wrap(c) {
  c.q = [];
  c.waiters = [];
  c.onAny((ev, payload) => {
    const i = c.waiters.findIndex((w) => w.ev === ev);
    if (i >= 0) {
      const [w] = c.waiters.splice(i, 1);
      clearTimeout(w.t);
      w.res(payload);
    } else c.q.push([ev, payload]);
  });
  return c;
}

function next(c, ev, ms = 2500) {
  const i = c.q.findIndex((e) => e[0] === ev);
  if (i >= 0) return Promise.resolve(c.q.splice(i, 1)[0][1]);
  return new Promise((res, rej) => {
    const w = { ev, res };
    w.t = setTimeout(() => {
      c.waiters.splice(c.waiters.indexOf(w), 1);
      rej(new Error(`timeout en attendant ${ev}`));
    }, ms);
    c.waiters.push(w);
  });
}

async function quiet(c, ev, ms = 200) {
  await wait(ms);
  assert.equal(c.q.filter((e) => e[0] === ev).length, 0, `${ev} ne devait pas arriver`);
}

const drain = (c) => (c.q.length = 0);

function setup() {
  const { server, io } = require("../server");
  const clients = [];
  let port;
  const api = {
    wait, next, quiet, drain,
    async start() {
      await new Promise((r) => server.listen(0, r));
      port = server.address().port;
    },
    stop() {
      clients.forEach((c) => c.close());
      io.close();
    },
    client() {
      const c = wrap(connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true }));
      clients.push(c);
      return new Promise((resolve) => c.on("connect", () => resolve(c)));
    },
    // Crée une salle : { c, code, pid, token, name }.
    async createRoom(name = "hote") {
      const c = await api.client();
      c.emit("imp:create", { username: name });
      const j = await next(c, "imp:joined");
      return { c, name, code: j.code, pid: j.you, token: j.token, joined: j };
    },
    async joinRoom(code, name) {
      const c = await api.client();
      c.emit("imp:join", { code, username: name });
      const j = await next(c, "imp:joined");
      return { c, name, code, pid: j.you, token: j.token, joined: j };
    },
    // Salle de n joueurs : tableau [hôte, ...invités].
    async lobby(n) {
      const host = await api.createRoom("p0");
      const all = [host];
      for (let i = 1; i < n; i++) all.push(await api.joinRoom(host.code, "p" + i));
      return all;
    },
    // Lance la manche : renvoie { rs: [round_started par joueur], impostor, white, normal }.
    async startRound(all, event = "start_round") {
      all[0].c.emit(event);
      const rs = [];
      for (const p of all) rs.push(await next(p.c, "round_started"));
      const words = rs.map((r) => r.word).filter((w) => w !== null);
      const counts = {};
      words.forEach((w) => (counts[w] = (counts[w] || 0) + 1));
      const normal = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      return {
        rs,
        normal,
        impostor: all[rs.findIndex((r) => r.word !== null && r.word !== normal)],
        white: all[rs.findIndex((r) => r.role === "white")] || null,
      };
    },
    // Relance des salles jusqu'à ce que `pred(all, info)` renvoie une valeur vraie (rôles aléatoires).
    async startUntil(n, pred, options) {
      for (let i = 0; i < 60; i++) {
        const all = await api.lobby(n);
        if (options) all[0].c.emit("update_lobby_options", { options });
        const info = await api.startRound(all);
        const ok = await pred(all, info);
        if (ok) return { all, ...info, ok };
        all.forEach((p) => p.c.emit("imp:leave", { forfeit: true }));
        await wait(20);
      }
      throw new Error("startUntil : condition jamais remplie");
    },
    // Tous les joueurs donnent un indice (un tour complet), observé par all[0].
    async oneTurn(all, count = all.length) {
      for (let i = 0; i < count; i++) {
        const t = await next(all[0].c, "next_turn");
        const speaker = all.find((p) => p.pid === t.playerId);
        speaker.c.emit("submit_hint", { hint: "indice" + i });
        await next(all[0].c, "hint_submitted");
      }
    },
    // Hôte force le vote ; chacun vote selon votes(p) -> pid cible.
    async voteAll(all, target, who = all) {
      all[0].c.emit("force_vote");
      await next(all[0].c, "all_hints_done");
      for (const p of who) {
        const t = typeof target === "function" ? target(p) : target;
        p.c.emit("vote", { votedId: t });
      }
    },
  };
  return api;
}

module.exports = { setup, wait, next, quiet, drain };
