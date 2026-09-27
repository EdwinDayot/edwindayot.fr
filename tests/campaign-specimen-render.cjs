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
const Hybrids = require("../public/game/botany-hybrids.js");

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

// Epic C7.9 — stem pooling. "clochette-du-soir" has port "tige-dressee" (a real stem);
// "oreille-de-pluie" (the default founder used by makeCultivar above) has port "rosette" (no stem
// at all, botany-hybrids.js's own buildSkeleton never builds one for it) — used below as the
// negative case.

test("omitting stemPools (3-argument call) leaves the stem mesh a normal child of the Group, unchanged from before this epic", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "clochette-du-soir");
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s);

  const [sm] = registry.values();
  const stemMesh = sm.group.userData.stemMesh;
  assert.ok(stemMesh, "expected a stemMesh for a tige-dressee specimen");
  assert.equal(stemMesh.parent, sm.group.children[0], "stem must still be nested under the Group's structure child");
  let instancedMeshCount = 0;
  scene.traverse((o) => {
    if (o.isInstancedMesh) instancedMeshCount++;
  });
  assert.equal(instancedMeshCount, 0, "no InstancedMesh must exist when stemPools is omitted");
});

test("with stemPools provided, a specimen's stem is detached from its Group and pooled into a shared InstancedMesh", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "clochette-du-soir");
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 5, z: -3, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools);

  const sm = registry.get(sp.id);
  assert.ok(sm.stemPool, "expected a stemPool recorded on the registry entry");
  assert.equal(sm.stemPool.mesh.isInstancedMesh, true);
  assert.equal(sm.stemPool.mesh.parent, scene, "the pool's InstancedMesh must be added to the real scene");
  assert.equal(sm.stemPool.mesh.count, 1, "exactly one active instance expected");

  let stemStillChild = false;
  sm.group.traverse((o) => {
    if (o === sm.group.userData.stemMesh) stemStillChild = true;
  });
  assert.equal(stemStillChild, false, "the stem Mesh must be detached from the specimen Group");
});

test("two specimens of the same cultivar and stage share exactly one stem pool", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "clochette-du-soir");
  const spA = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  const spB = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 10, z: 10, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools);

  const smA = registry.get(spA.id);
  const smB = registry.get(spB.id);
  assert.equal(smA.stemPool, smB.stemPool, "both specimens must share the identical pool object");
  assert.equal(smA.stemPool.mesh.count, 2, "the shared pool must hold exactly two active instances");
  let instancedMeshCount = 0;
  scene.traverse((o) => {
    if (o.isInstancedMesh) instancedMeshCount++;
  });
  assert.equal(instancedMeshCount, 1, "exactly one InstancedMesh must exist for this one (geometry, material) pair");
});

test("a rosette specimen (no stem) never touches stemPools", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "oreille-de-pluie");
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools);

  const sm = registry.get(sp.id);
  assert.equal(sm.stemPool, null, "a rosette specimen must never get a stemPool");
  assert.equal(stemPools.size, 0, "stemPools must stay empty when no specimen has a stem");
});

test("a stem instance is removed from its pool when the specimen is delivered away via the real deliverContract command", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "clochette-du-soir");
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 2, z: 2, stage: Cultivars.MATURE_STAGE });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 4, z: 4, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools);
  const pool = registry.get(sp2.id).stemPool;
  assert.equal(pool.mesh.count, 2);

  const signed = g.command({ type: "signContract", cultivarId: cv.id, quota: 1, pricePerUnit: 10 });
  assert.ok(!signed.error, signed.error);
  const contractId = g.s.campaignContracts[0].id;
  const delivered = g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.ok(!delivered.error, delivered.error);

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools);

  assert.equal(pool.mesh.count, 1, "exactly one active stem instance must remain after delivery");
  assert.ok(registry.get(sp2.id).stemPool, "the remaining specimen must keep its pooled stem instance");
});

test("a specimen's rebuilt Group on stage change re-registers the same stem pool (identical geometry/material) with size unchanged", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignDay = 15; // past printemps (C7.3), ordinary STAGE_DURATION applies
  const cv = makeCultivar(g, "clochette-du-soir");
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 1, z: 1 });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools);
  const poolBefore = registry.get(sp.id).stemPool;
  assert.equal(poolBefore.mesh.count, 1);

  g.s.elapsed = sp.plantedAt + Cultivars.STAGE_DURATION_ELAPSED_SECONDS;
  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools);
  const poolAfter = registry.get(sp.id).stemPool;

  assert.equal(poolAfter, poolBefore, "the same (geometry, material) pair must resolve to the same pool object");
  assert.equal(poolAfter.mesh.count, 1, "resolving to the same pool after a rebuild must not leak a phantom instance");
});

