const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Memory = require("../public/game/campaign-memory.js");

// Epic C5.2 (design §11, "veilleuses de croissance") : une zone de culture gagne un indicateur
// `veilleuse` (registre campaign-stations.js) ; pendant la résolution de nuit ("sleep",
// garden-state-cmd-f.js), une zone dont la veilleuse est active fait travailler ses Rainelles
// assignées (arroser/récolter) au lieu du repos par défaut, au prix d'une vraie consommation —
// jamais une ressource gratuite. Voir campaign-automation.js's runNightWork pour la raison du
// périmètre (arroser/récolter seulement, pas transporter, qui n'a aucune notion de zone).

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands today. Same
// fixture already used by tests/campaign-automation.cjs/-memory.cjs.
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

test("setVeilleuse: refuses explicitly on an unknown id, or an id that resolves to a different station kind", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });

  const unknown = g.command({ type: "setVeilleuse", zoneId: "z999", active: true });
  assert.equal(unknown.ok, false);

  const wrongKind = g.command({ type: "setVeilleuse", zoneId: panier.id, active: true });
  assert.equal(wrongKind.ok, false);
});

test("setVeilleuse: turns a zone's veilleuse on and off; a fresh zone starts off", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  assert.equal(zone.veilleuse, false);

  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  assert.equal(zone.veilleuse, true);

  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: false }).ok, true);
  assert.equal(zone.veilleuse, false);
});

test("sleep: a Rainelle assigned to a zone without veilleuse simply rests, exactly as before this epic", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(g.s.campaignMemory.rest, { [rainelle.id]: 1 });
  assert.deepEqual(g.s.campaignMemory.nightlyActivity, {});
});

test("sleep: an active veilleuse with real work available (arroser) waters overnight and is recorded as nightlyActivity, never rest", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  g.step(3 * 3600 + 100);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) < 1);

  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95, "real work: the specimen was actually watered");
  assert.deepEqual(g.s.campaignMemory.nightlyActivity, { [rainelle.id]: 1 });
  assert.deepEqual(g.s.campaignMemory.rest, {}, "worked, so never also counted as rested the same night");
});

test("sleep: an active veilleuse with nothing to do (no specimen in range) grants nothing, and the Rainelle still counts as having rested", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  // No specimen registered anywhere: the borne/zone resolve, but there is nothing to water.
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(g.s.campaignMemory.nightlyActivity, {}, "an active but idle veilleuse is never a night of work");
  assert.deepEqual(g.s.campaignMemory.rest, { [rainelle.id]: 1 });
});

test("sleep: switching the veilleuse off before the next night immediately returns to rest, no residual", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(g.s.campaignMemory.nightlyActivity, { [rainelle.id]: 1 });

  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: false }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(g.s.campaignMemory.nightlyActivity, { [rainelle.id]: 1 }, "no residual: unchanged from the previous night");
  assert.deepEqual(g.s.campaignMemory.rest, { [rainelle.id]: 1 });
});

test("sleep: recolter under a veilleuse still respects the destination panier's capacity — nothing lost, nothing free", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.capacity = 1;
  const a = Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  const b = Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  Cultivars.setReadyToProduce(g.s, a, true);
  Cultivars.setReadyToProduce(g.s, b, true);
  teach(g, rainelle.id, { verbe: "recolter", poste: zone.id, source: "x", destination: panier.id });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(Stations.panierTotal(panier), 1, "capacity respected, exactly like a daytime cycle");
  const stillReady = [a, b].filter((sp) => sp.readyToProduce);
  assert.equal(stillReady.length, 1, "the specimen that didn't fit stays ready, never lost");
  assert.deepEqual(g.s.campaignMemory.nightlyActivity, { [rainelle.id]: 1 });
});

test("sleep: a Rainelle taught 'transporter' never works at night under a veilleuse — no zone concept for that verb", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  from.buffer[cultivarId] = 3;
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  teach(g, rainelle.id, {
    verbe: "transporter",
    poste: zone.id,
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(from.buffer[cultivarId], 3, "never moved overnight");
  assert.deepEqual(g.s.campaignMemory.nightlyActivity, {});
  assert.deepEqual(g.s.campaignMemory.rest, { [rainelle.id]: 1 });
});

test("a save without any zone.veilleuse (pre-epic) migrates to false without error", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const raw = g.serialize();
  delete raw.campaignStations.zones[0].veilleuse;
  const migrated = validate(raw);
  assert.equal(migrated.campaignStations.zones[0].veilleuse, false);
});

test("validate rejects a malformed zone.veilleuse or campaignMemory.nightlyActivity", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });

  const badFlag = g.serialize();
  badFlag.campaignStations.zones[0].veilleuse = "yes";
  assert.throws(() => validate(badFlag), /Registre de stations invalide/);

  const unknownId = g.serialize();
  unknownId.campaignMemory.nightlyActivity = { r999: 1 };
  assert.throws(() => validate(unknownId), /Mémoire de campagne invalide/);

  const negative = g.serialize();
  negative.campaignMemory.nightlyActivity = { [rainelle.id]: -1 };
  assert.throws(() => validate(negative), /Mémoire de campagne invalide/);

  const valid = g.serialize();
  assert.doesNotThrow(() => validate(valid));
});

test("a real JSON round-trip keeps a populated zone.veilleuse and campaignMemory.nightlyActivity strictly identical", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: true });
  g.command({ type: "sleep" });
  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignStations, g.s.campaignStations);
  assert.deepEqual(reloaded.campaignMemory, g.s.campaignMemory);
});
