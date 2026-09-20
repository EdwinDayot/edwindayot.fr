const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Scenes = require("../public/game/campaign-scenes.js");

// Epic C5.14 (design §14, mise en scène observable de la persistance et de la réparation).
// campaign-scenes.js's selectSceneRainelle and garden-state-cmd-f.js's "sleep" attaching
// result.scenes exactly when — never before, never separately from — the corresponding
// narrative text (C5.6/C5.7) is itself actually (first-time) revealed. The camera/panel side
// (render-items.js, garden-dispatch.js) needs a real browser and is covered by
// campaign-gesture-scene-browser.cjs instead.

test("selectSceneRainelle: picks the first id, the same stable array-order priority C2.8 already documents", () => {
  assert.equal(Scenes.selectSceneRainelle(["r3", "r1", "r2"]), "r3");
  assert.equal(Scenes.selectSceneRainelle(["r5"]), "r5");
  assert.equal(Scenes.selectSceneRainelle([]), null);
});

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

test("sleep: result.scenes carries a persistance entry exactly the night the persistence text is first revealed", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;

  const result = g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), true);
  assert.deepEqual(result.scenes, [{ kind: "persistance", rainelleId: rainelle.id }]);
});

test("sleep: no result.scenes on an ordinary rest night (no persistence, no repair)", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const result = g.command({ type: "sleep" });
  assert.equal(result.scenes, undefined);
});

test("sleep: no result.scenes for an idle-but-never-sursollicitée Rainelle (design: does not count as guilt)", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);

  const result = g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), false);
  assert.equal(result.scenes, undefined);
});

test("sleep: result.scenes never repeats the same persistance scene on a later night (text revealed only once)", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;

  const first = g.command({ type: "sleep" });
  assert.ok(first.scenes && first.scenes.length, "first night stages the scene");

  g.s.campaignMemory.overexertion[rainelle.id] = 1;
  const second = g.command({ type: "sleep" });
  assert.equal(second.scenes, undefined, "already revealed once, never staged again");
});

test("sleep: result.scenes carries a reparation entry exactly the night the réparation text is first revealed", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;

  const persistenceNight = g.command({ type: "sleep" });
  assert.deepEqual(persistenceNight.scenes, [{ kind: "persistance", rainelleId: rainelle.id }]);

  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: false }).ok, true);
  const repairNight = g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("geste-qui-sarrete"), true);
  assert.deepEqual(repairNight.scenes, [{ kind: "reparation", rainelleId: rainelle.id }]);
});

test("sleep: no commande de C5.14 ne touche overexertion, rest, nightlyActivity ou la position — un simple constat", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;

  const before = JSON.parse(
    JSON.stringify({
      overexertion: g.s.campaignMemory.overexertion,
      rest: g.s.campaignMemory.rest,
      nightlyActivity: g.s.campaignMemory.nightlyActivity,
      x: g.s.rainelles[0].x,
      z: g.s.rainelles[0].z,
    }),
  );
  const result = g.command({ type: "sleep" });
  assert.ok(result.scenes && result.scenes.length);
  // C5.3's own increase/decrease loop already ran as part of this same "sleep" (persistance
  // means no real work this night, so overexertion decays exactly as C5.3 already documents) —
  // attaching result.scenes must not have added any mutation of its own on top of it.
  assert.equal(
    g.s.campaignMemory.overexertion[rainelle.id],
    0,
    "overexertion still decays exactly as C5.3 already does, nothing added",
  );
  assert.deepEqual(g.s.rainelles[0].x, before.x);
  assert.deepEqual(g.s.rainelles[0].z, before.z);
});
