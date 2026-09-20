const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");
const RainelleMovement = require("../public/game/rainelle-movement.js");
const Observation = require("../public/game/campaign-observation.js");

// Epic C2.9 (design §5, "Le mode d'observation montre chemins, transferts et cadence par
// journée. Il permet de suivre un objet du plant au présentoir et de lancer un cycle pas à
// pas."). See campaign-observation.js's own header comment for the documented présentoir scope
// gap (no point-of-sale station kind exists in campaign-stations.js's KINDS). Only the pure
// functions are tested here — the HUD panel/dispatch wiring is exercised by the browser
// regression check described in the epic's own report, not by a Node test.

// Same minimal fixture already used by tests/campaign-rainelles-status.cjs: a Rainelle created
// directly, without the scripted frog-encounter flow, since nothing here depends on that flow.
function freshRainelle(g) {
  const cultivar = Cultivars.createCultivar(g.s, { name: "Test", traits: {} });
  return Rainelles.createRainelle(g.s, { cultivarId: cultivar.id, name: "Observée" });
}

function teach(rainelle, fields) {
  const r = Rainelles.applyGesture(rainelle, { condition: "", ...fields });
  assert.equal(r.ok, true, r.error);
}

test("CYCLE_SECONDS is re-exported from campaign-automation.js, never a second duplicated number", () => {
  assert.equal(Observation.CYCLE_SECONDS, CampaignAutomation.CYCLE_SECONDS);
});

test("observedPaths: skips a Rainelle with no real position yet", () => {
  const g = new GardenState(null, 1000);
  freshRainelle(g);
  assert.deepEqual(Observation.observedPaths(g.s), []);
});

test("observedPaths: a Rainelle 'au travail' routes toward her geste's poste, matching RainelleMovement.routeTo directly", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 6, z: 6 });
  teach(rainelle, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  // Same starting cell rainelle-movement.js's own FALLBACK_POSITION uses — verified walkable
  // there (its own header comment: "{x:0,z:0} elle-même ne l'est pas, trop proche du pot de
  // départ ; ce point l'est").
  rainelle.x = RainelleMovement.FALLBACK_POSITION.x;
  rainelle.z = RainelleMovement.FALLBACK_POSITION.z;
  const [entry] = Observation.observedPaths(g.s);
  assert.ok(entry);
  assert.equal(entry.rainelleId, rainelle.id);
  assert.equal(entry.location, "poste");
  assert.equal(entry.statusKind, "au-travail");
  assert.deepEqual(entry.route, RainelleMovement.routeTo(g.s, rainelle, "poste"));
  assert.ok(entry.route.length > 0);
});

test("observedPaths: a Rainelle not currently working routes toward habitat, not her poste", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  rainelle.x = 0;
  rainelle.z = 0;
  // No gesture taught at all: RainellesStatus.status returns "repos", never "au-travail".
  const [entry] = Observation.observedPaths(g.s);
  assert.equal(entry.location, "habitat");
  assert.equal(entry.statusKind, "repos");
});

test("observedTransfers: a panier reports its real buffer/capacity/min and the Rainelles that target it, never the live buffer object itself", () => {
  const g = new GardenState(null, 1000);
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 10, z: 10 });
  from.buffer.fraise = 4;
  const rainelle = freshRainelle(g);
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
  });
  const transfers = Observation.observedTransfers(g.s);
  const fromSummary = transfers.find((t) => t.id === from.id);
  const toSummary = transfers.find((t) => t.id === to.id);
  assert.equal(fromSummary.kind, "panier");
  assert.deepEqual(fromSummary.buffer, { fraise: 4 });
  assert.notEqual(fromSummary.buffer, from.buffer);
  assert.equal(fromSummary.total, 4);
  assert.equal(fromSummary.capacity, Stations.DEFAULT_PANIER_CAPACITY);
  assert.deepEqual(fromSummary.rainelles, [
    { rainelleId: rainelle.id, verbe: "transporter", role: "source", status: "au-travail" },
  ]);
  assert.deepEqual(toSummary.rainelles, [
    { rainelleId: rainelle.id, verbe: "transporter", role: "destination", status: "au-travail" },
  ]);
});

