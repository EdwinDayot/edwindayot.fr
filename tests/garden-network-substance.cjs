const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate, D, C } = require("./garden-rules-helpers.cjs");

function pilea(overrides = {}) {
  return {
    species: "pilea",
    growth: 0.5,
    moisture: 50,
    progress: 0,
    ready: 0,
    ...overrides,
  };
}

test("A composter -> tank -> pipe -> drip -> pot network delivers fertilizer, never moisture", () => {
  const g = new GardenState(null, 1000);
  g.s.entities = [
    { id: "e1", type: "composter", x: 0, z: 0, rotation: 0, stored: false },
    {
      id: "e2",
      type: "tank",
      x: 1,
      z: 0,
      water: 0,
      rotation: 0,
      stored: false,
    },
    { id: "e3", type: "pipe", x: 2, z: 0, rotation: 0, stored: false },
    { id: "e4", type: "drip", x: 2.5, z: 0, rotation: 0, stored: false },
    {
      id: "e5",
      type: "pot",
      x: 2.9,
      z: 0,
      rotation: 0,
      stored: false,
      plant: pilea({ moisture: 50 }),
    },
  ];
  g.s.links = [
    ["e1", "e2"],
    ["e2", "e3"],
    ["e3", "e4"],
    ["e4", "e5"],
  ];
  g.s.nextId = 6;
  for (let i = 0; i < 10; i++) g.step(1);
  const tank = g.s.entities.find((e) => e.id === "e2"),
    pot = g.s.entities.find((e) => e.id === "e5");
  assert.ok(tank.water > 0, "the composter filled the tank");
  assert.ok(
    pot.plant.boostUntil > g.s.elapsed,
    "the drip delivered a fertilizer boost",
  );
  assert.ok(
    pot.plant.moisture <= 50,
    "fertilizer never adds moisture (only natural decay may lower it)",
  );
});

test("A boosted plant grows faster than an identical unboosted one", () => {
  const g = new GardenState(null, 1000),
    boosted = g.s.entities[0],
    plain = g.s.entities[1];
  boosted.plant = pilea({ growth: 0.5, moisture: 80, boostUntil: 1e9 });
  plain.plant = pilea({ growth: 0.5, moisture: 80 });
  g.step(30);
  assert.ok(
    boosted.plant.growth > plain.plant.growth,
    `boosted grew to ${boosted.plant.growth}, unboosted to ${plain.plant.growth}`,
  );
});

test("A water network never grants a fertilizer boost", () => {
  const g = new GardenState(null, 1000);
  g.s.entities = [
    {
      id: "e1",
      type: "pump",
      x: 3,
      z: 0,
      rotation: 0,
      stored: false,
    },
    {
      id: "e2",
      type: "tank",
      x: 4,
      z: 0,
      water: 100,
      rotation: 0,
      stored: false,
    },
    { id: "e3", type: "drip", x: 4.5, z: 0, rotation: 0, stored: false },
    {
      id: "e4",
      type: "pot",
      x: 4.9,
      z: 0,
      rotation: 0,
      stored: false,
      plant: pilea({ moisture: 10 }),
    },
  ];
  g.s.links = [
    ["e1", "e2"],
    ["e2", "e3"],
    ["e3", "e4"],
  ];
  g.s.nextId = 5;
  for (let i = 0; i < 5; i++) g.step(1);
  const pot = g.s.entities.find((e) => e.id === "e4");
  assert.ok(pot.plant.moisture > 10, "watered normally");
  assert.equal(pot.plant.boostUntil, undefined, "no fertilizer boost");
});

test("Bridging a fertilizer pipe to a water pipe is rejected, even though the topology and distance are otherwise legal", () => {
  const g = new GardenState(null, 1000);
  g.s.entities = [
    { id: "e1", type: "composter", x: 0, z: 0, rotation: 0, stored: false },
    {
      id: "e2",
      type: "tank",
      x: 1,
      z: 0,
      water: 10,
      rotation: 0,
      stored: false,
    },
    { id: "e3", type: "pipe", x: 2, z: 0, rotation: 0, stored: false },
    { id: "e4", type: "pump", x: 6, z: 0, rotation: 0, stored: false },
    {
      id: "e5",
      type: "tank",
      x: 7,
      z: 0,
      water: 10,
      rotation: 0,
      stored: false,
    },
    { id: "e6", type: "pipe", x: 5, z: 0, rotation: 0, stored: false },
  ];
  g.s.links = [
    ["e1", "e2"],
    ["e2", "e3"],
    ["e4", "e5"],
    ["e5", "e6"],
  ];
  g.s.nextId = 7;
  assert.ok(
    C.distance(g.s.entities[2], g.s.entities[5]) <= 4,
    "sanity: the two pipes are within normal linking range",
  );
  const before = g.serialize(),
    result = g.command({ type: "connect", id: "e3", to: "e6" });
  assert.equal(result.ok, false);
  assert.deepEqual(g.serialize(), before, "rejected atomically");
});

test("A save with an illegally bridged cross-substance network is rejected by validate()", () => {
  const g = new GardenState(null, 1000);
  g.s.entities = [
    { id: "e1", type: "composter", x: 0, z: 0, rotation: 0, stored: false },
    {
      id: "e2",
      type: "tank",
      x: 1,
      z: 0,
      water: 10,
      rotation: 0,
      stored: false,
    },
    { id: "e3", type: "pump", x: 2.5, z: 0, rotation: 0, stored: false },
  ];
  // A single link bridges the composter and the pump into one component.
  g.s.links = [
    ["e1", "e2"],
    ["e2", "e3"],
  ];
  g.s.nextId = 4;
  const saved = g.serialize();
  assert.throws(() => validate(saved), /invalide/i);
});

test("An unconnected, manually-filled tank still drains as water (the watering can never fills fertilizer)", () => {
  const g = new GardenState(null, 1000);
  g.s.entities = [
    {
      id: "e1",
      type: "tank",
      x: 0,
      z: 0,
      water: 50,
      rotation: 0,
      stored: false,
    },
    { id: "e2", type: "drip", x: 0.5, z: 0, rotation: 0, stored: false },
    {
      id: "e3",
      type: "pot",
      x: 0.9,
      z: 0,
      rotation: 0,
      stored: false,
      plant: pilea({ moisture: 10 }),
    },
  ];
  g.s.links = [
    ["e1", "e2"],
    ["e2", "e3"],
  ];
  g.s.nextId = 4;
  g.step(3);
  const pot = g.s.entities.find((e) => e.id === "e3");
  assert.ok(pot.plant.moisture > 10, "an unconnected tank still waters");
  assert.equal(pot.plant.boostUntil, undefined);
});
