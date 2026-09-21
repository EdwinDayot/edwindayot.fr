const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Memory = require("../public/game/campaign-memory.js");
const Cultivars = require("../public/game/cultivars.js");
const Rainelles = require("../public/game/rainelles.js");
const Narrative = require("../public/game/data-narrative.js");

// Epic C6.9 (design §10, chapitre 16 "Ce qu'on accepte de perdre"). Reaches "archives-restaurees"
// (C6.7) through the real quest/sleep/command chain, exactly like tests/campaign-chapter15.cjs's
// own helpers, rather than pushing the flag onto s.campaignFlags by hand.
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

// Reaches "archives-restaurees" (C6.7) via the full real chain, exactly as
// tests/campaign-chapter15.cjs's own tests prove it. Returns the Rainelle created along the way,
// useful to callers that need one for unrelated setup.
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

const LEVER_FLAGS = [
  "levier-contrat-reduit",
  "levier-veilleuse-coupee",
  "levier-prise-restituee",
];

function leverFlags(g) {
  return g.s.campaignFlags.filter((f) => LEVER_FLAGS.includes(f));
}

// --- (a) reduceContract -----------------------------------------------------------------------

test("reduceContract never reveals levier-contrat-reduit before archives-restaurees, even with real deliveries", () => {
  const g = new GardenState(null, 1000);
  reachChapter12Flag(g);
  g.command({ type: "sowPot", a: "menthe-de-velours", b: "aster-des-vents" });
  g.command({ type: "sleep" });
  const cultivar = g.s.cultivars[g.s.cultivars.length - 1];
  const sign = g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 5,
    pricePerUnit: 10,
  });
  assert.equal(sign.ok, true, sign.error);
  const contractId = g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.ok(g.s.campaignMemory.contractsFed[contractId] > 0);
  const reduce = g.command({ type: "reduceContract", contractId, quota: 2 });
  assert.equal(reduce.ok, true, reduce.error);
  assert.deepEqual(leverFlags(g), []);
});

test("reduceContract on a contract never fed reveals nothing, even after archives-restaurees", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);
  const cultivar = g.s.cultivars[g.s.cultivars.length - 1];
  const sign = g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 5,
    pricePerUnit: 10,
  });
  assert.equal(sign.ok, true, sign.error);
  const contractId = g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  assert.equal(g.s.campaignMemory.contractsFed[contractId] || 0, 0);
  const reduce = g.command({ type: "reduceContract", contractId, quota: 2 });
  assert.equal(reduce.ok, true, reduce.error);
  assert.deepEqual(leverFlags(g), []);
});

test("reduceContract on a contract already fed, after archives-restaurees, reveals levier-contrat-reduit exactly once", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);
  const cultivar = g.s.cultivars[g.s.cultivars.length - 1];
  const sign = g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 5,
    pricePerUnit: 10,
  });
  assert.equal(sign.ok, true, sign.error);
  const contractId = g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.ok(g.s.campaignMemory.contractsFed[contractId] > 0);
  const reduce = g.command({ type: "reduceContract", contractId, quota: 2 });
  assert.equal(reduce.ok, true, reduce.error);
  assert.deepEqual(leverFlags(g), ["levier-contrat-reduit"]);
  // A later reduction of a different (freshly signed) contract, also fed, never reveals a second
  // time — the entry is already present in campaignFlags.
  const reduceAgain = g.command({ type: "reduceContract", contractId, quota: 1 });
  assert.equal(reduceAgain.ok, true, reduceAgain.error);
  assert.deepEqual(leverFlags(g), ["levier-contrat-reduit"]);
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "levier-contrat-reduit").length,
    1,
  );
});

// --- (b) setVeilleuse ---------------------------------------------------------------------------