test("observedTransfers: a zone/borne reports veilleuse/priseFortDebit and its own workers", () => {
  const g = new GardenState(null, 1000);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 1, z: 1 });
  const rainelle = freshRainelle(g);
  teach(rainelle, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  const transfers = Observation.observedTransfers(g.s);
  const zoneSummary = transfers.find((t) => t.id === zone.id);
  const borneSummary = transfers.find((t) => t.id === borne.id);
  assert.equal(zoneSummary.veilleuse, false);
  assert.equal(zoneSummary.rainelles.length, 1);
  assert.equal(zoneSummary.rainelles[0].role, "poste");
  assert.equal(borneSummary.priseFortDebit, false);
  assert.equal(borneSummary.rainelles[0].role, "source");
});

test("observedCadence: nightlyActivity[id] / campaignDay, defaulting to 0 for a Rainelle that never worked a night", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  g.s.campaignDay = 4;
  g.s.campaignMemory.nightlyActivity[rainelle.id] = 2;
  const [entry] = Observation.observedCadence(g.s);
  assert.equal(entry.rainelleId, rainelle.id);
  assert.equal(entry.nightlyActivity, 2);
  assert.equal(entry.perDay, 0.5);
});

test("observedCadence: campaignDay 0 (or missing) never divides by zero", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  g.s.campaignDay = 0;
  g.s.campaignMemory.nightlyActivity[rainelle.id] = 3;
  const [entry] = Observation.observedCadence(g.s);
  assert.equal(entry.perDay, 3);
  assert.ok(Number.isFinite(entry.perDay));
});

test("resolveChainEnd: one transport hop ends at the destination panier", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const b = Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  const rainelle = freshRainelle(g);
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: a.id,
    destination: b.id,
  });
  const result = Observation.resolveChainEnd(g.s, a.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.chain, [a.id, b.id]);
  assert.equal(result.endId, b.id);
});

test("resolveChainEnd: two transport hops (panier A -> B -> C) end at C, the real one-not-a-second-source", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const b = Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  const c = Stations.registerStation(g.s.campaignStations, "panier", { x: 2, z: 2 });
  const first = freshRainelle(g);
  const second = freshRainelle(g);
  teach(first, { verbe: "transporter", poste: "x", source: a.id, destination: b.id });
  teach(second, { verbe: "transporter", poste: "x", source: b.id, destination: c.id });
  const result = Observation.resolveChainEnd(g.s, a.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.chain, [a.id, b.id, c.id]);
  assert.equal(result.endId, c.id);
});

test("resolveChainEnd: starting from a zone resolves the panier its own récolteuse actually feeds first", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  const rainelle = freshRainelle(g);
  teach(rainelle, { verbe: "recolter", poste: zone.id, source: "x", destination: panier.id });
  const result = Observation.resolveChainEnd(g.s, zone.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.chain, [panier.id]);
  assert.equal(result.endId, panier.id);
});

test("resolveChainEnd: a zone with no récolteuse feeding it yet has no chain to resolve", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const result = Observation.resolveChainEnd(g.s, zone.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.chain, []);
  assert.equal(result.endId, null);
});

test("resolveChainEnd: a two-Rainelle cycle (A->B, B->A) terminates instead of looping forever", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const b = Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  const first = freshRainelle(g);
  const second = freshRainelle(g);
  teach(first, { verbe: "transporter", poste: "x", source: a.id, destination: b.id });
  teach(second, { verbe: "transporter", poste: "x", source: b.id, destination: a.id });
  const result = Observation.resolveChainEnd(g.s, a.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.chain, [a.id, b.id]);
  assert.equal(result.endId, b.id);
});

test("resolveChainEnd: an unknown id, or one that is not a zone/panier, is a readable error, never a throw", () => {
  const g = new GardenState(null, 1000);
  assert.equal(Observation.resolveChainEnd(g.s, "inconnu").ok, false);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  assert.equal(Observation.resolveChainEnd(g.s, habitat.id).ok, false);
});

test("no read function ever mutates `s`, even called repeatedly", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 3 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 6, z: 6 });
  teach(rainelle, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  rainelle.x = 0;
  rainelle.z = 0;
  g.s.campaignMemory.nightlyActivity[rainelle.id] = 2;
  g.s.campaignDay = 3;
  const before = JSON.stringify(g.s);
  for (let i = 0; i < 5; i++) {
    Observation.observedPaths(g.s);
    Observation.observedTransfers(g.s);
    Observation.observedCadence(g.s);
    Observation.resolveChainEnd(g.s, panier.id);
    Observation.resolveChainEnd(g.s, zone.id);
  }
  assert.equal(JSON.stringify(g.s), before);
});
