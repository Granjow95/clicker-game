const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, wait, next, quiet } = require("./imposteur-helpers");

const t = setup();
test.before(() => t.start());
test.after(() => t.stop());

test("imposteur : un non-créateur ne peut pas lancer la partie ni forcer le vote", async () => {
  const all = await t.lobby(3);
  const [host, g1] = all;
  g1.c.emit("start_round");
  await quiet(g1.c, "round_started", 150);
  host.c.emit("start_round");
  const round = await next(g1.c, "round_started");
  assert.equal(round.players.length, 3);
  g1.c.emit("force_vote");
  await quiet(host.c, "all_hints_done", 150);
});

test("imposteur : moins de 3 joueurs connectés → not_enough_players", async () => {
  const host = await t.createRoom("h");
  const g = await t.joinRoom(host.code, "g");
  host.c.emit("start_round");
  const e = await next(host.c, "imp:error");
  assert.equal(e.code, "not_enough_players");
  await quiet(g.c, "round_started", 100);
});

test("imposteur : l'identité est le pid serveur, pas ce que le client envoie", async () => {
  const all = await t.lobby(3);
  const { rs } = await t.startRound(all);
  assert.ok(rs.every((r) => Array.isArray(r.order) && r.order.length === 3));
  const turn = await next(all[0].c, "next_turn");
  const speaker = all.find((p) => p.pid === turn.playerId);
  const other = all.find((p) => p !== speaker);

  other.c.emit("submit_hint", { playerId: speaker.pid, hint: "triche" });
  await quiet(all[0].c, "hint_submitted", 150);

  speaker.c.emit("submit_hint", { roomId: "autre", playerId: other.pid, hint: "<b>mot</b>" });
  const h = await next(all[0].c, "hint_submitted");
  assert.equal(h.playerId, speaker.pid);
  assert.equal(h.hint, "bmot/b");
  assert.equal(turn.index, all.indexOf(speaker));
  // Aucun socket.id ne circule dans les charges utiles.
  const sockIds = all.map((p) => p.c.id);
  assert.ok(!sockIds.some((id) => JSON.stringify([turn, h, rs]).includes(id)));
});

test("imposteur : pseudo nettoyé", async () => {
  const c = await t.createRoom("<script>alert(1)</script>");
  assert.ok(!/[<>]/.test(c.joined.players[0].username));
});

test("karaoké : seul l'hôte choisit la chanson", async () => {
  const host = await t.client();
  const guest = await t.client();
  host.emit("karaoke_join", { roomId: "K1", username: "h" });
  await next(host, "karaoke_joined");
  guest.emit("karaoke_join", { roomId: "K1", username: "g" });
  await next(guest, "karaoke_joined");
  host.q.length = 0;

  guest.emit("karaoke_select_song", { roomId: "K1", song: { title: "x", artist: "y" } });
  await quiet(host, "karaoke_song_selected", 150);

  host.emit("karaoke_select_song", { roomId: "K1", song: { title: "T", artist: "A", evil: 1 } });
  assert.deepEqual((await next(guest, "karaoke_song_selected")).song, { title: "T", artist: "A" });
});

test("alias join_or_create_room : crée avec un code généré, puis rejoint si le code existe", async () => {
  const a = await t.client();
  a.emit("join_or_create_room", { roomId: "peu importe", username: "a" });
  const ja = await next(a, "imp:joined");
  assert.match(ja.code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  assert.equal(ja.hostId, ja.you);

  const b = await t.client();
  b.emit("join_or_create_room", { roomId: ja.code.toLowerCase(), username: "b" });
  const jb = await next(b, "imp:joined");
  assert.equal(jb.code, ja.code);
  assert.equal(jb.players.length, 2);
  assert.equal((await next(a, "imp:room")).code, ja.code);
});

test("noms « constructor » / « __proto__ » : le serveur ne plante pas", async () => {
  for (const name of ["constructor", "__proto__", "toString"]) {
    const c = await t.client();
    c.emit("join_or_create_room", { roomId: name, username: "x" });
    await next(c, "imp:joined");
    c.emit("leave_room", name);
    c.emit("karaoke_join", { roomId: name, username: "x" });
    await next(c, "karaoke_joined");
    c.emit("karaoke_leave", name);
  }
  assert.ok((await t.client()).connected);
});

test("payloads invalides ignorés sans plantage", async () => {
  const c = await t.client();
  for (const bad of [null, 42, {}, [], { roomId: {} }, { votedId: {}, username: ["u"] }, "x"]) {
    for (const ev of ["join_or_create_room", "imp:create", "imp:join", "imp:resume", "karaoke_join", "vote", "start_round", "force_vote", "submit_hint", "imp:white_guess", "update_lobby_options"]) {
      c.emit(ev, bad);
    }
  }
  await wait(200);
  assert.ok(c.connected);
});

test("imposteur : aucun événement ne révèle l'imposteur avant reveal_results", async () => {
  const all = await t.lobby(3);
  const { rs } = await t.startRound(all);
  assert.ok(rs.every((r) => !("impostorIndex" in r) && !("impostorId" in r)));
  await t.oneTurn(all);
  all[0].c.emit("force_vote");
  await next(all[0].c, "all_hints_done");
  for (const p of all) {
    const seen = JSON.stringify(p.c.q);
    assert.ok(!/impostorId|impostorIndex|impostorName/.test(seen), "fuite avant la révélation");
  }
});

test("imposteur : pas de revote après la révélation, scores non gonflés", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  await t.voteAll(all, (p) => all.find((q) => q !== p).pid);
  const res = await next(all[0].c, "reveal_results");
  assert.ok(!("points" in res), "scores envoyés une seule fois");
  const before = JSON.stringify(res.scores);
  for (let i = 0; i < 4; i++) all[0].c.emit("vote", { votedId: all[1].pid });
  await quiet(all[0].c, "reveal_results", 200);
  assert.equal(JSON.stringify(res.scores), before);
});

