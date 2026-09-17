const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");

function withCultivar(g, name = "") {
  return Cultivars.createCultivar(g.s, {
    name,
    parentIds: ["ronce-a-rubans", "fraise-timide"],
    traits: { port: "grimpant", feuilles: { forme: "palmee", taille: "moyenne" } },
  });
}

test("renameCultivar sets the name and it persists after a real JSON round trip", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g);
  const r = g.command({ type: "renameCultivar", id: cv.id, name: "  Veilleuse rieuse  " });
  assert.equal(r.ok, true);
  assert.equal(g.s.cultivars[0].name, "Veilleuse rieuse");
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.equal(reloaded.s.cultivars[0].name, "Veilleuse rieuse");
});

test("renameCultivar on an unknown id is refused explicitly", () => {
  const g = new GardenState(null, 1000);
  const r = g.command({ type: "renameCultivar", id: "c999", name: "Fantôme" });
  assert.equal(r.ok, false);
  assert.ok(r.message);
});

test("renameCultivar rejects an empty name and stays silent about it (no mutation)", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g, "Original");
  const r = g.command({ type: "renameCultivar", id: cv.id, name: "   " });
  assert.equal(r.ok, false);
  assert.equal(g.s.cultivars[0].name, "Original");
});

test("renameCultivar stays legitimate after a disposition is already set", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g, "Original");
  assert.equal(g.command({ type: "keepCultivar", id: cv.id }).ok, true);
  const r = g.command({ type: "renameCultivar", id: cv.id, name: "Après coup" });
  assert.equal(r.ok, true);
  assert.equal(g.s.cultivars[0].name, "Après coup");
  assert.equal(g.s.cultivars[0].disposition, "kept");
});

for (const [first, second] of [
  ["keepCultivar", "storeCultivar"],
  ["storeCultivar", "giveCultivar"],
  ["giveCultivar", "compostCultivar"],
  ["compostCultivar", "keepCultivar"],
]) {
  test(`${first} sets a disposition once, then ${second} on the same cultivar is refused explicitly`, () => {
    const g = new GardenState(null, 1000),
      cv = withCultivar(g, "Essai");
    const r1 = g.command({ type: first, id: cv.id });
    assert.equal(r1.ok, true);
    assert.ok(g.s.cultivars[0].disposition);
    const r2 = g.command({ type: second, id: cv.id });
    assert.equal(r2.ok, false);
    assert.ok(r2.message);
    // The first decision is untouched by the refused second attempt.
    const expected = {
      keepCultivar: "kept",
      storeCultivar: "stored",
      giveCultivar: "given",
      compostCultivar: "composted",
    }[first];
    assert.equal(g.s.cultivars[0].disposition, expected);
  });
}

test("Any disposition command on an unknown cultivar id is refused explicitly", () => {
  const g = new GardenState(null, 1000);
  for (const type of ["keepCultivar", "storeCultivar", "giveCultivar", "compostCultivar"]) {
    const r = g.command({ type, id: "c999" });
    assert.equal(r.ok, false);
    assert.ok(r.message);
  }
});

test("The very first successful keepCultivar of the game seeds campaignSeedBox; a later keep on another cultivar never overwrites it", () => {
  const g = new GardenState(null, 1000),
    first = withCultivar(g, "Premier"),
    second = withCultivar(g, "Second");
  assert.deepEqual(g.s.campaignSeedBox, { seeded: false, cultivarId: null, retrievals: 0 });
  assert.equal(g.command({ type: "keepCultivar", id: first.id }).ok, true);
  assert.equal(g.s.campaignSeedBox.seeded, true);
  assert.equal(g.s.campaignSeedBox.cultivarId, first.id);
  assert.equal(g.command({ type: "keepCultivar", id: second.id }).ok, true);
  assert.equal(g.s.campaignSeedBox.cultivarId, first.id, "the box keeps remembering the first kept cultivar only");
});

test("retrieveSeedBoxSeed fails before any keep, succeeds after, and is never consumed across repeats", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g, "Mère");
  const before = g.command({ type: "retrieveSeedBoxSeed" });
  assert.equal(before.ok, false);
  assert.ok(before.message);
  assert.equal(g.command({ type: "keepCultivar", id: cv.id }).ok, true);
  const first = g.command({ type: "retrieveSeedBoxSeed" });
  assert.equal(first.ok, true);
  assert.equal(g.s.campaignSeedBox.retrievals, 1);
  assert.equal(g.s.campaignSeedBox.seeded, true);
  const second = g.command({ type: "retrieveSeedBoxSeed" });
  assert.equal(second.ok, true);
  assert.equal(g.s.campaignSeedBox.retrievals, 2);
  assert.equal(g.s.campaignSeedBox.seeded, true, "the mother seed is never consumed");
});

test("Composting a cultivar leaves its entry fully intact in s.cultivars after a real JSON round trip", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g, "Composté un jour");
  const before = { id: cv.id, parentIds: [...cv.parentIds], traits: { ...cv.traits } };
  assert.equal(g.command({ type: "compostCultivar", id: cv.id }).ok, true);
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  const after = reloaded.s.cultivars.find((c) => c.id === cv.id);
  assert.ok(after, "the notebook keeps the discovery even though the specimen was composted");
  assert.equal(after.id, before.id);
  assert.deepEqual(after.parentIds, before.parentIds);
  assert.deepEqual(after.traits, before.traits);
  assert.equal(after.disposition, "composted");
});

test("A v3 save without campaignSeedBox and without any cultivar.disposition migrates silently to the defaults", () => {
  const g = new GardenState(null, 1000);
  withCultivar(g, "Ancien");
  const old = g.serialize();
  delete old.campaignSeedBox;
  const before = JSON.stringify({ ...old, campaignSeedBox: undefined });
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.campaignSeedBox, { seeded: false, cultivarId: null, retrievals: 0 });
  assert.equal(migrated.s.cultivars[0].disposition, undefined);
  const after = JSON.stringify({ ...migrated.s, campaignSeedBox: undefined });
  assert.equal(after, before, "no other field should change during this migration");
});

test("A malformed campaignSeedBox field is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const bad of [
    "nope",
    { seeded: "yes", cultivarId: null, retrievals: 0 },
    { seeded: true, cultivarId: 1, retrievals: 0 },
    { seeded: true, cultivarId: "c1", retrievals: -1 },
    { seeded: true, cultivarId: "c1", retrievals: 1.5 },
    { seeded: true, cultivarId: "c1" },
    { cultivarId: "c1", retrievals: 0 },
    null,
  ]) {
    const saved = g.serialize();
    saved.campaignSeedBox = bad;
    assert.throws(() => validate(saved), /Boîte de semences invalide/);
  }
});

test("An invalid cultivar.disposition value is rejected by validate", () => {
  const g = new GardenState(null, 1000);
  withCultivar(g, "Essai");
  for (const bad of [1, "sold", "", "KEPT", true]) {
    const saved = g.serialize();
    saved.cultivars[0].disposition = bad;
    assert.throws(() => validate(saved), /Cultivar invalide/);
  }
});

test("A valid disposition value round-trips through validate untouched", () => {
  const g = new GardenState(null, 1000),
    cv = withCultivar(g, "Essai");
  assert.equal(g.command({ type: "giveCultivar", id: cv.id }).ok, true);
  const saved = g.serialize();
  assert.doesNotThrow(() => validate(saved));
  assert.equal(validate(saved).cultivars[0].disposition, "given");
});
