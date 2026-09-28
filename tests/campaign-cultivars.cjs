const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");
const Stations = require("../public/game/campaign-stations.js");

test("A fresh game starts with an empty cultivar list", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.cultivars, []);
  assert.equal(g.s.cultivarNextId, 1);
});

test("A cultivar created directly on the state keeps its exact id and traits across a real save/reload round trip", () => {
  const g = new GardenState(null, 1000);
  const created = Cultivars.createCultivar(g.s, {
    name: "Veilleuse de pluie",
    parentIds: [],
    traits: { habit: "rosette", leaf: "round", flower: "bell", color: "blue" },
  });
  assert.equal(created.id, "c1");
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  const reloaded = new GardenState(saved);
  assert.equal(reloaded.s.cultivars.length, 1);
  assert.deepEqual(reloaded.s.cultivars[0], created);
  assert.equal(reloaded.s.cultivarNextId, 2);
});

test("A second cultivar gets a distinct, incrementing id", () => {
  const g = new GardenState(null, 1000);
  const first = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  const second = Cultivars.createCultivar(g.s, {
    name: "B",
    parentIds: [first.id],
    traits: {},
  });
  assert.equal(first.id, "c1");
  assert.equal(second.id, "c2");
  assert.deepEqual(second.parentIds, ["c1"]);
});

test("createSpecimen assigns a stable id and appends the specimen to s.specimens (wired by epic C1.6, see tests/campaign-multiply.cjs for the plantSpecimen/multiplySpecimen commands built on it)", () => {
  const g = new GardenState(null, 1000);
  const specimen = Cultivars.createSpecimen(g.s, { cultivarId: "c1", x: 2.5, z: -1 });
  assert.deepEqual(specimen, {
    id: "sp1",
    cultivarId: "c1",
    x: 2.5,
    z: -1,
    stage: 0,
    plantedAt: 0,
    // Epic C7.3: default campaignDay (1) is a spring day (campaign-seasons.js's own
    // seasonForDay(1)), so a freshly created specimen here is planted in "printemps".
    plantedSeason: "printemps",
    moistureAt: 0,
    readyToProduce: false,
    zoneId: null,
    zoneSlot: null,
  });
  assert.deepEqual(g.s.specimens, [specimen]);
  assert.equal(g.s.specimenNextId, 2);
});

test("A v3 save without a cultivars field migrates to the empty default without altering the rest of its content", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  delete old.cultivars;
  delete old.cultivarNextId;
  const before = JSON.stringify({ ...old, cultivars: undefined, cultivarNextId: undefined });
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.cultivars, []);
  assert.equal(migrated.s.cultivarNextId, 1);
  const after = JSON.stringify({
    ...migrated.s,
    cultivars: undefined,
    cultivarNextId: undefined,
  });
  assert.equal(after, before, "no other field should change during this migration");
});

test("A malformed cultivars field is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const bad of [
    "nope",
    [{ id: "bad-id", name: "x", parentIds: [], traits: {} }],
    [{ id: "c1", name: 1, parentIds: [], traits: {} }],
    [{ id: "c1", name: "x", parentIds: ["a", "b", "c"], traits: {} }],
    [{ id: "c1", name: "x", parentIds: [], traits: null }],
    [
      { id: "c1", name: "x", parentIds: [], traits: {} },
      { id: "c1", name: "y", parentIds: [], traits: {} },
    ],
  ]) {
    const saved = g.serialize();
    saved.cultivars = bad;
    assert.throws(() => validate(saved), /Cultivar invalide/);
  }
});

test("A cultivarNextId that would collide with an existing cultivar id is rejected", () => {
  const g = new GardenState(null, 1000),
    saved = g.serialize();
  saved.cultivars = [{ id: "c3", name: "x", parentIds: [], traits: {} }];
  saved.cultivarNextId = 3;
  assert.throws(() => validate(saved), /Identifiants de cultivar invalides/);
  saved.cultivarNextId = 4;
  assert.doesNotThrow(() => validate(saved));
});

// Epic C7.20 (design §5, prerequisite of the Replanter gesture — see its own campagne-backlog.md
// entry for why the gesture itself stays out of scope here): zone capacity, occupation, and
// relocating an existing specimen into a zone that has room.

function makeCultivar(g) {
  return Cultivars.createCultivar(g.s, { name: "Test", traits: {} });
}

