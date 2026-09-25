const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const House = require("../public/game/campaign-house.js");

// Epic C6.27 (design §11, reparation of the third intensification lever, "réparation avec coût
// réel... jamais une annulation gratuite") : convertZoneToLivingSpace pays a real cost, restores
// a zone's extensionCommerciale flag to false, registers a brand-new habitat of exactly the
// capacity the original extendZoneOverHabitat (C6.26) took, and marks — never deletes — the
// transformation entry that recorded the original taking. See garden-state-cmd-y.js's own header
// comment for why the cost is a fixed catalog lookup (campaign-house.js's SPACES.cuisine.cost)
// rather than a value trusted from the caller.

const COST = House.SPACES.cuisine.cost; // { wood: 3, stone: 2, clay: 3 }

function extendedZone(g, capacity = 4) {
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 1,
    z: 1,
    capacity,
  });
  const result = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zone.id,
    habitatId: habitat.id,
  });
  assert.equal(result.ok, true, result.message);
  return zone;
}

function fund(g) {
  g.add("wood", 10);
  g.add("stone", 10);
  g.add("clay", 10);
}

test("convertZoneToLivingSpace: refuses an unknown zone id, never mutating anything", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const before = JSON.stringify(g.s.campaignStations);
  const beforeMemory = JSON.stringify(g.s.campaignMemory);
  const beforeInventory = JSON.stringify(g.s.inventory);

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: "z999", x: 5, z: 5 });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
  assert.equal(JSON.stringify(g.s.campaignMemory), beforeMemory);
  assert.equal(JSON.stringify(g.s.inventory), beforeInventory);
});

test("convertZoneToLivingSpace: refuses an id that resolves to something other than a zone", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const before = JSON.stringify(g.s.campaignStations);

  const result = g.command({
    type: "convertZoneToLivingSpace",
    zoneId: panier.id,
    x: 5,
    z: 5,
  });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("convertZoneToLivingSpace: refuses a zone that was never extended commercially", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const before = JSON.stringify(g.s.campaignStations);
  const beforeMemory = JSON.stringify(g.s.campaignMemory);
  const beforeInventory = JSON.stringify(g.s.inventory);

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, x: 5, z: 5 });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
  assert.equal(JSON.stringify(g.s.campaignMemory), beforeMemory);
  assert.equal(JSON.stringify(g.s.inventory), beforeInventory);
});

test("convertZoneToLivingSpace: refuses a non-finite or out-of-bounds position, never mutating anything", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const zone = extendedZone(g);
  const before = JSON.stringify(g.s.campaignStations);
  const beforeMemory = JSON.stringify(g.s.campaignMemory);
  const beforeInventory = JSON.stringify(g.s.inventory);

  for (const bad of [
    { x: NaN, z: 0 },
    { x: 0, z: Infinity },
    { x: 999, z: 0 },
    { x: "3", z: 3 },
  ]) {
    const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, ...bad });
    assert.equal(result.ok, false);
  }
  assert.equal(JSON.stringify(g.s.campaignStations), before);
  assert.equal(JSON.stringify(g.s.campaignMemory), beforeMemory);
  assert.equal(JSON.stringify(g.s.inventory), beforeInventory);
});

test("convertZoneToLivingSpace: refuses insufficient materials, mutating nothing including extensionCommerciale", () => {
  const g = new GardenState(null, 1000); // fresh inventory: wood 2, clay 2, stone 0 — always short of COST
  const zone = extendedZone(g);
  const before = JSON.stringify(g.s.campaignStations);
  const beforeMemory = JSON.stringify(g.s.campaignMemory);
  const beforeInventory = JSON.stringify(g.s.inventory);

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, x: 5, z: 5 });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
  assert.equal(JSON.stringify(g.s.campaignMemory), beforeMemory);
  assert.equal(JSON.stringify(g.s.inventory), beforeInventory);
});

test("convertZoneToLivingSpace: success debits exactly the fixed cost", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const zone = extendedZone(g);
  const before = { ...g.s.inventory };

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, x: 5, z: 5 });
  assert.equal(result.ok, true, result.message);
  for (const [item, qty] of Object.entries(COST))
    assert.equal(g.s.inventory[item], before[item] - qty);
});

test("convertZoneToLivingSpace: success returns extensionCommerciale to false", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const zone = extendedZone(g);

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, x: 5, z: 5 });
  assert.equal(result.ok, true, result.message);
  assert.equal(
    g.s.campaignStations.zones.find((z) => z.id === zone.id).extensionCommerciale,
    false,
  );
});

test("convertZoneToLivingSpace: success registers a new habitat of exactly the removed capacity", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const zone = extendedZone(g, 7);
  assert.equal(g.s.campaignStations.habitats.length, 0);

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, x: 9, z: -3 });
  assert.equal(result.ok, true, result.message);
  assert.equal(g.s.campaignStations.habitats.length, 1);
  const habitat = g.s.campaignStations.habitats[0];
  assert.equal(habitat.capacity, 7);
  assert.equal(habitat.x, 9);
  assert.equal(habitat.z, -3);
});

test("convertZoneToLivingSpace: success marks the original transformation entry as returned, without deleting it", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const zone = extendedZone(g);
  assert.equal(g.s.campaignMemory.habitatTransformations.length, 1);
  assert.equal(g.s.campaignMemory.habitatTransformations[0].returnedDay, undefined);

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, x: 5, z: 5 });
  assert.equal(result.ok, true, result.message);
  assert.equal(g.s.campaignMemory.habitatTransformations.length, 1);
  assert.equal(
    g.s.campaignMemory.habitatTransformations[0].returnedDay,
    g.s.campaignDay,
  );
});

test("convertZoneToLivingSpace: round-trips through JSON and re-validates", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const zone = extendedZone(g, 5);

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, x: 2, z: 2 });
  assert.equal(result.ok, true, result.message);

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.equal(
    reloaded.campaignStations.zones.find((z) => z.id === zone.id).extensionCommerciale,
    false,
  );
  assert.equal(reloaded.campaignStations.habitats.length, 1);
  assert.equal(reloaded.campaignStations.habitats[0].capacity, 5);
  assert.equal(
    reloaded.campaignMemory.habitatTransformations[0].returnedDay,
    g.s.campaignDay,
  );
});
