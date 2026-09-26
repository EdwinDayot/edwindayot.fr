const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const House = require("../public/game/campaign-house.js");
const Cultivars = require("../public/game/cultivars.js");
const Rainelles = require("../public/game/rainelles.js");

// Epic C6.27 (design §11, reparation of the third intensification lever, "réparation avec coût
// réel... jamais une annulation gratuite") : convertZoneToLivingSpace pays a real cost, restores
// a zone's extensionCommerciale flag to false, registers a brand-new habitat of exactly the
// capacity the original extendZoneOverHabitat (C6.26) took, and marks — never deletes — the
// transformation entry that recorded the original taking. See garden-state-cmd-y.js's own header
// comment for why the cost is a fixed catalog lookup (campaign-house.js's SPACES.cuisine.cost)
// rather than a value trusted from the caller.

// Epic C6.28 (design §11, tableau des trois leviers, troisième ligne "extension standardisée sur
// un espace vivant" ; accueil narratif de sa réparation, sur le même modèle que C6.9). Reaches
// "archives-restaurees" (C6.7) through the same real quest/sleep/command chain already proven by
// tests/campaign-chapter15.cjs and tests/campaign-chapter16.cjs, duplicated here rather than
// imported (neither file exports it — each test file in this suite stays self-contained, same
// pattern already followed by campaign-chapter15.cjs/campaign-chapter16.cjs themselves).
function reachChapter12Flag(g) {
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  g.command({ type: "quest", action: "accept", questId: "occasion-de-basile" });
  g.s.inventory["cutting:pilea"] = 1;
  const r = g.command({
    type: "quest",
    action: "complete",
    questId: "occasion-de-basile",
  });
  assert.equal(r.ok, true, r.error);
  g.command({ type: "sleep" });
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-1"));
}

function firstRainelle(g) {
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  return g.s.rainelles[0];
}

function reachSecondJeanneNote(g) {
  g.command({ type: "sowPot", a: "menthe-de-velours", b: "aster-des-vents" });
  g.command({ type: "sleep" });
  const cultivar = g.s.cultivars[g.s.cultivars.length - 1];
  g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 1,
    pricePerUnit: 10,
  });
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  const contractId = g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-2"));
}

function reachPremierNonFlag(g, r) {
  assert.equal(g.command({ type: "formBud", id: r.id }).ok, true);
  const attempt = g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.message, Rainelles.MULTIPLY_REFUSAL);
}

function reachArchivesRestaurees(g) {
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  reachSecondJeanneNote(g);
  reachPremierNonFlag(g, r);
  g.command({ type: "sleep" });
  assert.ok(g.s.campaignFlags.includes("alma-retour"));
  const result = g.command({ type: "restoreArchiveLabels" });
  assert.equal(result.ok, true, result.error);
  assert.ok(g.s.campaignFlags.includes("archives-restaurees"));
  return r;
}

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

// --- Epic C6.28: narrative accueil of the reparation ------------------------------------------

const Narrative = require("../public/game/data-narrative.js");

// reachArchivesRestaurees leaves one real Rainelle alive (firstRainelle). Stations.removeHabitat
// (called by extendZoneOverHabitat, inside extendedZone) refuses to remove the only habitat in
// the registry whenever it would leave less total capacity than the alive Rainelle count — exactly
// the "prévoir une destination de relogement d'abord" refusal this suite otherwise tests on
// purpose. A spare habitat, generous enough to house every Rainelle this file ever creates,
// registered once before any extendedZone() call, keeps that unrelated refusal out of these
// narrative-gate tests.
function spareHabitat(g) {
  Stations.registerStation(g.s.campaignStations, "habitat", { x: -20, z: -20, capacity: 10 });
}

test("convertZoneToLivingSpace: never reveals levier-extension-rendue before archives-restaurees, even on real success", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  const zone = extendedZone(g);
  assert.equal(g.s.campaignFlags.includes("archives-restaurees"), false);

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, x: 5, z: 5 });
  assert.equal(result.ok, true, result.message);
  assert.equal(g.s.campaignFlags.includes("levier-extension-rendue"), false);
});

test("convertZoneToLivingSpace: refused calls after archives-restaurees never reveal levier-extension-rendue", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  reachArchivesRestaurees(g);
  spareHabitat(g);
  const neverExtended = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 10,
    z: 10,
  });
  const flagsBefore = [...g.s.campaignFlags];

  assert.equal(
    g.command({ type: "convertZoneToLivingSpace", zoneId: "z999", x: 5, z: 5 }).ok,
    false,
  );
  assert.equal(
    g.command({
      type: "convertZoneToLivingSpace",
      zoneId: neverExtended.id,
      x: 5,
      z: 5,
    }).ok,
    false,
  );
  const extended = extendedZone(g);
  assert.equal(
    g.command({ type: "convertZoneToLivingSpace", zoneId: extended.id, x: NaN, z: 0 }).ok,
    false,
  );
  assert.deepEqual(g.s.campaignFlags, flagsBefore);
  assert.equal(g.s.campaignFlags.includes("levier-extension-rendue"), false);
});

test("convertZoneToLivingSpace: refused for insufficient materials after archives-restaurees never reveals", () => {
  const g = new GardenState(null, 1000); // fresh inventory: wood 2, clay 2, stone 0 — always short of COST
  reachArchivesRestaurees(g);
  spareHabitat(g);
  const zone = extendedZone(g);
  const flagsBefore = [...g.s.campaignFlags];

  const result = g.command({ type: "convertZoneToLivingSpace", zoneId: zone.id, x: 5, z: 5 });
  assert.equal(result.ok, false);
  assert.deepEqual(g.s.campaignFlags, flagsBefore);
});

test("convertZoneToLivingSpace: a real success after archives-restaurees reveals levier-extension-rendue exactly once, even across a second extension+conversion on a different zone", () => {
  const g = new GardenState(null, 1000);
  fund(g);
  reachArchivesRestaurees(g);
  spareHabitat(g);
  const zone1 = extendedZone(g);

  const first = g.command({
    type: "convertZoneToLivingSpace",
    zoneId: zone1.id,
    x: 1,
    z: 1,
  });
  assert.equal(first.ok, true, first.message);
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "levier-extension-rendue").length,
    1,
  );

  const zone2 = extendedZone(g, 3);
  const second = g.command({
    type: "convertZoneToLivingSpace",
    zoneId: zone2.id,
    x: 2,
    z: 2,
  });
  assert.equal(second.ok, true, second.message);
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "levier-extension-rendue").length,
    1,
  );

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.ok(reloaded.campaignFlags.includes("levier-extension-rendue"));
});

test("levier-extension-rendue text contains no obligation formulation and no accusation, and describes only a real cost accepted", () => {
  const entry = Narrative.TEXTS["levier-extension-rendue"];
  assert.ok(entry);
  const lower = entry.text.toLowerCase();
  for (const obligationWord of [
    "doit ",
    "dois ",
    "obligatoire",
    "obligé",
    "il faut",
  ]) {
    assert.equal(
      lower.includes(obligationWord),
      false,
      `"levier-extension-rendue" must not contain an obligation formulation ("${obligationWord}")`,
    );
  }
});
