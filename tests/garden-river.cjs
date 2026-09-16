const { test } = require("node:test");
const assert = require("node:assert/strict");
const River = require("../public/game/river.js");
const { GardenState } = require("./garden-rules-helpers.cjs");

test("riverX is pinned to the old straight river's position at z=4 (dock, fill point, label untouched)", () => {
  assert.equal(River.riverX(4), 5.8);
});

test("riverX genuinely curves away from a straight line elsewhere", () => {
  assert.notEqual(River.riverX(-10), River.riverX(4));
  assert.notEqual(River.riverX(14), River.riverX(4));
});

test("distanceToRiver is ~0 exactly on the centerline and grows moving away from it", () => {
  const z = 10,
    x = River.riverX(z);
  assert.ok(River.distanceToRiver(x, z) < 0.01);
  assert.ok(River.distanceToRiver(x + 5, z) > River.distanceToRiver(x + 1, z));
});

test("A pump is still legal at every position the existing test suite already relies on", () => {
  for (const [x, z] of [
    [3, 0],
    [6, 0],
    [2.5, 0],
  ])
    assert.ok(
      River.distanceToRiver(x, z) <= 2.5,
      `(${x},${z}) should still read as "at the river"`,
    );
});

test("A pump far from the river, even inside an unlocked zone, is rejected", () => {
  const g = new GardenState(null, 1000);
  g.s.unlocked.push(1);
  g.s.plans.push("pump");
  g.s.inventory.coins = 100;
  g.s.inventory.wood = 20;
  g.s.inventory.stone = 20;
  const r = g.command({
    type: "place",
    item: "pump",
    fabricate: true,
    x: -25,
    z: 5,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /rivière/);
});

test("A pump right at the curved bank is legal wherever the curve actually is", () => {
  const g = new GardenState(null, 1000);
  g.s.plans.push("pump");
  g.s.inventory.coins = 100;
  g.s.inventory.wood = 20;
  g.s.inventory.stone = 20;
  const z = 2,
    x = Math.round((River.riverX(z) - 1.5) * 2) / 2;
  const r = g.command({ type: "place", item: "pump", fabricate: true, x, z });
  assert.equal(r.ok, true, r.message);
});
