const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  GardenState,
  validate,
  migrate,
  SaveStore,
  KEY,
  BACKUP,
  LEGACY,
  D,
  C,
  near,
  memory,
  irrigation,
} = require("./garden-rules-helpers.cjs");
test("Stage 1: seed choice consumes precisely one seed; rejected commands are atomic", () => {
  const g = new GardenState(null, 1000),
    e = g.s.entities[1];
  let before = g.serialize();
  assert.equal(
    g.command({ type: "plant", id: e.id, species: "cactus" }, near(e)).ok,
    false,
  );
  assert.deepEqual(g.serialize(), before);
  assert.equal(
    g.command({ type: "plant", id: e.id, species: "calathea" }, near(e)).ok,
    true,
  );
  assert.equal(g.s.inventory["seed:calathea"], 1);
  assert.equal(g.s.inventory["seed:pilea"], 2);
  before = g.serialize();
  assert.equal(
    g.command({ type: "plant", id: e.id, species: "pilea" }, near(e)).ok,
    false,
  );
  assert.deepEqual(g.serialize(), before);
  g.step(30);
  assert.equal(e.plant.growth, 0);
  g.command({ type: "water", id: e.id }, near(e));
  g.step(26);
  assert.ok(e.plant.growth >= 0.12);
  assert.equal(g.s.inventory.coins, 8);
});
test("Stage 1: migration retains each plant, water, resources and upgraded pots", () => {
  const old = {
    version: 2,
    water: 43,
    tokens: 17,
    cares: 91,
    plots: Array.from({ length: 6 }, (_, i) => ({
      species: i % 3,
      planted: i < 4,
      growth: 0.6,
      moisture: 37,
      level: i % 3,
      age: 100,
    })),
  };
  const m = migrate(old, 1000);
  validate(m);
  assert.equal(m.entities.length, 6);
  assert.equal(m.water, 43);
  assert.equal(m.inventory.coins, 17);
  assert.equal(m.entities[2].legacyLevel, 2);
  assert.equal(m.entities[2].plant.growth, 0.6);
  const store = memory();
  store.setItem(LEGACY, JSON.stringify(old));
  new SaveStore(store).load(1000);
  assert.equal(store.getItem(LEGACY + "-backup"), JSON.stringify(old));
  assert.ok(store.getItem(KEY));
});
test("Stage 1: corrupted save, unavailable storage, invalid import and backup recovery", () => {
  const storage = memory(),
    store = new SaveStore(storage),
    g = new GardenState(null, 1000);
  store.save(g, 1000);
  g.s.water = 80;
  store.save(g, 1000);
  storage.setItem(KEY, "bad");
  const recovered = store.load(1000);
  assert.equal(recovered.game.s.water, 100);
  assert.match(recovered.message, /restaurée/);
  const before = storage.getItem(KEY);
  assert.throws(() => store.import('{"version":3}'));
  assert.equal(storage.getItem(KEY), before);
  const bad = new SaveStore({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  });
  assert.doesNotThrow(() => bad.load(1000));
  assert.equal(bad.available, false);
});
test("Stage 2: collision, locked land, river and access are checked before payment", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "craft", item: "pot" });
  const before = g.serialize();
  for (const [x, z] of [
    [0, 0],
    [6, 1],
    [-25, 0],
    [3.5, 4],
  ]) {
    assert.equal(g.command({ type: "place", item: "pot", x, z }).ok, false);
    assert.deepEqual(g.serialize(), before);
  }
  assert.equal(g.command({ type: "place", item: "pot", x: -3, z: 2 }).ok, true);
  assert.equal(g.s.entities.length, 4);
  const path = C.path(g.s, { x: -1, z: 3 }, { x: -5, z: -2 });
  assert.ok(path.length);
  assert.ok(path.every((p) => C.walkable(g.s, p.x, p.z)));
  assert.ok(C.approach(g.s, { x: -1, z: 3 }, g.s.entities[0]).length);
});
test("Stage 2: moving preserves plants and in-range links, storage pauses growth", () => {
  const g = new GardenState(null, 1000),
    p = g.s.entities[0];
  g.s.entities.push({
    id: "e4",
    type: "drip",
    x: -4.5,
    z: 0,
    rotation: 0,
    stored: false,
  });
  g.s.nextId = 5;
  assert.equal(g.command({ type: "connect", id: "e4", to: p.id }).ok, true);
  const original = structuredClone(p.plant);
  assert.equal(g.command({ type: "move", id: p.id, x: -3, z: 0.5 }).ok, true);
  assert.deepEqual(p.plant, original);
  assert.equal(g.s.links.length, 1);
  assert.equal(g.command({ type: "move", id: p.id, x: -5, z: 2 }).ok, true);
  assert.deepEqual(p.plant, original);
  assert.equal(g.s.links.length, 0);
  g.command({ type: "store", id: p.id });
  g.step(100);
  assert.deepEqual(p.plant, original);
  assert.equal(g.command({ type: "restore", id: p.id, x: -3, z: 0 }).ok, true);
});
