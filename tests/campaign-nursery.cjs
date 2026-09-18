const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");

// Epic C3.4 (design §5, "Multiplication et vie propre") : le bourgeon donne un second individu
// sans passer par un deuxième pot. formBud marque un bourgeon prêt (aucune mise en scène
// narrative, même posture que triggerFrogEncounter à C2.3) ; harvestBud exige une place de vie
// libre (campaign-stations.js, C3.3) avant de le déposer à la nurserie (s.campaignNursery) ; la
// nuit suivante (garden-state-cmd-f.js's "sleep") transforme chaque entrée en une nouvelle
// Rainelle, sans geste enseigné, jamais un tirage instantané.

function firstRainelle(g) {
  // Epic C4.4: triggerFrogEncounter now refuses until a cultivar already exists ("après les
  // apprentissages nécessaires", design §10 chapitre 4) — this unrelated warm-up cross satisfies
  // that real precondition before the scripted encounter itself.
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

test("a freshly created Rainelle carries no bourgeon", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  assert.equal(r.bourgeon, null);
});

test("formBud refuses an unknown Rainelle id", () => {
  const g = new GardenState(null, 1000);
  firstRainelle(g);
  const r = g.command({ type: "formBud", id: "r999" });
  assert.equal(r.ok, false);
  assert.ok(r.message.includes("r999") || /inconnue/.test(r.message));
});

test("formBud marks a bourgeon present; a second attempt is refused explicitly, without resetting it", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  const r1 = g.command({ type: "formBud", id: r.id });
  assert.equal(r1.ok, true);
  assert.equal(r.bourgeon, true);
  const r2 = g.command({ type: "formBud", id: r.id });
  assert.equal(r2.ok, false);
  assert.match(r2.message, /déjà un bourgeon/);
  assert.equal(r.bourgeon, true, "still present, not cleared by the refusal");
});

test("harvestBud refuses a Rainelle carrying no bourgeon", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  const res = g.command({ type: "harvestBud", id: r.id });
  assert.equal(res.ok, false);
  assert.match(res.message, /aucun bourgeon/);
});

test("harvestBud refuses without a free living place, leaving the bourgeon and the nursery untouched", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  g.command({ type: "formBud", id: r.id });
  // No habitat registered at all: zero free places for the one Rainelle already alive.
  const res = g.command({ type: "harvestBud", id: r.id });
  assert.equal(res.ok, false);
  assert.match(res.message, /[Aa]ucune place de vie libre/);
  assert.equal(r.bourgeon, true, "refusal never consumes the bourgeon");
  assert.deepEqual(g.s.campaignNursery, []);
});

test("harvestBud succeeds with a free living place: bourgeon cleared, nursery holds the parent's cultivarId", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  g.command({ type: "formBud", id: r.id });
  const res = g.command({ type: "harvestBud", id: r.id });
  assert.equal(res.ok, true);
  assert.equal(r.bourgeon, null);
  assert.equal(g.s.campaignNursery.length, 1);
  assert.equal(g.s.campaignNursery[0].id, "nu1");
  assert.equal(g.s.campaignNursery[0].cultivarId, r.cultivarId);
});

test("a second harvest is refused once the first already reserves the only free place, before any sleep", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  // Capacity 2, population 1: exactly one free place today.
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  g.command({ type: "formBud", id: r.id });
  assert.equal(g.command({ type: "harvestBud", id: r.id }).ok, true);
  assert.equal(g.s.campaignNursery.length, 1, "the one free place is now reserved");

  // Form and try to harvest a second bourgeon on the same Rainelle before any sleep: refused,
  // because the nursery already reserves the community's only free place — never two births
  // promised for one habitat slot.
  assert.equal(g.command({ type: "formBud", id: r.id }).ok, true);
  const second = g.command({ type: "harvestBud", id: r.id });
  assert.equal(second.ok, false);
  assert.match(second.message, /[Aa]ucune place de vie libre/);
  assert.equal(r.bourgeon, true, "the second bourgeon is left in place by the refusal");
  assert.equal(g.s.campaignNursery.length, 1, "still only the first reservation");
});

