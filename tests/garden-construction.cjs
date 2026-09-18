const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D, C } = require("./garden-rules-helpers.cjs");

test("Landscape 5 moves an old pot caught inside a new house without losing its plant", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  old.landscape = 4;
  const trapped = old.entities[0],
    house = D.buildings.find((b) => b.visitorId === "lea");
  trapped.x = house.x;
  trapped.z = house.z;
  const plant = trapped.plant;
  const migrated = new GardenState(old);
  assert.equal(migrated.s.landscape, 6);
  const moved = migrated.s.entities.find((e) => e.id === trapped.id);
  assert.deepEqual(moved.plant, plant);
  assert.ok(
    D.buildings.every(
      (b) => !C.insideHouse(b, moved.x, moved.z, C.radius(moved) + 0.4),
    ),
    `moved entity landed at ${moved.x},${moved.z}, still inside a house`,
  );
  assert.equal(C.placement(migrated.s, moved, moved.id), null);
});

test("Landscape 5 leaves entities that were never inside a house untouched", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  old.landscape = 4;
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.entities, old.entities);
});

test("Landscape 6 moves an old pot caught inside a wave-1 artisans' house without losing its plant", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  old.landscape = 5;
  const trapped = old.entities[0],
    house = D.buildings.find((b) => b.visitorId === "mira");
  trapped.x = house.x;
  trapped.z = house.z;
  const plant = trapped.plant;
  const migrated = new GardenState(old);
  assert.equal(migrated.s.landscape, 6);
  const moved = migrated.s.entities.find((e) => e.id === trapped.id);
  assert.deepEqual(moved.plant, plant);
  assert.ok(
    D.buildings.every(
      (b) => !C.insideHouse(b, moved.x, moved.z, C.radius(moved) + 0.4),
    ),
    `moved entity landed at ${moved.x},${moved.z}, still inside a house`,
  );
  assert.equal(C.placement(migrated.s, moved, moved.id), null);
});

test("Landscape 6 leaves entities that were never inside a wave-1 house untouched", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  old.landscape = 5;
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.entities, old.entities);
});

test("Each house door is a wide-enough continuous passage, the wall further out is not", () => {
  const g = new GardenState(null, 1000);
  for (const b of D.buildings) {
    const outside = { x: b.door.x, z: b.door.z - 0.5 },
      threshold = { x: b.door.x, z: b.door.z + 0.1 };
    assert.ok(C.walkable(g.s, outside.x, outside.z), `${b.visitorId} doormat`);
    assert.ok(
      C.walkable(g.s, threshold.x, threshold.z),
      `${b.visitorId} just past the door`,
    );
    // The passage tolerates the camera-angle drift of straight-line movement
    // (continuous, not grid-locked): half a unit off-center still gets through.
    for (const side of [-1, 1])
      assert.ok(
        C.walkable(g.s, b.door.x + side * 0.5, b.door.z + 0.1),
        `${b.visitorId} door drift tolerance`,
      );
    // A full unit off-center runs straight into a wall circle.
    for (const side of [-1, 1])
      assert.equal(
        C.walkable(g.s, b.door.x + side * 1, b.door.z + 0.1),
        false,
        `${b.visitorId} wall beside the door`,
      );
  }
});

test("The pépinière's central path and portal-to-house route stay clear of the three houses", () => {
  const g = new GardenState(null, 1000);
  assert.ok(C.walkable(g.s, 0, 4));
  for (const v of D.visitors) {
    const route = C.approach(g.s, { x: 0, z: 3 }, v);
    assert.ok(
      route.length || C.distance({ x: 0, z: 3 }, v) < 1.85,
      `Reach ${v.id} from the portal`,
    );
    if (route.length) assert.ok(C.distance(route.at(-1), v) <= 1.65);
  }
});

test("Placement is rejected inside a house footprint with a named message, and unaffected just outside it", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory.pot = 1;
  for (const b of D.buildings) {
    const inside = g.command(
      { type: "place", item: "pot", x: b.x, z: b.z },
      { position: { x: b.x, z: b.z } },
    );
    assert.equal(inside.ok, false);
    assert.match(inside.message, /Garde la maison de/);
  }
  const before = g.serialize();
  assert.equal(g.command({ type: "place", item: "pot", x: -3, z: 2 }).ok, true);
  assert.notDeepEqual(g.serialize(), before);
});

test("Landscape trees never spawn inside or hugging a house footprint", () => {
  for (const t of D.trees)
    for (const b of D.buildings)
      assert.ok(
        Math.hypot(t.x - b.x, t.z - b.z) >= 2.2,
        `tree ${t.id} too close to ${b.visitorId}'s house`,
      );
});

test("Every visitor sits inside their own house, reachable only through its door", () => {
  for (const v of D.visitors) {
    const b = D.buildings.find((b) => b.visitorId === v.id);
    assert.ok(Math.abs(v.x - b.x) < b.w / 2);
    assert.ok(Math.abs(v.z - b.z) < b.d / 2);
  }
});

test("Épic 4.1: an object can be placed in a zone's organic bulge, past its old rectangle edge", () => {
  // North of zone0's old bounds edge (z=19), inside the new polygon bulge,
  // clear of the back-street houses (basile/anouk sit at z=20 nearby).
  const g = new GardenState(null, 1000);
  g.s.inventory.clay = 2;
  g.s.inventory.wood = 1;
  const r = g.command({
    type: "place",
    item: "pot",
    fabricate: true,
    x: -6.5,
    z: 20,
  });
  assert.equal(r.ok, true, r.message);
  assert.equal(C.zoneAt(-6.5, 20)?.id, 0);
});

test("Épic 4.1: placement is still rejected once past the polygon's real contour, on the correct side of a shared border", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory.clay = 2;
  g.s.inventory.wood = 1;
  // Far past every zone, including zone4 (Épic C3.5, north of zone0): outside
  // the whole map, not just the old rectangle. (-6, 23) used to be this point
  // before zone4 claimed it — it's now inside zone4 and no longer a useful
  // "outside everything" example.
  assert.equal(
    g.command({ type: "place", item: "pot", fabricate: true, x: 100, z: 100 })
      .ok,
    false,
  );
  // Just past zone0's shared west border (x=-16): must resolve as zone1
  // territory, not spill back as an accepted zone0 placement.
  const acrossBorder = g.command({
    type: "place",
    item: "pot",
    fabricate: true,
    x: -16.3,
    z: 7,
  });
  assert.equal(C.zoneAt(-16.3, 7)?.id, 1);
  assert.equal(acrossBorder.ok, false, "zone1 isn't unlocked on a fresh save");
});
