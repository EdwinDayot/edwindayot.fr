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
test("Stage 4: low flow rotates among all consumers; collector saturation and selected multiplication", () => {
  const g = irrigation();
  g.s.entities = [];
  g.s.links = [];
  g.s.nextId = 20;
  const tank = {
    id: "e1",
    type: "tank",
    x: 0,
    z: 0,
    water: 1,
    rotation: 0,
    stored: false,
  };
  g.s.entities.push(tank);
  for (let i = 0; i < 4; i++) {
    g.s.entities.push({
      id: `e${i + 2}`,
      type: "drip",
      x: Math.cos(i) * 1.5,
      z: Math.sin(i) * 1.5,
      rotation: 0,
      stored: false,
    });
    const p = {
      id: `e${i + 6}`,
      type: "pot",
      x: Math.cos(i) * 2.5,
      z: Math.sin(i) * 2.5,
      rotation: 0,
      stored: false,
      plant: {
        species: "pilea",
        growth: 1,
        moisture: 0,
        progress: 0,
        ready: 3,
      },
    };
    g.s.entities.push(p);
    g.s.links.push(["e1", `e${i + 2}`], [`e${i + 2}`, p.id]);
  }
  for (let i = 0; i < 16; i++) {
    tank.water = 0.5;
    g.step(1);
  }
  assert.ok(
    g.s.entities.filter((e) => e.plant).every((e) => e.plant.moisture > 0),
  );
  const collector = {
    id: "e12",
    type: "collector",
    x: 0,
    z: 0,
    rotation: 0,
    stored: false,
    buffer: { "cutting:pilea": 22 },
  };
  g.s.entities.push(collector);
  g.step(1);
  assert.equal(collector.buffer["cutting:pilea"], 24);
  assert.equal(
    g.s.entities.filter((e) => e.plant).reduce((n, e) => n + e.plant.ready, 0),
    10,
  );
  g.command({ type: "withdraw", id: "e12" }, near(collector));
  assert.equal(g.s.inventory["cutting:pilea"], 24);
  g.s.entities.push({
    id: "e13",
    type: "nursery",
    x: 0,
    z: 1,
    rotation: 0,
    stored: false,
  });
  g.command(
    { type: "multiply", id: "e13", species: "pilea" },
    near({ x: 0, z: 1 }),
  );
  assert.equal(g.s.inventory["cutting:pilea"], 23);
  g.step(180);
  assert.equal(g.s.entities.at(-1).job.remaining, 0);
  assert.equal(g.s.inventory["young:pilea"], undefined);
  assert.ok(
    g.command({ type: "collectYoung", id: "e13" }, near({ x: 0, z: 1 })).ok,
  );
  assert.equal(g.s.inventory["young:pilea"], 1);
});
test("Stage 4: fixed-step active/offline equivalence, cap, future timestamps and no double claim", () => {
  const a = irrigation(),
    b = new GardenState(a.serialize());
  for (let i = 0; i < 12000; i++) a.step(0.1);
  b.catchUp(1201000);
  a.s.updatedAt = b.s.updatedAt;
  assert.deepEqual(a.serialize(), b.serialize());
  const capped = irrigation();
  assert.equal(capped.catchUp(1e12).seconds, 28800);
  assert.equal(capped.catchUp(1e12).seconds, 0);
  const future = irrigation();
  future.s.updatedAt = 1e12;
  const growth = future.s.entities[0].plant.growth;
  assert.equal(future.catchUp(1000).seconds, 0);
  assert.equal(future.s.entities[0].plant.growth, growth);
  const storage = memory(),
    store = new SaveStore(storage);
  store.save(irrigation(), 1000);
  const first = store.load(301000);
  const produced = first.game.s.stats.produced;
  assert.equal(store.load(301000).game.s.stats.produced, produced);
});
