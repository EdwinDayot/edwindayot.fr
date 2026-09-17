const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");

function withCultivar(g, name = "Essai") {
  return Cultivars.createCultivar(g.s, {
    name,
    parentIds: ["ronce-a-rubans", "fraise-timide"],
    traits: { port: "grimpant", feuilles: { forme: "palmee", taille: "moyenne" } },
  });
}

test("plantSpecimen creates a specimen bound to the cultivar, sequential ids, persists after a real JSON round trip", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g);
  const r = g.command({ type: "plantSpecimen", cultivarId: cv.id, x: 2, z: 3 });
  assert.equal(r.ok, true);
  assert.equal(g.s.specimens.length, 1);
  assert.equal(g.s.specimens[0].id, "sp1");
  assert.equal(g.s.specimens[0].cultivarId, cv.id);
  assert.equal(g.s.specimens[0].x, 2);
  assert.equal(g.s.specimens[0].z, 3);
  assert.equal(g.s.specimens[0].stage, 0);
  const second = g.command({ type: "plantSpecimen", cultivarId: cv.id, x: -1, z: 0 });
  assert.equal(second.ok, true);
  assert.equal(g.s.specimens[1].id, "sp2");
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.specimens, g.s.specimens);
});

test("plantSpecimen is refused explicitly on an unknown cultivarId, without creating a specimen", () => {
  const g = new GardenState(null, 1000);
  const r = g.command({ type: "plantSpecimen", cultivarId: "c999", x: 0, z: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.message);
  assert.equal(g.s.specimens.length, 0);
});

test("plantSpecimen is refused on a non-finite location", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g);
  for (const [x, z] of [
    [NaN, 0],
    [0, Infinity],
    ["2", 0],
    [null, 0],
  ]) {
    const r = g.command({ type: "plantSpecimen", cultivarId: cv.id, x, z });
    assert.equal(r.ok, false);
  }
  assert.equal(g.s.specimens.length, 0);
});

test("multiplySpecimen creates a new specimen sharing the source's cultivarId, with no genetics draw", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g);
  assert.equal(g.command({ type: "plantSpecimen", cultivarId: cv.id, x: 0, z: 0 }).ok, true);
  const source = g.s.specimens[0];
  const r = g.command({ type: "multiplySpecimen", specimenId: source.id, x: 5, z: 5 });
  assert.equal(r.ok, true);
  assert.equal(g.s.specimens.length, 2);
  const copy = g.s.specimens[1];
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.cultivarId, source.cultivarId);
  assert.equal(copy.x, 5);
  assert.equal(copy.z, 5);
  // Trait comparison is the epic's literal exit criterion: source and multiplied specimen are
  // identical trait to trait, because both resolve through the same cultivar, never a per
  // specimen copy.
  assert.deepEqual(
    Cultivars.specimenTraits(g.s, copy),
    Cultivars.specimenTraits(g.s, source),
  );
  assert.deepEqual(Cultivars.specimenTraits(g.s, copy), cv.traits);
});

test("Multiplying the same specimen repeatedly always yields specimens identical in traits to the original", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g, "Répétée");
  assert.equal(g.command({ type: "plantSpecimen", cultivarId: cv.id, x: 0, z: 0 }).ok, true);
  const source = g.s.specimens[0];
  for (let i = 0; i < 5; i++)
    assert.equal(
      g.command({ type: "multiplySpecimen", specimenId: source.id, x: i, z: i }).ok,
      true,
    );
  assert.equal(g.s.specimens.length, 6);
  for (const sp of g.s.specimens) {
    assert.equal(sp.cultivarId, cv.id);
    assert.deepEqual(Cultivars.specimenTraits(g.s, sp), cv.traits);
  }
  // Every id stays distinct even after repeated multiplication from the same source.
  assert.equal(new Set(g.s.specimens.map((sp) => sp.id)).size, 6);
});

test("multiplySpecimen is refused explicitly on an unknown specimenId, without creating a specimen", () => {
  const g = new GardenState(null, 1000);
  const r = g.command({ type: "multiplySpecimen", specimenId: "sp999", x: 0, z: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.message);
  assert.equal(g.s.specimens.length, 0);
});

test("multiplySpecimen is refused on a non-finite location", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g);
  assert.equal(g.command({ type: "plantSpecimen", cultivarId: cv.id, x: 0, z: 0 }).ok, true);
  const source = g.s.specimens[0];
  for (const [x, z] of [
    [NaN, 0],
    [0, -Infinity],
    ["1", 1],
  ]) {
    const r = g.command({ type: "multiplySpecimen", specimenId: source.id, x, z });
    assert.equal(r.ok, false);
  }
  assert.equal(g.s.specimens.length, 1, "no extra specimen from any refused attempt");
});

test("A save without specimens/specimenNextId migrates to defaults, no other field changes", () => {
  const g = new GardenState(null, 1000);
  withCultivar(g);
  const old = g.serialize();
  delete old.specimens;
  delete old.specimenNextId;
  const before = JSON.stringify({ ...old, specimens: undefined, specimenNextId: undefined });
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.specimens, []);
  assert.equal(migrated.s.specimenNextId, 1);
  const after = JSON.stringify({
    ...migrated.s,
    specimens: undefined,
    specimenNextId: undefined,
  });
  assert.equal(after, before, "no other field should change during this migration");
});

test("A malformed specimens field is rejected", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g);
  for (const bad of [
    "nope",
    [{ id: "e1", cultivarId: cv.id, x: 0, z: 0, stage: 0 }],
    [{ id: "sp1", cultivarId: "c999", x: 0, z: 0, stage: 0 }],
    [{ id: "sp1", cultivarId: cv.id, x: "0", z: 0, stage: 0 }],
    [{ id: "sp1", cultivarId: cv.id, x: 0, z: Infinity, stage: 0 }],
    [{ id: "sp1", cultivarId: cv.id, x: 0, z: 0, stage: -1 }],
    [{ id: "sp1", cultivarId: cv.id, x: 0, z: 0, stage: 1.5 }],
    [{ id: "sp1", cultivarId: cv.id, x: 0, z: 0 }],
    [
      { id: "sp1", cultivarId: cv.id, x: 0, z: 0, stage: 0 },
      { id: "sp1", cultivarId: cv.id, x: 1, z: 1, stage: 0 },
    ],
    null,
  ]) {
    const saved = g.serialize();
    saved.specimens = bad;
    assert.throws(() => validate(saved), /Spécimen invalide/);
  }
});

test("An id collision in specimenNextId is rejected, its correction accepted", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g);
  assert.equal(g.command({ type: "plantSpecimen", cultivarId: cv.id, x: 0, z: 0 }).ok, true);
  const saved = g.serialize();
  saved.specimenNextId = 1;
  assert.throws(() => validate(saved), /Identifiants de spécimen invalides/);
  saved.specimenNextId = 2;
  assert.doesNotThrow(() => validate(saved));
});