test("zoneOccupancy counts only specimens whose zoneId matches, never mutates s.specimens", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const other = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 1,
    z: 1,
    capacity: 2,
  });
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  sp1.zoneId = zone.id;
  const before = JSON.stringify(g.s.specimens);
  assert.equal(Cultivars.zoneOccupancy(g.s, zone.id), 1);
  assert.equal(Cultivars.zoneOccupancy(g.s, other.id), 0);
  assert.equal(Cultivars.zoneOccupancy(g.s, "z999"), 0);
  assert.equal(JSON.stringify(g.s.specimens), before);
});

test("canRelocateSpecimen refuses an unknown specimen, an unknown zone, a non-zone station id and a zone with no capacity", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const bareZone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  assert.equal(Cultivars.canRelocateSpecimen(g.s, "sp999", bareZone.id).ok, false);
  assert.equal(Cultivars.canRelocateSpecimen(g.s, sp.id, "z999").ok, false);
  assert.equal(Cultivars.canRelocateSpecimen(g.s, sp.id, borne.id).ok, false);
  assert.equal(Cultivars.canRelocateSpecimen(g.s, sp.id, bareZone.id).ok, false);
});

test("canRelocateSpecimen refuses a zone already at capacity, allows re-targeting a specimen already inside it", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  sp1.zoneId = zone.id;
  assert.equal(Cultivars.canRelocateSpecimen(g.s, sp2.id, zone.id).ok, false);
  assert.equal(Cultivars.canRelocateSpecimen(g.s, sp1.id, zone.id).ok, true);
});

// Epic C7.25 (design §5, "Replanter... respecte l'étiquette de cultivar ou la famille
// autorisée" — this epic isolates the cultivar-label half only, see this function's own comment
// for why "famille" stays out of scope).

test("canRelocateSpecimen refuses a specimen whose cultivar isn't in the zone's allowedCultivarIds, naming both", () => {
  const g = new GardenState(null, 1000);
  const cvAllowed = makeCultivar(g);
  const cvOther = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 2,
    allowedCultivarIds: [cvAllowed.id],
  });
  const spAllowed = Cultivars.createSpecimen(g.s, { cultivarId: cvAllowed.id, x: 0, z: 0 });
  const spOther = Cultivars.createSpecimen(g.s, { cultivarId: cvOther.id, x: 0, z: 0 });

  assert.equal(Cultivars.canRelocateSpecimen(g.s, spAllowed.id, zone.id).ok, true);
  const refused = Cultivars.canRelocateSpecimen(g.s, spOther.id, zone.id);
  assert.equal(refused.ok, false);
  assert.match(refused.error, new RegExp(cvOther.id));
  assert.match(refused.error, new RegExp(zone.id));
});

test("canRelocateSpecimen stays open to any cultivar when allowedCultivarIds is absent or empty (no regression)", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const bareZone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  const emptyListZone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 1,
    z: 1,
    capacity: 1,
    allowedCultivarIds: [],
  });
  assert.equal(Cultivars.canRelocateSpecimen(g.s, sp.id, bareZone.id).ok, true);
  assert.equal(Cultivars.canRelocateSpecimen(g.s, sp.id, emptyListZone.id).ok, true);
});

// Epic C7.26: canPlaceCultivarInZone is the extraction canRelocateSpecimen now wraps — it must
// refuse everything canRelocateSpecimen refused for a specimen's cultivar, but never needs a
// specimen to already exist (tickReplanter's own use case: the specimen doesn't exist yet at the
// point the gesture must decide whether it can even consume a young plant).

test("canPlaceCultivarInZone refuses an unknown zone, a non-zone station id and a zone with no capacity", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const bareZone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  assert.equal(Cultivars.canPlaceCultivarInZone(g.s, cv.id, "z999").ok, false);
  assert.equal(Cultivars.canPlaceCultivarInZone(g.s, cv.id, borne.id).ok, false);
  assert.equal(Cultivars.canPlaceCultivarInZone(g.s, cv.id, bareZone.id).ok, false);
});

test("canPlaceCultivarInZone refuses a zone already at capacity, accepts a zone with a free slot", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 }).zoneId = zone.id;
  assert.equal(Cultivars.canPlaceCultivarInZone(g.s, cv.id, zone.id).ok, false);
  const roomyZone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 1,
    z: 1,
    capacity: 1,
  });
  assert.equal(Cultivars.canPlaceCultivarInZone(g.s, cv.id, roomyZone.id).ok, true);
});

