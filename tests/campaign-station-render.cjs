// Epic C5.13 (docs/campagne-backlog.md) — programmatic audit of the campaign stations rendering
// module, in the spirit of tests/campaign-house-render.cjs/campaign-rainelle-render.cjs:
// public/game/render-campaign-stations.js has no DOM dependency, so it is required directly
// against public/vendor/three.min.js, no Playwright/canvas needed for these checks.
const { test } = require("node:test");
const assert = require("node:assert/strict");

global.THREE = require("../public/vendor/three.min.js");
const RenderStations = require("../public/game/render-campaign-stations.js");
const Stations = require("../public/game/campaign-stations.js");

function freshRegistry() {
  return { bornes: [], zones: [], paniers: [], borneNextId: 1, zoneNextId: 1, panierNextId: 1, habitats: [], habitatNextId: 1 };
}

function collectMaterials(group) {
  const seen = new Map();
  group.traverse((o) => {
    if (o.isMesh && !seen.has(o.material.uuid)) seen.set(o.material.uuid, o.material);
  });
  return [...seen.values()];
}

function allFinite(group) {
  let ok = true;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) ok = false;
  });
  return ok;
}

for (const kind of ["borne", "zone", "panier", "habitat"]) {
  test(`${kind}: builds without throwing, only finite vertex positions`, () => {
    const registry = freshRegistry();
    const station = Stations.registerStation(registry, kind, { x: 1, z: 2, capacity: kind === "habitat" ? 2 : undefined });
    const group = RenderStations.buildStationGroup(kind, station);
    assert.ok(allFinite(group), "non-finite vertex position found");
  });

  test(`${kind}: no material is metallic, every color is one of the documented existing families`, () => {
    const documentedHexes = new Set([
      RenderStations.STONE,
      RenderStations.STONE_DARK,
      RenderStations.STONE_MID,
      RenderStations.BARK,
      RenderStations.BARK_DARK,
      RenderStations.ROOF_WOOD,
      RenderStations.TERRE,
      RenderStations.WATER,
      RenderStations.FLOW_COLOR,
      RenderStations.VEILLEUSE_COLOR,
    ]);
    const registry = freshRegistry();
    const station = Stations.registerStation(registry, kind, { x: 0, z: 0, capacity: kind === "habitat" ? 2 : undefined });
    const group = RenderStations.buildStationGroup(kind, station);
    for (const m of collectMaterials(group)) {
      assert.equal(m.metalness, 0, `unexpected metalness on ${m.uuid}`);
      assert.ok(documentedHexes.has(m.color.getHex()), `color 0x${m.color.getHexString()} is not one of the documented families`);
    }
  });
}

test("two stations of the same kind and state are geometrically identical but distinct Group instances", () => {
  const registry = freshRegistry();
  const a = Stations.registerStation(registry, "panier", { x: 0, z: 0 });
  const b = Stations.registerStation(registry, "panier", { x: 5, z: 5 });
  const groupA = RenderStations.buildStationGroup("panier", a);
  const groupB = RenderStations.buildStationGroup("panier", b);
  assert.notEqual(groupA, groupB);
  assert.equal(groupA.children.length, groupB.children.length);
  const posA = [];
  groupA.traverse((o) => o.isMesh && posA.push(o.position.toArray()));
  const posB = [];
  groupB.traverse((o) => o.isMesh && posB.push(o.position.toArray()));
  assert.deepEqual(posA, posB);
});

test("a borne's water bead is emissive only when priseFortDebit is true, never a real light source", () => {
  const registry = freshRegistry();
  const off = Stations.registerStation(registry, "borne", { x: 0, z: 0 });
  const groupOff = RenderStations.buildStationGroup("borne", off);
  // MeshStandardMaterial's own default emissiveIntensity is 1, not 0 — an inactive material is
  // only ever non-emissive because its `emissive` color itself is left at the default black
  // (0x000000), so "intensity × black" always renders as no glow regardless of the intensity
  // value. The real, meaningful check is the emissive COLOR, not the intensity number alone.
  assert.equal(groupOff.userData.bead.material.emissive.getHex(), 0, "an inactive borne must not carry an emissive color");
  let lightFound = false;
  groupOff.traverse((o) => {
    if (o.isLight) lightFound = true;
  });
  assert.equal(lightFound, false, "a station must never add a real THREE.Light (see this test's own header/direction-artistique.md's light budget)");

  const on = Stations.registerStation(registry, "borne", { x: 1, z: 1 });
  on.priseFortDebit = true;
  const groupOn = RenderStations.buildStationGroup("borne", on);
  assert.equal(groupOn.userData.bead.material.color.getHex(), RenderStations.FLOW_COLOR);
  assert.equal(groupOn.userData.bead.material.emissive.getHex(), RenderStations.FLOW_EMISSIVE);
  assert.equal(groupOn.userData.bead.material.emissiveIntensity, RenderStations.SIGNAL_INTENSITY);
});