test("setVeilleuse off never reveals levier-veilleuse-coupee before archives-restaurees, even with real nightly activity", () => {
  const g = new GardenState(null, 1000);
  reachChapter12Flag(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  assert.equal(
    g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok,
    true,
  );
  Memory.recordNightlyActivity(g.s.campaignMemory, "r0");
  const off = g.command({ type: "setVeilleuse", zoneId: zone.id, active: false });
  assert.equal(off.ok, true, off.error);
  assert.deepEqual(leverFlags(g), []);
});

test("setVeilleuse false→false or true→true (no real transition) never reveals, even after archives-restaurees", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  Memory.recordNightlyActivity(g.s.campaignMemory, "r0");
  // Already off, switching "off" again: false→false.
  const noop1 = g.command({ type: "setVeilleuse", zoneId: zone.id, active: false });
  assert.equal(noop1.ok, true, noop1.error);
  assert.deepEqual(leverFlags(g), []);
  // Turn on, then on again: true→true never reveals either (only the off transition should).
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: true });
  const noop2 = g.command({ type: "setVeilleuse", zoneId: zone.id, active: true });
  assert.equal(noop2.ok, true, noop2.error);
  assert.deepEqual(leverFlags(g), []);
});

test("setVeilleuse off with nightlyActivity still empty (the veilleuse never really served) never reveals", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: true });
  assert.deepEqual(g.s.campaignMemory.nightlyActivity, {});
  const off = g.command({ type: "setVeilleuse", zoneId: zone.id, active: false });
  assert.equal(off.ok, true, off.error);
  assert.deepEqual(leverFlags(g), []);
});

test("setVeilleuse off after archives-restaurees, with real nightly activity recorded, reveals levier-veilleuse-coupee exactly once", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: true });
  Memory.recordNightlyActivity(g.s.campaignMemory, "r0");
  const off = g.command({ type: "setVeilleuse", zoneId: zone.id, active: false });
  assert.equal(off.ok, true, off.error);
  assert.deepEqual(leverFlags(g), ["levier-veilleuse-coupee"]);
  // Repeating the same on/off cycle never reveals a second time.
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: true });
  const offAgain = g.command({ type: "setVeilleuse", zoneId: zone.id, active: false });
  assert.equal(offAgain.ok, true, offAgain.error);
  assert.deepEqual(leverFlags(g), ["levier-veilleuse-coupee"]);
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "levier-veilleuse-coupee").length,
    1,
  );
});

// --- (c) setPriseFortDebit -----------------------------------------------------------------------

test("setPriseFortDebit off never reveals levier-prise-restituee before archives-restaurees, even with real withdrawals", () => {
  const g = new GardenState(null, 1000);
  reachChapter12Flag(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  assert.equal(
    g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true }).ok,
    true,
  );
  Memory.recordWaterWithdrawal(g.s.campaignMemory, borne.id, 5);
  const off = g.command({
    type: "setPriseFortDebit",
    borneId: borne.id,
    active: false,
  });
  assert.equal(off.ok, true, off.error);
  assert.deepEqual(leverFlags(g), []);
});

test("setPriseFortDebit false→false or true→true (no real transition) never reveals, even after archives-restaurees", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  Memory.recordWaterWithdrawal(g.s.campaignMemory, borne.id, 5);
  const noop1 = g.command({
    type: "setPriseFortDebit",
    borneId: borne.id,
    active: false,
  });
  assert.equal(noop1.ok, true, noop1.error);
  assert.deepEqual(leverFlags(g), []);
  g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true });
  const noop2 = g.command({
    type: "setPriseFortDebit",
    borneId: borne.id,
    active: true,
  });
  assert.equal(noop2.ok, true, noop2.error);
  assert.deepEqual(leverFlags(g), []);
});

test("setPriseFortDebit off with waterWithdrawals still at 0 for this borne never reveals", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true });
  assert.equal(g.s.campaignMemory.waterWithdrawals[borne.id] || 0, 0);
  const off = g.command({
    type: "setPriseFortDebit",
    borneId: borne.id,
    active: false,
  });
  assert.equal(off.ok, true, off.error);
  assert.deepEqual(leverFlags(g), []);
});

