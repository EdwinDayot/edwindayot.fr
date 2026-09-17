const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Clock = require("../public/game/campaign-clock.js");

// Epic C2.2: the atomic night bilan (design §3) — campaignDay/campaignClock persistence, the
// "sleep" command's day/clock reset, "dormir plus tôt" (early sleep ignores the hour reached)
// and non-double-credit across a real reload. The pot's own draw/compatibility rules are
// already covered by campaign-pot.cjs and are not repeated here.

test("A fresh save starts on campaign day 1, clock at 7h, unpaused, default pace", () => {
  const g = new GardenState(null, 1000);
  assert.equal(g.s.campaignDay, 1);
  assert.deepEqual(g.s.campaignClock, {
    activeSeconds: Clock.DEFAULT_ACTIVE_SECONDS,
    gameSeconds: 0,
    paused: false,
  });
});

test("sleep advances the campaign day by exactly one and resets the clock to 7h, unpaused", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignClock.gameSeconds = 40000; // pretend the day had already advanced well past 7h
  g.s.campaignClock.paused = true;
  const r = g.command({ type: "sleep" });
  assert.equal(r.ok, true);
  assert.equal(g.s.campaignDay, 2);
  assert.deepEqual(g.s.campaignClock, {
    activeSeconds: Clock.DEFAULT_ACTIVE_SECONDS,
    gameSeconds: 0,
    paused: false,
  });
});

test("Dormir plus tôt: sleep succeeds no matter the clock's hour, and never simulates the skipped hours", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignClock.gameSeconds = 3600; // ~8h, well before nightfall — an early bedtime
  const inventoryBefore = JSON.stringify(g.s.inventory);
  const elapsedBefore = g.s.elapsed;
  const r = g.command({ type: "sleep" });
  assert.equal(r.ok, true);
  assert.equal(g.s.campaignDay, 2, "an early sleep still counts as one full night");
  // "ne simule ni travail ni vente sur les heures sautées": sleep never touches the
  // free-garden's own tick count or inventory/economy by itself.
  assert.equal(g.s.elapsed, elapsedBefore);
  assert.equal(JSON.stringify(g.s.inventory), inventoryBefore);
});

test("No double-credit across a real reload: a second sleep with nothing newly sown is a new, empty night, never a repeat of the first", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.cultivars.length, 1);
  assert.equal(g.s.campaignDay, 2);

  const saved = JSON.parse(JSON.stringify(g.serialize()));
  const reloaded = new GardenState(saved);
  assert.equal(reloaded.s.cultivars.length, 1, "reload alone must never redraw the night");
  assert.equal(reloaded.s.campaignDay, 2, "reload alone must never re-advance the day");

  assert.equal(reloaded.command({ type: "sleep" }).ok, true);
  assert.equal(
    reloaded.s.cultivars.length,
    1,
    "an empty pot on the second, genuinely new night must not credit a second cultivar",
  );
  assert.equal(reloaded.s.campaignDay, 3, "a genuinely new sleep is a new day, not a repeat");
});

test("A v3 save without campaignDay/campaignClock migrates to the defaults without altering the rest of its content", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  delete old.campaignDay;
  delete old.campaignClock;
  const before = JSON.stringify({ ...old, campaignDay: undefined, campaignClock: undefined });
  const migrated = new GardenState(old);
  assert.equal(migrated.s.campaignDay, 1);
  assert.deepEqual(migrated.s.campaignClock, {
    activeSeconds: Clock.DEFAULT_ACTIVE_SECONDS,
    gameSeconds: 0,
    paused: false,
  });
  const after = JSON.stringify({
    ...migrated.s,
    campaignDay: undefined,
    campaignClock: undefined,
  });
  assert.equal(after, before, "no other field should change during this migration");
});

test("A malformed campaignDay field is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const bad of [0, -1, 1.5, "1", null, {}]) {
    const saved = g.serialize();
    saved.campaignDay = bad;
    assert.throws(() => validate(saved), /Jour de campagne invalide/);
  }
});

test("A malformed campaignClock field is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const bad of [
    "nope",
    { activeSeconds: 0, gameSeconds: 0, paused: false },
    { activeSeconds: -60, gameSeconds: 0, paused: false },
    { activeSeconds: 1440, gameSeconds: -1, paused: false },
    { activeSeconds: 1440, gameSeconds: Clock.DAY_SECONDS + 1, paused: false },
    { activeSeconds: 1440, gameSeconds: 0, paused: "no" },
    { activeSeconds: 1440, gameSeconds: 0 },
  ]) {
    const saved = g.serialize();
    saved.campaignClock = bad;
    assert.throws(() => validate(saved), /Horloge de campagne invalide/);
  }
});

test("A campaignClock at exactly the day boundary (23h) is accepted", () => {
  const g = new GardenState(null, 1000),
    saved = g.serialize();
  saved.campaignClock = { activeSeconds: 1440, gameSeconds: Clock.DAY_SECONDS, paused: false };
  assert.doesNotThrow(() => validate(saved));
});