test("the pooled stem instance matrix encodes the specimen's world position and the Group's stage scale", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "clochette-du-soir");
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 7, z: -4, stage: 0 });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools);
  const sm = registry.get(sp.id);

  const m = new THREE.Matrix4();
  sm.stemPool.mesh.getMatrixAt(sm.stemPool.indexOf.get(sp.id), m);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(position, quaternion, scale);

  // Tolerance accounts for the InstancedMesh's instance matrix buffer being a Float32Array
  // (render-instances.js's set()/InstancedMesh storage) — one order of magnitude above the
  // float32 rounding this exact value (0.38) actually exhibits (~4.8e-9), never a loose bound
  // chosen to paper over a real defect.
  const EPS = 1e-7;
  assert.deepEqual(position.toArray(), sm.group.position.toArray());
  assert.ok(Math.abs(scale.x - sm.group.scale.x) < EPS);
  assert.ok(Math.abs(scale.y - sm.group.scale.x) < EPS);
  assert.ok(Math.abs(scale.z - sm.group.scale.x) < EPS);
});

// Epic C7.10 — organ pooling. "menthe-de-velours" (port "touffe", fleurs "epi"/"groupee") exercises
// the multi-Mesh-per-organ case on BOTH axes at once (a simple "ronde" leaf is one Mesh per organ,
// but its flower is a grouped épi — up to 4 spheres per branch * 3 branches = up to 12 Meshes for a
// single logical flower); "ronce-a-rubans" (port "grimpant", feuilles "palmee") exercises the other
// multi-Mesh case, a five-fingered leaf (5 Meshes per organ, no flowers at all on this founder) —
// between the two, every multi-Mesh organ shape named by this epic's criterion is exercised by a
// real specimen, synced through the real syncSpecimenModels. "oreille-de-pluie" (port "rosette",
// used by makeCultivar's default) stays the negative/simple case throughout, as it already was for
// C7.9's stem tests above.

test("omitting organPools (4-argument call, stemPools only) leaves every organ mesh a normal child of the Group, unchanged from before this epic", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "menthe-de-velours");
  Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools);

  const [sm] = registry.values();
  assert.equal(sm.organPools, null, "organPools must stay null on the registry entry when omitted");
  const organMeshes = sm.group.userData.organMeshes;
  assert.ok(organMeshes.length > 1, "expected several organ meshes for menthe-de-velours");
  for (const om of organMeshes) {
    let stillDescendant = false;
    sm.group.traverse((o) => {
      if (o === om.mesh) stillDescendant = true;
    });
    assert.ok(stillDescendant, "an organ mesh must still be a descendant of the Group when organPools is omitted");
  }
});

test("with organPools provided, a five-fingered palmate leaf's five Meshes are each detached and pooled", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "ronce-a-rubans");
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 3, z: -1, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();
  const organPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools, organPools);

  const sm = registry.get(sp.id);
  const organMeshes = sm.group.userData.organMeshes;
  assert.equal(organMeshes.length, sm.organPools.length, "organPools must have exactly one entry per organMeshes entry");
  // "grimpant" port, 9 attach points, one 5-fingered palmate leaf organ per attach point (no
  // flowers on this founder) — 45 total organ meshes.
  assert.equal(organMeshes.length, 45, "unexpected organ mesh count for ronce-a-rubans (palmate leaves, no flowers)");
  organMeshes.forEach((om) => {
    let stillDescendant = false;
    sm.group.traverse((o) => {
      if (o === om.mesh) stillDescendant = true;
    });
    assert.equal(stillDescendant, false, "every organ mesh must be detached from the specimen Group");
  });
  assert.equal(sm.organPools.every((p) => p != null), true, "every organ mesh must have landed in a real pool");
  // A single (geometry, material) pair — one leaf shape, one leaf colour — so every organ mesh
  // shares the exact same pool object.
  assert.ok(sm.organPools.every((p) => p === sm.organPools[0]), "all 45 palmate-leaf meshes must share the identical pool");
  assert.equal(sm.organPools[0].mesh.count, 45, "the shared pool must hold exactly 45 active instances");
});

