const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Rainelles = require("../public/game/rainelles.js");
const Narrative = require("../public/game/data-narrative.js");

// Epic C6.16 (design §10, chapitre 17 "Rendre le passage" ; §11, scène de référence "Rendre le
// passage"). Covers only the narrative reveal itself — "passage-rainelle-installee", trigger
// "passageRainelleSettled" — wired at the three real sites that apply rainelle.settledAt = true
// (garden-state-cmd-w.js's restorePassage, garden-state-cmd-u.js's releaseGesture,
// garden-state-cmd-f.js's bloc sleep), already exhaustively covered mechanically by
// tests/campaign-passage-settle.cjs (C6.15). Same fixtures as that file.

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

const SETTLED_FLAG = "passage-rainelle-installee";

function settledFlags(g) {
  return g.s.campaignFlags.filter((f) => f === SETTLED_FLAG);
}

test("no reveal while the passage stays blocked, even with a Rainelle already released", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g); // geste already null (never taught) — passage untouched, still blocked
  assert.equal(g.s.campaignPassage.blocked, true);
  assert.deepEqual(settledFlags(g), []);
});

test("no reveal once the passage is open if no Rainelle has geste === null", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(settledFlags(g), []);
});

test("restorePassage reveals passage-rainelle-installee exactly once, with a Rainelle already released beforehand", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g); // geste already null, already eligible
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.equal(rainelle.settledAt, true);
  assert.deepEqual(settledFlags(g), [SETTLED_FLAG]);
});

test("releaseGesture reveals passage-rainelle-installee exactly once, with the passage already restored beforehand", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });

  const openResult = g.command({ type: "restorePassage" });
  assert.equal(openResult.ok, true, openResult.error);
  assert.deepEqual(settledFlags(g), [], "she still has a real gesture, not yet eligible");

  const releaseResult = g.command({ type: "releaseGesture", rainelleId: rainelle.id });
  assert.equal(releaseResult.ok, true, releaseResult.error);
  assert.equal(rainelle.settledAt, true);
  assert.deepEqual(settledFlags(g), [SETTLED_FLAG]);
});

test("sleep (bourgeon resolution) reveals passage-rainelle-installee exactly once, when the newborn settles at birth", () => {
  const g = new GardenState(null, 1000);
  const first = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, first.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });

  const openResult = g.command({ type: "restorePassage" });
  assert.equal(openResult.ok, true, openResult.error);
  assert.deepEqual(settledFlags(g), [], "the only Rainelle still has a real gesture, not eligible");

  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 5 });
  assert.equal(g.command({ type: "formBud", id: first.id }).ok, true);
  assert.equal(g.command({ type: "harvestBud", id: first.id }).ok, true);

  const sleepResult = g.command({ type: "sleep" });
  assert.equal(sleepResult.ok, true, sleepResult.error);
  const second = g.s.rainelles[1];
  assert.equal(second.settledAt, true, "already eligible at birth (passage open, no one settled yet)");
  assert.deepEqual(settledFlags(g), [SETTLED_FLAG]);
});

test("no second reveal once a Rainelle is already settled — a second release never re-triggers it", () => {
  const g = new GardenState(null, 1000);
  const first = bornRainelle(g);
  const second = Rainelles.createRainelle(g.s, { cultivarId: first.cultivarId, name: "Deuxième" });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  second.geste = { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x", condition: "" };

  const openResult = g.command({ type: "restorePassage" });
  assert.equal(openResult.ok, true, openResult.error);
  assert.equal(first.settledAt, true);
  assert.deepEqual(settledFlags(g), [SETTLED_FLAG]);

  const releaseResult = g.command({ type: "releaseGesture", rainelleId: second.id });
  assert.equal(releaseResult.ok, true, releaseResult.error);
  assert.equal(second.settledAt, false, "a Rainelle already settled blocks any further settling, forever");
  assert.deepEqual(
    settledFlags(g),
    [SETTLED_FLAG],
    "still exactly one occurrence — no second reveal from a command that settles no one",
  );
});

test("removeHabitat never reveals passage-rainelle-installee — it never touches geste, never completes the condition", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.command({ type: "restorePassage" });
  assert.deepEqual(settledFlags(g), []);

  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 5, z: 5, capacity: 2 });
  const result = g.command({ type: "removeHabitat", habitatId: habitat.id });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(settledFlags(g), []);
});

test("the text contains no obligation formulation and no accusation, and names no motivation the Rainelle does not have", () => {
  const entry = Narrative.TEXTS[SETTLED_FLAG];
  assert.ok(entry, `TEXTS must carry an entry for "${SETTLED_FLAG}"`);
  assert.equal(entry.trigger, "passageRainelleSettled");
  const lower = entry.text.toLowerCase();
  for (const obligationWord of ["doit ", "dois ", "obligatoire", "obligé", "il faut"]) {
    assert.equal(
      lower.includes(obligationWord),
      false,
      `must not contain an obligation formulation ("${obligationWord}")`,
    );
  }
  // Design §11: "le résultat de la réparation n'appartient pas entièrement au joueur" — the text
  // must not claim the game explains why she settled (no invented motivation).
  assert.equal(lower.includes("parce qu"), false, "must not fabricate a motivation");
});

test("non-regression: the reveal never fires from a command reached before either upstream fact is real", () => {
  const g = new GardenState(null, 1000);
  // Neither the passage nor any Rainelle exist yet at all.
  assert.deepEqual(settledFlags(g), []);
  const refusal = g.command({ type: "releaseGesture", rainelleId: "r999" });
  assert.equal(refusal.ok, false);
  assert.deepEqual(settledFlags(g), []);
});

test("a JSON round-trip after the reveal keeps the exact flag and settledAt", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  g.command({ type: "restorePassage" });
  assert.deepEqual(settledFlags(g), [SETTLED_FLAG]);

  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(settledFlags(reloaded), [SETTLED_FLAG]);
  assert.equal(
    reloaded.s.rainelles.find((r) => r.id === rainelle.id).settledAt,
    true,
  );
});
