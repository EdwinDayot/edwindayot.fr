const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");

// Epic C7.2: growth stage gets the same "store a timestamp, derive on demand" treatment
// specimenMoisture already has (C2.6b) — see cultivars.js's own header comment. `plantedAt` is
// stored once at creation; `specimenStage(s, specimen)` derives the current stage from
// `s.elapsed - plantedAt` and a fixed duration per stage, never from the raw `stage` field.

function makeCultivar(g) {
  return Cultivars.createCultivar(g.s, { name: "Test", traits: {} });
}

const DURATION = Cultivars.STAGE_DURATION_ELAPSED_SECONDS;

test("a freshly created specimen (default stage) is immature: specimenStage is 0", () => {
  const g = new GardenState(null, 1000);
  g.s.elapsed = 500;
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  assert.equal(sp.plantedAt, 500);
  assert.equal(Cultivars.specimenStage(g.s, sp), 0);
  assert.equal(Cultivars.isMature(g.s, sp), false);
});

test("a specimen becomes mature after exactly the total expected duration, recomputed independently here", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const totalToMature = Cultivars.MATURE_STAGE * DURATION;
  // Just before: still not mature.
  g.s.elapsed = sp.plantedAt + totalToMature - 1;
  assert.equal(Cultivars.isMature(g.s, sp), false);
  // Exactly at the boundary: mature.
  g.s.elapsed = sp.plantedAt + totalToMature;
  assert.equal(Cultivars.isMature(g.s, sp), true);
  assert.equal(Cultivars.specimenStage(g.s, sp), Cultivars.MATURE_STAGE);
  // Long past: still capped at MATURE_STAGE, never beyond.
  g.s.elapsed = sp.plantedAt + totalToMature * 100;
  assert.equal(Cultivars.specimenStage(g.s, sp), Cultivars.MATURE_STAGE);
});

test("specimenStage walks through every intermediate stage boundary, each recomputed independently", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  for (let stage = 0; stage <= Cultivars.MATURE_STAGE; stage++) {
    g.s.elapsed = sp.plantedAt + stage * DURATION;
    assert.equal(Cultivars.specimenStage(g.s, sp), stage);
    // One second before this stage's own boundary (when stage > 0): still the previous stage.
    if (stage > 0) {
      g.s.elapsed = sp.plantedAt + stage * DURATION - 1;
      assert.equal(Cultivars.specimenStage(g.s, sp), stage - 1);
    }
  }
});

test("specimenStage is pure: repeat calls with the same (s, specimen) agree, no hidden mutation", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  g.s.elapsed = sp.plantedAt + DURATION + 10;
  const before = JSON.stringify(sp);
  const first = Cultivars.specimenStage(g.s, sp);
  const second = Cultivars.specimenStage(g.s, sp);
  assert.equal(first, second);
  assert.equal(JSON.stringify(sp), before);
});

test("createSpecimen's explicit stage convenience still derives that exact stage immediately, via a backdated plantedAt", () => {
  const g = new GardenState(null, 1000);
  g.s.elapsed = 42;
  const cv = makeCultivar(g);
  for (const stage of [0, 1, Cultivars.MATURE_STAGE]) {
    const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage });
    assert.equal(sp.stage, stage);
    assert.equal(Cultivars.specimenStage(g.s, sp), stage);
  }
});

test("updateSpecimenReadiness never marks a specimen ready whose derived stage is not mature", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const CampaignAutomation = require("../public/game/campaign-automation.js");
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  // Still immature: elapsed advanced, but not enough to reach MATURE_STAGE.
  g.s.elapsed = sp.plantedAt + DURATION;
  CampaignAutomation.updateSpecimenReadiness(g.s);
  assert.equal(sp.readyToProduce, false);
  // Now mature: readiness flips.
  g.s.elapsed = sp.plantedAt + Cultivars.MATURE_STAGE * DURATION;
  CampaignAutomation.updateSpecimenReadiness(g.s);
  assert.equal(sp.readyToProduce, true);
});

test("a specimen saved before this epic (no plantedAt) migrates plantedAt to s.elapsed, never 0", () => {
  const g = new GardenState(null, 1000);
  g.s.elapsed = 888;
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 3, z: -2 });
  const saved = g.serialize();
  delete saved.specimens[0].plantedAt;
  const migrated = new GardenState(saved);
  assert.equal(migrated.s.specimens.length, 1);
  const sp = migrated.s.specimens[0];
  assert.equal(sp.plantedAt, 888);
  // A specimen migrated this way is immature the instant it loads, never instantly mature.
  assert.equal(Cultivars.isMature(migrated.s, sp), false);
});

test("a malformed plantedAt is rejected, but a legitimately negative one (backdated) is accepted", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  for (const bad of [Infinity, -Infinity, "12", null, NaN]) {
    const saved = g.serialize();
    saved.specimens[0].plantedAt = bad;
    assert.throws(() => validate(saved), /Spécimen invalide/);
  }
  const negative = g.serialize();
  negative.specimens[0].plantedAt = -1000;
  assert.doesNotThrow(() => validate(negative));
});

test("plantedAt survives a real JSON save/reload round trip", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: 1 });
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.specimens[0], sp);
});
