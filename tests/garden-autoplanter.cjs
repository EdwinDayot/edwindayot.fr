const { test } = require("node:test");
const assert = require("node:assert/strict");
const Automation = require("../public/game/automation.js");
const D = require("../public/game/data.js");
const { GardenState, near } = require("./garden-rules-helpers.cjs");

test("tickSow plants a seed from the buffer into an empty pot in range, draining exactly one", () => {
  const spec = D.recipes.autoPlanter,
    planter = { type: "autoPlanter", x: 0, z: 0, buffer: { "seed:pilea": 2 } },
    pot = { id: "p1", type: "pot", x: 1, z: 0, stored: false, plant: null },
    far = {
      id: "p2",
      type: "pot",
      x: spec.range + 1,
      z: 0,
      stored: false,
      plant: null,
    },
    s = { entities: [pot, far] };
  Automation.tickSow(planter, s);
  assert.equal(pot.plant.species, "pilea");
  assert.equal(pot.plant.source, "seed");
  assert.equal(pot.plant.growth, 0);
  assert.equal(far.plant, null, "out-of-range pot untouched");
  assert.equal(planter.buffer["seed:pilea"], 1);
  assert.equal(planter.running, true);
});

test("tickSow plants a young plant at 0.3 growth, same as the manual plant command's source", () => {
  const planter = {
      type: "autoPlanter",
      x: 0,
      z: 0,
      buffer: { "young:monstera": 1 },
    },
    pot = { id: "p1", type: "pot", x: 0.5, z: 0, stored: false, plant: null },
    s = { entities: [pot] };
  Automation.tickSow(planter, s);
  assert.equal(pot.plant.species, "monstera");
  assert.equal(pot.plant.source, "young");
  assert.equal(pot.plant.growth, 0.3);
});

test("tickSow never touches an occupied pot, a stored one, or a non-pot entity, and is idle without seeds", () => {
  const planter = { type: "autoPlanter", x: 0, z: 0, buffer: {} },
    occupied = {
      id: "p1",
      type: "pot",
      x: 0.5,
      z: 0,
      stored: false,
      plant: { species: "pilea", growth: 0.5 },
    },
    stored = {
      id: "p2",
      type: "pot",
      x: 0.5,
      z: 0,
      stored: true,
      plant: null,
    },
    tank = { id: "p3", type: "tank", x: 0.5, z: 0, stored: false },
    s = { entities: [occupied, stored, tank] };
  Automation.tickSow(planter, s);
  assert.equal(planter.running, false, "no seeds, nothing to do");
  planter.buffer["seed:pilea"] = 3;
  Automation.tickSow(planter, s);
  assert.deepEqual(occupied.plant, { species: "pilea", growth: 0.5 });
  assert.equal(stored.plant, null);
  assert.equal(planter.buffer["seed:pilea"], 3, "no eligible pot in range");
});

test("The generic dispatch runs tickSow only for a recipe that declares sow", () => {
  const s = {
    entities: [
      { id: "p1", type: "pot", x: 0, z: 0, stored: false, plant: null },
    ],
  };
  const planter = {
    type: "autoPlanter",
    x: 0,
    z: 0,
    buffer: { "seed:pilea": 1 },
  };
  Automation.tick(planter, s);
  assert.equal(s.entities[0].plant.species, "pilea");
  const collector = { type: "collector", x: 0, z: 0, buffer: {} };
  Automation.tick(collector, s);
  assert.deepEqual(
    collector.buffer,
    {},
    "buffer mode, not sow — nothing consumed",
  );
});

test("Full lifecycle: place, load two seeds, tick plants them into empty pots, withdraw the rest", () => {
  const g = new GardenState(null, 1000);
  g.s.plans.push("autoPlanter");
  g.s.inventory.coins = 100;
  g.s.inventory.wood = 20;
  g.s.inventory.clay = 20;
  const place = g.command({
    type: "place",
    item: "autoPlanter",
    fabricate: true,
    x: -6,
    z: 2,
  });
  assert.equal(place.ok, true, place.message);
  const planter = g.s.entities.find((e) => e.type === "autoPlanter");
  assert.deepEqual(planter.buffer, {});
  g.s.inventory["seed:pilea"] = 2;
  assert.equal(
    g.command(
      { type: "load", id: planter.id, species: "pilea", source: "seed" },
      near(planter),
    ).ok,
    true,
  );
  assert.equal(
    g.command(
      { type: "load", id: planter.id, species: "pilea", source: "seed" },
      near(planter),
    ).ok,
    true,
  );
  assert.equal(planter.buffer["seed:pilea"], 2);
  assert.equal(g.s.inventory["seed:pilea"], 0);
  const potA = g.command({
      type: "place",
      item: "pot",
      fabricate: true,
      x: -4.5,
      z: 2,
    }),
    potB = g.command({
      type: "place",
      item: "pot",
      fabricate: true,
      x: -6,
      z: 3.5,
    });
  assert.equal(potA.ok, true, potA.message);
  assert.equal(potB.ok, true, potB.message);
  g.step(1);
  const potAEntity = g.s.entities.find(
      (e) => e.type === "pot" && e.x === -4.5 && e.z === 2,
    ),
    potBEntity = g.s.entities.find(
      (e) => e.type === "pot" && e.x === -6 && e.z === 3.5,
    );
  assert.ok(potAEntity?.plant, "pot A got planted");
  assert.ok(potBEntity?.plant, "pot B got planted");
  assert.equal(planter.buffer["seed:pilea"], 0);
  assert.equal(
    g.command({ type: "withdraw", id: planter.id }, near(planter)).ok,
    false,
    "nothing left to withdraw once the buffer is empty",
  );
});

test("Loading requires a real, discovered-independent seed the player actually has, and respects capacity", () => {
  const g = new GardenState(null, 1000);
  g.s.plans.push("autoPlanter");
  g.s.inventory.coins = 100;
  g.s.inventory.wood = 20;
  g.s.inventory.clay = 20;
  g.command({
    type: "place",
    item: "autoPlanter",
    fabricate: true,
    x: -6,
    z: 2,
  });
  const planter = g.s.entities.find((e) => e.type === "autoPlanter"),
    load = () =>
      g.command(
        { type: "load", id: planter.id, species: "pilea", source: "seed" },
        near(planter),
      );
  g.s.inventory["seed:pilea"] = 0;
  assert.equal(load().ok, false, "no seed in inventory");
  g.s.inventory["seed:pilea"] = D.recipes.autoPlanter.capacity + 5;
  for (let i = 0; i < D.recipes.autoPlanter.capacity; i++) load();
  assert.equal(load().ok, false, "buffer is at capacity");
  assert.equal(planter.buffer["seed:pilea"], D.recipes.autoPlanter.capacity);
});
