const { test } = require("node:test");
const assert = require("node:assert/strict");
const Automation = require("../public/game/automation.js");
const D = require("../public/game/data.js");

test("tickJob counts a job down to zero, marks running while active, credits stats.produced once", () => {
  const s = { stats: { produced: 0, collected: 0 } },
    e = { type: "nursery", job: { species: "pilea", remaining: 2 } };
  Automation.tickJob(e, s);
  assert.equal(e.job.remaining, 1);
  assert.equal(e.running, true);
  assert.equal(s.stats.produced, 0);
  Automation.tickJob(e, s);
  assert.equal(e.job.remaining, 0);
  assert.equal(e.running, false);
  assert.equal(s.stats.produced, 1);
  Automation.tickJob(e, s);
  assert.equal(s.stats.produced, 1, "no double credit once remaining is 0");
});

test("tickJob is a no-op without a job", () => {
  const s = { stats: { produced: 0 } },
    e = { type: "nursery" };
  Automation.tickJob(e, s);
  assert.equal(e.running, undefined);
  assert.equal(s.stats.produced, 0);
});

test("tickBuffer fills from ready plants within the recipe's range, up to its capacity, and never over-collects", () => {
  const spec = D.recipes.collector,
    collector = { type: "collector", x: 0, z: 0, buffer: {} },
    near = { x: 1, z: 0, plant: { species: "pilea", ready: 2 } },
    far = { x: spec.range + 1, z: 0, plant: { species: "pilea", ready: 3 } },
    s = { stats: { produced: 0, collected: 0 }, entities: [near, far] };
  Automation.tickBuffer(collector, s);
  assert.equal(collector.buffer["cutting:pilea"], 2);
  assert.equal(near.plant.ready, 0);
  assert.equal(far.plant.ready, 3, "out-of-range plant untouched");
  assert.equal(s.stats.collected, 2);
  assert.equal(
    collector.running,
    true,
    "still has room after collecting less than capacity",
  );
});

test("tickBuffer stops at capacity and marks not-running once full", () => {
  const collector = {
      type: "collector",
      x: 0,
      z: 0,
      buffer: { "cutting:pilea": D.recipes.collector.capacity },
    },
    ready = { x: 0.5, z: 0, plant: { species: "pilea", ready: 1 } },
    s = { stats: { produced: 0, collected: 0 }, entities: [ready] };
  Automation.tickBuffer(collector, s);
  assert.equal(ready.plant.ready, 1, "nothing collected once full");
  assert.equal(collector.running, false);
});

test("The generic dispatch only runs the behaviour the entity's recipe declares", () => {
  const s = {
    stats: { produced: 0, collected: 0 },
    entities: [],
  };
  const nursery = { type: "nursery", job: { species: "pilea", remaining: 1 } };
  Automation.tick(nursery, s);
  assert.equal(nursery.job.remaining, 0);
  const pot = { type: "pot" };
  Automation.tick(pot, s);
  assert.deepEqual(
    pot,
    { type: "pot" },
    "a plain pot recipe has no job/buffer",
  );
});
