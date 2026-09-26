// Epic C7.4 (docs/campagne-backlog.md) — programmatic audit of the persistent specimen rendering
// registry, in the spirit of tests/campaign-station-render.cjs/campaign-rainelle-render.cjs:
// public/game/render-specimens.js has no DOM dependency, so its syncSpecimenModels function is
// required directly against public/vendor/three.min.js, no Playwright/canvas needed here — the
// live scene-graph wiring itself (real render-flow.js sync(), real v.specimenModels) is the
// separate concern tests/garden-material-audit.cjs's own extension covers.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");

global.THREE = require("../public/vendor/three.min.js");
const RenderSpecimens = require("../public/game/render-specimens.js");
const Cultivars = require("../public/game/cultivars.js");
const Terrain = require("../public/game/terrain.js");
const Genetics = require("../public/game/botany-genetics.js");

// A real founder's trait shape (port/feuilles/fleurs/palette/humidite/fonction) — buildSpecimenGroup
// (botany-hybrids.js) reads traits.palette.dominante1/2 and traits.feuilles.forme/taille directly,
// so an empty {} traits object (fine for the pure specimenStage math tests elsewhere) would throw
// here; this module is exercised through the real rendering path, not just the schema.
function makeCultivar(g, founderId = "oreille-de-pluie") {
  const founder = Genetics.founders.find((f) => f.id === founderId);
  return Cultivars.createCultivar(g.s, { name: founder.name, traits: founder.traits });
}

test("a new specimen gets a Group built, added to the scene, and positioned at (x, terrainHeight(x,z), z)", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 3, z: -2, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);

  assert.equal(registry.size, 1);
  const sm = registry.get(sp.id);
  assert.ok(sm, "expected a registry entry for the new specimen");
  assert.equal(sm.group.parent, scene, "the Group must be added to the real scene");
  assert.deepEqual(
    sm.group.position.toArray(),
    [3, Terrain.terrainHeight(3, -2), -2],
    "Group position must match (specimen.x, terrainHeight(x,z), specimen.z)",
  );
});

test("an unchanged specimen keeps the exact same Group instance across two syncs (never rebuilt without a real change)", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: 0 });
  const scene = new THREE.Group();
  const registry = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);
  const first = registry.get(sp.id).group;
  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);
  const second = registry.get(sp.id).group;

  assert.equal(first, second, "the Group instance must be reused when nothing changed");
  assert.equal(scene.children.length, 1, "no duplicate Group must have been added");
});

test("a specimen whose derived stage changes gets its Group entirely rebuilt, never mutated in place", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignDay = 15; // past printemps (C7.3), so the ordinary STAGE_DURATION applies below
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 1, z: 1 });
  assert.equal(sp.plantedSeason, "ete");
  const scene = new THREE.Group();
  const registry = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);
  const before = registry.get(sp.id).group;
  assert.equal(before.userData.stage, 0);

  // Cross the stage 0 -> 1 boundary.
  g.s.elapsed = sp.plantedAt + Cultivars.STAGE_DURATION_ELAPSED_SECONDS;
  assert.equal(Cultivars.specimenStage(g.s, sp), 1);
  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);
  const after = registry.get(sp.id).group;

  assert.notEqual(before, after, "the Group must be a new instance after a stage change");
  assert.equal(after.userData.stage, 1);
  assert.equal(before.parent, null, "the stale Group must have been removed from the scene");
  assert.equal(after.parent, scene, "the rebuilt Group must be in the real scene");
  assert.equal(scene.children.length, 1, "exactly one Group must remain for this specimen");
});

test("a specimen delivered via the real deliverContract command disappears from the registry and the scene", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 2, z: 2, stage: Cultivars.MATURE_STAGE });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 4, z: 4, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);
  assert.equal(registry.size, 2);

  const signed = g.command({ type: "signContract", cultivarId: cv.id, quota: 1, pricePerUnit: 10 });
  assert.ok(!signed.error, signed.error);
  const contractId = g.s.campaignContracts[0].id;
  const delivered = g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.ok(!delivered.error, delivered.error);
  assert.equal(g.s.specimens.length, 1, "exactly one specimen must have been delivered away");

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);

  assert.equal(registry.size, 1, "the delivered specimen's registry entry must be gone");
  assert.equal(scene.children.length, 1, "the delivered specimen's Group must be removed from the scene");
  assert.ok(registry.get(sp2.id), "the remaining specimen must still be registered");
});

test("a specimen whose cultivar cannot be resolved yet is skipped, never throws", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
  sp.cultivarId = "cv-does-not-exist";
  const scene = new THREE.Group();
  const registry = new Map();

  assert.doesNotThrow(() => RenderSpecimens.syncSpecimenModels(registry, scene, g.s));
  assert.equal(registry.size, 0);
  assert.equal(scene.children.length, 0);
});

test("two specimens of the same cultivar at the same stage share organ geometry/material objects (no duplication)", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "menthe-de-velours");
  const spA = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  const spB = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 6, z: 6, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);

  const groupA = registry.get(spA.id).group;
  const groupB = registry.get(spB.id).group;
  const leafA = groupA.userData.organs.find((o) => o.kind === "leaf");
  const leafB = groupB.userData.organs.find((o) => o.kind === "leaf");
  const meshA = leafA.branch.children.find((c) => c.isMesh) || leafA.branch.children[0].children?.[0];
  const meshB = leafB.branch.children.find((c) => c.isMesh) || leafB.branch.children[0].children?.[0];
  assert.ok(meshA && meshB, "expected at least one mesh under each specimen's leaf organ");
  assert.equal(meshA.geometry, meshB.geometry, "leaf geometry must be the identical object");
  assert.equal(meshA.material, meshB.material, "leaf material must be the identical object");
});

test("no mesh in a synced specimen Group has a non-finite vertex position", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g);
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: -8, z: 9, stage: 1 });
  const scene = new THREE.Group();
  const registry = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);

  let ok = true;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) ok = false;
  });
  assert.ok(ok, "non-finite vertex position found in a synced specimen Group");
});