test("sleep resolves every pending nursery entry into a new, gesture-less Rainelle sharing its parent's cultivar", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  g.command({ type: "formBud", id: r.id });
  g.command({ type: "harvestBud", id: r.id });
  assert.equal(g.s.rainelles.length, 1, "not born yet, only reserved");

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.rainelles.length, 2);
  const child = g.s.rainelles[1];
  assert.equal(child.id, "r2");
  assert.equal(child.cultivarId, r.cultivarId);
  assert.equal(child.name, "");
  assert.equal(child.geste, null, "il ne copie pas un souvenir ni une obligation de métier");
  assert.equal(child.bourgeon, null);
  assert.deepEqual(g.s.campaignNursery, [], "consumed exactly once");

  // A further, empty night resolves normally without inventing a second child.
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.rainelles.length, 2, "no double-awakening on a later, unrelated night");
});

test("a reload mid-maturation never wakes a pending bourgeon early or twice", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  g.command({ type: "formBud", id: r.id });
  g.command({ type: "harvestBud", id: r.id });

  const saved = JSON.parse(JSON.stringify(g.serialize()));
  const reloaded = new GardenState(saved);
  assert.equal(reloaded.s.rainelles.length, 1, "reload alone never resolves the nursery");
  assert.equal(reloaded.s.campaignNursery.length, 1);

  assert.equal(reloaded.command({ type: "sleep" }).ok, true);
  assert.equal(reloaded.s.rainelles.length, 2, "resolves exactly once, on the real next sleep");
  assert.deepEqual(reloaded.s.campaignNursery, []);
});

test("an existing save without campaignNursery/campaignNurseryNextId migrates to defaults without error", () => {
  const g = new GardenState(null, 1000);
  firstRainelle(g);
  const saved = g.serialize();
  delete saved.campaignNursery;
  delete saved.campaignNurseryNextId;
  const migrated = validate(saved);
  assert.deepEqual(migrated.campaignNursery, []);
  assert.equal(migrated.campaignNurseryNextId, 1);
});

test("an existing rainelle without a bourgeon field migrates to null without error", () => {
  const g = new GardenState(null, 1000);
  firstRainelle(g);
  const saved = g.serialize();
  delete saved.rainelles[0].bourgeon;
  const migrated = validate(saved);
  assert.equal(migrated.rainelles[0].bourgeon, null);
});

test("validate rejects a malformed campaignNursery entry", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);

  const badId = g.serialize();
  badId.campaignNursery.push({ id: "notNu1", cultivarId: r.cultivarId });
  assert.throws(() => validate(badId), /Nurserie invalide/);

  const badCultivar = g.serialize();
  badCultivar.campaignNursery.push({ id: "nu1", cultivarId: "c999" });
  assert.throws(() => validate(badCultivar), /Nurserie invalide/);

  const dup = g.serialize();
  dup.campaignNursery.push(
    { id: "nu1", cultivarId: r.cultivarId },
    { id: "nu1", cultivarId: r.cultivarId },
  );
  assert.throws(() => validate(dup), /Nurserie invalide/);
});

test("validate rejects a malformed rainelle.bourgeon", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  for (const bad of ["yes", 1, {}]) {
    const saved = g.serialize();
    saved.rainelles[0].bourgeon = bad;
    assert.throws(() => validate(saved), /Rainelle invalide/);
  }
});

test("a campaignNurseryNextId collision is rejected, a correction accepted", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  g.command({ type: "formBud", id: r.id });
  g.command({ type: "harvestBud", id: r.id });

  const saved = g.serialize();
  saved.campaignNurseryNextId = 1; // nu1 already exists
  assert.throws(() => validate(saved), /Identifiants de nurserie invalides/);

  saved.campaignNurseryNextId = 2;
  assert.doesNotThrow(() => validate(saved));
});

test("a real JSON round trip keeps a populated nursery strictly identical", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  g.command({ type: "formBud", id: r.id });
  g.command({ type: "harvestBud", id: r.id });
  const roundTripped = JSON.parse(JSON.stringify(g.s.campaignNursery));
  assert.deepEqual(roundTripped, g.s.campaignNursery);
});
