const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Memory = require("../public/game/campaign-memory.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

// Epic C5.4 (design §11, "prise d'eau à fort débit") : une borne d'eau (registre
// campaign-stations.js) gagne un indicateur `priseFortDebit` ; une fois active, le cycle
// d'arrosage d'une Rainelle qui la prend pour source tourne plus vite (FAST_CYCLE_SECONDS au lieu
// de CYCLE_SECONDS, campaign-automation.js) et chaque passage réel consomme le bassin commun
// partagé (campaign-memory.js's waterWithdrawals/bassinCommunLevel) — une borne sans la prise n'y
// touche jamais, et couper la prise arrête la baisse sans jamais la faire remonter.

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands today. Same
// fixture already used by tests/campaign-automation.cjs/-memory.cjs/-veilleuses.cjs/-overexertion.cjs.
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

test("setPriseFortDebit: refuses explicitly on an unknown id, or an id that resolves to a different station kind", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });

  const unknown = g.command({ type: "setPriseFortDebit", borneId: "b999", active: true });
  assert.equal(unknown.ok, false);

  const wrongKind = g.command({ type: "setPriseFortDebit", borneId: zone.id, active: true });
  assert.equal(wrongKind.ok, false);
});

test("setPriseFortDebit: turns a borne's flag on and off; a fresh borne starts off", () => {
  const g = new GardenState(null, 1000);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  assert.equal(borne.priseFortDebit, false);

  assert.equal(g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true }).ok, true);
  assert.equal(borne.priseFortDebit, true);

  assert.equal(g.command({ type: "setPriseFortDebit", borneId: borne.id, active: false }).ok, true);
  assert.equal(borne.priseFortDebit, false);
});

test("arroser: a borne without priseFortDebit runs on the ordinary CYCLE_SECONDS, exactly as before this epic", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  g.step(3 * 3600 + 100);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) < 1);
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });

  g.step(CampaignAutomation.FAST_CYCLE_SECONDS);
  assert.ok(
    Cultivars.specimenMoisture(specimen, g.s.elapsed) < 1,
    "not watered yet: the ordinary cycle hasn't completed at the fast duration",
  );
  g.step(CampaignAutomation.CYCLE_SECONDS - CampaignAutomation.FAST_CYCLE_SECONDS);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95, "watered once the full ordinary cycle elapsed");
  assert.deepEqual(g.s.campaignMemory.waterWithdrawals, {}, "no flag, no withdrawal");
});

test("arroser: a flagged borne runs on FAST_CYCLE_SECONDS and records a withdrawal for it", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  g.step(3 * 3600 + 100);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) < 1);
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true }).ok, true);

  g.step(CampaignAutomation.FAST_CYCLE_SECONDS);
  assert.ok(
    Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95,
    "watered already at the fast duration, before the ordinary cycle would have completed",
  );
  assert.deepEqual(g.s.campaignMemory.waterWithdrawals, { [borne.id]: 1 });
});

test("bassinCommunLevel: intensive use through a flagged borne measurably reduces the shared level", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimens = Array.from({ length: 5 }, () =>
    Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 }),
  );
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true }).ok, true);
  const before = Memory.bassinCommunLevel(g.s.campaignMemory);
  assert.equal(before, Memory.BASSIN_COMMUN_CAPACITY, "untouched at the start");

  for (let cycle = 0; cycle < 6; cycle++) {
    for (const sp of specimens) sp.moistureAt = g.s.elapsed - 999999;
    g.step(CampaignAutomation.FAST_CYCLE_SECONDS);
  }
  const after = Memory.bassinCommunLevel(g.s.campaignMemory);
  assert.ok(after < before, "measurably reduced by real, repeated use");
  assert.equal(
    before - after,
    Object.values(g.s.campaignMemory.waterWithdrawals).reduce((n, v) => n + v, 0),
    "the reduction is exactly the cumulative withdrawal total",
  );
});

test("bassinCommunLevel: a borne without priseFortDebit never touches waterWithdrawals or the shared level", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimens = Array.from({ length: 5 }, () =>
    Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 }),
  );
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  // Never flagged: ordinary flow only.

  for (let cycle = 0; cycle < 6; cycle++) {
    for (const sp of specimens) sp.moistureAt = g.s.elapsed - 999999;
    g.step(CampaignAutomation.CYCLE_SECONDS);
  }
  assert.deepEqual(g.s.campaignMemory.waterWithdrawals, {});
  assert.equal(Memory.bassinCommunLevel(g.s.campaignMemory), Memory.BASSIN_COMMUN_CAPACITY);
});

test("bassinCommunLevel: cutting the prise stops the decrease without ever making it climb back", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true }).ok, true);

  specimen.moistureAt = g.s.elapsed - 999999;
  g.step(CampaignAutomation.FAST_CYCLE_SECONDS);
  const levelAfterWork = Memory.bassinCommunLevel(g.s.campaignMemory);
  assert.ok(levelAfterWork < Memory.BASSIN_COMMUN_CAPACITY, "reduced by the one real withdrawal");

  assert.equal(g.command({ type: "setPriseFortDebit", borneId: borne.id, active: false }).ok, true);
  for (let cycle = 0; cycle < 6; cycle++) {
    specimen.moistureAt = g.s.elapsed - 999999;
    g.step(CampaignAutomation.CYCLE_SECONDS);
  }
  assert.equal(
    Memory.bassinCommunLevel(g.s.campaignMemory),
    levelAfterWork,
    "no further decrease once cut, and never restored either — a real, lasting cost",
  );
});

test("a save without any borne.priseFortDebit (pre-epic) migrates to false without error", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const raw = g.serialize();
  delete raw.campaignStations.bornes[0].priseFortDebit;
  const migrated = validate(raw);
  assert.equal(migrated.campaignStations.bornes[0].priseFortDebit, false);
});

test("validate rejects a malformed borne.priseFortDebit or campaignMemory.waterWithdrawals", () => {
  const g = new GardenState(null, 1000);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });

  const badFlag = g.serialize();
  badFlag.campaignStations.bornes[0].priseFortDebit = "yes";
  assert.throws(() => validate(badFlag), /Registre de stations invalide/);

  const unknownId = g.serialize();
  unknownId.campaignMemory.waterWithdrawals = { b999: 1 };
  assert.throws(() => validate(unknownId), /Mémoire de campagne invalide/);

  const negative = g.serialize();
  negative.campaignMemory.waterWithdrawals = { [borne.id]: -1 };
  assert.throws(() => validate(negative), /Mémoire de campagne invalide/);

  const valid = g.serialize();
  valid.campaignMemory.waterWithdrawals = { [borne.id]: 4 };
  assert.doesNotThrow(() => validate(valid));
});

test("a real JSON round-trip keeps a populated borne.priseFortDebit and campaignMemory.waterWithdrawals strictly identical", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true });
  g.step(CampaignAutomation.FAST_CYCLE_SECONDS);
  assert.ok(Object.keys(g.s.campaignMemory.waterWithdrawals).length > 0);
  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignStations, g.s.campaignStations);
  assert.deepEqual(reloaded.campaignMemory, g.s.campaignMemory);
});