test("a grouped épi flower's up to twelve Meshes are pooled separately from its leaves, and two specimens of the same cultivar share both pools", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "menthe-de-velours");
  const spA = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  const spB = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 8, z: 8, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();
  const organPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools, organPools);

  const smA = registry.get(spA.id);
  const smB = registry.get(spB.id);
  // A separate, throwaway build (never passed to syncSpecimenModels, so its meshes are never
  // detached) to map each flat organMeshes index back to its logical organ kind — smA/smB's own
  // organ meshes were already detached from their branches by the real sync() above, so their own
  // branches can no longer be traversed for this. Same cultivar/stage/deterministic seed, so this
  // reference build's organMeshes order is identical to smA/smB's own.
  const reference = Hybrids.buildSpecimenGroup(cv, Cultivars.MATURE_STAGE);
  const leafIndices = [];
  const flowerIndices = [];
  let flatIndex = 0;
  reference.userData.organs.forEach((o) => {
    let meshCount = 0;
    o.branch.traverse((node) => {
      if (node.isMesh) meshCount++;
    });
    for (let i = 0; i < meshCount; i++) {
      (o.kind === "leaf" ? leafIndices : flowerIndices).push(flatIndex);
      flatIndex++;
    }
  });
  // "touffe" port, 8 attach points, all 8 carrying a leaf at maturity (1 mesh each); the épi
  // flower is "groupée" so attachPoints.slice(-2) gives 2 flower organs, each 4 spheres * 3
  // (groupée) = 12 meshes — 24 flower meshes total, matching this epic's own "jusqu'à douze pour
  // une épi groupée" wording per logical flower.
  assert.equal(leafIndices.length, 8, "expected 8 leaf meshes for menthe-de-velours at maturity");
  assert.equal(flowerIndices.length, 24, "expected 24 flower meshes (2 grouped épi flowers * 12 each)");

  const leafPool = smA.organPools[leafIndices[0]];
  const flowerPool = smA.organPools[flowerIndices[0]];
  assert.notEqual(leafPool, flowerPool, "leaf and flower organs must land in distinct pools (different geometry/material)");
  assert.ok(leafIndices.every((i) => smA.organPools[i] === leafPool), "every leaf mesh must share the same leaf pool");
  assert.ok(flowerIndices.every((i) => smA.organPools[i] === flowerPool), "every flower mesh must share the same flower pool");

  // Same cultivar, same stage: specimen B's organs must resolve to the exact same two pools.
  assert.ok(leafIndices.every((i) => smB.organPools[i] === leafPool), "specimen B's leaves must share specimen A's leaf pool");
  assert.ok(flowerIndices.every((i) => smB.organPools[i] === flowerPool), "specimen B's flowers must share specimen A's flower pool");
  assert.equal(leafPool.mesh.count, leafIndices.length * 2, "leaf pool must hold both specimens' leaf instances");
  assert.equal(flowerPool.mesh.count, flowerIndices.length * 2, "flower pool must hold both specimens' flower instances");

  let poolCount = 0;
  for (const byMaterial of organPools.values()) poolCount += byMaterial.size;
  assert.equal(poolCount, 2, "exactly two distinct organ pools expected for this one cultivar (leaf colour, flower/accent colour)");
});

