const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Memory = require("../public/game/campaign-memory.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

// Epic C5.3 (design §11, "des limites physiologiques finissent par réduire la capacité... elles
// ne doivent pas annuler immédiatement tout le gain nocturne") : a Rainelle's overexertion streak
// (campaignMemory.overexertion, distinct from C5.1's cumulative nightlyActivity) climbs by one on
// a night of real night work (C5.2) and comes down by one, floored at zero, on a night of real
// rest — never reset outright. Past Memory.OVEREXERTION_THRESHOLD, doArroser/doRecolter
// (campaign-automation.js) cap the volume moved to CampaignAutomation.FATIGUED_CAPACITY_PER_CYCLE,
// never to zero.

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands today. Same
// fixture already used by tests/campaign-automation.cjs/-memory.cjs/-veilleuses.cjs.
function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function teach(g, id, fields) {
  const r = g.command({ type: "teachGesture", id, condition: "", ...fields });
  assert.equal(r.ok, true, r.error);
}

test("sleep: a night of real night work increases the overexertion streak by one", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id] || 0, 0);

  g.command({ type: "sleep" });
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id], 1);
  g.command({ type: "sleep" });
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id], 2);
});

test("sleep: a rested night (no veilleuse) decreases the overexertion streak by exactly one, never resetting it outright", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  // No gesture/veilleuse at all: every following night is plain rest.
  g.s.campaignMemory.overexertion[rainelle.id] = 3;

  g.command({ type: "sleep" });
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id], 2, "one unit removed, not reset to zero");
  g.command({ type: "sleep" });
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id], 1);
});

test("sleep: the overexertion streak floors at zero and never goes negative", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;

  g.command({ type: "sleep" });
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id], 0);
  g.command({ type: "sleep" });
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id], 0, "already at the floor, stays there");
});

test("sleep: an active veilleuse with a zone idle for want of input still counts as rest, decreasing overexertion", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  // No specimen anywhere: the veilleuse is lit but there is nothing to water.
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 2;

  g.command({ type: "sleep" });
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id], 1, "idle veilleuse is rest, per design §11 read symmetrically");
});

test("doArroser under runNightWork: under the threshold, every specimen in range is watered — unchanged from before this epic", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimens = [0, 1, 2].map(() =>
    Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 }),
  );
  // Dry every specimen out fully *before* teaching the gesture: once taught, the ordinary
  // day-tick automation (tickArroser) would otherwise keep rewatering them as g.step() advances,
  // making a watered specimen indistinguishable from an unwatered one by moisture alone.
  g.step(3 * 3600 + 100);
  for (const sp of specimens)
    assert.ok(Cultivars.specimenMoisture(sp, g.s.elapsed) < 1, "fully dried out before the test night");
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id] || 0, 0, "under threshold");

  g.command({ type: "sleep" });
  for (const sp of specimens)
    assert.ok(
      Cultivars.specimenMoisture(sp, g.s.elapsed) > 95,
      "no cap below the threshold: every specimen in range is watered",
    );
});

test("doArroser under runNightWork: past the overexertion threshold, only FATIGUED_CAPACITY_PER_CYCLE specimens are watered — never zero", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimens = [0, 1, 2].map(() =>
    Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 }),
  );
  // Same ordering fix as the previous test: dry out before teaching, so the day-tick automation
  // (once taught) never gets a chance to rewater a specimen while g.step() advances.
  g.step(3 * 3600 + 100);
  for (const sp of specimens)
    assert.ok(Cultivars.specimenMoisture(sp, g.s.elapsed) < 1, "fully dried out before the test night");
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  // Simulates a Rainelle that already ran several consecutive nights of real work — the streak
  // as it would stand *before* tonight's own resolution.
  g.s.campaignMemory.overexertion[rainelle.id] = Memory.OVEREXERTION_THRESHOLD + 1;

  g.command({ type: "sleep" });
  const watered = specimens.filter((sp) => Cultivars.specimenMoisture(sp, g.s.elapsed) > 95);
  const untouched = specimens.filter((sp) => Cultivars.specimenMoisture(sp, g.s.elapsed) < 1);
  assert.equal(watered.length, CampaignAutomation.FATIGUED_CAPACITY_PER_CYCLE, "capped, but never zero");
  assert.equal(untouched.length, specimens.length - CampaignAutomation.FATIGUED_CAPACITY_PER_CYCLE);
  // Still counted as a night of real work: a reduced cycle is still work, not rest.
  assert.equal(g.s.campaignMemory.nightlyActivity[rainelle.id], 1);
});

test("doRecolter under runNightWork: past the overexertion threshold, only FATIGUED_CAPACITY_PER_CYCLE units are harvested, the rest stay ready, nothing lost", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const specimens = [0, 1, 2].map(() =>
    Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0, stage: Cultivars.MATURE_STAGE }),
  );
  for (const sp of specimens) Cultivars.setReadyToProduce(g.s, sp, true);
  teach(g, rainelle.id, { verbe: "recolter", poste: zone.id, source: "x", destination: panier.id });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = Memory.OVEREXERTION_THRESHOLD + 1;

  g.command({ type: "sleep" });
  assert.equal(Stations.panierTotal(panier), CampaignAutomation.FATIGUED_CAPACITY_PER_CYCLE, "capped, but never zero");
  const stillReady = specimens.filter((sp) => sp.readyToProduce);
  assert.equal(
    stillReady.length,
    specimens.length - CampaignAutomation.FATIGUED_CAPACITY_PER_CYCLE,
    "the specimens that didn't fit under the cap stay ready, never lost",
  );
});

test("a save without any campaignMemory.overexertion (pre-epic) migrates to an empty streak map without error", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const raw = g.serialize();
  delete raw.campaignMemory.overexertion;
  const migrated = validate(raw);
  assert.deepEqual(migrated.campaignMemory.overexertion, {});
});

test("validate rejects a malformed campaignMemory.overexertion", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);

  const unknownId = g.serialize();
  unknownId.campaignMemory.overexertion = { r999: 1 };
  assert.throws(() => validate(unknownId), /Mémoire de campagne invalide/);

  const negative = g.serialize();
  negative.campaignMemory.overexertion = { [rainelle.id]: -1 };
  assert.throws(() => validate(negative), /Mémoire de campagne invalide/);

  const valid = g.serialize();
  valid.campaignMemory.overexertion = { [rainelle.id]: 4 };
  assert.doesNotThrow(() => validate(valid));
});

test("a real JSON round-trip keeps a populated campaignMemory.overexertion strictly identical", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: true });
  g.command({ type: "sleep" });
  g.command({ type: "sleep" });
  assert.ok(g.s.campaignMemory.overexertion[rainelle.id] > 0);
  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignMemory, g.s.campaignMemory);
});
