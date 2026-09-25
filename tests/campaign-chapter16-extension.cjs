const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");

// Epic C6.26 (design §11, third intensification lever, "extension standardisée sur un espace
// vivant") : extendZoneOverHabitat sets a zone's extensionCommerciale flag and, in the same
// gesture, removes the named habitat from the registry (Stations.removeHabitat, C3.3) — the real
// cost this lever pays. See garden-state-cmd-y.js and campaign-memory.js's
// recordHabitatTransformation for the full mandate.

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands — same fixture
// already used by tests/campaign-chapter17.cjs.
function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

test("extendZoneOverHabitat: refuses an unknown zone id, never mutating anything", () => {
  const g = new GardenState(null, 1000);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const before = JSON.stringify(g.s.campaignStations);
  const beforeMemory = JSON.stringify(g.s.campaignMemory);

  const result = g.command({ type: "extendZoneOverHabitat", zoneId: "z999", habitatId: habitat.id });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
  assert.equal(JSON.stringify(g.s.campaignMemory), beforeMemory);
});

test("extendZoneOverHabitat: refuses an id that resolves to something other than a zone", () => {
  const g = new GardenState(null, 1000);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const before = JSON.stringify(g.s.campaignStations);

  const result = g.command({
    type: "extendZoneOverHabitat",
    zoneId: borne.id,
    habitatId: habitat.id,
  });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("extendZoneOverHabitat: refuses an unknown habitat id, never mutating anything", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const before = JSON.stringify(g.s.campaignStations);
  const beforeMemory = JSON.stringify(g.s.campaignMemory);

  const result = g.command({ type: "extendZoneOverHabitat", zoneId: zone.id, habitatId: "h999" });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
  assert.equal(JSON.stringify(g.s.campaignMemory), beforeMemory);
});

test("extendZoneOverHabitat: refuses an id that resolves to something other than a habitat", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  const before = JSON.stringify(g.s.campaignStations);

  const result = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zone.id,
    habitatId: panier.id,
  });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("extendZoneOverHabitat: refuses a zone already extended commercially", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const habitatA = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 1,
    z: 1,
    capacity: 2,
  });
  const habitatB = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 2,
    z: 2,
    capacity: 2,
  });

  const first = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zone.id,
    habitatId: habitatA.id,
  });
  assert.equal(first.ok, true, first.error);

  const before = JSON.stringify(g.s.campaignStations);
  const beforeMemory = JSON.stringify(g.s.campaignMemory);
  const second = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zone.id,
    habitatId: habitatB.id,
  });
  assert.equal(second.ok, false, "a zone already extended cannot be extended a second time");
  assert.equal(JSON.stringify(g.s.campaignStations), before);
  assert.equal(JSON.stringify(g.s.campaignMemory), beforeMemory);
});

test("extendZoneOverHabitat: refuses when the habitat is occupied (Stations.removeHabitat itself would refuse)", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const habitatA = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 1,
    z: 1,
    capacity: 2,
  });
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 2, z: 2, capacity: 2 });
  bornRainelle(g);
  Rainelles.createRainelle(g.s, { cultivarId: g.s.cultivars[0].id, name: "Seconde" });
  Rainelles.createRainelle(g.s, { cultivarId: g.s.cultivars[0].id, name: "Troisième" });
  assert.equal(g.s.rainelles.length, 3);

  const before = JSON.stringify(g.s.campaignStations);
  const beforeMemory = JSON.stringify(g.s.campaignMemory);
  const result = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zone.id,
    habitatId: habitatA.id,
  });
  assert.equal(
    result.ok,
    false,
    "removing this 2-place habitat would leave only 2 places for 3 Rainelles",
  );
  assert.equal(JSON.stringify(g.s.campaignStations), before, "refusal never mutates stations");
  assert.equal(
    JSON.stringify(g.s.campaignMemory),
    beforeMemory,
    "refusal never mutates campaignMemory either",
  );
});

test("extendZoneOverHabitat: succeeds, removes the habitat and flags the zone", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const habitatA = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 1,
    z: 1,
    capacity: 3,
  });
  const habitatB = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 2,
    z: 2,
    capacity: 2,
  });
  bornRainelle(g);

  const result = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zone.id,
    habitatId: habitatA.id,
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(g.s.campaignStations.habitats, [habitatB]);
  assert.equal(
    g.s.campaignStations.zones.find((z) => z.id === zone.id).extensionCommerciale,
    true,
  );
});

test("extendZoneOverHabitat: records exactly one habitatTransformations entry with the right fields", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 1,
    z: 1,
    capacity: 5,
  });
  g.s.campaignDay = 7;

  const result = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zone.id,
    habitatId: habitat.id,
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(g.s.campaignMemory.habitatTransformations, [
    { zoneId: zone.id, habitatId: habitat.id, capacity: 5, day: 7 },
  ]);
});

test("extendZoneOverHabitat: two extensions on two different zones add two distinct entries, never overwriting the first", () => {
  const g = new GardenState(null, 1000);
  const zoneA = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const zoneB = Stations.registerStation(g.s.campaignStations, "zone", { x: 5, z: 5 });
  const habitatA = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 1,
    z: 1,
    capacity: 4,
  });
  const habitatB = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 2,
    z: 2,
    capacity: 6,
  });

  const first = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zoneA.id,
    habitatId: habitatA.id,
  });
  assert.equal(first.ok, true, first.error);
  const second = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zoneB.id,
    habitatId: habitatB.id,
  });
  assert.equal(second.ok, true, second.error);

  assert.deepEqual(g.s.campaignMemory.habitatTransformations, [
    { zoneId: zoneA.id, habitatId: habitatA.id, capacity: 4, day: g.s.campaignDay },
    { zoneId: zoneB.id, habitatId: habitatB.id, capacity: 6, day: g.s.campaignDay },
  ]);
});

test("extendZoneOverHabitat: round-trips through JSON and re-validates", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const habitatKept = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 1,
    z: 1,
    capacity: 2,
  });
  const habitatTaken = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 2,
    z: 2,
    capacity: 4,
  });

  const result = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zone.id,
    habitatId: habitatTaken.id,
  });
  assert.equal(result.ok, true, result.error);

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignStations.habitats, [habitatKept]);
  assert.equal(
    reloaded.campaignStations.zones.find((z) => z.id === zone.id).extensionCommerciale,
    true,
  );
  assert.deepEqual(reloaded.campaignMemory.habitatTransformations, [
    { zoneId: zone.id, habitatId: habitatTaken.id, capacity: 4, day: g.s.campaignDay },
  ]);
});

test("non-regression: a fresh save has extensionCommerciale-free zones and an empty habitatTransformations", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.campaignStations.zones, []);
  assert.deepEqual(g.s.campaignMemory.habitatTransformations, []);
});

test("migration: a pre-epic zone without extensionCommerciale migrates to false", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const raw = JSON.parse(JSON.stringify(g.s));
  delete raw.campaignStations.zones.find((z) => z.id === zone.id).extensionCommerciale;

  const reloaded = validate(raw);
  assert.equal(
    reloaded.campaignStations.zones.find((z) => z.id === zone.id).extensionCommerciale,
    false,
  );
});
