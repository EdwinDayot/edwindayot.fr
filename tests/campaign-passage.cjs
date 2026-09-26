const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Geometry = require("../public/game/geometry.js");
const Data = require("../public/game/data.js");
const Construction = require("../public/game/construction.js");
const Passage = require("../public/game/campaign-passage.js");

// Epic C6.12 (design §10, chapitre 17 "Rendre le passage" : "rétablir l'accès à une mare") :
// s.campaignPassage.blocked starts true on a fresh save; restorePassage is the single, one-way
// transition to false, refused if it would not actually change anything.

test("a fresh save starts with the passage blocked, at its fixed position", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.campaignPassage, {
    blocked: true,
    x: Passage.PASSAGE_POSITION.x,
    z: Passage.PASSAGE_POSITION.z,
  });
});

test("restorePassage succeeds once and sets blocked to false", () => {
  const g = new GardenState(null, 1000);
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignPassage.blocked, false);
});

test("restorePassage refuses a second call, never mutating the state", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "restorePassage" });
  const before = JSON.stringify(g.s.campaignPassage);

  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, false, "the passage is already restored, restoring it again is a no-op");
  assert.equal(JSON.stringify(g.s.campaignPassage), before);
});

test("an older save with no campaignPassage field migrates to blocked, at the fixed position", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  delete raw.campaignPassage;

  const migrated = validate(raw);
  assert.deepEqual(migrated.campaignPassage, {
    blocked: true,
    x: Passage.PASSAGE_POSITION.x,
    z: Passage.PASSAGE_POSITION.z,
  });
});

test("a C6.12-era save with campaignPassage but no x/z migrates to the fixed position", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  raw.campaignPassage = { blocked: false }; // shape saved by a game between C6.12 and C6.13

  const migrated = validate(raw);
  assert.deepEqual(migrated.campaignPassage, {
    blocked: false,
    x: Passage.PASSAGE_POSITION.x,
    z: Passage.PASSAGE_POSITION.z,
  });
});

test("a real JSON round-trip keeps the restored passage, including its position, strictly identical", () => {
  const g = new GardenState(null, 1000);
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignPassage, {
    blocked: false,
    x: Passage.PASSAGE_POSITION.x,
    z: Passage.PASSAGE_POSITION.z,
  });
});

// Epic C6.13 (design §10, chapitre 17, fourth beat) : s.campaignPassage.x/z is a fixed point of
// the shared navigation grid; while blocked, construction.js's obstacles(s) blocks it (and its
// immediate grid neighbours) for walkable()/flood()/path(), with zero regression on a save that
// never carries campaignPassage at all.

test("the fixed passage position resolves to one of the two default-unlocked zones", () => {
  const { x, z } = Passage.PASSAGE_POSITION;
  const zone = Geometry.zoneAt(Data.zones, x, z);
  assert.ok(zone, "the passage position must fall inside a real zone");
  assert.ok(
    [0, 4].includes(zone.id),
    `expected zone 0 or 4 (both unlocked by default), got zone ${zone.id}`,
  );
});

test("the passage position is on the 0.5-unit navigation grid", () => {
  const { x, z } = Passage.PASSAGE_POSITION;
  // `|| 0` folds -0 (e.g. (-6 * 2) % 1) into 0 for the strict-equal comparison below; the game's
  // own grid check elsewhere (garden-state-validate.js) uses these same truthy semantics.
  assert.equal((x * 2) % 1 || 0, 0);
  assert.equal((z * 2) % 1 || 0, 0);
});

test("walkable() refuses the passage point while blocked, accepts it once restored", () => {
  const g = new GardenState(null, 1000);
  const { x, z } = g.s.campaignPassage;

  assert.equal(g.s.campaignPassage.blocked, true);
  assert.equal(Construction.walkable(g.s, x, z), false);

  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.equal(Construction.walkable(g.s, x, z), true);
});

test("a path straddling the blocked passage detours around it, never crossing the point", () => {
  const g = new GardenState(null, 1000);
  const { x, z } = g.s.campaignPassage;
  const from = { x: x - 2, z },
    to = { x: x + 2, z };

  assert.equal(Construction.walkable(g.s, from.x, from.z), true);
  assert.equal(Construction.walkable(g.s, to.x, to.z), true);

  const blockedRoute = Construction.path(g.s, from, to);
  assert.ok(blockedRoute.length > 0, "a detour exists in this open zone, path() must find it");
  assert.ok(
    blockedRoute.every((p) => Math.hypot(p.x - x, p.z - z) > 0.01),
    "the route must never step on the blocked passage point itself",
  );

  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  const openRoute = Construction.path(g.s, from, to);
  assert.ok(openRoute.length > 0);
  assert.ok(
    openRoute.length <= blockedRoute.length,
    "once unblocked, the route must be at least as short as the forced detour",
  );
});

test("a path fails when no detour exists around the blocked passage", () => {
  const g = new GardenState(null, 1000);
  const { x, z } = g.s.campaignPassage;
  // Traps row z between two solid walls (one row north, one row south) spanning well past both
  // ends of the zone's actual width (-16..4, see data-world.js), so no detour around either end is
  // possible — the only gap in the whole trench is the passage's own point, which is blocked. Each
  // wall cell sits exactly on the grid point it blocks (distance 0 to its own center, blocked
  // whatever the radius), with an explicit radius small enough (0.2, overriding "bench"'s own
  // 0.65 — a real non-flat recipe, just borrowed for a valid D.recipes[type] lookup) to stay under
  // walkable()'s 0.5-unit-away clearance test (0.2 + 0.23 = 0.43 < 0.5) and never bleed into row z
  // itself, which must stay open except exactly at the passage's own already-blocked cells.
  let n = 0;
  for (let wx = -18; wx <= 6; wx += 0.5)
    for (const dz of [-0.5, 0.5])
      g.s.entities.push({
        id: `wall-${n++}`,
        type: "bench",
        radius: 0.2,
        x: wx,
        z: z + dz,
        stored: false,
      });

  const from = { x: x - 1.5, z },
    to = { x: x + 1.5, z };
  assert.equal(Construction.walkable(g.s, from.x, from.z), true);
  assert.equal(Construction.walkable(g.s, to.x, to.z), true);

  const route = Construction.path(g.s, from, to);
  assert.deepEqual(route, [], "no detour exists, path() must fail rather than invent one");
});

test("obstacles/walkable/path have zero regression for a save without campaignPassage at all", () => {
  const g = new GardenState(null, 1000);
  const withPassage = Construction.walkable(g.s, 0, 4);
  const routeWithPassage = Construction.path(g.s, { x: 0, z: 4 }, { x: -1, z: 3 });

  delete g.s.campaignPassage; // free-garden save, or a pre-C6.12 campaign save

  assert.equal(
    Construction.walkable(g.s, 0, 4),
    withPassage,
    "central path walkability must be unaffected by the absence of campaignPassage",
  );
  assert.deepEqual(
    Construction.path(g.s, { x: 0, z: 4 }, { x: -1, z: 3 }),
    routeWithPassage,
    "pathfinding away from the passage's own position must be byte-identical either way",
  );
  // And the passage's own point, unblocked by construction whenever the field is simply absent
  // (optional chaining, s.campaignPassage?.blocked is undefined -> falsy -> no obstacle added).
  assert.equal(
    Construction.walkable(g.s, Passage.PASSAGE_POSITION.x, Passage.PASSAGE_POSITION.z),
    true,
  );
});
