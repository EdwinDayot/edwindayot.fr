// Epic C2.5v-b (docs/campagne-backlog.md) — programmatic audit of the teaching trajectory
// rendering module, in the spirit of tests/campaign-station-render.cjs:
// public/game/render-campaign-teaching.js has no DOM/GardenTerrain dependency, so it is required
// directly against public/vendor/three.min.js, no Playwright/canvas needed for these checks.
const { test } = require("node:test");
const assert = require("node:assert/strict");

global.THREE = require("../public/vendor/three.min.js");
const RenderTeaching = require("../public/game/render-campaign-teaching.js");

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

test("builds one tile per cell, only finite vertex positions", () => {
  const cells = [
    { x: 0, y: 0.02, z: 0 },
    { x: 0.5, y: 0.03, z: 0 },
    { x: 1, y: 0.04, z: 0 },
  ];
  const group = RenderTeaching.buildTrajectoryOverlayGroup(cells);
  let meshCount = 0;
  group.traverse((o) => {
    if (o.isMesh) meshCount++;
  });
  assert.equal(meshCount, cells.length);
  assert.ok(allFinite(group), "non-finite vertex position found");
});

test("empty cell list builds an empty, harmless group", () => {
  const group = RenderTeaching.buildTrajectoryOverlayGroup([]);
  let meshCount = 0;
  group.traverse((o) => {
    if (o.isMesh) meshCount++;
  });
  assert.equal(meshCount, 0);
});

test("material is the documented, already-whitelisted 'survol de portée' family — never metallic, opacity within the audit's ceiling", () => {
  const group = RenderTeaching.buildTrajectoryOverlayGroup([{ x: 0, y: 0, z: 0 }]);
  const materials = collectMaterials(group);
  assert.equal(materials.length, 1, "expected a single shared material instance");
  const [m] = materials;
  assert.equal(m.metalness, 0, "unexpected metalness");
  assert.equal(
    m.color.getHex(),
    RenderTeaching.TRAJECTORY_COLOR,
    "must reuse the exact documented 0x6d9365 hex, not an invented tint",
  );
  assert.equal(m.transparent, true);
  // tests/garden-material-audit.cjs's TRANSPARENT_ALLOWLIST caps this exact color at 0.15 —
  // staying under it is what lets this module reuse that entry instead of adding a new one.
  assert.ok(
    m.opacity <= 0.15,
    `opacity ${m.opacity} exceeds the audit's documented ceiling (0.15) for color 6d9365`,
  );
  assert.equal(RenderTeaching.TRAJECTORY_OPACITY, m.opacity);
});

test("tiles are flat (rotated to lie on the ground) and positioned at the given world coordinates", () => {
  const group = RenderTeaching.buildTrajectoryOverlayGroup([{ x: 3, y: 0.1, z: -2 }]);
  const tile = group.children[0];
  assert.equal(tile.rotation.x, -Math.PI / 2);
  assert.deepEqual(tile.position.toArray(), [3, 0.1, -2]);
  assert.equal(tile.castShadow, false, "a preview overlay must never cast a shadow");
});
