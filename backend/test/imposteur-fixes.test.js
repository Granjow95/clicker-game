const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, wait, next, quiet } = require("./imposteur-helpers");

const t = setup();
test.before(() => t.start());
test.after(() => t.stop());

const leave = (p) => p.c.emit("imp:leave", { forfeit: true });

test("next_turn envoie { index, playerId } à toute la salle, index dans la liste courante", async () => {
  const all = await t.lobby(4);
  await t.startRound(all);
  const t0 = await next(all[3].c, "next_turn");
  const first = all.find((p) => p.pid === t0.playerId);
  assert.equal(t0.index, all.indexOf(first));
  first.c.emit("submit_hint", { hint: "un" });
  const t1 = await next(all[3].c, "next_turn");
  assert.notEqual(t1.playerId, t0.playerId);
  assert.equal(t1.index, all.findIndex((p) => p.pid === t1.playerId));
});

test("arrivée refusée pendant une manche en cours (game_in_progress)", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  const late = await t.client();
  late.emit("imp:join", { code: all[0].code, username: "tard" });
  const e = await next(late, "imp:error");
  assert.equal(e.code, "game_in_progress");
});

test("vote pour soi-même rejeté, start_round refusé en cours de manche", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  all[0].c.emit("start_round");
  await quiet(all[0].c, "round_started", 150);

  all[0].c.emit("force_vote");
  await next(all[1].c, "all_hints_done");
  all[0].c.emit("vote", { votedId: all[0].pid });
  all[1].c.emit("vote", { votedId: all[0].pid });
  all[2].c.emit("vote", { votedId: all[0].pid });
  await quiet(all[0].c, "reveal_results", 200);
  all[0].c.emit("vote", { votedId: all[1].pid });
  await next(all[0].c, "reveal_results");
});

test("vote pour un inconnu ou une valeur invalide ignoré", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  all[0].c.emit("force_vote");
  await next(all[1].c, "all_hints_done");
  for (const bad of ["inconnu", 42, null, {}, ["x"]]) all[1].c.emit("vote", { votedId: bad });
  await quiet(all[1].c, "vote_accepted", 150);
  all[1].c.emit("vote", { votedId: all[2].pid });
  assert.deepEqual(await next(all[1].c, "vote_accepted"), { votedId: all[2].pid });
});

test("force_reveal : hôte seulement, phase voting, au moins un vote", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  all[0].c.emit("force_reveal"); // phase hints
  await quiet(all[0].c, "reveal_results", 100);
  all[0].c.emit("force_vote");
  await next(all[1].c, "all_hints_done");
  all[0].c.emit("force_reveal"); // aucun vote
  await quiet(all[0].c, "reveal_results", 100);
  all[1].c.emit("vote", { votedId: all[0].pid });
  all[1].c.emit("force_reveal"); // non hôte
  await quiet(all[0].c, "reveal_results", 100);
  all[0].c.emit("force_reveal");
  const r = await next(all[2].c, "reveal_results");
  assert.deepEqual(r.votes, { [all[1].pid]: all[0].pid });
});

test("force_vote avec un seul joueur connecté : attend, force_reveal de l'hôte finalise", async () => {
  const { all } = await t.startUntil(3, (a, info) => info.impostor !== a[1] && info.impostor !== a[0]);
  leave(all[1]);
  all[2].c.emit("imp:leave", {}); // départ « doux » : grâce, donc déconnecté mais présent
  await wait(60);
  all[0].c.emit("force_vote");
  await next(all[0].c, "all_hints_done");
  all[0].c.emit("vote", { votedId: all[2].pid });
  await quiet(all[0].c, "reveal_results", 150);
  all[0].c.emit("force_reveal");
  const r = await next(all[0].c, "reveal_results");
  assert.equal(r.caught, true);
});

test("le plus voté est éliminé ; l'imposteur non démasqué gagne 100", async () => {
  const { all } = await t.startUntil(3, (a, info) => info.impostor === a[2]);
  all[0].c.emit("force_vote");
  await next(all[0].c, "all_hints_done");
  all[0].c.emit("vote", { votedId: all[1].pid });
  all[1].c.emit("vote", { votedId: all[0].pid });
  all[2].c.emit("vote", { votedId: all[0].pid });
  // 0 a 2 voix : élimine 0, imposteur (2) non démasqué
  const r = await next(all[0].c, "reveal_results");
  assert.equal(r.caught, false);
  assert.equal(r.eliminatedId, all[0].pid);
  assert.equal(r.scores[all[2].pid], 100);
});