test("a zone's lamp is emissive only when veilleuse is true, never a real light source", () => {
  const registry = freshRegistry();
  const off = Stations.registerStation(registry, "zone", { x: 0, z: 0 });
  const groupOff = RenderStations.buildStationGroup("zone", off);
  assert.equal(groupOff.userData.lamp.material.emissive.getHex(), 0, "an inactive zone must not carry an emissive color");
  let lightFound = false;
  groupOff.traverse((o) => {
    if (o.isLight) lightFound = true;
  });
  assert.equal(lightFound, false, "a station must never add a real THREE.Light");

  const on = Stations.registerStation(registry, "zone", { x: 1, z: 1 });
  on.veilleuse = true;
  const groupOn = RenderStations.buildStationGroup("zone", on);
  assert.equal(groupOn.userData.lamp.material.color.getHex(), RenderStations.VEILLEUSE_COLOR);
  assert.equal(groupOn.userData.lamp.material.emissive.getHex(), RenderStations.VEILLEUSE_EMISSIVE);
  assert.equal(groupOn.userData.lamp.material.emissiveIntensity, RenderStations.SIGNAL_INTENSITY);
});

test("updateStationGroup swaps a borne's bead material only when priseFortDebit actually changes, is a no-op otherwise", () => {
  const registry = freshRegistry();
  const station = Stations.registerStation(registry, "borne", { x: 0, z: 0 });
  const group = RenderStations.buildStationGroup("borne", station);
  const beadOff = group.userData.bead.material;
  RenderStations.updateStationGroup("borne", station, group);
  assert.equal(group.userData.bead.material, beadOff, "no-op call must not swap the material");

  station.priseFortDebit = true;
  RenderStations.updateStationGroup("borne", station, group);
  assert.notEqual(group.userData.bead.material, beadOff, "a real change must swap the material");
  const beadOn = group.userData.bead.material;
  assert.equal(beadOn.emissiveIntensity, RenderStations.SIGNAL_INTENSITY);

  station.priseFortDebit = false;
  RenderStations.updateStationGroup("borne", station, group);
  assert.equal(group.userData.bead.material, beadOff, "must fall back to the exact cached inactive material when the flag clears");
});

test("updateStationGroup swaps a zone's lamp material only when veilleuse actually changes, is a no-op otherwise", () => {
  const registry = freshRegistry();
  const station = Stations.registerStation(registry, "zone", { x: 0, z: 0 });
  const group = RenderStations.buildStationGroup("zone", station);
  const lampOff = group.userData.lamp.material;
  RenderStations.updateStationGroup("zone", station, group);
  assert.equal(group.userData.lamp.material, lampOff, "no-op call must not swap the material");

  station.veilleuse = true;
  RenderStations.updateStationGroup("zone", station, group);
  assert.notEqual(group.userData.lamp.material, lampOff, "a real change must swap the material");

  station.veilleuse = false;
  RenderStations.updateStationGroup("zone", station, group);
  assert.equal(group.userData.lamp.material, lampOff, "must fall back to the exact cached inactive material when the flag clears");
});

test("updateStationGroup is a no-op for panier/habitat (no mutable renderable state on those kinds)", () => {
  const registry = freshRegistry();
  for (const kind of ["panier", "habitat"]) {
    const station = Stations.registerStation(registry, kind, { x: 0, z: 0, capacity: kind === "habitat" ? 2 : undefined });
    const group = RenderStations.buildStationGroup(kind, station);
    const before = JSON.stringify(collectMaterials(group).map((m) => m.uuid));
    RenderStations.updateStationGroup(kind, station, group);
    const after = JSON.stringify(collectMaterials(group).map((m) => m.uuid));
    assert.equal(before, after);
  }
});

test("the four kinds are visually distinct: no two kinds share the exact same mesh-count/bounding-box silhouette", () => {
  const registry = freshRegistry();
  const seen = [];
  for (const kind of ["borne", "zone", "panier", "habitat"]) {
    const station = Stations.registerStation(registry, kind, { x: 0, z: 0, capacity: kind === "habitat" ? 2 : undefined });
    const group = RenderStations.buildStationGroup(kind, station);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    seen.push({ kind, meshCount: 0, size: [size.x, size.y, size.z] });
    group.traverse((o) => {
      if (o.isMesh) seen[seen.length - 1].meshCount++;
    });
  }
  const signatures = seen.map((s) => `${s.meshCount}:${s.size.map((n) => n.toFixed(2)).join(",")}`);
  assert.equal(new Set(signatures).size, signatures.length, "two station kinds must never produce the same silhouette: " + JSON.stringify(seen));
});

test("an unknown station kind throws explicitly rather than returning a silent empty group", () => {
  assert.throws(() => RenderStations.buildStationGroup("presentoir", { x: 0, z: 0 }));
});
