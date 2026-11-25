process.env.IMP_TURN_TIMER_MS = "400";
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, next } = require("./imposteur-helpers");

const t = setup();
test.before(() => t.start());
test.after(() => t.stop());

test("minuteur de tour serveur : le joueur inactif est sauté, puis le suivant est invité", async () => {
  const all = await t.lobby(3);
  const { rs } = await t.startRound(all);
  const order = rs[0].order;
  const first = await next(all[0].c, "next_turn");
  assert.equal(first.playerId, order[0]);
  const skipped = await next(all[0].c, "hint_submitted", 2000);
  assert.deepEqual(skipped, { playerId: order[0], hint: null, skipped: true });
  const second = await next(all[0].c, "next_turn");
  assert.equal(second.playerId, order[1]);
});
