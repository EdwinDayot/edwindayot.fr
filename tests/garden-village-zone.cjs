// Épic C3.5 (campagne, phase 3) : "Le coin de village" (zone 4) and its two
// generic residents. This is base garden data (data-world.js/data-buildings.js),
// not a campaign-* module, so it lives alongside the other garden-*.cjs tests
// that already exercise D.zones/D.buildings generically.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D, C } = require("./garden-rules-helpers.cjs");
const G = require("../public/game/geometry.js");

test("Zone 4 exists, is always unlocked and has no unlock cost, like zone0", () => {
  const z = D.zones.find((z) => z.id === 4);
  assert.ok(z, "zone 4 should exist");
  assert.deepEqual(z.cost, {});
  assert.equal(z.rep, 0);
  const g = new GardenState(null, 1000);
  assert.ok(g.s.unlocked.includes(4), "zone 4 should be unlocked on a fresh save");
});

test("Zone 4's shared border with zone0 has neither gap nor overlap", () => {
  // Zone 4's polygon deliberately repeats zone0's own north-edge points
  // ([-16,19], [-6,22], [4,19]) as its south edge — the same "shared edges
  // stay exact" convention already tested for zone0/1 and zone0/2 in
  // garden-geometry.cjs, just along a diagonal instead of a straight line.
  // Boundary z(x), computed from zone0's own polygon points ([-16,19],
  // [-6,22], [4,19]) rather than hand-copied, to avoid a second arithmetic
  // mistake on top of the one this test caught the first time it ran.
  const boundaryZ = (x) =>
    x <= -6 ? 19 + (x + 16) * 0.3 : 22 - (x + 6) * 0.3;
  for (const x of [-15, -10, -6, -2, 3]) {
    const edge = boundaryZ(x),
      below = G.zoneAt(D.zones, x, edge - 0.05)?.id,
      above = G.zoneAt(D.zones, x, edge + 0.3)?.id;
    assert.equal(below, 0, `(${x},${edge - 0.05}) should still resolve to zone0`);
    assert.equal(above, 4, `(${x},${edge + 0.3}) should resolve to zone4`);
  }
});

test("Zone 4 never overlaps any other zone", () => {
  const z4 = D.zones.find((z) => z.id === 4);
  for (let x = z4.bounds[0]; x <= z4.bounds[1]; x += 1)
    for (let z = z4.bounds[2]; z <= z4.bounds[3]; z += 1)
      if (G.pointInPolygon(z4.polygon, x, z))
        for (const other of D.zones)
          if (other.id !== 4)
            assert.equal(
              G.pointInPolygon(other.polygon, x, z),
              false,
              `(${x},${z}) is inside both zone4 and zone${other.id}`,
            );
});

test("Both villagers are plain residents, in zone 4, with a generic id", () => {
  for (const id of ["villageois-1", "villageois-2"]) {
    const b = D.buildings.find((b) => b.visitorId === id);
    assert.ok(b, id + " should exist");
    assert.equal(b.role, "resident");
    assert.deepEqual(b.roleData.quests, undefined);
    assert.equal(C.zoneAt(b.x, b.z)?.id, 4);
  }
});

test("Every resource in zone 4 actually resolves to zone 4 (data-driven, not asserted)", () => {
  for (const r of D.resources.filter((r) => r.zone === 4))
    assert.equal(G.zoneAt(D.zones, r.x, r.z)?.id, 4, r.id);
  for (const type of ["wood", "stone", "clay"])
    assert.ok(
      D.resources.filter((r) => r.zone === 4 && r.type === type).length >= 4,
    );
});
