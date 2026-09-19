const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Memory = require("../public/game/campaign-memory.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");

// Epic C5.1 (design §11, "Mémoire factuelle bornée, sans score de vertu") : a bounded journal of
// events/aggregates — never a per-frame/per-night history (design §14) — covering the categories
// already observable without any new system: repos, naissances, première affectation de geste,
// interventions manuelles distinctes des cycles automatiques. See campaign-memory.js's own header
// comment for the full reasoning and the fields reserved for C5.2/C5.3/C5.4 and later.

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands today. Same
// fixture already used by tests/campaign-teaching.cjs/-automation.cjs.
function bornRainelle(g) {
  // Epic C4.4: triggerFrogEncounter now refuses until a cultivar already exists ("après les
  // apprentissages nécessaires", design §10 chapitre 4) — this unrelated warm-up cross satisfies
  // that real precondition before the scripted encounter itself.
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

const FIELDS = {
  verbe: "arroser",
  poste: "zone-fraisiers",
  source: "borne-1",
  destination: "zone-fraisiers",
  condition: "",
};

test("a fresh save starts with an empty, well-formed campaignMemory", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.campaignMemory, Memory.freshMemory());
});

test("sleep never counts a newly-born Rainelle as having rested the night it is born, but does the following night", () => {
  const g = new GardenState(null, 1000);
  const r = bornRainelle(g);
  assert.deepEqual(
    g.s.campaignMemory.rest,
    {},
    "born during this very sleep: not counted for a night it did not live through",
  );
  assert.deepEqual(g.s.campaignMemory.births, [r.id]);

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(g.s.campaignMemory.rest, { [r.id]: 1 });

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(g.s.campaignMemory.rest, { [r.id]: 2 });
});

test("births are recorded exactly once per Rainelle, including a second individual born via the nursery", () => {
  const g = new GardenState(null, 1000);
  const r = bornRainelle(g);
  assert.deepEqual(g.s.campaignMemory.births, [r.id]);

  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  assert.equal(g.command({ type: "formBud", id: r.id }).ok, true);
  assert.equal(g.command({ type: "harvestBud", id: r.id }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.rainelles.length, 2);
  const secondId = g.s.rainelles[1].id;
  assert.deepEqual(g.s.campaignMemory.births, [r.id, secondId]);

  // A further, empty night never re-records a birth that already happened.
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(g.s.campaignMemory.births, [r.id, secondId]);
});

test("a refused sleep-adjacent command never moves any counter (a refused command never becomes a fictive intervention)", () => {
  const g = new GardenState(null, 1000);
  const before = JSON.parse(JSON.stringify(g.s.campaignMemory));
  // No cultivar exists yet: triggerFrogEncounter is refused outright, before any sleep runs.
  const r = g.command({ type: "triggerFrogEncounter" });
  assert.equal(r.ok, false);
  assert.deepEqual(g.s.campaignMemory, before);
});

test("teachGesture records one manual intervention and the first-gesture verb; a reteach counts again but never overwrites the first verb", () => {
  const g = new GardenState(null, 1000);
  const r = bornRainelle(g);
  assert.equal(g.command({ type: "teachGesture", id: r.id, ...FIELDS }).ok, true);
  assert.equal(g.s.campaignMemory.manualInterventions, 1);
  assert.deepEqual(g.s.campaignMemory.firstGesture, { [r.id]: "arroser" });

  // Reteach with a different verb: a second intervention, but the recorded *first* verb is
  // untouched (design §11 counts a first affectation, not every one since).
  assert.equal(
    g.command({
      type: "teachGesture",
      id: r.id,
      ...FIELDS,
      verbe: "recolter",
      destination: "panier-1",
    }).ok,
    true,
  );
  assert.equal(g.s.campaignMemory.manualInterventions, 2);
  assert.deepEqual(g.s.campaignMemory.firstGesture, { [r.id]: "arroser" });
});

test("a refused teachGesture (unknown Rainelle, invalid fields, or the multiply refusal) never touches campaignMemory", () => {
  const g = new GardenState(null, 1000);
  const r = bornRainelle(g);
  const before = () => JSON.parse(JSON.stringify(g.s.campaignMemory));

  const b1 = before();
  assert.equal(g.command({ type: "teachGesture", id: "r999", ...FIELDS }).ok, false);
  assert.deepEqual(g.s.campaignMemory, b1);

  const b2 = before();
  assert.equal(
    g.command({ type: "teachGesture", id: r.id, ...FIELDS, poste: "" }).ok,
    false,
  );
  assert.deepEqual(g.s.campaignMemory, b2);

  const b3 = before();
  assert.equal(
    g.command({ type: "teachGesture", id: r.id, ...FIELDS, verbe: "multiplier" }).ok,
    false,
  );
  assert.deepEqual(g.s.campaignMemory, b3, "the narrated refusal is not a manual intervention");
});

test("confirmTeaching (four-moment flow) records the same manual-intervention/first-gesture pair as teachGesture", () => {
  const g = new GardenState(null, 1000);
  const r = bornRainelle(g);
  g.command({ type: "beginTeaching", id: r.id });
  g.command({ type: "demonstrateGesture", ...FIELDS });
  assert.equal(g.s.campaignMemory.manualInterventions, 0, "not yet confirmed");
  const res = g.command({ type: "confirmTeaching" });
  assert.equal(res.ok, true);
  assert.equal(g.s.campaignMemory.manualInterventions, 1);
  assert.deepEqual(g.s.campaignMemory.firstGesture, { [r.id]: "arroser" });
});

test("teachGestureQuick also records a manual intervention, and only sets firstGesture for a Rainelle taught for the first time", () => {
  const g = new GardenState(null, 1000);
  const r = bornRainelle(g);
  g.command({ type: "beginTeaching", id: r.id });
  g.command({ type: "demonstrateGesture", ...FIELDS });
  g.command({ type: "confirmTeaching" });
  const afterFirst = JSON.parse(JSON.stringify(g.s.campaignMemory));

  const { createRainelle } = require("../public/game/rainelles.js");
  const second = createRainelle(g.s, { cultivarId: g.s.cultivars[0].id, name: "" });
  assert.equal(g.command({ type: "teachGestureQuick", id: second.id }).ok, true);
  assert.equal(g.s.campaignMemory.manualInterventions, afterFirst.manualInterventions + 1);
  assert.deepEqual(g.s.campaignMemory.firstGesture, {
    [r.id]: "arroser",
    [second.id]: "arroser",
  });

  // Quick-teaching the very first Rainelle again (already taught) counts a second intervention
  // but never changes its already-recorded first verb.
  assert.equal(g.command({ type: "teachGestureQuick", id: r.id }).ok, true);
  assert.equal(g.s.campaignMemory.manualInterventions, afterFirst.manualInterventions + 2);
  assert.equal(g.s.campaignMemory.firstGesture[r.id], "arroser");
});

test("campaign-automation.js's own tick never moves campaignMemory: only a direct command does", () => {
  const g = new GardenState(null, 1000);
  const r = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  Stations.registerStation(g.s.campaignStations, "borne", { x: 10, z: 10 });
  Stations.registerStation(g.s.campaignStations, "zone", { x: 20, z: 20 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 21, z: 20 });
  assert.equal(
    g.command({
      type: "teachGesture",
      id: r.id,
      verbe: "arroser",
      poste: "z1",
      source: "b1",
      destination: "z1",
      condition: "",
    }).ok,
    true,
  );
  const afterTeach = JSON.parse(JSON.stringify(g.s.campaignMemory));
  g.step(500);
  assert.deepEqual(
    g.s.campaignMemory,
    afterTeach,
    "many ticks of automated work never touch the journal, only the command above did",
  );
});

test("a real JSON round-trip keeps a populated campaignMemory strictly identical", () => {
  const g = new GardenState(null, 1000);
  const r = bornRainelle(g);
  g.command({ type: "teachGesture", id: r.id, ...FIELDS });
  g.command({ type: "sleep" });
  const before = JSON.parse(JSON.stringify(g.s.campaignMemory));
  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignMemory, before);
});

