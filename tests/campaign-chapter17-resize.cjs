const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");

// Epic C6.11 (design §10, chapitre 17 "Rendre le passage" : "redimensionner les bacs") :
// resizePanier sets a panier's capacity/min, both previously fixed forever at
// Stations.DEFAULT_PANIER_CAPACITY/MIN since C2.8, with no command ever touching them.

// A panier's buffer key is a cultivarId, never a free item string (garden-state-validate.js) —
// only the scripted frog encounter (C2.3) can create a Rainelle and its own cultivar through
// commands, same fixture already used by tests/campaign-automation.cjs/-chapter17.cjs.
function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

test("resizePanier: refuses an unknown panier id, never mutating the registry", () => {
  const g = new GardenState(null, 1000);
  const before = JSON.stringify(g.s.campaignStations);

  const result = g.command({ type: "resizePanier", panierId: "pn999", capacity: 10, min: 0 });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("resizePanier: refuses an id that resolves to something other than a panier", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const before = JSON.stringify(g.s.campaignStations);

  const result = g.command({ type: "resizePanier", panierId: zone.id, capacity: 10, min: 0 });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("resizePanier: refuses a capacity below what the panier already holds", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer = { [cultivarId]: 8 };
  const before = JSON.stringify(g.s.campaignStations);

  const result = g.command({ type: "resizePanier", panierId: panier.id, capacity: 7, min: 0 });
  assert.equal(result.ok, false, "8 units held, capacity 7 would drop stored resource");
  assert.equal(JSON.stringify(g.s.campaignStations), before, "refusal never mutates");
});

test("resizePanier: refuses min greater than capacity", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const before = JSON.stringify(g.s.campaignStations);

  const result = g.command({ type: "resizePanier", panierId: panier.id, capacity: 5, min: 6 });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("resizePanier: refuses a non-integer, non-finite or negative capacity/min", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });

  for (const bad of [0, -1, 1.5, NaN, Infinity, "10"]) {
    assert.equal(
      g.command({ type: "resizePanier", panierId: panier.id, capacity: bad, min: 0 }).ok,
      false,
      `capacity ${bad} should be refused`,
    );
  }
  for (const bad of [-1, 1.5, NaN, Infinity, "0"]) {
    assert.equal(
      g.command({ type: "resizePanier", panierId: panier.id, capacity: 10, min: bad }).ok,
      false,
      `min ${bad} should be refused`,
    );
  }
});

test("resizePanier: succeeds, updates capacity/min exactly, touches neither buffer nor other paniers", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer = { [cultivarId]: 4 };
  const other = Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  other.buffer = { [cultivarId]: 2 };
  const otherBefore = JSON.stringify(other);

  assert.equal(panier.capacity, Stations.DEFAULT_PANIER_CAPACITY);
  const result = g.command({ type: "resizePanier", panierId: panier.id, capacity: 40, min: 4 });
  assert.equal(result.ok, true, result.error);
  assert.equal(panier.capacity, 40);
  assert.equal(panier.min, 4);
  assert.deepEqual(panier.buffer, { [cultivarId]: 4 }, "buffer untouched");
  assert.equal(JSON.stringify(other), otherBefore, "other panier untouched");
});

test("resizePanier: a real JSON round-trip keeps the resized panier strictly identical", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer = { [cultivarId]: 4 };

  const result = g.command({ type: "resizePanier", panierId: panier.id, capacity: 30, min: 2 });
  assert.equal(result.ok, true, result.error);

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  const reloadedPanier = reloaded.campaignStations.paniers.find((p) => p.id === panier.id);
  assert.equal(reloadedPanier.capacity, 30);
  assert.equal(reloadedPanier.min, 2);
  assert.deepEqual(reloadedPanier.buffer, { [cultivarId]: 4 });
});
