// Epic C7.22 (docs/campagne-backlog.md) — programmatic integration test for
// render-stations-sync.js's syncStationModels, replaying the real sync loop twice against a real
// `relocateStation` command (GardenState.command(), never a direct registry write) — in the
// spirit of tests/campaign-specimen-render.cjs (C7.4) for the same class of defect ("the rule is
// proven, its rendering is stale"). The second test below is the one that fails before this
// epic's render-flow.js/render-stations-sync.js fix and passes after: before the fix, a
// relocated station's cached Group was never repositioned by a resync.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");

global.THREE = require("../public/vendor/three.min.js");
const RenderStationsSync = require("../public/game/render-stations-sync.js");
const Stations = require("../public/game/campaign-stations.js");
const Terrain = require("../public/game/terrain.js");

test("a newly registered station gets a Group built, added to the scene, and positioned at (x, terrainHeight(x,z), z) — non-regression of C5.13", () => {
  const g = new GardenState(null, 1000);
  const station = Stations.registerStation(g.s.campaignStations, "borne", { x: 3, z: -2 });
  const scene = new THREE.Group();
  const stationModels = new Map();

  const result = RenderStationsSync.syncStationModels(stationModels, scene, g.s);

  assert.equal(stationModels.size, 1);
  assert.equal(result.batchDirty, true, "a brand-new station must mark batchDirty");
  const sm = stationModels.get(station.id);
  assert.ok(sm, "expected a registry entry for the new station");
  assert.equal(sm.group.parent, scene, "the Group must be added to the real scene");
  assert.deepEqual(sm.group.position.toArray(), [3, Terrain.terrainHeight(3, -2), -2]);
});

test("relocateStation applied then a resync moves group.position to the new (x, terrainHeight(x,z), z)", () => {
  const g = new GardenState(null, 1000);
  const station = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const scene = new THREE.Group();
  const stationModels = new Map();

  RenderStationsSync.syncStationModels(stationModels, scene, g.s);
  const before = stationModels.get(station.id).group.position.toArray();
  assert.deepEqual(before, [0, Terrain.terrainHeight(0, 0), 0]);

  const relocated = g.command({ type: "relocateStation", id: station.id, x: 9, z: -6 });
  assert.equal(relocated.ok, true, relocated.message);

  RenderStationsSync.syncStationModels(stationModels, scene, g.s);
  const after = stationModels.get(station.id).group.position.toArray();
  assert.deepEqual(
    after,
    [9, Terrain.terrainHeight(9, -6), -6],
    "the Group must reflect the station's new position after a real relocateStation command + resync",
  );
});

test("the same Group (identity) is reused after a relocation — never a rebuild, never remove+re-add", () => {
  const g = new GardenState(null, 1000);
  const station = Stations.registerStation(g.s.campaignStations, "zone", { x: 1, z: 1 });
  const scene = new THREE.Group();
  const stationModels = new Map();

  RenderStationsSync.syncStationModels(stationModels, scene, g.s);
  const groupBefore = stationModels.get(station.id).group;
  const sceneCountBefore = scene.children.length;

  const relocated = g.command({ type: "relocateStation", id: station.id, x: 5, z: 5 });
  assert.equal(relocated.ok, true, relocated.message);
  const result = RenderStationsSync.syncStationModels(stationModels, scene, g.s);

  const groupAfter = stationModels.get(station.id).group;
  assert.equal(groupAfter, groupBefore, "relocateStation must never cause a rebuild of the Group");
  assert.equal(scene.children.length, sceneCountBefore, "no Group must be added or removed for a plain move");
  assert.equal(result.batchDirty, false, "a plain reposition must never set batchDirty (no Group added/removed)");
});

test("a resync with no further change moves neither group.position nor the scene's child count (no-op)", () => {
  const g = new GardenState(null, 1000);
  const station = Stations.registerStation(g.s.campaignStations, "panier", { x: 2, z: 2 });
  const scene = new THREE.Group();
  const stationModels = new Map();

  RenderStationsSync.syncStationModels(stationModels, scene, g.s);
  const group = stationModels.get(station.id).group;
  const positionBefore = group.position.toArray();
  const sceneCountBefore = scene.children.length;

  const result = RenderStationsSync.syncStationModels(stationModels, scene, g.s);

  assert.deepEqual(group.position.toArray(), positionBefore, "an unchanged station must not move its Group");
  assert.equal(scene.children.length, sceneCountBefore);
  assert.equal(result.batchDirty, false);
});

test("a habitat, never relocatable (C7.18), keeps its Group at its original position when relocateStation is refused", () => {
  const g = new GardenState(null, 1000);
  const station = Stations.registerStation(g.s.campaignStations, "habitat", { x: 4, z: 4, capacity: 2 });
  const scene = new THREE.Group();
  const stationModels = new Map();

  RenderStationsSync.syncStationModels(stationModels, scene, g.s);
  const relocated = g.command({ type: "relocateStation", id: station.id, x: 10, z: 10 });
  assert.equal(relocated.ok, false, "relocating a habitat must be refused");

  RenderStationsSync.syncStationModels(stationModels, scene, g.s);
  assert.deepEqual(stationModels.get(station.id).group.position.toArray(), [4, Terrain.terrainHeight(4, 4), 4]);
});
