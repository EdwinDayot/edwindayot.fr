const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Rainelles = require("../public/game/rainelles.js");
const RainellesStatus = require("../public/game/rainelles-status.js");
const Movement = require("../public/game/rainelle-movement.js");
const Passage = require("../public/game/campaign-passage.js");

// Epic C6.15 (design §10, chapitre 17, sixième temps : "une Rainelle rejoint la mare et n'en
// revient pas"). Only the mechanism itself — a Rainelle already libérée (geste null) settles for
// good at Passage.PASSAGE_POSITION the first time both she and the passage (C6.10/C6.13) are
// ready, whichever event completes the condition second (restorePassage or releaseGesture) — no
// rendering, no narrative text (see the epic's own backlog entry for both limits, reconduced).

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands. Same fixture
// already used throughout the campaign test suite (campaign-rainelle-movement.cjs and others).
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

// Same "advance real time, observe the public field" style already used by
// campaign-rainelle-position.cjs's own stepUntil.
function stepUntil(g, max, done) {
  for (let i = 0; i < max && !done(); i++) g.step(1);
}

test("selectRainelleToSettle: null while the passage stays blocked, even with an already-released Rainelle", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g); // geste already null (never taught) — passage untouched, still blocked by default
  assert.equal(g.s.campaignPassage.blocked, true);
  assert.equal(Movement.selectRainelleToSettle(g.s), null);
});

test("selectRainelleToSettle: null once the passage is open if no Rainelle has geste === null", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignPassage.blocked, false);
  assert.equal(rainelle.settledAt, false, "the only Rainelle still has a real gesture, not eligible");
});

test("restorePassage settles a Rainelle already released beforehand, exactly once", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g); // geste already null, never taught — already eligible
  assert.equal(rainelle.settledAt, false);

  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.equal(rainelle.settledAt, true);
});

test("releaseGesture settles a Rainelle, with the passage already restored beforehand", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });

  const openResult = g.command({ type: "restorePassage" });
  assert.equal(openResult.ok, true, openResult.error);
  assert.equal(rainelle.settledAt, false, "she still has a real gesture, not yet eligible");

  const releaseResult = g.command({ type: "releaseGesture", rainelleId: rainelle.id });
  assert.equal(releaseResult.ok, true, releaseResult.error);
  assert.equal(rainelle.settledAt, true);
});

test("only one Rainelle settles even when several are eligible at the same instant — first by array order", () => {
  const g = new GardenState(null, 1000);
  const first = bornRainelle(g); // "r1", geste already null
  const second = Rainelles.createRainelle(g.s, { cultivarId: first.cultivarId, name: "Deuxième" }); // "r2", geste already null too

  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.equal(first.settledAt, true, "s.rainelles[0] wins the tie, same array-order priority as selectSceneRainelle");
  assert.equal(second.settledAt, false);
});

test("a second Rainelle released after the first has settled never settles in turn", () => {
  const g = new GardenState(null, 1000);
  const first = bornRainelle(g);
  const second = Rainelles.createRainelle(g.s, { cultivarId: first.cultivarId, name: "Deuxième" });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  second.geste = { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x", condition: "" };

  const openResult = g.command({ type: "restorePassage" });
  assert.equal(openResult.ok, true, openResult.error);
  assert.equal(first.settledAt, true, "the only eligible Rainelle at that instant (first has no gesture)");
  assert.equal(second.settledAt, false);

  const releaseResult = g.command({ type: "releaseGesture", rainelleId: second.id });
  assert.equal(releaseResult.ok, true, releaseResult.error);
  assert.equal(second.settledAt, false, "a Rainelle already settled blocks any further settling, forever");
});

test("releaseGesture: a refusal (unknown id / no gesture to release) never settles anyone, never mutates anything beyond what it already refused", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  g.command({ type: "restorePassage" });
  assert.equal(rainelle.settledAt, true, "sanity: she is already settled from the passage opening alone");

  const before = JSON.stringify(g.s.rainelles);
  const result = g.command({ type: "releaseGesture", rainelleId: "r999" });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.rainelles), before);
});

test("removeHabitat never completes the settling condition — it never touches geste", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.command({ type: "restorePassage" });
  assert.equal(rainelle.settledAt, false, "she still has a real gesture");

  // Two habitats so removing one still leaves enough capacity for the one living Rainelle
  // (removeHabitat itself refuses a removal that would drop total capacity below the population,
  // C3.3/C6.10 — orthogonal to this test's own point, worked around exactly like
  // campaign-chapter17.cjs's own removeHabitat tests do).
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 5, z: 5, capacity: 2 });
  const result = g.command({ type: "removeHabitat", habitatId: habitat.id });
  assert.equal(result.ok, true, result.error);
  assert.equal(rainelle.settledAt, false, "removeHabitat never sets geste to null, so it can never trigger a settle");
});

