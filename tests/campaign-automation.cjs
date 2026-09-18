const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

// Epic C2.6c (third and final tier of C2.6's reformulation, see campagne-backlog.md's journal
// des décisions, 2026-09-18): the "arroser"/"recolter" gestures actually run, every tick, once
// bornes/zones/paniers (C2.6a) and specimen humidity/maturity (C2.6b) both exist. See
// campaign-automation.js's own header comment for the design reasoning (job/buffer as this
// file's own reimplementation of automation.js's tickJob/tickBuffer *pattern*, not its code).

const CYCLE = CampaignAutomation.CYCLE_SECONDS;
const RANGE = CampaignAutomation.ZONE_WORK_RANGE;

// Only the scripted frog encounter (C2.3) can create a Rainelle — and its own cultivar — through
// commands. Same fixture already used by tests/campaign-teaching.cjs/-gestures.cjs.
function bornRainelle(g) {
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function teach(rainelle, fields) {
  const r = Rainelles.applyGesture(rainelle, {
    condition: "",
    ...fields,
  });
  assert.equal(r.ok, true, r.error);
}

test("arroser: a taught Rainelle fills at the borne and waters every specimen in the zone's range, with no command but the passage of time", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 10,
    z: 10,
  });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 20,
    z: 20,
  });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 21,
    z: 20,
  });
  // Dry the specimen out almost completely by advancing simulated time alone — no water command.
  g.step(3 * 3600 + 100);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) < 1);
  teach(rainelle, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
  });
  assert.equal(rainelle.job, null);
  g.step(CYCLE);
  assert.equal(rainelle.job.remaining, CYCLE);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95);
  assert.equal(specimen.moistureAt, g.s.elapsed);
});

test("arroser: a specimen outside the zone's range is never watered", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const far = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 40,
    z: 40,
  });
  assert.ok(
    Math.hypot(far.x - zone.x, far.z - zone.z) > RANGE,
    "fixture must actually be out of range",
  );
  teach(rainelle, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
  });
  const before = far.moistureAt;
  g.step(CYCLE * 3);
  assert.equal(far.moistureAt, before);
});

test("arroser: an unknown source id, or a poste of the wrong kind, leaves the Rainelle inactive without throwing", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });

  const unknownSource = bornRainelle(g);
  teach(unknownSource, {
    verbe: "arroser",
    poste: zone.id,
    source: "b999",
    destination: "peu-importe",
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(unknownSource.job, null);

  const g2 = new GardenState(null, 1000);
  const zone2 = Stations.registerStation(g2.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const borne2 = Stations.registerStation(g2.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  const wrongKind = bornRainelle(g2);
  // poste points at a borne, not a zone: wrong kind, same as an unresolved id.
  teach(wrongKind, {
    verbe: "arroser",
    poste: borne2.id,
    source: borne2.id,
    destination: "peu-importe",
  });
  assert.doesNotThrow(() => g2.step(CYCLE * 2));
  assert.equal(wrongKind.job, null);
});

test("recolter: a mature specimen in range becomes ready automatically, then lands in the destination panier's buffer and is un-readied", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 5,
    z: 5,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 8,
    z: 5,
  });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 5,
    z: 6,
    stage: Cultivars.MATURE_STAGE,
  });
  assert.equal(specimen.readyToProduce, false);
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  // One tick is enough for the readiness pass alone to flip a mature specimen.
  g.tick();
  assert.equal(specimen.readyToProduce, true);
  g.step(CYCLE - 1);
  assert.equal(panier.buffer[cultivarId], 1);
  assert.equal(specimen.readyToProduce, false);
  // The specimen stays mature and is re-armed the very next tick (see
  // campaign-automation.js's updateSpecimenReadiness comment: no growth-timer/yield-limit
  // model exists yet), so a second full cycle harvests it again rather than staying idle.
  g.step(CYCLE);
  assert.equal(panier.buffer[cultivarId], 2);
});

test("recolter: an immature specimen is never harvested, even in range and forced readyToProduce would be illegal", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0, stage: 0 });
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(CYCLE * 3);
  assert.deepEqual(panier.buffer, {});
});

test("recolter: a mature, ready specimen outside the zone's range is never harvested", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 50,
    z: 50,
    stage: Cultivars.MATURE_STAGE,
  });
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(CYCLE * 3);
  assert.deepEqual(panier.buffer, {});
});

test("the four out-of-scope verbs (transporter/replanter/preparer/trier) never crash and never start a job", () => {
  for (const verbe of ["transporter", "replanter", "preparer", "trier"]) {
    const g = new GardenState(null, 1000);
    const rainelle = bornRainelle(g);
    const zone = Stations.registerStation(g.s.campaignStations, "zone", {
      x: 0,
      z: 0,
    });
    const panier = Stations.registerStation(g.s.campaignStations, "panier", {
      x: 0,
      z: 0,
    });
    teach(rainelle, {
      verbe,
      poste: zone.id,
      source: panier.id,
      destination: panier.id,
    });
    assert.doesNotThrow(() => g.step(CYCLE * 2));
    assert.equal(rainelle.job, null);
  }
});

test("a save without rainelle.job or panier.buffer (pre-epic) migrates to correct defaults without error", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  const saved = g.serialize();
  delete saved.rainelles[0].job;
  delete saved.campaignStations.paniers[0].buffer;
  const migrated = new GardenState(saved);
  assert.equal(migrated.s.rainelles[0].job, null);
  assert.deepEqual(migrated.s.campaignStations.paniers[0].buffer, {});
  assert.doesNotThrow(() => migrated.tick());
});

test("validate rejects a malformed rainelle.job or panier.buffer", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });

  const badJob = g.serialize();
  badJob.rainelles[0].job = { remaining: -1 };
  assert.throws(() => validate(badJob), /Rainelle invalide/);

  const overCycle = g.serialize();
  overCycle.rainelles[0].job = { remaining: CYCLE + 1 };
  assert.throws(() => validate(overCycle), /Rainelle invalide/);

  const badBuffer = g.serialize();
  badBuffer.campaignStations.paniers[0].buffer = { "not-a-cultivar": 1 };
  assert.throws(() => validate(badBuffer), /Registre de stations invalide/);

  const badQty = g.serialize();
  const cultivarId = badQty.cultivars[0]?.id;
  if (cultivarId) {
    badQty.campaignStations.paniers[0].buffer = { [cultivarId]: -1 };
    assert.throws(() => validate(badQty), /Registre de stations invalide/);
  }
});

test("a well-formed rainelle.job/panier.buffer round-trip a real JSON save/reload unchanged", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(CYCLE * 2);
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.rainelles, g.s.rainelles);
  assert.deepEqual(reloaded.s.campaignStations, g.s.campaignStations);
});
