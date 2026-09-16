const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../public/game/geometry.js");
const D = require("../public/game/data.js");

test("Every zone's polygon is a strict superset of its old bounds rectangle", () => {
  for (const z of D.zones) {
    const [x0, x1, z0, z1] = z.bounds;
    for (let x = x0 + 0.25; x < x1; x += 1)
      for (let zz = z0 + 0.25; zz < z1; zz += 1)
        assert.equal(
          G.zoneAt(D.zones, x, zz)?.id,
          z.id,
          `(${x},${zz}) was inside zone ${z.id}'s rectangle`,
        );
  }
});

test("zoneAt returns undefined far outside every zone's polygon", () => {
  assert.equal(G.zoneAt(D.zones, 1000, 1000), undefined);
});

test("Shared borders between neighboring zones stay exact: no gap, no overlap", () => {
  // x = -16 splits {0,1} from {2,3} depending on z; z = -5 splits {0,1}
  // from {2,3} depending on x. Ǫne side must resolve immediately, the
  // other must not, right up against the boundary.
  for (const z of [-4, 5, 15, -10, -20, -30])
    assert.notEqual(
      G.zoneAt(D.zones, -16.01, z)?.id,
      G.zoneAt(D.zones, -15.99, z)?.id,
      `x=-16 at z=${z} should flip zone id across the shared border`,
    );
  for (const x of [-30, -20, -5, 0, 3])
    assert.notEqual(
      G.zoneAt(D.zones, x, -4.99)?.id,
      G.zoneAt(D.zones, x, -5.01)?.id,
      `z=-5 at x=${x} should flip zone id across the shared border`,
    );
});

test("Bulges only extend past the outer edges of the whole map, never past a shared internal border", () => {
  // Just outside zone0's rectangle on its shared west edge (x=-16, into
  // zone1's rectangle) must resolve to zone1, never bleed back into zone0.
  assert.equal(G.zoneAt(D.zones, -16.5, 7)?.id, 1);
  // Just outside zone0's rectangle on its own outer north edge (z=19) is a
  // real bulge: it should still be zone0, not undefined.
  assert.equal(G.zoneAt(D.zones, -6, 19.5)?.id, 0);
});

test("Every static resource and tree carries the zone id zoneAt would compute for its position", () => {
  for (const r of D.resources)
    assert.equal(r.zone, G.zoneAt(D.zones, r.x, r.z)?.id, r.id);
});

test("distanceToPolygonEdge is zero on an edge and grows moving inward", () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(G.distanceToPolygonEdge(square, 5, 0), 0);
  assert.equal(G.distanceToPolygonEdge(square, 5, 5), 5);
  assert.equal(G.distanceToPolygonEdge(square, 1, 1), 1);
});

test("pointInPolygon agrees with a simple square's obvious inside/outside points", () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(G.pointInPolygon(square, 5, 5), true);
  assert.equal(G.pointInPolygon(square, -1, 5), false);
  assert.equal(G.pointInPolygon(square, 11, 5), false);
});
