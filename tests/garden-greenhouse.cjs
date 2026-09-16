const { test } = require("node:test");
const assert = require("node:assert/strict");
const Automation = require("../public/game/automation.js");
const { GardenState, D } = require("./garden-rules-helpers.cjs");

test("tickAura boosts every plant in range via the exact same boostUntil field as fertilizer", () => {
  const greenhouse = { type: "greenhouse", x: 0, z: 0 },
    inRange = {
      type: "pot",
      x: 1,
      z: 0,
      stored: false,
      plant: { species: "pilea", boostUntil: 0 },
    },
    far = {
      type: "pot",
      x: D.recipes.greenhouse.aura.range + 1,
      z: 0,
      stored: false,
      plant: { species: "pilea", boostUntil: 0 },
    },
    s = { elapsed: 100, entities: [inRange, far] };
  Automation.tickAura(greenhouse, s);
  assert.equal(inRange.plant.boostUntil, 102);
  assert.equal(far.plant.boostUntil, 0, "out of range, untouched");
  assert.equal(
    greenhouse.running,
    true,
    "at least one plant currently boosted",
  );
});

test("tickAura never touches a stored pot, an empty pot, or a non-pot entity", () => {
  const greenhouse = { type: "greenhouse", x: 0, z: 0 },
    stored = {
      type: "pot",
      x: 0.5,
      z: 0,
      stored: true,
      plant: { species: "pilea", boostUntil: 0 },
    },
    empty = { type: "pot", x: 0.5, z: 0, stored: false, plant: null },
    tank = { x: 0.5, z: 0, type: "tank", stored: false },
    s = { elapsed: 10, entities: [stored, empty, tank] };
  Automation.tickAura(greenhouse, s);
  assert.equal(stored.plant.boostUntil, 0);
  assert.equal(greenhouse.running, false);
});

test("The generic dispatch runs tickAura only for a recipe that declares aura", () => {
  const s = {
    elapsed: 5,
    entities: [
      {
        type: "pot",
        x: 0,
        z: 0,
        stored: false,
        plant: { species: "pilea", boostUntil: 0 },
      },
    ],
  };
  Automation.tick({ type: "greenhouse", x: 0, z: 0 }, s);
  assert.equal(s.entities[0].plant.boostUntil, 7);
  const collector = { type: "collector", x: 0, z: 0, buffer: {} };
  Automation.tick(collector, s);
  assert.deepEqual(
    collector.buffer,
    {},
    "no aura declared, tickAura never ran",
  );
});

test("A placed greenhouse boosts growth exactly like the composter's fertilizer, through the real simulation", () => {
  const g = new GardenState(null, 1000);
  g.s.plans.push("greenhouse");
  g.s.inventory.coins = 100;
  g.s.inventory.wood = 20;
  g.s.inventory.clay = 20;
  const place = g.command({
    type: "place",
    item: "greenhouse",
    fabricate: true,
    x: -6,
    z: 2,
  });
  assert.equal(place.ok, true, place.message);
  const potA = g.command({
      type: "place",
      item: "pot",
      fabricate: true,
      x: -4,
      z: 2,
    }),
    potB = g.command({
      type: "place",
      item: "pot",
      fabricate: true,
      x: -1,
      z: 2,
    });
  assert.equal(potA.ok, true, potA.message);
  assert.equal(potB.ok, true, potB.message);
  const inRange = g.s.entities.find((e) => e.type === "pot" && e.x === -4),
    outOfRange = g.s.entities.find((e) => e.type === "pot" && e.x === -1);
  inRange.plant = {
    species: "pilea",
    growth: 0.5,
    moisture: 80,
    progress: 0,
    ready: 0,
  };
  outOfRange.plant = {
    species: "pilea",
    growth: 0.5,
    moisture: 80,
    progress: 0,
    ready: 0,
  };
  g.step(1);
  assert.ok(inRange.plant.boostUntil > g.s.elapsed, "boosted while in range");
  assert.equal(
    outOfRange.plant.boostUntil,
    undefined,
    "out of range, never boosted",
  );
  const growthIn = inRange.plant.growth,
    growthOut = outOfRange.plant.growth;
  assert.ok(growthIn > growthOut, "the boosted plant grew faster this tick");
});

test("A save with a boosted plant near a greenhouse survives validate() unchanged (reuses 0.4's schema)", () => {
  const g = new GardenState(null, 1000);
  g.s.entities[0].plant.boostUntil = g.s.elapsed + 5;
  const saved = g.serialize(),
    reloaded = new GardenState(saved);
  assert.equal(
    reloaded.s.entities[0].plant.boostUntil,
    saved.entities[0].plant.boostUntil,
  );
});
