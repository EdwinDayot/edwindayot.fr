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
test("Mining requires the right tool, proximity and timed work before rewarding once", () => {
  for (const type of ["wood", "stone", "clay"]) {
    const g = new GardenState(null, 1000),
      r = g.s.resources.find((r) => r.type === type),
      spec = D.mining[type],
      before = g.serialize();
    for (const command of [
      { type: "gather", id: r.id },
      { type: "mine", id: r.id, tool: "hand" },
    ]) {
      assert.equal(g.command(command, near(r)).ok, false);
      assert.deepEqual(g.serialize(), before);
    }
    assert.equal(
      g.command(
        { type: "mine", id: r.id, tool: spec.tool },
        near({ x: 30, z: 30 }),
      ).ok,
      false,
    );
    assert.deepEqual(g.serialize(), before);
    const start = g.s.inventory[type] || 0;
    for (let i = 0; i < spec.hits; i++) {
      assert.equal(
        g.command({ type: "mine", id: r.id, tool: spec.tool }, near(r)).ok,
        true,
      );
      if (i < spec.hits - 1) {
        assert.equal(g.s.inventory[type] || 0, start);
        const snapshot = g.serialize();
        assert.equal(
          g.command({ type: "mine", id: r.id, tool: spec.tool }, near(r)).ok,
          false,
        );
        assert.deepEqual(g.serialize(), snapshot);
      }
      g.step(0.7);
    }
    assert.equal(g.s.inventory[type], start + 3);
    assert.equal(r.work, 0);
    assert.ok(r.ready > g.s.elapsed);
    const saved = g.serialize();
    assert.equal(
      g.command({ type: "mine", id: r.id, tool: spec.tool }, near(r)).ok,
      false,
    );
    assert.deepEqual(g.serialize(), saved);
    const active = new GardenState(saved),
      offline = new GardenState(saved);
    active.step(spec.renew);
    offline.catchUp(1000 + spec.renew * 1000);
    active.s.updatedAt = offline.s.updatedAt;
    assert.deepEqual(active.serialize(), offline.serialize());
    assert.equal(
      active.command({ type: "mine", id: r.id, tool: spec.tool }, near(r)).ok,
      true,
    );
  }
});
test("Renewable sites are spread over all zones and old saves retain their cooldowns", () => {
  const g = new GardenState(null, 1000);
  const before = g.serialize();
  assert.equal(
    g.command({ type: "place", item: "pot", fabricate: true, x: -5, z: -2.5 })
      .ok,
    false,
  );
  assert.deepEqual(g.serialize(), before);
  for (const zone of D.zones)
    for (const type of ["wood", "stone", "clay"])
      assert.ok(
        g.s.resources.filter((r) => r.zone === zone.id && r.type === type)
          .length >= 4,
      );
  const old = g.serialize();
  old.landscape = 2;
  old.resources = old.resources.slice(0, 12);
  old.resources[0].ready = 90;
  const migrated = new GardenState(old);
  assert.equal(migrated.s.resources.length, D.resources.length);
  assert.equal(migrated.s.resources[0].ready, 90);
  assert.deepEqual(migrated.s.inventory, old.inventory);
  const saved = g.serialize();
  saved.resources[0].work = 99;
  assert.throws(() => validate(saved));
  g.s.unlocked = D.zones.map((z) => z.id);
  for (const resource of g.s.resources)
    assert.ok(
      C.approach(g.s, { x: 0, z: 4 }, resource).length,
      "Reach " + resource.id,
    );
});

test("Every landscape tree can be cut, leaves a solid stump and regrows without trapping anyone", () => {
  const g = new GardenState(null, 1000),
    r = g.s.resources.find((r) => r.treeId && r.zone === 0),
    spec = D.mining.wood;
  assert.ok(r);
  assert.equal(g.s.resources.filter((r) => r.treeId).length, D.trees.length);
  assert.ok(C.trees(g.s).some((t) => t.id === r.treeId));
  for (let i = 0; i < spec.hits; i++) {
    assert.equal(
      g.command({ type: "mine", id: r.id, tool: "axe" }, near(r)).ok,
      true,
    );
    g.step(0.7);
  }
  assert.equal(
    C.trees(g.s).some((t) => t.id === r.treeId),
    false,
  );
  assert.equal(C.walkable(g.s, r.x, r.z), false);
  g.step(spec.renew);
  assert.ok(C.trees(g.s).some((t) => t.id === r.treeId));
  assert.equal(C.walkable(g.s, r.x, r.z), false);
});