test("imposteur : un joueur qui part pendant les votes ne bloque pas la manche", async () => {
  const all = await t.lobby(3);
  await t.startRound(all);
  all[0].c.emit("force_vote");
  await next(all[1].c, "all_hints_done");
  all[0].c.emit("vote", { votedId: all[1].pid });
  all[1].c.emit("vote", { votedId: all[2].pid });
  await wait(50);
  all[2].c.emit("imp:leave", { forfeit: true });
  const res = await next(all[0].c, "reveal_results");
  assert.ok(res.players.length >= 2);
});

test("imposteur : quand l'hôte part, le nouvel hôte est prévenu et peut forcer le vote", async () => {
  const { all } = await t.startUntil(3, (a, info) => info.impostor !== a[0] && info.white !== a[0]);
  const [host, g1] = all;
  host.c.emit("imp:leave", { forfeit: true });
  const hc = await next(g1.c, "host_changed");
  assert.equal(hc.phase, "hints");
  g1.c.emit("force_vote");
  await next(g1.c, "all_hints_done");
});

test("imposteur : si le joueur dont c'est le tour part, le tour passe au suivant", async () => {
  const { all, ok: first } = await t.startUntil(4, async (a, info) => {
    const turn = await next(a[0].c, "next_turn");
    const s = a.find((p) => p.pid === turn.playerId);
    return s !== info.impostor && s !== info.white ? s : null;
  });
  all.forEach((p) => t.drain(p.c));
  first.c.emit("imp:leave", { forfeit: true });
  const rest = all.find((p) => p !== first);
  const turn = await next(rest.c, "next_turn");
  assert.notEqual(turn.playerId, first.pid);
});

test("salles isolées par jeu : un salon imposteur ne reçoit pas le karaoké", async () => {
  const imp = await t.createRoom("i");
  const kk = await t.client();
  kk.emit("karaoke_join", { roomId: imp.code, username: "k" });
  await next(kk, "karaoke_joined");
  kk.emit("karaoke_select_song", { roomId: imp.code, song: { title: "t", artist: "a" } });
  await next(kk, "karaoke_song_selected");
  await wait(150);
  assert.ok(!imp.c.q.some((e) => e[0].startsWith("karaoke")));
});

test("un socket n'occupe qu'une salle imposteur à la fois", async () => {
  const c = await t.client();
  const codes = [];
  for (let i = 0; i < 5; i++) {
    c.emit("imp:create", { username: "u" });
    codes.push((await next(c, "imp:joined")).code);
  }
  const { rooms } = require("../server").io.sockets.adapter;
  assert.deepEqual(codes.filter((k) => rooms.has("imp:" + k)), [codes[4]]);
});

test("le roomId envoyé par le client est ignoré (salle = celle du socket)", async () => {
  const a = await t.lobby(3);
  const b = await t.lobby(3);
  b[0].c.emit("start_round", { roomId: a[0].code });
  b[0].c.emit("start_round", a[0].code);
  await next(b[1].c, "round_started");
  await quiet(a[1].c, "round_started", 150);
});

test("karaoké : chanson invalide → erreur renvoyée", async () => {
  const c = await t.client();
  c.emit("karaoke_join", { roomId: "K9", username: "h" });
  await next(c, "karaoke_joined");
  c.emit("karaoke_select_song", { roomId: "K9", song: { nope: 1 } });
  assert.match(await next(c, "karaoke_error"), /invalide/i);
});
