// Epic C6.14 (docs/campagne-backlog.md) — programmatic audit of the chapter-17 passage rendering
// module, in the spirit of tests/campaign-house-render.cjs: public/game/render-campaign-passage.js
// has no DOM dependency, so it is required directly against public/vendor/three.min.js, no
// Playwright/canvas needed for these checks.
const { test } = require("node:test");
const assert = require("node:assert/strict");

global.THREE = require("../public/vendor/three.min.js");
const RenderPassage = require("../public/game/render-campaign-passage.js");

function allFinite(group) {
  let ok = true;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) ok = false;
  });
  return ok;
}

function collectMaterials(group) {
  const seen = new Map();
  group.traverse((o) => {
    if (o.isMesh && !seen.has(o.material.uuid)) seen.set(o.material.uuid, o.material);
  });
  return [...seen.values()];
}

test("a blocked passage builds without throwing and is marked blocked", () => {
  const group = RenderPassage.buildPassageGroup(true);
  assert.equal(group.userData.blocked, true);
  assert.ok(allFinite(group), "non-finite vertex position found");
});

test("an open (franchissable) passage builds without throwing and is marked not blocked", () => {
  const group = RenderPassage.buildPassageGroup(false);
  assert.equal(group.userData.blocked, false);
  assert.ok(allFinite(group), "non-finite vertex position found");
});

test("blocked and open states are visually distinct: mesh count and materials differ", () => {
  const blocked = RenderPassage.buildPassageGroup(true);
  const open = RenderPassage.buildPassageGroup(false);
  let blockedMeshCount = 0,
    openMeshCount = 0;
  blocked.traverse((o) => o.isMesh && blockedMeshCount++);
  open.traverse((o) => o.isMesh && openMeshCount++);
  assert.notEqual(blockedMeshCount, openMeshCount, "blocked/open should not share the exact same mesh count");
  const blockedHexes = new Set(collectMaterials(blocked).map((m) => m.color.getHex()));
  const openHexes = new Set(collectMaterials(open).map((m) => m.color.getHex()));
  assert.ok(
    ![...openHexes].every((h) => blockedHexes.has(h)),
    "the open state must introduce at least one color the blocked state never uses (the eau family)",
  );
  assert.ok(openHexes.has(RenderPassage.WATER), "open state should use the documented eau color");
  assert.ok(blockedHexes.has(RenderPassage.BARK) || blockedHexes.has(RenderPassage.BARK_DARK), "blocked state should use a documented bois color");
});

test("no material is metallic or transparent; roughness matches documented conventions", () => {
  for (const group of [RenderPassage.buildPassageGroup(true), RenderPassage.buildPassageGroup(false)]) {
    for (const m of collectMaterials(group)) {
      assert.equal(m.metalness, 0, `unexpected metalness on ${m.uuid}`);
      assert.equal(m.transparent, false, `unexpected transparency on ${m.uuid} — this module documents fully opaque materials`);
      const isWater = m.color.getHex() === RenderPassage.WATER || m.color.getHex() === RenderPassage.WATER_SHALLOW;
      assert.equal(
        m.roughness,
        isWater ? RenderPassage.WATER_ROUGHNESS : 0.72,
        `unexpected roughness on ${m.uuid} (0x${m.color.getHexString()})`,
      );
    }
  }
});

test("every color used is one of the exact hex values direction-artistique.md documents for terre/bois/eau", () => {
  const documentedHexes = new Set([
    0xb99875, // terre
    0xb99670, // bois/écorce (bark)
    0x785a3e, // bois/écorce (bark dark)
    0x80c3c3, // eau
    0x9acfd3, // eau (shallow)
  ]);
  for (const group of [RenderPassage.buildPassageGroup(true), RenderPassage.buildPassageGroup(false)]) {
    for (const m of collectMaterials(group)) {
      assert.ok(documentedHexes.has(m.color.getHex()), `color 0x${m.color.getHexString()} is not one of the documented terre/bois/eau hexes`);
    }
  }
});

test("no emissive material is introduced in either state", () => {
  for (const group of [RenderPassage.buildPassageGroup(true), RenderPassage.buildPassageGroup(false)]) {
    for (const m of collectMaterials(group)) {
      assert.equal(m.emissive.getHex(), 0, `unexpected emissive color on ${m.uuid} — this module documents no signal/light source`);
    }
  }
});

test("two groups built from the same state are geometrically identical but distinct Group instances (deterministic, no randomness)", () => {
  const a = RenderPassage.buildPassageGroup(true);
  const b = RenderPassage.buildPassageGroup(true);
  assert.notEqual(a, b);
  assert.equal(a.children.length, b.children.length);
  const posA = [];
  a.traverse((o) => o.isMesh && posA.push(o.position.toArray()));
  const posB = [];
  b.traverse((o) => o.isMesh && posB.push(o.position.toArray()));
  assert.deepEqual(posA, posB);
});
