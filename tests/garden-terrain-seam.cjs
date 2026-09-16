const { test } = require("node:test");
const assert = require("node:assert/strict");
const { terrainHeight } = require("../public/game/terrain.js");
const D = require("../public/game/data.js");

test("terrainHeight is exactly 0 far from every hill", () => {
  assert.equal(terrainHeight(1000, -1000), 0);
  assert.equal(terrainHeight(0, 0), 0);
});

test("terrainHeight is exactly 0 right at a hill's own radius, and positive inside it", () => {
  // Matches the zone0 hill this file documents (game/terrain.js).
  assert.equal(terrainHeight(-6.5 + 3.5, 2.5), 0, "exactly at the radius");
  assert.equal(terrainHeight(-6.5 + 3.6, 2.5), 0, "past the radius");
  assert.ok(terrainHeight(-6.5, 2.5) > 0, "at the peak");
  assert.ok(
    terrainHeight(-6.5, 2.5) <= 3.6 + 1e-9,
    "never exceeds the hill's own height",
  );
});

test("terrainHeight never exceeds the documented amplitude cap anywhere near the map", () => {
  // 4.7 measured directly (a throwaway grid scan over every hill, see
  // game/terrain.js) rather than assumed additive from the tallest single
  // hill — hills are spaced far enough apart that none actually overlap.
  for (let x = -45; x <= 10; x += 2.5)
    for (let z = -40; z <= 25; z += 2.5)
      assert.ok(
        terrainHeight(x, z) <= 4.7 + 1e-9,
        `terrainHeight(${x},${z}) exceeded the 4.7 cap`,
      );
});

test("Every zone0 house, visitor, resource, cache and the gate stay on flat ground (verified clearance from the two zone0 hills)", () => {
  const points = [
    ...D.resources
      .filter((r) => r.zone === 0)
      .map((r) => ({ id: r.id, x: r.x, z: r.z })),
    ...D.visitors.map((v) => ({ id: v.id, x: v.x, z: v.z })),
    ...D.buildings.map((b) => ({ id: "house:" + b.visitorId, x: b.x, z: b.z })),
    { id: "gate0", x: D.zones[0].gate[0], z: D.zones[0].gate[1] },
    { id: "e1", x: -3, z: 0 },
    { id: "e2", x: 0, z: 0 },
    { id: "e3", x: 0, z: -3 },
  ];
  for (const p of points)
    assert.equal(
      terrainHeight(p.x, p.z),
      0,
      `${p.id} at (${p.x},${p.z}) should be flat`,
    );
});
