const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Rainelles = require("../public/game/rainelles.js");

// Epic C3.3 (design §6, "le nombre de postes de travail ouvrables dépend des habitats
// aménagés... chaque naissance exige une place de vie libre ; le refuge ne permet pas de
// contourner ce nombre de postes... un habitat fournit plusieurs places de vie ; son style
// n'influe pas sur les capacités... un habitat occupé ne peut pas être supprimé sans destination
// de relogement") : campaign-stations.js's registry gains a fourth collection, `habitats`, plus
// two pure functions — freeLivingPlaces (population math) and removeHabitat (explicit refusal
// when a removal would break the promise). Neither is wired to a real creation/removal command
// yet: C3.4 is the epic that will actually create a Rainelle through this gate; no world UI
// exists to place or remove a habitat at all today (same gap left open for bornes/zones/paniers
// since C2.6a). See campaign-stations.js's own header/inline comments for the reasoning.

test("a fresh campaign save declares an empty habitats collection", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.campaignStations.habitats, []);
  assert.equal(g.s.campaignStations.habitatNextId, 1);
});

test("registerStation creates a habitat with the given capacity and an h-prefixed id", () => {
  const g = new GardenState(null, 1000);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 1,
    z: 2,
    capacity: 3,
  });
  assert.deepEqual(habitat, { id: "h1", x: 1, z: 2, capacity: 3 });
  assert.deepEqual(g.s.campaignStations.habitats, [habitat]);
  const second = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 4,
    z: 5,
    capacity: 2,
  });
  assert.equal(second.id, "h2");
});

test("registerStation refuses a habitat capacity below the design's 'plusieurs' floor", () => {
  const g = new GardenState(null, 1000);
  assert.throws(() =>
    Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 1 }),
  );
  assert.throws(() =>
    Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 0 }),
  );
  assert.throws(() =>
    Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0 }),
  );
  assert.equal(g.s.campaignStations.habitats.length, 0, "no partial entry on refusal");
  assert.equal(Stations.MIN_HABITAT_CAPACITY, 2);
});

test("resolveStation finds a registered habitat, same as any other station kind", () => {
  const g = new GardenState(null, 1000);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  assert.deepEqual(Stations.resolveStation(g.s.campaignStations, habitat.id), {
    ok: true,
    kind: "habitat",
    station: habitat,
  });
});

test("habitatCapacityTotal sums every registered habitat's capacity", () => {
  const g = new GardenState(null, 1000);
  assert.equal(Stations.habitatCapacityTotal(g.s.campaignStations), 0);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 3 });
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 1, z: 1, capacity: 2 });
  assert.equal(Stations.habitatCapacityTotal(g.s.campaignStations), 5);
});

test("freeLivingPlaces is the total habitat capacity minus the current living population", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 3 });
  assert.equal(Stations.freeLivingPlaces(g.s.campaignStations, 0), 3);
  assert.equal(Stations.freeLivingPlaces(g.s.campaignStations, 3), 0);
  // Zero is a meaningful "no room left", not "no habitats declared" — a caller must compare
  // with > 0, never with plain truthiness (see campaign-stations.js's own comment).
  assert.equal(Stations.freeLivingPlaces(g.s.campaignStations, 3) > 0, false);
});

test("no Rainelle can be created without a free habitat place (verified directly, not yet gated by a real command)", () => {
  // No creation command reads freeLivingPlaces yet (C3.4 will wire the real path) — this proves
  // the gate itself is correct, exactly as the epic's own criterion asks for.
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  const canCreate = (aliveCount) =>
    Stations.freeLivingPlaces(g.s.campaignStations, aliveCount) > 0;
  assert.equal(canCreate(0), true);
  assert.equal(canCreate(1), true);
  assert.equal(canCreate(2), false, "at capacity: no free place left");
  assert.equal(canCreate(3), false, "already over capacity: still refused");

  // The existing createRainelle factory (C2.3) is itself agnostic to habitats — this epic never
  // touches it (C3.4's own job) — but confirms the raw population count it produces is exactly
  // what freeLivingPlaces expects as its second argument.
  Rainelles.createRainelle(g.s, { cultivarId: null, name: "Une" });
  assert.equal(canCreate(g.s.rainelles.length), true);
});

test("removeHabitat refuses when the removal would drop total capacity below the current population", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 1, z: 1, capacity: 2 });
  // Total capacity 4; population 3 — removing the 2-place habitat `a` would leave only 2 places,
  // below the 3 already living there.
  const refused = Stations.removeHabitat(g.s.campaignStations, a.id, 3);
  assert.equal(refused.ok, false);
  assert.equal(typeof refused.error, "string");
  assert.equal(g.s.campaignStations.habitats.length, 2, "refusal never mutates the registry");
});

test("removeHabitat succeeds when enough capacity remains, and returns a registry without it", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  const b = Stations.registerStation(g.s.campaignStations, "habitat", { x: 1, z: 1, capacity: 3 });
  const result = Stations.removeHabitat(g.s.campaignStations, a.id, 3);
  assert.equal(result.ok, true);
  assert.deepEqual(result.registry.habitats, [b]);
  // Pure: the original registry is untouched.
  assert.equal(g.s.campaignStations.habitats.length, 2);
});

test("removeHabitat fails explicitly on an unknown id — never a silent no-op", () => {
  const g = new GardenState(null, 1000);
  const r = Stations.removeHabitat(g.s.campaignStations, "h999", 0);
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("h999"));
});

test("an existing save without a habitats collection migrates to an empty one without error", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const saved = g.serialize();
  delete saved.campaignStations.habitats;
  delete saved.campaignStations.habitatNextId;
  const migrated = validate(saved);
  assert.deepEqual(migrated.campaignStations.habitats, []);
  assert.equal(migrated.campaignStations.habitatNextId, 1);
  // Nothing else in the registry is disturbed by this migration.
  assert.equal(migrated.campaignStations.bornes.length, 1);
});

test("validate rejects a habitat with a capacity below the design's 'plusieurs' floor, or non-finite", () => {
  const base = () => new GardenState(null, 1000).serialize();

  const tooLow = base();
  tooLow.campaignStations.habitats.push({ id: "h1", x: 0, z: 0, capacity: 1 });
  tooLow.campaignStations.habitatNextId = 2;
  assert.throws(() => validate(tooLow), /Registre de stations invalide/);

  const nonFinite = base();
  nonFinite.campaignStations.habitats.push({ id: "h1", x: 0, z: 0, capacity: NaN });
  nonFinite.campaignStations.habitatNextId = 2;
  assert.throws(() => validate(nonFinite), /Registre de stations invalide/);

  const valid = base();
  valid.campaignStations.habitats.push({ id: "h1", x: 0, z: 0, capacity: 2 });
  valid.campaignStations.habitatNextId = 2;
  assert.doesNotThrow(() => validate(valid));
});

test("a real round trip through JSON keeps a populated habitats collection strictly identical", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 1.5, z: -2, capacity: 4 });
  const roundTripped = JSON.parse(JSON.stringify(g.s.campaignStations));
  assert.deepEqual(roundTripped, g.s.campaignStations);
});