test("canPlaceCultivarInZone's excludeSpecimenId leaves that specimen's own slot out of the occupancy tally", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  sp.zoneId = zone.id;
  assert.equal(Cultivars.canPlaceCultivarInZone(g.s, cv.id, zone.id).ok, false);
  assert.equal(
    Cultivars.canPlaceCultivarInZone(g.s, cv.id, zone.id, { excludeSpecimenId: sp.id }).ok,
    true,
  );
});

test("canPlaceCultivarInZone refuses a cultivar not in allowedCultivarIds, naming both, accepts one explicitly allowed", () => {
  const g = new GardenState(null, 1000);
  const cvAllowed = makeCultivar(g);
  const cvOther = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 2,
    allowedCultivarIds: [cvAllowed.id],
  });
  assert.equal(Cultivars.canPlaceCultivarInZone(g.s, cvAllowed.id, zone.id).ok, true);
  const refused = Cultivars.canPlaceCultivarInZone(g.s, cvOther.id, zone.id);
  assert.equal(refused.ok, false);
  assert.match(refused.error, new RegExp(cvOther.id));
  assert.match(refused.error, new RegExp(zone.id));
});

test("relocateSpecimen propagates the allowedCultivarIds refusal from canRelocateSpecimen without duplicating the rule", () => {
  const g = new GardenState(null, 1000);
  const cvAllowed = makeCultivar(g);
  const cvOther = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 2,
    allowedCultivarIds: [cvAllowed.id],
  });
  const spOther = Cultivars.createSpecimen(g.s, { cultivarId: cvOther.id, x: 0, z: 0 });
  const before = JSON.stringify(g.s.specimens);
  const result = Cultivars.relocateSpecimen(g.s, spOther.id, zone.id);
  assert.equal(result.ok, false);
  assert.match(result.error, new RegExp(cvOther.id));
  assert.equal(JSON.stringify(g.s.specimens), before, "a refusal never mutates anything");
});

test("a round-trip through GardenState JSON save/load preserves a zone's allowedCultivarIds", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
    allowedCultivarIds: [cv.id],
  });
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())), 1000);
  assert.deepEqual(reloaded.s.campaignStations.zones[0].allowedCultivarIds, [cv.id]);
});

test("relocateSpecimen moves a specimen into a zone with room, leaves every other specimen strictly unchanged", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 5, z: 5 });
  const result = Cultivars.relocateSpecimen(g.s, sp1.id, zone.id);
  assert.equal(result.ok, true, result.error);
  const moved = result.specimens.find((sp) => sp.id === sp1.id);
  assert.equal(moved.zoneId, zone.id);
  // Epic C7.24: the only zone occupant so far claims the smallest free slot, 0.
  assert.equal(moved.zoneSlot, 0);
  assert.deepEqual({ ...moved, zoneId: sp1.zoneId, zoneSlot: sp1.zoneSlot }, sp1);
  const untouched = result.specimens.find((sp) => sp.id === sp2.id);
  assert.deepEqual(untouched, sp2);
  // Original array/object untouched — relocateSpecimen never mutates s.specimens in place.
  assert.equal(sp1.zoneId, null);
  assert.equal(sp1.zoneSlot, null);
});

test("relocateSpecimen refuses without mutating anything when the target zone is unknown or full", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 5, z: 5 });
  sp1.zoneId = zone.id;
  const before = JSON.stringify(g.s.specimens);
  const full = Cultivars.relocateSpecimen(g.s, sp2.id, zone.id);
  assert.equal(full.ok, false);
  const unknown = Cultivars.relocateSpecimen(g.s, sp2.id, "z999");
  assert.equal(unknown.ok, false);
  assert.equal(JSON.stringify(g.s.specimens), before);
});

test("A specimen's zoneId and zoneSlot survive a real JSON save/reload round trip", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const relocated = Cultivars.relocateSpecimen(g.s, sp.id, zone.id);
  g.s.specimens = relocated.specimens;
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  const reloaded = new GardenState(saved);
  assert.equal(reloaded.s.specimens[0].zoneId, zone.id);
  assert.equal(reloaded.s.specimens[0].zoneSlot, 0);
});

test("A specimen saved before this epic (no zoneId) migrates to null without error", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const saved = g.serialize();
  delete saved.specimens[0].zoneId;
  const migrated = new GardenState(saved);
  assert.equal(migrated.s.specimens[0].zoneId, null);
});

