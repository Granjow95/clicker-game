process.env.IMP_WHITE_GUESS_MS = "900";
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, wait, next, quiet } = require("./imposteur-helpers");
const { scoreVotes } = require("../games/imposteur");

const t = setup();
test.before(() => t.start());
test.after(() => t.stop());

const OPT = { rounds: 3, timer: 60, mrWhite: true };
const hasWhite = (a, info) => !!info.white;
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Mr White (plus voté) : tous les autres votent pour lui, lui vote pour un civil.
async function whiteEliminated(all, info) {
  const civil = all.find((p) => p !== info.white && p !== info.impostor);
  await t.voteAll(all, (p) => (p === info.white ? civil.pid : info.white.pid));
  return next(all[0].c, "imp:white_guess_start");
}

test("Mr White : manche sans lui sous 4 joueurs connectés (round_started.mrWhite = false)", async () => {
  const all = await t.lobby(3);
  all[0].c.emit("update_lobby_options", { options: OPT });
  const { rs } = await t.startRound(all);
  assert.ok(rs.every((r) => r.mrWhite === false && r.role === "player" && typeof r.word === "string"));
});

test("Mr White : à 4 joueurs, un seul Mr White (word null, role white), imposteur distinct", async () => {
  const { rs, white, impostor, all } = await t.startUntil(4, hasWhite, OPT);
  assert.ok(rs.every((r) => r.mrWhite === true));
  assert.equal(rs.filter((r) => r.word === null).length, 1);
  assert.equal(rs.filter((r) => r.role === "white").length, 1);
  assert.equal(rs[all.indexOf(white)].word, null);
  assert.notEqual(white, impostor);
  assert.ok(rs.every((r, i) => all[i] === white || (r.word !== null && r.role === "player")));
});

test("Mr White : jamais le premier à parler", async () => {
  for (let i = 0; i < 15; i++) {
    const all = await t.lobby(4);
    all[0].c.emit("update_lobby_options", { options: OPT });
    const { white, rs } = await t.startRound(all);
    const turn = await next(all[0].c, "next_turn");
    assert.notEqual(turn.playerId, white.pid);
    assert.equal(rs[0].order[0], turn.playerId);
    all.forEach((p) => p.c.emit("imp:leave", { forfeit: true }));
  }
});

test("Mr White éliminé : devinette avec accents et article acceptée (+150), barème complet", async () => {
  const { all, white, impostor, normal } = await t.startUntil(4, hasWhite, OPT);
  const start = await whiteEliminated(all, { white, impostor });
  assert.equal(start.whiteId, white.pid);
  assert.equal(start.durationMs, 900);
  white.c.emit("imp:white_guess", { guess: "  Le " + strip(normal).toUpperCase() + " " });
  const r = await next(all[0].c, "reveal_results");
  assert.equal(r.whiteGuessCorrect, true);
  assert.equal(r.whiteId, white.pid);
  assert.equal(r.eliminatedId, white.pid);
  assert.equal(r.caught, false);
  const civil = all.find((p) => p !== white && p !== impostor);
  assert.equal(r.scores[white.pid], 150);
  assert.equal(r.scores[impostor.pid], 50 + 100); // vote pour White + non éliminé
  assert.equal(r.scores[civil.pid], 50);
  const expected = scoreVotes(r.votes, { impostorId: impostor.pid, whiteId: white.pid, whiteGuessCorrect: true }, {}).points;
  for (const p of all) assert.equal(r.scores[p.pid], expected[p.pid] || 0);
});

test("Mr White éliminé : mauvaise devinette = 0, seul Mr White peut deviner", async () => {
  const { all, white, impostor } = await t.startUntil(4, hasWhite, OPT);
  await whiteEliminated(all, { white, impostor });
  impostor.c.emit("imp:white_guess", { guess: "n'importe" });
  await quiet(all[0].c, "reveal_results", 150);
  white.c.emit("imp:white_guess", { guess: "zzzz" });
  const r = await next(all[0].c, "reveal_results");
  assert.equal(r.whiteGuessCorrect, false);
  assert.equal(r.whiteGuess, "zzzz");
  assert.equal(r.scores[white.pid], 0);
});

