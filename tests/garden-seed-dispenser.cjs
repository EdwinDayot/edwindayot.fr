const { test } = require("node:test");
const assert = require("node:assert/strict");
const Automation = require("../public/game/automation.js");
const { GardenState, D, near } = require("./garden-rules-helpers.cjs");

test("tickDispense manufactures one seed every `every` ticks, up to its own capacity", () => {
  const spec = D.recipes.seedDispenser.dispense,
    e = { type: "seedDispenser", x: 0, z: 0, buffer: {} };
  for (let elapsed = 1; elapsed <= spec.every * 3; elapsed++) {
    const s = { elapsed, entities: [e] };
    Automation.tickDispense(e, s);
  }
  assert.equal(e.buffer[`seed:${spec.species}`], 3);
});

test("tickDispense stops manufacturing once its own capacity is reached", () => {
  const spec = D.recipes.seedDispenser,
    item = `seed:${spec.dispense.species}`,
    e = {
      type: "seedDispenser",
      x: 0,
      z: 0,
      buffer: { [item]: spec.capacity },
    },
    s = { elapsed: spec.dispense.every, entities: [e] };
  Automation.tickDispense(e, s);
  assert.equal(e.buffer[item], spec.capacity, "no overflow past capacity");
});

test("tickDispense feeds one seed at a time to an auto-planter in range that has room", () => {
  const item = `seed:${D.recipes.seedDispenser.dispense.species}`,
    dispenser = { type: "seedDispenser", x: 0, z: 0, buffer: { [item]: 3 } },
    planter = { type: "autoPlanter", x: 1, z: 0, buffer: {} },
    far = { type: "autoPlanter", x: 100, z: 0, buffer: {} },
    s = { elapsed: 1, entities: [dispenser, planter, far] };
  Automation.tickDispense(dispenser, s);
  assert.equal(planter.buffer[item], 1);
  assert.equal(dispenser.buffer[item], 2);
  assert.equal(far.buffer[item], undefined, "out of range, untouched");
});

test("tickDispense never overfills a nearby planter past its own capacity", () => {
  const item = `seed:${D.recipes.seedDispenser.dispense.species}`,
    cap = D.recipes.autoPlanter.capacity,
    dispenser = { type: "seedDispenser", x: 0, z: 0, buffer: { [item]: 5 } },
    planter = { type: "autoPlanter", x: 1, z: 0, buffer: { [item]: cap } },
    s = { elapsed: 1, entities: [dispenser, planter] };
  Automation.tickDispense(dispenser, s);
  assert.equal(planter.buffer[item], cap);
  assert.equal(
    dispenser.buffer[item],
    5,
    "kept its seed, the planter had no room",
  );
});

test("The generic dispatch runs tickDispense only for a recipe that declares dispense", () => {
  const item = `seed:${D.recipes.seedDispenser.dispense.species}`,
    dispenser = { type: "seedDispenser", x: 0, z: 0, buffer: {} },
    s = {
      elapsed: D.recipes.seedDispenser.dispense.every,
      entities: [dispenser],
    };
  Automation.tick(dispenser, s);
  assert.equal(dispenser.buffer[item], 1);
  const collector = { type: "collector", x: 0, z: 0, buffer: {} };
  Automation.tick(collector, s);
  assert.deepEqual(
    collector.buffer,
    {},
    "no dispense declared, tickDispense never ran",
  );
});

test("Full lifecycle: place both, wait for the dispenser to manufacture and hand off a seed, then it plants itself", () => {
  const g = new GardenState(null, 1000);
  g.s.plans.push("seedDispenser", "autoPlanter");
  g.s.inventory.coins = 100;
  g.s.inventory.wood = 20;
  g.s.inventory.clay = 20;
  const dispenserPlace = g.command({
      type: "place",
      item: "seedDispenser",
      fabricate: true,
      x: -6,
      z: 2,
    }),
    planterPlace = g.command({
      type: "place",
      item: "autoPlanter",
      fabricate: true,
      x: -3.5,
      z: 2,
    });
  assert.equal(dispenserPlace.ok, true, dispenserPlace.message);
  assert.equal(planterPlace.ok, true, planterPlace.message);
  const dispenser = g.s.entities.find((e) => e.type === "seedDispenser"),
    planter = g.s.entities.find((e) => e.type === "autoPlanter"),
    pot = g.command({
      type: "place",
      item: "pot",
      fabricate: true,
      x: -2,
      z: 2,
    });
  assert.equal(pot.ok, true, pot.message);
  g.step(D.recipes.seedDispenser.dispense.every + 1);
  const item = `seed:${D.recipes.seedDispenser.dispense.species}`,
    potEntity = g.s.entities.find((e) => e.type === "pot" && e.x === -2);
  assert.ok(
    (planter.buffer[item] || 0) > 0 || potEntity.plant,
    "the seed either reached the planter's buffer or was already sown",
  );
  assert.equal(
    g.command({ type: "withdraw", id: dispenser.id }, near(dispenser)).ok,
    false,
    "the dispenser handed its only seed to the planter, nothing left to withdraw",
  );
});