test("a Rainelle born (bourgeon resolution) while the passage is already open settles at that same sleep, without waiting for a third command", () => {
  // Found by /code-review before this epic's own commit: neither restorePassage nor
  // releaseGesture is ever called again by a birth, so a newborn (geste null from creation) could
  // otherwise satisfy the settling condition without anything left to notice her — fixed in
  // garden-state-cmd-f.js's own "sleep" handler, right after both birth loops.
  const g = new GardenState(null, 1000);
  const first = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, first.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });

  const openResult = g.command({ type: "restorePassage" });
  assert.equal(openResult.ok, true, openResult.error);
  assert.equal(first.settledAt, false, "she still has a real gesture, not eligible");

  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 5 });
  assert.equal(g.command({ type: "formBud", id: first.id }).ok, true);
  assert.equal(g.command({ type: "harvestBud", id: first.id }).ok, true);
  assert.equal(g.s.rainelles.length, 1, "the bourgeon has not resolved into a Rainelle yet");

  const sleepResult = g.command({ type: "sleep" });
  assert.equal(sleepResult.ok, true, sleepResult.error);
  assert.equal(g.s.rainelles.length, 2, "the bourgeon resolved into a second Rainelle this sleep");
  const second = g.s.rainelles[1];
  assert.equal(second.geste, null, "born without a taught gesture, design §5");
  assert.equal(second.settledAt, true, "already eligible at birth (passage open, no one settled yet)");
  assert.equal(first.settledAt, false, "the first Rainelle still has a real gesture");
});

test("targetPosition: a settled Rainelle always targets the passage, whatever location is passed", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 1, z: 1, capacity: 2 });
  rainelle.settledAt = true;
  rainelle.x = 10;
  rainelle.z = 10;
  const { LOCATIONS } = require("../public/game/campaign-scenes.js");
  for (const location of [LOCATIONS.POSTE, LOCATIONS.REPOS, LOCATIONS.HABITAT]) {
    assert.deepEqual(Movement.targetPosition(g.s, rainelle, location), Passage.PASSAGE_POSITION);
  }
});

test("a settled Rainelle actually routes, tick after tick, to the passage and stays there — even if a gesture is retaught afterward", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  g.step(1); // real starting position (fallback, no habitat registered)
  assert.notDeepEqual({ x: rainelle.x, z: rainelle.z }, Passage.PASSAGE_POSITION);

  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.equal(rainelle.settledAt, true);

  stepUntil(g, 150, () => rainelle.x === Passage.PASSAGE_POSITION.x && rainelle.z === Passage.PASSAGE_POSITION.z);
  assert.deepEqual({ x: rainelle.x, z: rainelle.z }, Passage.PASSAGE_POSITION, "arrived within a generous real-tick budget");

  const settledX = rainelle.x,
    settledZ = rainelle.z;
  g.step(10);
  assert.equal(rainelle.x, settledX, "stays put once arrived, real ticks later");
  assert.equal(rainelle.z, settledZ);

  // Limite honnête reconduite (voir l'entrée C6.15 du backlog) : teachGesture ne connaît pas
  // settledAt et resterait techniquement utilisable — vérifié ici plutôt que deviné : la
  // destination ignore quand même le geste retransmis, tant que settledAt reste vrai.
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.step(5);
  assert.equal(rainelle.x, settledX, "a retaught gesture never moves a settled Rainelle away");
  assert.equal(rainelle.z, settledZ);
});

test("non-régression : RainellesStatus.status / le mouvement d'une Rainelle non installée restent inchangés", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 6, z: 6 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(RainellesStatus.status(rainelle, g.s).kind, "au-travail");
  assert.equal(rainelle.settledAt, false);

  stepUntil(g, 60, () => rainelle.x === zone.x && rainelle.z === zone.z);
  assert.deepEqual({ x: rainelle.x, z: rainelle.z }, { x: zone.x, z: zone.z }, "unaffected by this epic when never settled");
});

test("aucune mutation d'aucun champ au-delà de settledAt sur un refus de restorePassage", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  g.command({ type: "restorePassage" });
  assert.equal(rainelle.settledAt, true);
  const before = JSON.stringify(g.s.rainelles);

  const result = g.command({ type: "restorePassage" }); // already open — refused
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.rainelles), before, "a refused restore never touches settledAt or anything else");
});

test("aller-retour JSON de settledAt", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  g.command({ type: "restorePassage" });
  assert.equal(rainelle.settledAt, true);

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.equal(reloaded.rainelles[0].settledAt, true);
});

test("migration : une sauvegarde antérieure sans settledAt migre à false pour chaque Rainelle", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const raw = JSON.parse(JSON.stringify(g.s));
  delete raw.rainelles[0].settledAt;

  const migrated = validate(raw);
  assert.equal(migrated.rainelles[0].settledAt, false);
});

test("validate : refuse une sauvegarde avec deux Rainelles settledAt à la fois", () => {
  const g = new GardenState(null, 1000);
  const first = bornRainelle(g);
  const second = Rainelles.createRainelle(g.s, { cultivarId: first.cultivarId, name: "Deuxième" });
  first.settledAt = true;
  second.settledAt = true;

  assert.throws(() => validate(JSON.parse(JSON.stringify(g.s))));
});

test("validate : refuse un settledAt qui n'est pas un booléen", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const raw = JSON.parse(JSON.stringify(g.s));
  raw.rainelles[0].settledAt = "oui";

  assert.throws(() => validate(raw));
});