test("a different cultivar's organ colours land in different pools than an existing cultivar's", () => {
  const g = new GardenState(null, 1000);
  const cvMenthe = makeCultivar(g, "menthe-de-velours");
  const cvOreille = makeCultivar(g, "oreille-de-pluie");
  const spMenthe = Cultivars.createSpecimen(g.s, { cultivarId: cvMenthe.id, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  const spOreille = Cultivars.createSpecimen(g.s, { cultivarId: cvOreille.id, x: 4, z: 4, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();
  const organPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools, organPools);

  const smMenthe = registry.get(spMenthe.id);
  const smOreille = registry.get(spOreille.id);
  assert.ok(smOreille.organPools.length > 0, "oreille-de-pluie (rosette, coupe leaves) must still get organ pools — only the STEM is absent for a rosette");
  assert.equal(smOreille.stemPool, null, "a rosette specimen must still never get a stemPool");
  const shared = smMenthe.organPools.some((p) => smOreille.organPools.includes(p));
  assert.equal(shared, false, "two cultivars with different leaf colours/shapes must never share an organ pool");
});

// Sums active instance counts across every distinct pool in an organPools registry — used below
// where a test cares about the total number of pooled organ instances rather than one pool's own
// count (menthe-de-velours spreads its organs across two pools, leaf and flower/accent).
function sumOrganPoolInstances(organPools) {
  let total = 0;
  for (const byMaterial of organPools.values())
    for (const pool of byMaterial.values()) total += pool.mesh.count;
  return total;
}

test("organ instances are removed from their pools when the specimen is delivered away via the real deliverContract command", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "menthe-de-velours");
  const sp1 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 2, z: 2, stage: Cultivars.MATURE_STAGE });
  const sp2 = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 4, z: 4, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();
  const organPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools, organPools);
  const organMeshCount = registry.get(sp1.id).group.userData.organMeshes.length;
  assert.equal(sumOrganPoolInstances(organPools), organMeshCount * 2, "both specimens' organ instances must be pooled");

  const signed = g.command({ type: "signContract", cultivarId: cv.id, quota: 1, pricePerUnit: 10 });
  assert.ok(!signed.error, signed.error);
  const contractId = g.s.campaignContracts[0].id;
  const delivered = g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.ok(!delivered.error, delivered.error);
  assert.equal(g.s.specimens.length, 1, "exactly one specimen must have been delivered away");

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools, organPools);

  assert.equal(sumOrganPoolInstances(organPools), organMeshCount, "exactly one specimen's worth of organ instances must remain after delivery");
  const remainingId = g.s.specimens[0].id;
  assert.ok(registry.get(remainingId).organPools, "the remaining specimen must keep its pooled organ instances");
});

test("a specimen's rebuilt Group on stage change re-registers organs into the same pools, with the new stage's organ count exactly (no leak)", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignDay = 15; // past printemps (C7.3), ordinary STAGE_DURATION applies
  const cv = makeCultivar(g, "menthe-de-velours");
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 1, z: 1 });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();
  const organPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools, organPools);
  const before = registry.get(sp.id);
  const leafPoolBefore = before.organPools[0];
  // Stage 0 thins the canopy (only every other attach point), so every organ mesh here is a leaf
  // sharing the one pool (no flowers before MATURE_STAGE) — exactly the count this specimen's own
  // organMeshes list holds right now, never more (a leak) or less.
  assert.equal(leafPoolBefore.mesh.count, before.group.userData.organMeshes.length);

  g.s.elapsed = sp.plantedAt + Cultivars.STAGE_DURATION_ELAPSED_SECONDS;
  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools, organPools);
  const after = registry.get(sp.id);
  const leafPoolAfter = after.organPools[0];

  assert.equal(leafPoolAfter, leafPoolBefore, "the same (geometry, material) pair must resolve to the same pool object across a rebuild");
  assert.ok(after.group.userData.organMeshes.length > before.group.userData.organMeshes.length, "the later stage must have a fuller (untinned) canopy than stage 0");
  assert.equal(
    leafPoolAfter.mesh.count,
    after.group.userData.organMeshes.length,
    "the pool must hold exactly the new stage's organ count after rebuild — the old stage's instance must have been released first, never left as a phantom alongside the new one",
  );
});

test("a pooled organ instance matrix combines the specimen's real world transform with its precomputed localMatrix", () => {
  const g = new GardenState(null, 1000);
  const cv = makeCultivar(g, "menthe-de-velours");
  const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 6, z: -9, stage: Cultivars.MATURE_STAGE });
  const scene = new THREE.Group();
  const registry = new Map();
  const stemPools = new Map();
  const organPools = new Map();

  RenderSpecimens.syncSpecimenModels(registry, scene, g.s, stemPools, organPools);
  const sm = registry.get(sp.id);
  const om = sm.group.userData.organMeshes[0];
  const pool = sm.organPools[0];

  const m = new THREE.Matrix4();
  pool.mesh.getMatrixAt(pool.indexOf.get(`${sp.id}:0`), m);

  const expected = new THREE.Matrix4()
    .compose(sm.group.position, new THREE.Quaternion(), sm.group.scale)
    .multiply(om.localMatrix);

  // Same float32 instance-buffer tolerance already used by the stem's own matrix test above.
  const EPS = 1e-5;
  for (let i = 0; i < 16; i++) {
    assert.ok(
      Math.abs(m.elements[i] - expected.elements[i]) < EPS,
      `instance matrix element ${i} mismatch: got ${m.elements[i]}, expected ${expected.elements[i]}`,
    );
  }
});
