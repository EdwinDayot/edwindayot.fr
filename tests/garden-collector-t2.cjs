const { test } = require("node:test");
const assert = require("node:assert/strict");
const Automation = require("../public/game/automation.js");
const { GardenState, D, near } = require("./garden-rules-helpers.cjs");

test("collectorT2 is a pure data entry: same buffer mechanism, bigger capacity and range", () => {
  const base = D.recipes.collector,
    t2 = D.recipes.collectorT2;
  assert.equal(t2.buffer, true);
  assert.ok(t2.capacity > base.capacity);
  assert.ok(t2.range > base.range);
});

test("tickBuffer collects at collectorT2's own range, beyond the base collector's reach", () => {
  const collector = { type: "collector", x: 0, z: 0, buffer: {} },
    t2 = { type: "collectorT2", x: 0, z: 0, buffer: {} },
    plant = {
      x: D.recipes.collector.range + 1,
      z: 0,
      plant: { species: "pilea", ready: 1 },
    },
    s = { stats: { produced: 0, collected: 0 }, entities: [plant] };
  Automation.tickBuffer(collector, s);
  assert.deepEqual(collector.buffer, {}, "out of the base collector's range");
  Automation.tickBuffer(t2, s);
  assert.equal(
    t2.buffer["cutting:pilea"],
    1,
    "within collectorT2's own, longer range",
  );
});

test("A placed collectorT2 fills to its own (larger) capacity and is withdrawn through the same generic command", () => {
  const g = new GardenState(null, 1000);
  g.s.plans.push("collectorT2");
  g.s.inventory.coins = 100;
  g.s.inventory.wood = 20;
  g.s.inventory.stone = 20;
  const place = g.command({
    type: "place",
    item: "collectorT2",
    fabricate: true,
    x: -6,
    z: 2,
  });
  assert.equal(place.ok, true, place.message);
  const collector = g.s.entities.find((e) => e.type === "collectorT2"),
    pot = g.command({
      type: "place",
      item: "pot",
      fabricate: true,
      x: -3.5,
      z: 2,
    });
  assert.equal(pot.ok, true, pot.message);
  const potEntity = g.s.entities.find(
    (e) => e.type === "pot" && e.x === -3.5 && e.z === 2,
  );
  potEntity.plant = {
    species: "pilea",
    growth: 1,
    moisture: 80,
    progress: 0,
    ready: 3,
  };
  // The starter pot (e1, -3,0) also has a ready pilea and falls within
  // collectorT2's wide range — neutralize it so only potEntity is counted.
  g.s.entities.find((e) => e.id === "e1").plant.ready = 0;
  g.step(1);
  assert.equal(collector.buffer["cutting:pilea"], 3);
  const withdraw = g.command(
    { type: "withdraw", id: collector.id },
    near(collector),
  );
  assert.equal(withdraw.ok, true);
  assert.equal(g.s.inventory["cutting:pilea"], 3);
  assert.deepEqual(collector.buffer, {});
});

test("Validation rejects a collectorT2 buffer over its own capacity, not the base collector's 24", () => {
  const g = new GardenState(null, 1000),
    saved = g.serialize();
  saved.entities.push({
    id: "e9",
    type: "collectorT2",
    x: -6,
    z: 2,
    rotation: 0,
    stored: false,
    buffer: { "cutting:pilea": D.recipes.collectorT2.capacity + 1 },
  });
  saved.nextId = 10;
  assert.throws(
    () => require("../public/garden-state.js").validate(saved),
    /Réserve invalide/,
  );
});