// Epic C7.24: a specimen saved before this epic never had a zoneSlot at all, whatever its
// zoneId — migrates to null the same way zoneId itself migrated at C7.20.
test("A specimen saved before this epic (no zoneSlot) migrates to null without error", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  sp.zoneId = zone.id;
  const saved = g.serialize();
  delete saved.specimens[0].zoneSlot;
  const migrated = new GardenState(saved);
  assert.equal(migrated.s.specimens[0].zoneId, zone.id);
  assert.equal(migrated.s.specimens[0].zoneSlot, null);
});

test("zoneFreeSlot returns the smallest free index in an empty zone, skips already-taken slots, and returns null once full", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  assert.equal(Cultivars.zoneFreeSlot(g.s, zone.id), 0);
  const sp0 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 1, z: 1 });
  sp0.zoneId = zone.id;
  sp0.zoneSlot = 0;
  sp2.zoneId = zone.id;
  sp2.zoneSlot = 2;
  assert.equal(Cultivars.zoneFreeSlot(g.s, zone.id), 1);
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 2, z: 2 });
  sp1.zoneId = zone.id;
  sp1.zoneSlot = 1;
  assert.equal(Cultivars.zoneFreeSlot(g.s, zone.id), null);
  // excludeSpecimenId lets a specimen already in the zone see its own slot as free again.
  assert.equal(Cultivars.zoneFreeSlot(g.s, zone.id, sp1.id), 1);
});

test("relocateSpecimen assigns distinct, increasing slots to three specimens relocated successively into the same zone", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 1, z: 1 });
  const sp3 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 2, z: 2 });
  g.s.specimens = Cultivars.relocateSpecimen(g.s, sp1.id, zone.id).specimens;
  g.s.specimens = Cultivars.relocateSpecimen(g.s, sp2.id, zone.id).specimens;
  g.s.specimens = Cultivars.relocateSpecimen(g.s, sp3.id, zone.id).specimens;
  assert.equal(g.s.specimens.find((sp) => sp.id === sp1.id).zoneSlot, 0);
  assert.equal(g.s.specimens.find((sp) => sp.id === sp2.id).zoneSlot, 1);
  assert.equal(g.s.specimens.find((sp) => sp.id === sp3.id).zoneSlot, 2);
});

test("Re-targeting a specimen already inside a zone at the same zone keeps its initial zoneSlot, never recomputed", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 1, z: 1 });
  g.s.specimens = Cultivars.relocateSpecimen(g.s, sp1.id, zone.id).specimens;
  g.s.specimens = Cultivars.relocateSpecimen(g.s, sp2.id, zone.id).specimens;
  const before = g.s.specimens.find((sp) => sp.id === sp1.id).zoneSlot;
  assert.equal(before, 0);
  g.s.specimens = Cultivars.relocateSpecimen(g.s, sp1.id, zone.id).specimens;
  assert.equal(g.s.specimens.find((sp) => sp.id === sp1.id).zoneSlot, before);
});

test("Relocating a specimen from zone A to zone B assigns a fresh free slot in B, without touching the slots of A's other specimens", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zoneA = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  const zoneB = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 5,
    z: 5,
    capacity: 3,
  });
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 1, z: 1 });
  const spB = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 5, z: 5 });
  g.s.specimens = Cultivars.relocateSpecimen(g.s, sp1.id, zoneA.id).specimens;
  g.s.specimens = Cultivars.relocateSpecimen(g.s, sp2.id, zoneA.id).specimens;
  g.s.specimens = Cultivars.relocateSpecimen(g.s, spB.id, zoneB.id).specimens;
  const sp2SlotBefore = g.s.specimens.find((sp) => sp.id === sp2.id).zoneSlot;
  const result = Cultivars.relocateSpecimen(g.s, sp1.id, zoneB.id);
  assert.equal(result.ok, true, result.error);
  const moved = result.specimens.find((sp) => sp.id === sp1.id);
  assert.equal(moved.zoneId, zoneB.id);
  // spB already claims slot 0 of zoneB, so sp1 gets the next free slot, 1.
  assert.equal(moved.zoneSlot, 1);
  // sp2, left behind in zone A, keeps its own slot untouched.
  assert.equal(
    result.specimens.find((sp) => sp.id === sp2.id).zoneSlot,
    sp2SlotBefore,
  );
});

