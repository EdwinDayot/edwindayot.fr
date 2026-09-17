const { test } = require("node:test");
const assert = require("node:assert/strict");
const Clock = require("../public/game/campaign-clock.js");

// Ticks a clock in fixed real-time steps and returns the wall-clock time reached.
function run(clock, startWall, stepMs, steps) {
  let wall = startWall;
  clock.tick(wall); // establishes the reference point, advances 0
  for (let i = 0; i < steps; i++) {
    wall += stepMs;
    clock.tick(wall);
  }
  return wall;
}

test("A full 7h-23h day elapses in ~24 real minutes at the default rate, ticked in 1s steps", () => {
  const clock = new Clock.CampaignClock();
  run(clock, 0, 1000, Clock.DEFAULT_ACTIVE_SECONDS);
  assert.ok(
    Math.abs(clock.gameSeconds - Clock.DAY_SECONDS) < 1,
    `expected ~${Clock.DAY_SECONDS} in-game seconds, got ${clock.gameSeconds}`,
  );
  assert.ok(Math.abs(clock.hour() - Clock.DAY_END_HOUR) < 0.001);
});

test("The game clock never advances past 23h even if ticking continues", () => {
  const clock = new Clock.CampaignClock();
  run(clock, 0, 1000, Clock.DEFAULT_ACTIVE_SECONDS + 100);
  assert.equal(clock.gameSeconds, Clock.DAY_SECONDS);
});

test("A custom activeSeconds changes the rate proportionally", () => {
  const clock = new Clock.CampaignClock({ activeSeconds: 720 }); // half the default: twice as fast
  run(clock, 0, 1000, 720);
  assert.ok(
    Math.abs(clock.gameSeconds - Clock.DAY_SECONDS) < 1,
    `a halved activeSeconds should still complete the day in the same step count, got ${clock.gameSeconds}`,
  );
});

test("Pausing freezes the game clock; resuming does not credit the paused interval", () => {
  const clock = new Clock.CampaignClock();
  run(clock, 0, 1000, 100); // some progress
  const before = clock.gameSeconds;
  clock.pause();
  clock.tick(100000 + 500000); // a huge real-time gap while paused
  assert.equal(clock.gameSeconds, before, "no seconds should be credited while paused");
  assert.ok(clock.isPaused());
  clock.resume(600000);
  clock.tick(601000); // 1 real second after resuming
  assert.ok(
    clock.gameSeconds > before,
    "the clock should advance again once resumed",
  );
  assert.ok(
    clock.gameSeconds - before < Clock.DAY_SECONDS,
    "resuming must not retroactively credit the paused gap",
  );
});

test("A large real-time gap between ticks (tab hidden) is discarded as a suspension, not caught up", () => {
  const clock = new Clock.CampaignClock();
  clock.tick(0);
  clock.tick(1000); // normal 1s tick, some progress
  const afterOneTick = clock.gameSeconds;
  assert.ok(afterOneTick > 0);
  const advanced = clock.tick(1000 + 10 * 60 * 1000); // tab hidden for 10 real minutes
  assert.equal(advanced, 0, "a suspended gap must credit zero in-game seconds");
  assert.equal(clock.gameSeconds, afterOneTick);
  // Ticking continues normally afterwards, from the new reference point.
  clock.tick(1000 + 10 * 60 * 1000 + 1000);
  assert.ok(clock.gameSeconds > afterOneTick);
});

test("A gap right at the suspend threshold is still credited; just above it is discarded", () => {
  const atThreshold = new Clock.CampaignClock();
  atThreshold.tick(0);
  atThreshold.tick(Clock.SUSPEND_GAP_MS);
  assert.ok(atThreshold.gameSeconds > 0, "exactly at the threshold should still tick normally");

  const overThreshold = new Clock.CampaignClock();
  overThreshold.tick(0);
  overThreshold.tick(Clock.SUSPEND_GAP_MS + 1);
  assert.equal(overThreshold.gameSeconds, 0, "one millisecond over the threshold is a suspension");
});

// Real-time ticks (1s steps) needed to reach a given in-game hour, from the 7h start.
function ticksForHour(activeSeconds, targetHour) {
  const dayHours = Clock.DAY_END_HOUR - Clock.DAY_START_HOUR;
  return (targetHour - Clock.DAY_START_HOUR) * activeSeconds / dayHours;
}

test("The evening reminder fires at 22h30 and not before, and stops being reported once past 23h", () => {
  const beforeReminder = new Clock.CampaignClock();
  run(beforeReminder, 0, 1000, Math.floor(ticksForHour(Clock.DEFAULT_ACTIVE_SECONDS, 22.4)));
  assert.ok(beforeReminder.hour() < 22.5, `expected < 22.5, got ${beforeReminder.hour()}`);
  assert.equal(beforeReminder.isEveningReminderTime(), false);

  const atReminder = new Clock.CampaignClock();
  run(atReminder, 0, 1000, Math.ceil(ticksForHour(Clock.DEFAULT_ACTIVE_SECONDS, 22.5)));
  assert.ok(atReminder.hour() >= 22.5, `expected >= 22.5, got ${atReminder.hour()}`);
  assert.equal(atReminder.isEveningReminderTime(), true);

  const atNightfall = new Clock.CampaignClock();
  run(atNightfall, 0, 1000, Clock.DEFAULT_ACTIVE_SECONDS);
  assert.equal(atNightfall.isEveningReminderTime(), false);
  assert.equal(atNightfall.isNightfall(), true);
});

test("A fresh clock starts unpaused, at 7h, and the first tick() only establishes a reference point", () => {
  const clock = new Clock.CampaignClock();
  assert.equal(clock.isPaused(), false);
  assert.equal(clock.hour(), Clock.DAY_START_HOUR);
  const advanced = clock.tick(12345);
  assert.equal(advanced, 0);
  assert.equal(clock.gameSeconds, 0);
});
