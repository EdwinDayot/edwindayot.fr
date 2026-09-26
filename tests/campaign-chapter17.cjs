const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

// Epic C6.10 (design §10, chapitre 17 "Rendre le passage") : two commands on mechanisms already
// posed but never reachable — removeHabitat (Stations.removeHabitat, C3.3) and releaseGesture
// ("laisser certaines Rainelles quitter le travail", a plain wrapper resetting a Rainelle's
// geste/job to the same null pair createRainelle already gives before any teaching).

const CYCLE = CampaignAutomation.CYCLE_SECONDS;

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands — same fixture
// already used by tests/campaign-automation.cjs/-teaching.cjs/-gestures.cjs.
function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

test("removeHabitat: refuses an unknown id, never mutating the registry", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  const before = JSON.stringify(g.s.campaignStations);

  const result = g.command({ type: "removeHabitat", habitatId: "h999" });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("removeHabitat: refuses a removal that would drop capacity below the living population", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 1, z: 1, capacity: 2 });
  // Only the scripted encounter can ever produce the *first* Rainelle through a command (C2.3) —
  // the second and third here use the raw factory directly, same precedent as
  // campaign-habitats.cjs's own population tests, purely to reach a population of 3 (total
  // capacity 4; removing habitat `a`'s 2 places would leave only 2, below 3) without inventing a
  // second encounter.
  bornRainelle(g);
  Rainelles.createRainelle(g.s, { cultivarId: g.s.cultivars[0].id, name: "Seconde" });
  Rainelles.createRainelle(g.s, { cultivarId: g.s.cultivars[0].id, name: "Troisième" });
  assert.equal(g.s.rainelles.length, 3);

  const before = JSON.stringify(g.s.campaignStations);
  const result = g.command({ type: "removeHabitat", habitatId: a.id });
  assert.equal(result.ok, false, "removing this 2-place habitat would leave only 2 places for 3 Rainelles");
  assert.equal(JSON.stringify(g.s.campaignStations), before, "refusal never mutates");
});

test("removeHabitat: a bourgeon already waiting in the nursery counts as reserved population, exactly like harvestBud's own reservation", () => {
  // Regression: a bourgeon deposited by harvestBud (garden-state-cmd-m.js) resolves into a real
  // Rainelle unconditionally at the next "sleep" (garden-state-cmd-f.js) — it must occupy a living
  // place for this refusal's purposes even though s.rainelles itself has not grown yet, the exact
  // same reservation harvestBud already applies before accepting a new bourgeon.
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  Rainelles.createRainelle(g.s, { cultivarId: g.s.cultivars[0].id, name: "Seconde" });
  const a = Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 1, z: 1, capacity: 2 });
  // Total capacity 4, two living Rainelles: a free living place exists, so harvestBud succeeds
  // and reserves it in the nursery — before the bourgeon actually becomes a third Rainelle.
  assert.equal(g.command({ type: "formBud", id: rainelle.id }).ok, true);
  assert.equal(g.command({ type: "harvestBud", id: rainelle.id }).ok, true);
  assert.equal(g.s.campaignNursery.length, 1);
  assert.equal(g.s.rainelles.length, 2, "the bourgeon has not resolved into a Rainelle yet");

  const before = JSON.stringify(g.s.campaignStations);
  const result = g.command({ type: "removeHabitat", habitatId: a.id });
  assert.equal(
    result.ok,
    false,
    "removing this 2-place habitat would leave only 2 places for 2 living Rainelles + 1 pending bourgeon",
  );
  assert.equal(JSON.stringify(g.s.campaignStations), before, "refusal never mutates");
});

test("removeHabitat: succeeds and removes the habitat when enough margin remains", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  const b = Stations.registerStation(g.s.campaignStations, "habitat", { x: 1, z: 1, capacity: 3 });
  bornRainelle(g);

  const result = g.command({ type: "removeHabitat", habitatId: a.id });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(g.s.campaignStations.habitats, [b]);
});

test("releaseGesture: refuses an unknown Rainelle id", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const before = JSON.stringify(g.s.rainelles);

  const result = g.command({ type: "releaseGesture", rainelleId: "r999" });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.rainelles), before);
  assert.equal(rainelle.geste, null, "untouched fixture, no gesture taught yet");
});

test("releaseGesture: refuses a Rainelle that already has no gesture — releasing nothing is not a release", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  assert.equal(rainelle.geste, null);

  const result = g.command({ type: "releaseGesture", rainelleId: rainelle.id });
  assert.equal(result.ok, false);
  assert.equal(rainelle.geste, null);
  assert.equal(rainelle.job, null);
});

test("releaseGesture: clears geste and an in-progress job's countdown, touching nothing else", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 10, z: 10 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 20, z: 20 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 21, z: 20 });

  const taught = Rainelles.applyGesture(rainelle, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
    condition: "",
  });
  assert.equal(taught.ok, true, taught.error);
  g.step(CYCLE);
  assert.notEqual(rainelle.geste, null);
  assert.ok(rainelle.job && Number.isFinite(rainelle.job.remaining), "a real countdown is running");

  const before = {
    id: rainelle.id,
    cultivarId: rainelle.cultivarId,
    name: rainelle.name,
    bourgeon: rainelle.bourgeon,
    founder: rainelle.founder,
    x: rainelle.x,
    z: rainelle.z,
  };
  const result = g.command({ type: "releaseGesture", rainelleId: rainelle.id });
  assert.equal(result.ok, true, result.error);
  assert.equal(rainelle.geste, null);
  assert.equal(rainelle.job, null);
  assert.deepEqual(
    {
      id: rainelle.id,
      cultivarId: rainelle.cultivarId,
      name: rainelle.name,
      bourgeon: rainelle.bourgeon,
      founder: rainelle.founder,
      x: rainelle.x,
      z: rainelle.z,
    },
    before,
    "release touches only geste/job, nothing else on the Rainelle",
  );
});

test("a real JSON round-trip keeps a removed habitat and a released gesture strictly identical", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  const b = Stations.registerStation(g.s.campaignStations, "habitat", { x: 1, z: 1, capacity: 3 });
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 10, z: 10 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 20, z: 20 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 21, z: 20 });
  Rainelles.applyGesture(rainelle, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
    condition: "",
  });

  const removeResult = g.command({ type: "removeHabitat", habitatId: g.s.campaignStations.habitats[0].id });
  assert.equal(removeResult.ok, true, removeResult.error);
  const releaseResult = g.command({ type: "releaseGesture", rainelleId: rainelle.id });
  assert.equal(releaseResult.ok, true, releaseResult.error);

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignStations.habitats, [b]);
  assert.equal(reloaded.rainelles[0].geste, null);
  assert.equal(reloaded.rainelles[0].job, null);
});