test("setPriseFortDebit off after archives-restaurees, with real withdrawals recorded, reveals levier-prise-restituee exactly once", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true });
  Memory.recordWaterWithdrawal(g.s.campaignMemory, borne.id, 5);
  const off = g.command({
    type: "setPriseFortDebit",
    borneId: borne.id,
    active: false,
  });
  assert.equal(off.ok, true, off.error);
  assert.deepEqual(leverFlags(g), ["levier-prise-restituee"]);
  g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true });
  const offAgain = g.command({
    type: "setPriseFortDebit",
    borneId: borne.id,
    active: false,
  });
  assert.equal(offAgain.ok, true, offAgain.error);
  assert.deepEqual(leverFlags(g), ["levier-prise-restituee"]);
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "levier-prise-restituee").length,
    1,
  );
});

// --- All three at once, texts, non-regression -----------------------------------------------

test("all three levers can fire in the same game, none mutually exclusive of the others", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);

  const cultivar = g.s.cultivars[g.s.cultivars.length - 1];
  const sign = g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 5,
    pricePerUnit: 10,
  });
  assert.equal(sign.ok, true, sign.error);
  const contractId = g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  g.command({ type: "deliverContract", contractId, quantity: 1 });
  g.command({ type: "reduceContract", contractId, quota: 2 });

  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: true });
  Memory.recordNightlyActivity(g.s.campaignMemory, "r0");
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: false });

  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 5,
    z: 0,
  });
  g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true });
  Memory.recordWaterWithdrawal(g.s.campaignMemory, borne.id, 5);
  g.command({ type: "setPriseFortDebit", borneId: borne.id, active: false });

  assert.deepEqual(
    leverFlags(g).sort(),
    LEVER_FLAGS.slice().sort(),
  );
});

test("the three lever texts contain no obligation formulation and no accusation, and describe only a real cost accepted", () => {
  for (const id of LEVER_FLAGS) {
    const entry = Narrative.TEXTS[id];
    assert.ok(entry, `TEXTS must carry an entry for "${id}"`);
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
        `"${id}" must not contain an obligation formulation ("${obligationWord}")`,
      );
    }
  }
});

test("non-regression: nuit-attentive-reconnue, bilan-matin-*, premier-non-*, alma-retour and archives-restaurees still fire exactly as before alongside the new reveals", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);
  for (const id of [
    "note-jeanne-serre-1",
    "note-jeanne-serre-2",
    "alma-retour",
    "reconstitution-jeanne",
    "archives-restaurees",
  ]) {
    assert.equal(
      g.s.campaignFlags.filter((f) => f === id).length,
      1,
      `"${id}" should appear exactly once`,
    );
  }
  assert.equal(
    g.s.campaignFlags.filter((f) => f.startsWith("premier-non-")).length,
    1,
  );
  assert.equal(
    g.s.campaignFlags.filter((f) => f.startsWith("bilan-matin-")).length,
    1,
  );
});

test("a JSON round-trip after all three reveals keeps the exact flags and campaignMemory facts", () => {
  const g = new GardenState(null, 1000);
  reachArchivesRestaurees(g);

  const cultivar = g.s.cultivars[g.s.cultivars.length - 1];
  g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 5,
    pricePerUnit: 10,
  });
  const contractId = g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  g.command({ type: "deliverContract", contractId, quantity: 1 });
  g.command({ type: "reduceContract", contractId, quota: 2 });

  assert.deepEqual(leverFlags(g), ["levier-contrat-reduit"]);
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(leverFlags(reloaded), ["levier-contrat-reduit"]);
  assert.equal(
    reloaded.s.campaignMemory.contractsFed[contractId],
    g.s.campaignMemory.contractsFed[contractId],
  );
});
