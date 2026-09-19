const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Memory = require("../public/game/campaign-memory.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");
const Scenes = require("../public/game/campaign-scenes.js");
const Narrative = require("../public/game/data-narrative.js");

// Epic C5.7 (design §11, "réparation... coût réel, jamais un bouton pardon" ; design ch. 14,
// "elle interrompt une première fois le geste, sans redevenir instantanément disponible").
// detectRepairedGestures identifies a Rainelle only when all three hold at once: already recorded
// in campaignMemory.persistentGestureIds on some earlier night (C5.6), overexertion (C5.3) back
// down to exactly zero as of *after* tonight's own decrease, and deriveLocation (C5.5) reads
// exactly REPOS this same night — never merely "overexertion reached zero", since a Rainelle that
// always had real work at night can rest back down to zero without ever once being caught idle in
// persistance de geste.

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

test("detectRepairedGestures: a Rainelle never seen in persistence is never repaired, whatever its overexertion or location", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  // Real rest (veilleuse off), overexertion already back to zero — but never previously flagged.
  const worked = CampaignAutomation.runNightWork(g.s);
  assert.deepEqual(
    Scenes.detectRepairedGestures(g.s, worked, new Set()),
    [],
  );
});

test("detectRepairedGestures: still positive overexertion is never repaired, even if previously persistent and now at real repos", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.s.campaignMemory.overexertion[rainelle.id] = 1; // not yet back to zero

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.deepEqual(
    Scenes.detectRepairedGestures(g.s, worked, new Set([rainelle.id])),
    [],
    "overexertion must reach exactly zero before réparation",
  );
});

test("detectRepairedGestures: still in persistance de geste (HABITAT, overexerted) is never repaired", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  zone.veilleuse = true; // still on, nothing to water: this night is persistance, not réparation
  g.s.campaignMemory.overexertion[rainelle.id] = 0;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.deepEqual(
    Scenes.detectRepairedGestures(g.s, worked, new Set([rainelle.id])),
    [],
    "HABITAT is never REPOS, whatever the overexertion level",
  );
});

test("detectRepairedGestures: back at poste (real work tonight) is never repaired", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  zone.veilleuse = true;
  g.s.campaignMemory.overexertion[rainelle.id] = 0;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.equal(worked.has(rainelle.id), true);
  assert.deepEqual(
    Scenes.detectRepairedGestures(g.s, worked, new Set([rainelle.id])),
    [],
    "POSTE is never REPOS",
  );
});

test("detectRepairedGestures: previously persistent, now real repos with overexertion back to zero, is repaired", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  zone.veilleuse = false; // cut: real rest
  g.s.campaignMemory.overexertion[rainelle.id] = 0;

  const worked = CampaignAutomation.runNightWork(g.s);
  assert.deepEqual(
    Scenes.detectRepairedGestures(g.s, worked, new Set([rainelle.id])),
    [rainelle.id],
  );
});

test("sleep: reveals the réparation text the first night a previously persistent Rainelle returns to real repos, recovered", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;

  // Night 1: detected persistent (idle, veilleuse on, overexerted) — not a réparation yet, this
  // is the very first time this Rainelle is ever seen in persistance de geste.
  g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), true);
  assert.equal(g.s.campaignFlags.includes("geste-qui-sarrete"), false);
  assert.deepEqual(g.s.campaignMemory.persistentGestureIds, [rainelle.id]);

  // Cut the veilleuse: real rest from now on.
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: false }).ok, true);

  // Night 2: real rest, overexertion decays 1 -> 0 this same night — réparation fires now, not
  // at the moment the veilleuse was cut.
  g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("geste-qui-sarrete"), true);
  const seenAfterFirst = g.s.campaignFlags.filter((f) => f === "geste-qui-sarrete").length;

  // A later rest night never reveals the same text twice.
  g.command({ type: "sleep" });
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "geste-qui-sarrete").length,
    seenAfterFirst,
    "revealed only once, ever",
  );
});

test("sleep: never reveals the réparation text for a Rainelle that recovers without ever having been caught persisting", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);

  // Real night work only, every night: overexertion climbs but the Rainelle is always at POSTE,
  // never idle, so it is never once recorded in persistentGestureIds.
  for (let i = 0; i < Memory.OVEREXERTION_THRESHOLD; i++) {
    g.command({ type: "sleep" });
    Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  }
  assert.ok(g.s.campaignMemory.overexertion[rainelle.id] > 0, "actually overexerted by now");
  assert.deepEqual(g.s.campaignMemory.persistentGestureIds, [], "never once caught idle");

  // Now cut the veilleuse directly (real rest) until overexertion decays back to zero.
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: false }).ok, true);
  while (g.s.campaignMemory.overexertion[rainelle.id] > 0) g.command({ type: "sleep" });

  assert.equal(
    g.s.campaignFlags.includes("geste-qui-sarrete"),
    false,
    "an ordinary rest-driven recovery is not a réparation without a recorded persistance first",
  );
});

test("sleep: the réparation text is independent of the same-night persistence/attentive-player reveals", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.s.campaignMemory.persistentGestureIds = [rainelle.id]; // already seen persisting, some earlier night
  g.s.campaignMemory.overexertion[rainelle.id] = 1;
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: false }).ok, true);

  g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("geste-qui-sarrete"), true);
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), false);
});

test("sleep: no commande de C5.7 ne touche overexertion, rest ou nightlyActivity elle-même", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  g.s.campaignMemory.persistentGestureIds = [rainelle.id];
  g.s.campaignMemory.overexertion[rainelle.id] = 1;

  const restBefore = { ...g.s.campaignMemory.rest };
  const nightlyBefore = { ...g.s.campaignMemory.nightlyActivity };
  g.command({ type: "sleep" });
  // The réparation reveal itself never adds a second write on top of C5.1/C5.2/C5.3's own
  // recordRest/recordNightlyActivity/decreaseOverexertion calls, already exercised elsewhere —
  // only campaignMemory.persistentGestureIds and campaignFlags may have grown from this test.
  assert.equal(
    g.s.campaignMemory.overexertion[rainelle.id],
    0,
    "overexertion moved only by C5.3's own decrease, not by anything C5.7 adds",
  );
  assert.equal(g.s.campaignMemory.rest[rainelle.id], (restBefore[rainelle.id] || 0) + 1);
  assert.equal(
    g.s.campaignMemory.nightlyActivity[rainelle.id] || 0,
    nightlyBefore[rainelle.id] || 0,
  );
});

test("Narrative.TEXTS carries the C5.7 entry with a factual, non-accusatory, non-congratulatory tone (design §11)", () => {
  const repair = Narrative.TEXTS["geste-qui-sarrete"];
  assert.ok(repair);
  assert.equal(repair.trigger, "persistentGestureRepaired");
  assert.doesNotMatch(
    repair.text.toLowerCase(),
    /tu devrais|ta faute|coupable|tu as mal|bravo|félicitations|tu as réparé|pardon/,
  );
});