test("A specimen with a zoneId that resolves to a non-zone station or an unknown zone is rejected", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const saved = g.serialize();
  saved.specimens[0].zoneId = borne.id;
  assert.throws(() => validate(saved), /Spécimen invalide/);
  saved.specimens[0].zoneId = "z999";
  assert.throws(() => validate(saved), /Spécimen invalide/);
  saved.specimens[0].zoneId = null;
  assert.doesNotThrow(() => validate(saved));
});

// Epic C7.21: the trou left open by C7.20's own commit ("validate() ne vérifie pas que
// l'occupation totale d'une zone rechargée ne dépasse pas sa capacité") — a zone's declared
// capacity must never be exceeded by the real occupation counted on s.specimens once reloaded.
// Equal to capacity is the normal "full" state (already exercised by the round-trip test above)
// and must stay valid.
test("validate rejects a zone whose real occupation exceeds its declared capacity, accepts it exactly at capacity", () => {
  const overflowing = new GardenState(null, 1000);
  const cvOverflow = makeCultivar(overflowing);
  const overflowZone = Stations.registerStation(overflowing.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  const spOverflow1 = Cultivars.createSpecimen(overflowing.s, {
    cultivarId: cvOverflow.id,
    x: 0,
    z: 0,
  });
  const spOverflow2 = Cultivars.createSpecimen(overflowing.s, {
    cultivarId: cvOverflow.id,
    x: 1,
    z: 1,
  });
  spOverflow1.zoneId = overflowZone.id;
  spOverflow2.zoneId = overflowZone.id;
  assert.throws(
    () => validate(overflowing.serialize()),
    /Registre de stations invalide/,
  );

  const exactlyFull = new GardenState(null, 1000);
  const cvFull = makeCultivar(exactlyFull);
  const fullZone = Stations.registerStation(exactlyFull.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  const spFull = Cultivars.createSpecimen(exactlyFull.s, { cultivarId: cvFull.id, x: 0, z: 0 });
  spFull.zoneId = fullZone.id;
  assert.doesNotThrow(() => validate(exactlyFull.serialize()));

  // A zone with no declared capacity is never concerned by this control, however many specimens
  // point at it — behaviour unchanged from before this epic.
  const bare = new GardenState(null, 1000);
  const cvBare = makeCultivar(bare);
  const bareZone = Stations.registerStation(bare.s.campaignStations, "zone", { x: 0, z: 0 });
  const spBare1 = Cultivars.createSpecimen(bare.s, { cultivarId: cvBare.id, x: 0, z: 0 });
  const spBare2 = Cultivars.createSpecimen(bare.s, { cultivarId: cvBare.id, x: 1, z: 1 });
  spBare1.zoneId = bareZone.id;
  spBare2.zoneId = bareZone.id;
  assert.doesNotThrow(() => validate(bare.serialize()));
});

// Epic C7.24: zoneSlot's own validation, independent of the C7.21 occupation-vs-capacity
// control above (which only ever counts specimens, never reads zoneSlot at all).
test("validate rejects a non-integer, negative or out-of-range zoneSlot, and a non-null zoneSlot on a specimen without a zoneId", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  sp.zoneId = zone.id;
  const saved = g.serialize();
  for (const bad of [0.5, "0", -1, 2, 100]) {
    saved.specimens[0].zoneSlot = bad;
    assert.throws(() => validate(saved), /Spécimen invalide/);
  }
  saved.specimens[0].zoneSlot = 0;
  assert.doesNotThrow(() => validate(saved));
  saved.specimens[0].zoneSlot = 1;
  assert.doesNotThrow(() => validate(saved));

  // A zoneSlot with no zoneId at all is always rejected, whatever its value.
  saved.specimens[0].zoneId = null;
  saved.specimens[0].zoneSlot = 0;
  assert.throws(() => validate(saved), /Spécimen invalide/);
  saved.specimens[0].zoneSlot = null;
  assert.doesNotThrow(() => validate(saved));
});

test("validate rejects two specimens sharing the same (zoneId, zoneSlot) pair, accepts the same zoneSlot in two different zones", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const zoneA = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const zoneB = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 5,
    z: 5,
    capacity: 2,
  });
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 1, z: 1 });
  sp1.zoneId = zoneA.id;
  sp1.zoneSlot = 0;
  sp2.zoneId = zoneA.id;
  sp2.zoneSlot = 0;
  assert.throws(() => validate(g.serialize()), /Spécimen invalide/);

  // The same slot index in a different zone is never a conflict.
  sp2.zoneId = zoneB.id;
  sp2.zoneSlot = 0;
  assert.doesNotThrow(() => validate(g.serialize()));
});

