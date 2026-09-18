// Epic C3.2 (docs/campagne-backlog.md) — programmatic audit of the refuge house rendering
// module, in the spirit of tests/campaign-hybrids-render.cjs: public/game/render-campaign-house.js
// has no DOM dependency, so it is required directly against public/vendor/three.min.js, no
// Playwright/canvas needed for these checks.
const { test } = require("node:test");
const assert = require("node:assert/strict");

global.THREE = require("../public/vendor/three.min.js");
const RenderHouse = require("../public/game/render-campaign-house.js");
const House = require("../public/game/campaign-house.js");

function repairedHouse() {
  const h = House.freshHouse();
  h.spaces.accueil.status = "repare";
  return h;
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

test("a fresh house (accueil delabre) builds without throwing and is marked not repaired", () => {
  const group = RenderHouse.buildRefugeHouseGroup(House.freshHouse());
  assert.equal(group.userData.repaired, false);
  assert.ok(allFinite(group), "non-finite vertex position found");
});

test("a house with accueil repaired builds and is marked repaired", () => {
  const group = RenderHouse.buildRefugeHouseGroup(repairedHouse());
  assert.equal(group.userData.repaired, true);
  assert.ok(allFinite(group), "non-finite vertex position found");
});

test("repaired and delabre states are visually distinct: roof panel count and door style differ", () => {
  const delabre = RenderHouse.buildRefugeHouseGroup(House.freshHouse());
  const repare = RenderHouse.buildRefugeHouseGroup(repairedHouse());
  assert.notEqual(delabre.userData.roofPanelCount, repare.userData.roofPanelCount);
  assert.equal(delabre.userData.roofPanelCount, 1, "delabre house should have exactly one intact roof panel");
  assert.equal(repare.userData.roofPanelCount, 2, "repaired house should have exactly two intact roof panels");
  assert.notEqual(delabre.userData.doorStyle, repare.userData.doorStyle);
  assert.equal(delabre.userData.doorStyle, "boarded");
  assert.equal(repare.userData.doorStyle, "closed");
});

test("no material is metallic; roughness matches the existing house convention (render.js's own stone/bark materials)", () => {
  for (const house of [House.freshHouse(), repairedHouse()]) {
    const group = RenderHouse.buildRefugeHouseGroup(house);
    for (const m of collectMaterials(group)) {
      assert.equal(m.metalness, 0, `unexpected metalness on ${m.uuid}`);
      assert.equal(m.roughness, 0.72, `unexpected roughness on ${m.uuid} (existing houses' stone/bark materials all use 0.72, render.js)`);
    }
  }
});

test("every wall/quoin/roof color used is one of the exact hex values render.js/render-houses.js already use for every existing house", () => {
  const existingHouseHexes = new Set([
    0xc5c5b2, // stone
    0x8f8a76, // stoneDark
    0xa9afa2, // stoneMid (quoins' alternate tone in render-houses.js)
    0x8a7156, // bark
    0x6b5540, // bark dark / trim
    0x5c4632, // roof, default
    0xeedeb9, // cream
  ]);
  for (const house of [House.freshHouse(), repairedHouse()]) {
    const group = RenderHouse.buildRefugeHouseGroup(house);
    for (const m of collectMaterials(group)) {
      assert.ok(existingHouseHexes.has(m.color.getHex()), `color 0x${m.color.getHexString()} is not one of the documented existing house hexes`);
    }
  }
});

test("two houses built from the same status are geometrically identical but distinct Group instances (deterministic, no randomness)", () => {
  const a = RenderHouse.buildRefugeHouseGroup(House.freshHouse());
  const b = RenderHouse.buildRefugeHouseGroup(House.freshHouse());
  assert.notEqual(a, b);
  assert.equal(a.children.length, b.children.length);
  const posA = [];
  a.traverse((o) => o.isMesh && posA.push(o.position.toArray()));
  const posB = [];
  b.traverse((o) => o.isMesh && posB.push(o.position.toArray()));
  assert.deepEqual(posA, posB);
});

test("gable end geometry follows the roof pitch exactly, same technique as render-houses.js's gableGeometry", () => {
  const group = RenderHouse.buildRefugeHouseGroup(repairedHouse());
  const w2 = RenderHouse.HOUSE_W / 2;
  let gableMesh = null;
  group.traverse((o) => {
    if (o.isMesh && Math.abs(o.position.x - w2) < 1e-9 && o.geometry.attributes.position.count === 6) gableMesh = o;
  });
  assert.ok(gableMesh, "expected a 6-vertex gable mesh at x = +HOUSE_W/2");
  const pos = gableMesh.geometry.attributes.position;
  const ys = [];
  for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i));
  const near = (a, b) => Math.abs(a - b) < 1e-4; // Float32Array storage, not exact double equality
  assert.ok(ys.some((y) => near(y, RenderHouse.ROOF_H)), "gable must reach the ridge height exactly");
  assert.equal(ys.filter((y) => near(y, RenderHouse.WALL_H)).length, 4, "four of the six gable vertices sit at eave height");
});
