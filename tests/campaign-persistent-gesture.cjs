const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Memory = require("../public/game/campaign-memory.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");
const Scenes = require("../public/game/campaign-scenes.js");
const Narrative = require("../public/game/data-narrative.js");

// Epic C5.6 (design §11, scène de référence "la pause qui ne commence pas" ; design §10,
// chapitre 14 du même nom). detectPersistentGestures identifies exactly C5.2's own case 3
// (resolved zone, veilleuse on, no real work this night) further narrowed by a strictly
// positive overexertion streak (C5.3) — distinct from a Rainelle simply at "repos" réel
// (veilleuse off) and from a Rainelle who has never once been sursollicitée.

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

test("detectPersistentGestures: no gesture ever taught is never persistent", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const worked = CampaignAutomation.runNightWork(g.s);
  assert.deepEqual(Scenes.detectPersistentGestures(g.s, worked), []);
});

test("detectPersistentGestures: real rest (veilleuse off) is never persistent, whatever the overexertion streak", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.s.campaignMemory.overexertion[rainelle.id] = 3;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(worked.has(rainelle.id), false);
  assert.deepEqual(Scenes.detectPersistentGestures(g.s, worked), []);
});

test("detectPersistentGestures: real work this night is never persistent, even with a positive overexertion streak", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  zone.veilleuse = true;
  g.s.campaignMemory.overexertion[rainelle.id] = 2;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(worked.has(rainelle.id), true);
  assert.deepEqual(Scenes.detectPersistentGestures(g.s, worked), []);
});

test("detectPersistentGestures: an active veilleuse with an empty source but a Rainelle never sursollicitée is not persistent", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  // No specimen registered anywhere: the borne/zone resolve, but there is nothing to water.
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  zone.veilleuse = true;
  assert.equal(g.s.campaignMemory.overexertion[rainelle.id] || 0, 0, "never sursollicitée");

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(worked.has(rainelle.id), false);
  assert.deepEqual(
    Scenes.detectPersistentGestures(g.s, worked),
    [],
    "an idle-but-never-fatiguée veilleuse does not count as persistence",
  );
});

test("detectPersistentGestures: an active veilleuse with an empty source AND a positive overexertion streak is persistent", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  zone.veilleuse = true;
  g.s.campaignMemory.overexertion[rainelle.id] = 1;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(worked.has(rainelle.id), false, "nothing to water");
  assert.deepEqual(Scenes.detectPersistentGestures(g.s, worked), [rainelle.id]);
});

test("detectPersistentGestures: an unresolvable zone ('station manquante') is never persistent, even with a positive overexertion streak", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: "z999", source: borne.id, destination: "x" });
  g.s.campaignMemory.overexertion[rainelle.id] = 5;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.deepEqual(
    Scenes.detectPersistentGestures(g.s, worked),
    [],
    "a missing station has no real poste to be seen persisting at",
  );
});

test("detectPersistentGestures: 'transporter' never joins the persistent set (no night mechanism, so overexertion never accrues for it)", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  teach(g, rainelle.id, {
    verbe: "transporter",
    poste: "x",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  // Contrived, but exercises the verb guard directly rather than relying only on the fact that
  // no real code path can ever set this for a transporteuse.
  g.s.campaignMemory.overexertion[rainelle.id] = 3;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.deepEqual(Scenes.detectPersistentGestures(g.s, worked), []);
});

test("sleep: reveals the persistence text the first night a Rainelle is detected in persistance de geste", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), false);

  g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), true);
  const seenAfterFirst = g.s.campaignFlags.filter((f) => f === "persistance-geste-vide").length;

  // A second night of persistence never reveals the same text twice.
  g.s.campaignMemory.overexertion[rainelle.id] = 1;
  g.command({ type: "sleep" });
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "persistance-geste-vide").length,
    seenAfterFirst,
    "revealed only once, ever",
  );
});

test("sleep: never reveals the persistence text on a refused command or an ordinary rest night", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  // Refused command: unknown gesture verb.
  const refused = g.command({ type: "teachGesture", id: rainelle.id, verbe: "voler", poste: "x", source: "x", destination: "x", condition: "" });
  assert.equal(refused.ok, false);

  g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), false);
});

test("sleep: reveals the attentive-player text the first night with no persistence but at least one real veilleuse night already recorded", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  assert.equal(Object.keys(g.s.campaignMemory.nightlyActivity).length, 0);

  // First real veilleuse night: waters the specimen, no persistence this same night.
  g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), false);
  assert.equal(g.s.campaignFlags.includes("nuit-attentive-reconnue"), true);
});

test("sleep: never reveals the attentive-player text on a save that has never used a veilleuse at all", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  g.command({ type: "sleep" });
  g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("nuit-attentive-reconnue"), false);
});

test("sleep: the persistence and attentive-player texts are mutually exclusive on the same night", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;
  // Fake a prior real night of veilleuse work so the attentive text's second condition holds.
  g.s.campaignMemory.nightlyActivity[rainelle.id] = 1;

  g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), true);
  assert.equal(g.s.campaignFlags.includes("nuit-attentive-reconnue"), false);
});

test("Narrative.TEXTS carries both C5.6 entries with a factual, non-accusatory tone (design §11)", () => {
  const persistence = Narrative.TEXTS["persistance-geste-vide"];
  const attentive = Narrative.TEXTS["nuit-attentive-reconnue"];
  assert.ok(persistence && attentive);
  assert.equal(persistence.trigger, "persistentGestureDetected");
  assert.equal(attentive.trigger, "attentiveNightRecognized");
  for (const t of [persistence.text, attentive.text]) {
    assert.doesNotMatch(t.toLowerCase(), /tu devrais|ta faute|coupable|tu as mal/);
  }
});