test("Mr White : expiration de la devinette = échec ; force_reveal de l'hôte aussi", async () => {
  const a = await t.startUntil(4, hasWhite, OPT);
  await whiteEliminated(a.all, a);
  const t0 = Date.now();
  const r = await next(a.all[0].c, "reveal_results", 3000);
  assert.ok(Date.now() - t0 >= 700);
  assert.equal(r.whiteGuessCorrect, false);
  assert.equal(r.whiteGuess, null);

  const b = await t.startUntil(4, hasWhite, OPT);
  await whiteEliminated(b.all, b);
  b.all[0].c.emit("force_reveal");
  assert.equal((await next(b.all[0].c, "reveal_results")).whiteGuessCorrect, false);
});

test("Mr White non éliminé (égalité) : personne éliminé, pas de devinette, +100", async () => {
  const { all, white, impostor } = await t.startUntil(4, hasWhite, OPT);
  await t.voteAll(all, (p) => all[(all.indexOf(p) + 1) % 4].pid);
  const r = await next(all[0].c, "reveal_results");
  assert.equal(r.eliminatedId, null);
  assert.equal(r.caught, false);
  assert.equal(r.whiteGuessCorrect, false);
  const expected = scoreVotes(r.votes, { impostorId: impostor.pid, whiteId: white.pid }, {}).points;
  for (const p of all) assert.equal(r.scores[p.pid], expected[p.pid] || 0);
  assert.ok(r.scores[white.pid] >= 100);
  await quiet(all[0].c, "imp:white_guess_start", 50);
});

test("imposteur démasqué avec Mr White : caught = true", async () => {
  const { all, white, impostor } = await t.startUntil(4, hasWhite, OPT);
  await t.voteAll(all, (p) => (p === impostor ? white.pid : impostor.pid));
  const r = await next(all[0].c, "reveal_results");
  assert.equal(r.caught, true);
  assert.equal(r.eliminatedId, impostor.pid);
  assert.equal(r.scores[white.pid], 200); // +100 (non éliminé) +100 (a voté l'imposteur)
});

test("Mr White : son identité et l'imposteur ne fuient pas avant la révélation ; snapshot de reprise", async () => {
  const { all, white, impostor, rs } = await t.startUntil(4, hasWhite, OPT);
  for (const p of all) assert.ok(!/whiteId|impostorId/.test(JSON.stringify(p.c.q.filter((e) => e[0] !== "imp:joined"))));
  const wi = all.indexOf(white);
  white.c.close();
  await wait(60);
  const c = await t.client();
  c.emit("imp:resume", { code: white.code, token: white.token });
  const j = await next(c, "imp:joined");
  assert.equal(j.state.word, null);
  assert.equal(j.state.role, "white");
  assert.deepEqual(j.state.order, rs[wi].order);
  assert.ok(!/impostorId|whiteId/.test(JSON.stringify(j.state)));
  void impostor;
});

test("Mr White quitte avant le vote : manche révélée sans points ; départ pendant la devinette = échec", async () => {
  const a = await t.startUntil(4, hasWhite, OPT);
  a.white.c.emit("imp:leave", { forfeit: true });
  const r = await next(a.all.find((p) => p !== a.white).c, "reveal_results");
  assert.equal(r.aborted, true);

  const b = await t.startUntil(4, hasWhite, OPT);
  await whiteEliminated(b.all, b);
  b.white.c.emit("imp:leave", { forfeit: true });
  const r2 = await next(b.all.find((p) => p !== b.white).c, "reveal_results");
  assert.equal(r2.aborted, false);
  assert.equal(r2.whiteGuessCorrect, false);
});

test("Mr White : reprise pendant la devinette renvoie phase et whiteId", async () => {
  const { all, white, impostor } = await t.startUntil(4, hasWhite, OPT);
  await whiteEliminated(all, { white, impostor });
  const other = all.find((p) => p !== white && p !== impostor);
  other.c.close();
  await wait(50);
  const c = await t.client();
  c.emit("imp:resume", { code: other.code, token: other.token });
  const j = await next(c, "imp:joined");
  assert.equal(j.state.phase, "white_guess");
  assert.equal(j.state.whiteId, white.pid);
  assert.ok(j.state.guessLeftMs > 0);
  assert.ok(!/impostorId/.test(JSON.stringify(j.state)));
  white.c.emit("imp:white_guess", { guess: "x" });
  // `other` peut être all[0] (socket fermé) : on observe la fin via le socket repris et Mr White.
  const [r] = await Promise.all([next(c, "reveal_results"), next(white.c, "reveal_results")]);
  assert.equal(r.whiteId, white.pid);
  assert.equal(r.whiteGuess, "x"); // révélation due à la devinette, pas au minuteur
});
