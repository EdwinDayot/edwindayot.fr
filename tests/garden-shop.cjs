const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D } = require("./garden-rules-helpers.cjs");

test("Every vendor's wares reference a real recipe with a non-empty coin cost", () => {
  for (const b of D.buildings.filter((b) => b.role === "vendor")) {
    assert.ok(
      b.roleData.wares.length,
      `${b.visitorId} sells at least one item`,
    );
    for (const w of b.roleData.wares) {
      assert.ok(
        D.recipes[w.item],
        `${b.visitorId}'s ${w.item} is a real recipe`,
      );
      assert.ok(
        Object.keys(w.cost).length,
        `${b.visitorId}'s ${w.item} has a cost`,
      );
    }
  }
});

test("Buying an affordable item pays the exact cost and adds exactly one to the inventory", () => {
  const g = new GardenState(null, 1000),
    before = g.s.inventory.coins;
  const r = g.command({ type: "buy", vendor: "basile", item: "lantern" });
  assert.equal(r.ok, true);
  assert.equal(g.s.inventory.coins, before - 6);
  assert.equal(g.s.inventory.lantern, 1);
});

test("Buying with insufficient funds is rejected atomically", () => {
  const g = new GardenState(null, 1000),
    before = g.serialize();
  // Mira's reservoir costs 14 coins; a fresh save only has 8.
  const r = g.command({ type: "buy", vendor: "mira", item: "reservoir" });
  assert.equal(r.ok, false);
  assert.deepEqual(g.serialize(), before);
});

test("Buying an item a vendor does not sell, or from an unknown vendor, is rejected", () => {
  const g = new GardenState(null, 1000),
    before = g.serialize();
  for (const c of [
    { type: "buy", vendor: "noe", item: "lantern" },
    { type: "buy", vendor: "nobody", item: "pot" },
    { type: "buy", vendor: "noe", item: "nonsense" },
  ]) {
    assert.equal(g.command(c).ok, false);
    assert.deepEqual(g.serialize(), before);
  }
});

test("A multi-item vendor sells each of her wares independently", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory.coins = 100;
  assert.equal(
    g.command({ type: "buy", vendor: "mira", item: "reservoir" }).ok,
    true,
  );
  assert.equal(
    g.command({ type: "buy", vendor: "mira", item: "bench" }).ok,
    true,
  );
  assert.equal(g.s.inventory.coins, 100 - 14 - 10);
  assert.equal(g.s.inventory.reservoir, 1);
  assert.equal(g.s.inventory.bench, 1);
});

test("A bought item can be placed like any other inventory item", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "buy", vendor: "basile", item: "lantern" }).ok,
    true,
  );
  const r = g.command({ type: "place", item: "lantern", x: -3, z: 2 });
  assert.equal(r.ok, true);
  assert.equal(g.s.inventory.lantern || 0, 0);
  assert.ok(
    g.s.entities.some((e) => e.type === "lantern" && e.x === -3 && e.z === 2),
  );
});
