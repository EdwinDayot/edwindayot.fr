const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");

test("A fresh game starts with an empty cultivar list", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.cultivars, []);
  assert.equal(g.s.cultivarNextId, 1);
});

test("A cultivar created directly on the state keeps its exact id and traits across a real save/reload round trip", () => {
  const g = new GardenState(null, 1000);
  const created = Cultivars.createCultivar(g.s, {
    name: "Veilleuse de pluie",
    parentIds: [],
    traits: { habit: "rosette", leaf: "round", flower: "bell", color: "blue" },
  });
  assert.equal(created.id, "c1");
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  const reloaded = new GardenState(saved);
  assert.equal(reloaded.s.cultivars.length, 1);
  assert.deepEqual(reloaded.s.cultivars[0], created);
  assert.equal(reloaded.s.cultivarNextId, 2);
});

test("A second cultivar gets a distinct, incrementing id", () => {
  const g = new GardenState(null, 1000);
  const first = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  const second = Cultivars.createCultivar(g.s, {
    name: "B",
    parentIds: [first.id],
    traits: {},
  });
  assert.equal(first.id, "c1");
  assert.equal(second.id, "c2");
  assert.deepEqual(second.parentIds, ["c1"]);
});

test("createSpecimen returns a plain reference to its cultivar, location and stage, not yet wired into entities", () => {
  const specimen = Cultivars.createSpecimen({
    cultivarId: "c1",
    x: 2.5,
    z: -1,
    stage: 0.4,
  });
  assert.deepEqual(specimen, { cultivarId: "c1", x: 2.5, z: -1, stage: 0.4 });
});

test("A v3 save without a cultivars field migrates to the empty default without altering the rest of its content", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  delete old.cultivars;
  delete old.cultivarNextId;
  const before = JSON.stringify({ ...old, cultivars: undefined, cultivarNextId: undefined });
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.cultivars, []);
  assert.equal(migrated.s.cultivarNextId, 1);
  const after = JSON.stringify({
    ...migrated.s,
    cultivars: undefined,
    cultivarNextId: undefined,
  });
  assert.equal(after, before, "no other field should change during this migration");
});

test("A malformed cultivars field is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const bad of [
    "nope",
    [{ id: "bad-id", name: "x", parentIds: [], traits: {} }],
    [{ id: "c1", name: 1, parentIds: [], traits: {} }],
    [{ id: "c1", name: "x", parentIds: ["a", "b", "c"], traits: {} }],
    [{ id: "c1", name: "x", parentIds: [], traits: null }],
    [
      { id: "c1", name: "x", parentIds: [], traits: {} },
      { id: "c1", name: "y", parentIds: [], traits: {} },
    ],
  ]) {
    const saved = g.serialize();
    saved.cultivars = bad;
    assert.throws(() => validate(saved), /Cultivar invalide/);
  }
});

test("A cultivarNextId that would collide with an existing cultivar id is rejected", () => {
  const g = new GardenState(null, 1000),
    saved = g.serialize();
  saved.cultivars = [{ id: "c3", name: "x", parentIds: [], traits: {} }];
  saved.cultivarNextId = 3;
  assert.throws(() => validate(saved), /Identifiants de cultivar invalides/);
  saved.cultivarNextId = 4;
  assert.doesNotThrow(() => validate(saved));
});
