process.env.RESUME_GRACE_MS = "600";
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, wait, next, quiet } = require("./imposteur-helpers");

const t = setup();
test.before(() => t.start());
test.after(() => t.stop());

async function resume(p, token = p.token) {
  const c = await t.client();
  c.emit("imp:resume", { code: p.code, token });
  const j = await next(c, "imp:joined");
  return { ...p, c, token: j.token, joined: j };
}

test("reprise en cours de manche : pseudo, pid, mot et rôle conservés, imposteur jamais divulgué", async () => {
  const all = await t.lobby(3);
  const { rs } = await t.startRound(all);
  const me = all[1];
  me.c.close();
  await wait(60);
  const back = await resume(me);
  const s = back.joined.state;
  assert.equal(back.joined.resumed, true);
  assert.equal(back.joined.you, me.pid);
  assert.equal(back.joined.players.find((p) => p.id === me.pid).username, "p1");
  assert.equal(s.phase, "hints");
  assert.equal(s.word, rs[1].word);
  assert.equal(s.role, "player");
  assert.deepEqual(s.order, rs[1].order);
  assert.equal(s.options.rounds, 3);
  assert.equal(s.round, 1);
  assert.ok(!/impostorId|impostorName|impostorIndex/.test(JSON.stringify(back.joined)));
  assert.notEqual(back.token, me.token, "jeton renouvelé");
  me.c.close();
  const old = await t.client();
  old.emit("imp:resume", { code: me.code, token: me.token });
  assert.equal((await next(old, "imp:error")).code, "resume_failed");
});

test("reprise : les points déjà gagnés sont conservés", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  await t.voteAll(all, (p) => all.find((q) => q !== p).pid);
  const rev = await next(all[0].c, "reveal_results");
  all[0].c.emit("start_next_round");
  await next(all[2].c, "round_started");
  all[2].c.close();
  await wait(60);
  const back = await resume(all[2]);
  assert.deepEqual(back.joined.state.scores, rev.scores);
  assert.equal(back.joined.state.round, 2);
});

test("le tour d'un joueur déconnecté est sauté (skipped diffusé) et il peut revenir", async () => {
  const all = await t.lobby(4);
  const { rs } = await t.startRound(all);
  const order = rs[0].order;
  const victim = all.find((p) => p.pid === order[1]);
  const obs = all.find((p) => p.pid !== order[1] && p.pid !== order[0]);
  const first = all.find((p) => p.pid === order[0]);
  victim.c.close();
  await wait(60);
  t.drain(obs.c);
  first.c.emit("submit_hint", { hint: "alpha" });
  const h1 = await next(obs.c, "hint_submitted");
  assert.equal(h1.playerId, order[0]);
  const skipped = await next(obs.c, "hint_submitted");
  assert.deepEqual(skipped, { playerId: order[1], hint: null, skipped: true });
  const turn = await next(obs.c, "next_turn");
  assert.equal(turn.playerId, order[2]);

  const back = await resume(victim);
  assert.ok(back.joined.state.hints[0].some((h) => h.skipped && h.playerId === victim.pid));
  assert.equal(back.joined.state.currentId, order[2]);
});

test("le vote n'attend pas un joueur déconnecté ; sa présence au vote est conservée à la reprise", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  all[0].c.emit("force_vote");
  await next(all[1].c, "all_hints_done");
  all[2].c.close();
  await wait(60);
  all[0].c.emit("vote", { votedId: all[1].pid });
  all[1].c.emit("vote", { votedId: all[0].pid });
  const rev = await next(all[0].c, "reveal_results");
  assert.deepEqual(Object.keys(rev.votes).sort(), [all[0].pid, all[1].pid].sort());
  const back = await resume(all[2]);
  assert.equal(back.joined.state.phase, "revealed");
  assert.equal(back.joined.state.reveal.round, 1);
});

test("reprise pendant le vote : mon vote et la phase sont renvoyés", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  all[0].c.emit("force_vote");
  await next(all[1].c, "all_hints_done");
  all[1].c.emit("vote", { votedId: all[2].pid });
  await next(all[1].c, "vote_accepted");
  all[1].c.close();
  await wait(60);
  const back = await resume(all[1]);
  assert.equal(back.joined.state.phase, "voting");
  assert.equal(back.joined.state.myVote, all[2].pid);
});

test("grâce écoulée : l'imposteur absent entraîne la révélation immédiate (sans points)", async () => {
  const { all, impostor } = await t.startUntil(3, (a, info) => info.impostor !== a[0]);
  impostor.c.close();
  const rev = await next(all[0].c, "reveal_results", 3000);
  assert.equal(rev.aborted, true);
  assert.equal(rev.impostorId, impostor.pid);
  assert.ok(Object.values(rev.scores).every((v) => v === 0));
});

test("grâce écoulée : un civil absent est retiré sans interrompre la manche", async () => {
  const { all, impostor } = await t.startUntil(4, (a, info) => info.impostor !== a[3]);
  void impostor;
  all[3].c.close();
  const room = await (async () => {
    for (;;) {
      const r = await next(all[0].c, "imp:room");
      if (r.players.length === 3) return r;
    }
  })();
  assert.ok(!room.players.some((p) => p.id === all[3].pid));
  await quiet(all[0].c, "reveal_results", 100);
});

test("l'hôte déconnecté passe la main ; il ne la reprend pas à la reprise", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  all[0].c.close();
  const hc = await next(all[1].c, "host_changed");
  assert.equal(hc.phase, "hints");
  const back = await resume(all[0]);
  assert.equal(back.joined.hostId, all[1].pid);
});

test("reprise : les événements de jeu du nouveau socket sont bien reliés au même joueur", async () => {
  const all = await t.lobby(3);
  const { rs } = await t.startRound(all);
  const order = rs[0].order;
  const turn = await next(all[0].c, "next_turn");
  const speaker = all.find((p) => p.pid === turn.playerId);
  assert.equal(speaker.pid, order[0]);
  speaker.c.close();
  await wait(60);
  const back = await resume(speaker);
  // Son tour a été sauté pendant la coupure : il ne peut plus soumettre cet indice.
  back.c.emit("submit_hint", { hint: "retard" });
  await wait(150);
  const q = all.find((p) => p !== speaker).c.q.filter((e) => e[0] === "hint_submitted" && e[1].hint === "retard");
  assert.equal(q.length, 0);
});

test("re-join du même code en pleine manche : snapshot renvoyé, joueur non retiré", async () => {
  const all = await t.lobby(3);
  const { impostor } = await t.startRound(all);
  const me = all.find((p) => p.pid === (impostor && impostor.pid)) || all[1];
  me.c.emit("imp:join", { code: me.code, username: "autre" });
  const j = await next(me.c, "imp:joined");
  assert.equal(j.you, me.pid);
  assert.equal(j.state.phase, "hints");
  me.c.emit("join_or_create_room", { roomId: me.code, username: "autre" });
  assert.equal((await next(me.c, "imp:joined")).you, me.pid);
  await quiet(all[0].c, "reveal_results", 250);
  await quiet(all[0].c, "imp:error", 50);
});

test("vote : avec un seul connecté, pas de finalisation automatique", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  all[0].c.emit("force_vote");
  await next(all[1].c, "all_hints_done");
  all[1].c.close();
  all[2].c.close();
  await wait(60);
  all[0].c.emit("vote", { votedId: all[1].pid });
  await quiet(all[0].c, "reveal_results", 300);
});
