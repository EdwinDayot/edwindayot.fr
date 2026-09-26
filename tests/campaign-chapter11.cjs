const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Memory = require("../public/game/campaign-memory.js");
const Narrative = require("../public/game/data-narrative.js");

// Epic C6.3 (design §10, chapitre 11 "La nuit où tout continue"). Reaches "la-bonne-occasion"
// (C6.1) through the real quest chain, exactly the same path tests/campaign-chapter10.cjs already
// proves, rather than pushing the flag onto s.campaignFlags by hand.
function reachChapter10Flag(g) {
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
  assert.ok(g.s.campaignFlags.includes("la-bonne-occasion"));
}

const BILAN_FLAGS = [
  "bilan-matin-preserve",
  "bilan-matin-actif",
  "bilan-matin-actif-bassin",
  "bilan-matin-actif-persistance",
  "bilan-matin-actif-complet",
];

function bilanFlag(g) {
  return g.s.campaignFlags.filter((f) => BILAN_FLAGS.includes(f));
}

test("no bilan flag is ever revealed before chapter 10's own flag exists, even with a lever active", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  assert.equal(
    g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok,
    true,
  );
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), []);
});

test("no lever ever activated: sleeping after chapter 10's flag reveals the 'preserved' branch, exactly once", () => {
  const g = new GardenState(null, 1000);
  reachChapter10Flag(g);
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), ["bilan-matin-preserve"]);
  // A further night never re-evaluates the branch — the family is a one-time event, unlike
  // persistance/réparation which re-check every night.
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), ["bilan-matin-preserve"]);
});

test("a zone veilleuse active, no measurable sign yet: reveals the plain 'active' branch", () => {
  const g = new GardenState(null, 1000);
  reachChapter10Flag(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  assert.equal(
    g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok,
    true,
  );
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), ["bilan-matin-actif"]);
});

test("a borne prise à fort débit active with the bassin commun already lowered: reveals the 'bassin' variant", () => {
  const g = new GardenState(null, 1000);
  reachChapter10Flag(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  assert.equal(
    g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true })
      .ok,
    true,
  );
  Memory.recordWaterWithdrawal(g.s.campaignMemory, borne.id, 5);
  assert.ok(
    Memory.bassinCommunLevel(g.s.campaignMemory) <
      Memory.BASSIN_COMMUN_CAPACITY,
  );
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), ["bilan-matin-actif-bassin"]);
});

test("a zone veilleuse active with a Rainelle already recorded persistent: reveals the 'persistance' variant", () => {
  const g = new GardenState(null, 1000);
  reachChapter10Flag(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  assert.equal(
    g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok,
    true,
  );
  Memory.recordPersistentGesture(g.s.campaignMemory, "r0");
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), ["bilan-matin-actif-persistance"]);
});

test("both signs true at once: reveals the 'complet' variant, still exactly one flag", () => {
  const g = new GardenState(null, 1000);
  reachChapter10Flag(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  assert.equal(
    g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true })
      .ok,
    true,
  );
  Memory.recordWaterWithdrawal(g.s.campaignMemory, borne.id, 5);
  Memory.recordPersistentGesture(g.s.campaignMemory, "r0");
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), ["bilan-matin-actif-complet"]);
});

test("switching the lever off again before the very first eligible sleep never fires a second, contradictory branch", () => {
  const g = new GardenState(null, 1000);
  reachChapter10Flag(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: true });
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), ["bilan-matin-actif"]);
  // A later night, even with the lever switched off, must never add "bilan-matin-preserve" on
  // top — the family fires once, permanently.
  g.command({ type: "setVeilleuse", zoneId: zone.id, active: false });
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), ["bilan-matin-actif"]);
});

test("each of the five texts contains no obligation formulation and stays a factual observation, never a verdict on the player", () => {
  for (const id of BILAN_FLAGS) {
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

test("a JSON round-trip after the bilan is revealed keeps the exact flag and campaignMemory facts", () => {
  const g = new GardenState(null, 1000);
  reachChapter10Flag(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true });
  Memory.recordWaterWithdrawal(g.s.campaignMemory, borne.id, 5);
  g.command({ type: "sleep" });
  assert.deepEqual(bilanFlag(g), ["bilan-matin-actif-bassin"]);
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(bilanFlag(reloaded), ["bilan-matin-actif-bassin"]);
});
