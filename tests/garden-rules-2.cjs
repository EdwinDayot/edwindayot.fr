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
test("Stage 3: renewable harvests never remove adults; discovery occurs once; requests stay accessible", () => {
  const g = new GardenState(null, 1000),
    p = g.s.entities[0];
  g.command({ type: "collect", id: p.id }, near(p));
  assert.equal(p.plant.growth, 1);
  assert.equal(g.s.inventory["cutting:pilea"], 1);
  g.step(500);
  assert.equal(p.plant.ready, 3);
  g.step(500);
  assert.equal(p.plant.ready, 3);
  for (let i = 0; i < 50; i++) {
    g.command({ type: "replace", request: g.s.requests[0].id });
    assert.equal(g.s.requests.length, 3);
    assert.ok(
      g.s.requests.every((r) => g.s.discovered.includes(r.item.split(":")[1])),
    );
  }
  g.s.unlocked.push(1);
  const c = D.caches[0];
  assert.equal(g.command({ type: "discover", id: c.id }, near(c)).ok, true);
  const before = g.serialize();
  assert.equal(g.command({ type: "discover", id: c.id }, near(c)).ok, false);
  assert.deepEqual(g.serialize(), before);
});

test("Stage 4: real water, empty/full tanks, disconnected pipes and pumping", () => {
  const g = irrigation(),
    p = g.s.entities[0],
    tank = g.s.entities[1];
  g.step(10);
  assert.ok(p.plant.moisture > 10);
  assert.equal(tank.water, 95);
  g.command({ type: "disconnect", id: "e4", to: "e5" });
  const before = p.plant.moisture;
  g.step(10);
  assert.ok(p.plant.moisture < before);
  assert.equal(tank.water, 95);
  g.command({ type: "connect", id: "e4", to: "e5" });
  tank.water = 0;
  g.step(10);
  assert.equal(tank.water, 0);
  tank.x = 2.5;
  tank.z = 2;
  g.s.links = [];
  g.s.entities.push({
    id: "e6",
    type: "pump",
    x: 3,
    z: 0,
    rotation: 0,
    stored: false,
  });
  g.s.nextId = 7;
  g.command({ type: "connect", id: "e4", to: "e6" });
  g.step(100);
  assert.equal(tank.water, 160);
  g.command({ type: "disconnect", id: "e4", to: "e6" });
  tank.water = 0;
  g.step(10);
  assert.equal(tank.water, 0);
});
