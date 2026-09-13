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
test("Placement cannot trap the player and a pot cannot bridge independent drip networks", () => {
  const g = irrigation();
  g.s.inventory.pot = 1;
  const before = g.serialize();
  assert.equal(
    g.command(
      { type: "place", item: "pot", x: -3, z: 2 },
      { position: { x: -3, z: 2 } },
    ).ok,
    false,
  );
  assert.deepEqual(g.serialize(), before);
  g.s.entities.push({
    id: "e6",
    type: "drip",
    x: -3,
    z: 1.5,
    rotation: 0,
    stored: false,
  });
  g.s.nextId = 7;
  assert.equal(g.command({ type: "connect", id: "e6", to: "e1" }).ok, false);
});
test("Quick slots persist, accept discovered items, swap and reject invalid assignment atomically", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.hotbar, D.defaultHotbar);
  assert.equal(
    g.command({ type: "equip", slot: 2, item: "seed:monstera" }).ok,
    true,
  );
  assert.equal(g.command({ type: "swapSlots", a: 0, b: 2 }).ok, true);
  assert.equal(g.s.hotbar[0], "seed:monstera");
  const before = g.serialize();
  for (const c of [
    { type: "equip", slot: 5, item: "pot" },
    { type: "equip", slot: 2, item: "tank" },
    { type: "equip", slot: 1, item: "seed:cactus" },
    { type: "swapSlots", a: 1, b: -1 },
  ]) {
    assert.equal(g.command(c).ok, false);
    assert.deepEqual(g.serialize(), before);
  }
  assert.deepEqual(new GardenState(before).s.hotbar, g.s.hotbar);
});
test("Old v3 gardens survive landscape expansion with plants, cooldowns and default quick slots", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  delete old.landscape;
  delete old.hotbar;
  old.resources[3].x = -16;
  old.resources[3].z = -3;
  old.resources[3].ready = 87;
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.entities, old.entities);
  assert.equal(migrated.s.resources[3].ready, 87);
  assert.equal(migrated.s.resources[3].x, D.resources[3].x);
  assert.deepEqual(migrated.s.hotbar, D.defaultHotbar);
  const area = D.zones.reduce(
    (n, z) => n + (z.bounds[1] - z.bounds[0]) * (z.bounds[3] - z.bounds[2]),
    0,
  );
  assert.ok(area > 2000);
  assert.ok(D.trees.filter((t) => C.zoneAt(t.x, t.z)?.id === 1).length >= 20);
  const tree = D.trees.find((t) => C.zoneAt(t.x, t.z)?.id === 0);
  assert.equal(C.walkable(g.s, tree.x, tree.z), false);
});
test("Quick construction fabricates only after legal placement; irrigation explains real operating states", () => {
  const g = new GardenState(null, 1000),
    before = g.serialize();
  assert.equal(
    g.command({ type: "place", item: "pot", fabricate: true, x: 0, z: 0 }).ok,
    false,
  );
  assert.deepEqual(g.serialize(), before);
  assert.equal(
    g.command({ type: "place", item: "pot", fabricate: true, x: -3, z: 2 }).ok,
    true,
  );
  assert.equal(g.s.inventory.clay, 0);
  assert.equal(g.s.entities.length, 4);
  const I = require("../public/game/irrigation.js"),
    network = irrigation(),
    tank = network.s.entities[1];
  assert.equal(I.status(network.s, tank).kind, "idle");
  network.step(1);
  assert.equal(I.status(network.s, tank).kind, "flowing");
  assert.equal(I.status(network.s, tank).flow, 0.5);
  tank.water = 0;
  network.step(1);
  assert.equal(I.status(network.s, tank).kind, "empty");
  network.s.links = [];
  assert.equal(I.status(network.s, tank).kind, "unconnected");
});