test("a save from before this epic (no campaignMemory field) migrates to a fresh, empty journal", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const raw = g.serialize();
  delete raw.campaignMemory;
  const migrated = validate(raw);
  assert.deepEqual(migrated.campaignMemory, Memory.freshMemory());
});

test("validate rejects a malformed campaignMemory", () => {
  const g = new GardenState(null, 1000);
  const r = bornRainelle(g);
  const base = () => g.serialize();

  const badShape = base();
  badShape.campaignMemory = { rest: {} };
  assert.throws(() => validate(badShape), /Mémoire de campagne invalide/);

  const restUnknownId = base();
  restUnknownId.campaignMemory.rest = { r999: 1 };
  assert.throws(() => validate(restUnknownId), /Mémoire de campagne invalide/);

  const restNegative = base();
  restNegative.campaignMemory.rest = { [r.id]: -1 };
  assert.throws(() => validate(restNegative), /Mémoire de campagne invalide/);

  const birthUnknownId = base();
  birthUnknownId.campaignMemory.births = ["r999"];
  assert.throws(() => validate(birthUnknownId), /Mémoire de campagne invalide/);

  const birthDuplicate = base();
  birthDuplicate.campaignMemory.births = [r.id, r.id];
  assert.throws(() => validate(birthDuplicate), /Mémoire de campagne invalide/);

  const firstGestureUnknownId = base();
  firstGestureUnknownId.campaignMemory.firstGesture = { r999: "arroser" };
  assert.throws(() => validate(firstGestureUnknownId), /Mémoire de campagne invalide/);

  const firstGestureBadVerb = base();
  firstGestureBadVerb.campaignMemory.firstGesture = { [r.id]: "multiplier" };
  assert.throws(() => validate(firstGestureBadVerb), /Mémoire de campagne invalide/);

  const negativeInterventions = base();
  negativeInterventions.campaignMemory.manualInterventions = -1;
  assert.throws(() => validate(negativeInterventions), /Mémoire de campagne invalide/);

  const badReserved = base();
  badReserved.campaignMemory.habitatTransformations = {};
  assert.throws(() => validate(badReserved), /Mémoire de campagne invalide/);

  const valid = base();
  assert.doesNotThrow(() => validate(valid));
});
