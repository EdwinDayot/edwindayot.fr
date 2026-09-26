const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");

// Epic C2.6b (second tier of C2.6's reformulation, see campagne-backlog.md's journal des
// décisions, 2026-09-18): a specimen (s.specimens, C1.6) gains a moisture that decays with
// simulated elapsed time (s.elapsed, never the wall clock — same "store a timestamp, compare it
// to the current elapsed" principle already used by the free garden's plant.boostUntil) and a
// maturity state derived from its growth stage (C1.8). No command wires this to anything yet
// (that is C2.6c's job, once bornes/zones/paniers from C2.6a and this epic both exist).

function makeCultivar(g) {
  return Cultivars.createCultivar(g.s, { name: "Test", traits: {} });
}

test("createSpecimen sets moistureAt to the current s.elapsed and readyToProduce to false", () => {
  const g = new GardenState(null, 1000);
  g.s.elapsed = 42;
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  assert.equal(sp.moistureAt, 42);
  assert.equal(sp.readyToProduce, false);
});

test("specimenMoisture is 100 right at moistureAt, and decays deterministically afterwards", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  assert.equal(Cultivars.specimenMoisture(sp, sp.moistureAt), 100);
  const rate = 100 / (3 * 3600);
  for (const elapsedSince of [1, 100, 3600, 5000]) {
    const expected = Math.max(0, 100 - rate * elapsedSince);
    assert.equal(
      Cultivars.specimenMoisture(sp, sp.moistureAt + elapsedSince),
      expected,
    );
  }
});

test("specimenMoisture never goes negative and is a pure function (repeat calls agree)", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const farFuture = sp.moistureAt + 10 * 24 * 3600;
  assert.equal(Cultivars.specimenMoisture(sp, farFuture), 0);
  assert.equal(
    Cultivars.specimenMoisture(sp, farFuture),
    Cultivars.specimenMoisture(sp, farFuture),
  );
});

test("specimenMoisture ignores elapsed before moistureAt (never a negative duration)", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  sp.moistureAt = 1000;
  assert.equal(Cultivars.specimenMoisture(sp, 500), 100);
});

test("waterSpecimen resets the decay clock to fully moist as of the given elapsed instant", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  assert.ok(Cultivars.specimenMoisture(sp, sp.moistureAt + 5000) < 100);
  Cultivars.waterSpecimen(sp, 9000);
  assert.equal(sp.moistureAt, 9000);
  assert.equal(Cultivars.specimenMoisture(sp, 9000), 100);
});

test("isMature is true only at the last growth stage", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  assert.equal(
    Cultivars.isMature(
      g.s,
      Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: 0 }),
    ),
    false,
  );
  assert.equal(
    Cultivars.isMature(
      g.s,
      Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: 1 }),
    ),
    false,
  );
  assert.equal(
    Cultivars.isMature(
      g.s,
      Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: 2 }),
    ),
    true,
  );
});

test("setReadyToProduce refuses an immature specimen and never mutates it on refusal", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const young = Cultivars.createSpecimen(g.s, {
    cultivarId: cv.id,
    x: 0,
    z: 0,
    stage: 1,
  });
  assert.throws(
    () => Cultivars.setReadyToProduce(g.s, young, true),
    /immature/,
  );
  assert.equal(young.readyToProduce, false);
});

test("setReadyToProduce marks a mature specimen ready, and can also unmark it regardless of stage", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const mature = Cultivars.createSpecimen(g.s, {
    cultivarId: cv.id,
    x: 0,
    z: 0,
    stage: 2,
  });
  Cultivars.setReadyToProduce(g.s, mature, true);
  assert.equal(mature.readyToProduce, true);
  Cultivars.setReadyToProduce(g.s, mature, false);
  assert.equal(mature.readyToProduce, false);
  const young = Cultivars.createSpecimen(g.s, {
    cultivarId: cv.id,
    x: 0,
    z: 0,
    stage: 0,
  });
  assert.doesNotThrow(() => Cultivars.setReadyToProduce(g.s, young, false));
});

test("A specimen with readyToProduce true but an immature stage is rejected at load", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: 1 });
  const saved = g.serialize();
  saved.specimens[0].readyToProduce = true;
  assert.throws(() => validate(saved), /Spécimen invalide/);
});

test("A specimen with readyToProduce true and a mature stage loads without error", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: 2 });
  const saved = g.serialize();
  saved.specimens[0].readyToProduce = true;
  assert.doesNotThrow(() => validate(saved));
});

test("A malformed moistureAt or readyToProduce is rejected", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  for (const bad of [
    { moistureAt: -1 },
    { moistureAt: Infinity },
    { moistureAt: "12" },
    { readyToProduce: "yes" },
    { readyToProduce: 1 },
  ]) {
    const saved = g.serialize();
    Object.assign(saved.specimens[0], bad);
    assert.throws(() => validate(saved), /Spécimen invalide/);
  }
});

test("A specimen saved before this epic (no moistureAt/readyToProduce) migrates to defaults without error", () => {
  const g = new GardenState(null, 1000);
  g.s.elapsed = 777;
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 3, z: -2, stage: 1 });
  const saved = g.serialize();
  delete saved.specimens[0].moistureAt;
  delete saved.specimens[0].readyToProduce;
  const migrated = new GardenState(saved);
  assert.equal(migrated.s.specimens.length, 1);
  const sp = migrated.s.specimens[0];
  assert.equal(sp.moistureAt, 777);
  assert.equal(sp.readyToProduce, false);
  assert.equal(sp.stage, 1);
  assert.equal(sp.x, 3);
  assert.equal(sp.z, -2);
});

test("A specimen's moistureAt/readyToProduce survive a real JSON save/reload round trip", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, {
    cultivarId: cv.id,
    x: 0,
    z: 0,
    stage: 2,
  });
  Cultivars.waterSpecimen(sp, 123);
  Cultivars.setReadyToProduce(g.s, sp, true);
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.specimens[0], sp);
});
