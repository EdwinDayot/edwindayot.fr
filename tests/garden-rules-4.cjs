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
test("Stage 5: twenty-minute route from a fresh save without granting any resources", () => {
  const g = new GardenState(null, 1000);
  let pos = { x: -1, z: 3 },
    clock = 0;
  const log = [];
  function go(e) {
    const path = C.approach(g.s, pos, e);
    assert.ok(path.length || C.distance(pos, e) < 1.85, `Reach ${e.id}`);
    for (const p of path) {
      g.step(C.distance(pos, p) / 3);
      pos = p;
    }
    clock = g.s.elapsed;
  }
  function command(c, e) {
    if (e) go(e);
    const result = g.command(c, { position: pos });
    assert.equal(result.ok, true, `${JSON.stringify(c)}: ${result.message}`);
    log.push([g.s.elapsed, c.type]);
  }
  const waitUntil = (t) => {
    if (t > g.s.elapsed) g.step(t - g.s.elapsed);
  };
  waitUntil(30);
  const pilea = g.s.entities[0];
  command({ type: "collect", id: pilea.id }, pilea);
  waitUntil(60);
  const empty = g.s.entities[1];
  command({ type: "plant", id: empty.id, species: "pilea" }, empty);
  command({ type: "water", id: empty.id });
  waitUntil(180);
  command(
    {
      type: "trade",
      request: g.s.requests.find((r) => r.item === "cutting:pilea").id,
    },
    D.visitors[0],
  );
  waitUntil(240);
  command({ type: "craft", item: "pot" });
  command({ type: "place", item: "pot", x: -3, z: 2 });
  waitUntil(360);
  for (const id of ["wood", "stone", "clay"]) {
    const r = g.s.resources.find((r) => r.zone === 0 && r.type === id);
    go(r);
    for (let i = 0; i < D.mining[id].hits; i++) {
      command({ type: "mine", id: r.id, tool: D.mining[id].tool });
      g.step(0.7);
    }
  }
  waitUntil(420);
  command(
    { type: "unlock", zone: 1 },
    { id: "gate", x: D.zones[1].gate[0], z: D.zones[1].gate[1] },
  );
  const cache = D.caches[0];
  command({ type: "discover", id: cache.id }, cache);
  waitUntil(720);
  command({ type: "collect", id: empty.id }, empty);
  command({ type: "craft", item: "tank" });
  command({ type: "place", item: "tank", x: 2, z: 1 });
  command({ type: "craft", item: "drip" });
  command({ type: "place", item: "drip", x: 1, z: 0 });
  const tank = g.s.entities.find((e) => e.type === "tank"),
    drip = g.s.entities.find((e) => e.type === "drip");
  command({ type: "fill" }, { id: "river", x: 3.5, z: 4 });
  command({ type: "fillTank", id: tank.id }, tank);
  command({ type: "connect", id: tank.id, to: drip.id });
  command({ type: "connect", id: drip.id, to: empty.id });
  assert.ok(g.s.elapsed < 1200);
  assert.equal(g.s.trades, 1);
  assert.equal(g.s.entities.filter((e) => e.type === "pot").length, 4);
  assert.ok(g.s.unlocked.includes(1));
  assert.ok(g.s.discovered.includes("pothos"));
  const start = empty.plant.growth;
  g.step(1200 - g.s.elapsed);
  assert.ok(empty.plant.growth >= start);
  assert.ok(empty.plant.ready > 0);
  assert.ok(tank.water < 100);
  validate(g.serialize());
  console.log(
    "First-session milestones (simulation seconds):",
    JSON.stringify(log),
  );
});
test("Safety net has no cost and stored plants do not qualify as lost", () => {
  const g = new GardenState();
  const before = g.serialize();
  assert.equal(g.command({ type: "rescue" }).ok, false);
  assert.deepEqual(g.serialize(), before);
  g.s.entities.forEach((e) => (e.plant = null));
  for (const k of Object.keys(g.s.inventory))
    if (k.includes(":")) g.s.inventory[k] = 0;
  assert.equal(g.command({ type: "rescue" }).ok, true);
  assert.equal(g.s.inventory["seed:pilea"], 2);
});
test("Current wall-clock saves are valid; imported malformed networks, capacities and times are rejected", () => {
  const g = new GardenState();
  assert.doesNotThrow(() => validate(g.serialize()));
  for (const mutate of [
    (s) => (s.water = -1),
    (s) => (s.updatedAt = Infinity),
    (s) => (s.inventory.wood = -1),
    (s) => (s.entities[0].plant.ready = 4),
    (s) => (s.requests[0].item = "seed:cactus"),
    (s) => s.links.push(["e1", "e2"]),
    (s) => (s.nextId = 1),
    (s) => (s.settings.sound = "yes"),
  ]) {
    const s = g.serialize();
    mutate(s);
    assert.throws(() => validate(s));
  }
});