test("égalité stricte (1-1-1) : eliminatedId null, caught false", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  await t.voteAll(all, (p) => all[(all.indexOf(p) + 1) % 3].pid);
  const r = await next(all[0].c, "reveal_results");
  assert.equal(r.eliminatedId, null);
  assert.equal(r.caught, false);
});

test("Rejouer : start_round fonctionne après la dernière manche (game_over déjà émis)", async () => {
  const all = await t.lobby(3);
  all[0].c.emit("update_lobby_options", { options: { rounds: 1, timer: 60 } });
  await t.startRound(all);
  await t.voteAll(all, (p) => all[(all.indexOf(p) + 1) % 3].pid);
  const r = await next(all[1].c, "reveal_results");
  assert.equal(r.isLastRound, true);
  const over = await next(all[1].c, "game_over");
  assert.equal(over.ranking.length, 3);
  assert.ok(over.ranking.every((e) => e.id && e.username && typeof e.score === "number"));

  all[0].c.emit("start_next_round"); // ignoré : la partie est finie
  await quiet(all[0].c, "round_started", 150);
  all.forEach((p) => t.drain(p.c));
  all[0].c.emit("start_round");
  const again = await next(all[0].c, "round_started");
  assert.equal(again.round, 1);
});

test("options modifiables entre deux parties, refusées en pleine partie", async () => {
  const all = await t.lobby(3);
  all[0].c.emit("update_lobby_options", { options: { rounds: 1, timer: 30 } });
  assert.deepEqual((await next(all[1].c, "lobby_options_updated")).options, { rounds: 1, timer: 30, mrWhite: false });
  await t.startRound(all);
  all[0].c.emit("update_lobby_options", { options: { rounds: 9, timer: 60 } });
  await quiet(all[1].c, "lobby_options_updated", 150);
  await t.voteAll(all, (p) => all[(all.indexOf(p) + 1) % 3].pid);
  await next(all[0].c, "game_over");
  all[0].c.emit("update_lobby_options", { options: { rounds: 4, mrWhite: true } });
  const u = await next(all[1].c, "lobby_options_updated");
  assert.deepEqual(u.options, { rounds: 4, timer: 60, mrWhite: true });
});

test("classement complet : tous les joueurs à 0 au départ, même sans vote reçu", async () => {
  const all = await t.lobby(3);
  all[0].c.emit("update_lobby_options", { options: { rounds: 1, timer: 60 } });
  await t.startRound(all);
  all[0].c.emit("force_vote");
  await next(all[0].c, "all_hints_done");
  all[0].c.emit("vote", { votedId: all[1].pid });
  all[0].c.emit("force_reveal");
  const r = await next(all[0].c, "reveal_results");
  assert.equal(Object.keys(r.scores).length, 3);
  const over = await next(all[0].c, "game_over");
  assert.equal(over.ranking.length, 3);
});

test("l'imposteur qui quitte définitivement : manche révélée aussitôt, sans points", async () => {
  const { all, impostor } = await t.startUntil(3, (a, info) => info.impostor !== a[0]);
  leave(impostor);
  const r = await next(all[0].c, "reveal_results");
  assert.equal(r.aborted, true);
  assert.equal(r.impostorId, impostor.pid);
  assert.ok(r.players.some((p) => p.id === impostor.pid), "l'imposteur parti reste affiché");
  assert.ok(Object.values(r.scores).every((v) => v === 0));
});

test("un hôte qui part en cours de manche : le tour du joueur parti est passé", async () => {
  const { all, ok: speaker } = await t.startUntil(4, async (a, info) => {
    const turn = await next(a[0].c, "next_turn");
    const s = a.find((p) => p.pid === turn.playerId);
    return s !== info.impostor && s !== info.white ? s : null;
  });
  all.forEach((p) => t.drain(p.c));
  leave(speaker);
  const other = all.find((p) => p !== speaker);
  const turn = await next(other.c, "next_turn");
  assert.notEqual(turn.playerId, speaker.pid);
});
