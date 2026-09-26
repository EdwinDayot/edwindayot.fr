const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");
const Seasons = require("../public/game/campaign-seasons.js");

// Epic C7.3: the spring bonus for the stage 0 -> 1 transition ("le printemps favorise les jeunes
// plants", design §12), and the migration of a specimen saved before this epic. Kept in its own
// file rather than merged into campaign-specimen-growth.cjs (C7.2), which stays about the
// season-independent shape of specimenStage.

const DURATION = Cultivars.STAGE_DURATION_ELAPSED_SECONDS;
const SPRING_DURATION = Cultivars.SPRING_YOUNG_STAGE_DURATION_ELAPSED_SECONDS;

function makeCultivar(g) {
  return Cultivars.createCultivar(g.s, { name: "Test", traits: {} });
}

test("a specimen planted on a spring day reaches stage 1 after exactly the spring duration, never later", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignDay = 1; // printemps (seasonForDay(1) === "printemps")
  assert.equal(Seasons.seasonForDay(g.s.campaignDay), "printemps");
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  assert.equal(sp.plantedSeason, "printemps");
  g.s.elapsed = sp.plantedAt + SPRING_DURATION - 1;
  assert.equal(Cultivars.specimenStage(g.s, sp), 0);
  g.s.elapsed = sp.plantedAt + SPRING_DURATION;
  assert.equal(Cultivars.specimenStage(g.s, sp), 1);
});

test("a specimen planted on a summer/autumn/winter day reaches stage 1 only after the ordinary duration, never shorter", () => {
  for (const [day, season] of [
    [11, "ete"],
    [21, "automne"],
    [31, "hiver"],
  ]) {
    const g = new GardenState(null, 1000);
    g.s.campaignDay = day;
    assert.equal(Seasons.seasonForDay(g.s.campaignDay), season);
    const cv = makeCultivar(g);
    const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
    assert.equal(sp.plantedSeason, season);
    // Just before the ordinary duration: still stage 0, in particular never already advanced by
    // the spring-only shortcut (checked at the spring boundary itself, which must still be too
    // early here since SPRING_DURATION < DURATION).
    g.s.elapsed = sp.plantedAt + SPRING_DURATION;
    assert.equal(Cultivars.specimenStage(g.s, sp), 0);
    g.s.elapsed = sp.plantedAt + DURATION - 1;
    assert.equal(Cultivars.specimenStage(g.s, sp), 0);
    g.s.elapsed = sp.plantedAt + DURATION;
    assert.equal(Cultivars.specimenStage(g.s, sp), 1);
  }
});

test("the stage 1 -> MATURE_STAGE transition always takes the ordinary duration, whatever the planting season", () => {
  for (const [day, season] of [
    [1, "printemps"],
    [11, "ete"],
    [21, "automne"],
    [31, "hiver"],
  ]) {
    const g = new GardenState(null, 1000);
    g.s.campaignDay = day;
    const cv = makeCultivar(g);
    const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
    assert.equal(sp.plantedSeason, season);
    const firstStageDuration = season === "printemps" ? SPRING_DURATION : DURATION;
    g.s.elapsed = sp.plantedAt + firstStageDuration + DURATION - 1;
    assert.equal(Cultivars.specimenStage(g.s, sp), 1);
    g.s.elapsed = sp.plantedAt + firstStageDuration + DURATION;
    assert.equal(Cultivars.specimenStage(g.s, sp), Cultivars.MATURE_STAGE);
  }
});

test("specimenStage is pure across the seasonal boundary too: repeat calls without advancing s.elapsed agree", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignDay = 1;
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  g.s.elapsed = sp.plantedAt + SPRING_DURATION + 10;
  const before = JSON.stringify(sp);
  const first = Cultivars.specimenStage(g.s, sp);
  const second = Cultivars.specimenStage(g.s, sp);
  assert.equal(first, second);
  assert.equal(JSON.stringify(sp), before);
});

test("a specimen saved before this epic (no plantedSeason) migrates to a season that never shortens its growth", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignDay = 1; // printemps: if migration ever defaulted to "printemps" this would speed
  // up a specimen already growing on an old save, exactly what the backlog forbids.
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  const saved = g.serialize();
  delete saved.specimens[0].plantedSeason;
  assert.doesNotThrow(() => validate(saved));
  const migrated = new GardenState(saved);
  const migratedSp = migrated.s.specimens[0];
  assert.notEqual(migratedSp.plantedSeason, "printemps");
  assert.ok(Seasons.SEASONS.includes(migratedSp.plantedSeason));
  // Confirms the migrated season really does behave as "never shorter": stage 0 -> 1 still needs
  // the full, ordinary duration, not the spring one.
  migrated.s.elapsed = sp.plantedAt + SPRING_DURATION;
  assert.equal(Cultivars.specimenStage(migrated.s, migratedSp), 0);
  migrated.s.elapsed = sp.plantedAt + DURATION;
  assert.equal(Cultivars.specimenStage(migrated.s, migratedSp), 1);
});

test("a malformed plantedSeason is rejected; every real season is accepted", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  for (const bad of ["ete-invalide", "", 1, null]) {
    const saved = g.serialize();
    saved.specimens[0].plantedSeason = bad;
    assert.throws(() => validate(saved), /Spécimen invalide/);
  }
  for (const season of Seasons.SEASONS) {
    const saved = g.serialize();
    saved.specimens[0].plantedSeason = season;
    assert.doesNotThrow(() => validate(saved));
  }
});

test("plantedSeason survives a real JSON save/reload round trip", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignDay = 21;
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  assert.equal(sp.plantedSeason, "automne");
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.specimens[0], sp);
});
