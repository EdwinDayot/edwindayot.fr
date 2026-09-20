const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");
const Scenes = require("../public/game/campaign-scenes.js");

// Epic C5.5 (design §15, phase 5's mechanical exit gate) : une fonction pure classe chaque
// Rainelle, à l'instant qui suit la résolution d'une nuit, dans exactement un de trois lieux
// observables ("poste"/"repos"/"habitat"), sans coordonnées ni graphe de déplacement — voir
// campaign-scenes.js's own header comment. Ces tests reprennent les quatre cas déjà distingués
// par C5.2 (tests/campaign-veilleuses.cjs) plus le cinquième nommé par cet epic (aucun geste),
// et deux cas supplémentaires (station manquante, transporter) que le critère de sortie couvre
// par sa clause générale sans les nommer un par un.

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands today. Same
// fixture already used by tests/campaign-veilleuses.cjs/-automation.cjs/-memory.cjs.
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

test("deriveLocation: no gesture ever taught falls back to 'habitat'", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(Scenes.deriveLocation(rainelle, g.s, worked), Scenes.LOCATIONS.HABITAT);
});

test("deriveLocation: C5.2 case 1 — zone without veilleuse falls back to 'repos'", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(worked.has(rainelle.id), false);
  assert.equal(Scenes.deriveLocation(rainelle, g.s, worked), Scenes.LOCATIONS.REPOS);
});

test("deriveLocation: C5.2 case 2 — active veilleuse with real work resolves to 'poste'", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  zone.veilleuse = true;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(worked.has(rainelle.id), true);
  assert.equal(Scenes.deriveLocation(rainelle, g.s, worked), Scenes.LOCATIONS.POSTE);
});

test("deriveLocation: C5.2 case 3 — active veilleuse with an empty source resolves to 'habitat', not 'repos'", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  // No specimen registered anywhere: the borne/zone resolve, but there is nothing to water.
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  zone.veilleuse = true;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(worked.has(rainelle.id), false);
  assert.equal(Scenes.deriveLocation(rainelle, g.s, worked), Scenes.LOCATIONS.HABITAT);
});

test("deriveLocation: C5.2 case 4 — veilleuse switched off again reads back as 'repos', no residual", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });

  zone.veilleuse = true;
  const workedOn = CampaignAutomation.runNightWork(g.s);
  assert.equal(Scenes.deriveLocation(rainelle, g.s, workedOn), Scenes.LOCATIONS.POSTE);

  zone.veilleuse = false;
  const workedOff = CampaignAutomation.runNightWork(g.s);
  assert.equal(workedOff.has(rainelle.id), false);
  assert.equal(Scenes.deriveLocation(rainelle, g.s, workedOff), Scenes.LOCATIONS.REPOS);
});

test("deriveLocation: an arroser/recolter gesture pointing at an unknown zone id ('station manquante') falls back to 'habitat'", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: "z999", source: borne.id, destination: "x" });

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(Scenes.deriveLocation(rainelle, g.s, worked), Scenes.LOCATIONS.HABITAT);
});

test("deriveLocation: 'transporter' has no night mechanism at all but still resolves to 'poste' — it functions by day", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  from.buffer[cultivarId] = 3;
  teach(g, rainelle.id, {
    verbe: "transporter",
    poste: "x",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(worked.has(rainelle.id), false, "transporter never joins runNightWork's own set");
  assert.equal(Scenes.deriveLocation(rainelle, g.s, worked), Scenes.LOCATIONS.POSTE);
});

test("deriveLocation: a degenerate 'transporter' (same source and destination) falls back to 'habitat'", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  teach(g, rainelle.id, {
    verbe: "transporter",
    poste: "x",
    source: panier.id,
    destination: panier.id,
    condition: "",
  });

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(Scenes.deriveLocation(rainelle, g.s, worked), Scenes.LOCATIONS.HABITAT);
});
