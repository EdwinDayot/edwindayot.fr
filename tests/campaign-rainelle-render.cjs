// Epic C5.9 (docs/campagne-backlog.md) — programmatic audit of the Rainelle rendering module, in
// the spirit of tests/campaign-hybrids-render.cjs: public/game/render-rainelles.js has no DOM
// dependency, so it is required directly against public/vendor/three.min.js.
const { test } = require("node:test");
const assert = require("node:assert/strict");

global.THREE = require("../public/vendor/three.min.js");
const Hybrids = require("../public/game/botany-hybrids.js");
const Rainelles = require("../public/game/render-rainelles.js");
const Genetics = require("../public/game/botany-genetics.js");

function cultivarFor(id) {
  const founder = Genetics.founders.find((f) => f.id === id);
  return { id: founder.id, traits: founder.traits };
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

function collectMaterials(group) {
  const seen = new Map();
  group.traverse((o) => {
    if (o.isMesh && !seen.has(o.material.uuid)) seen.set(o.material.uuid, o.material);
  });
  return [...seen.values()];
}

function serialize(group) {
  const parts = [];
  group.traverse((o) => {
    if (o.isMesh) parts.push({ pos: o.position.toArray(), mat: o.material.uuid });
  });
  return parts;
}

test("a rainelle without an id is refused explicitly", () => {
  assert.throws(() => Rainelles.buildRainelleGroup({}, cultivarFor("oreille-de-pluie")), /rainelle id required/);
});

test("a missing/traitless cultivar is refused explicitly", () => {
  assert.throws(() => Rainelles.buildRainelleGroup({ id: "r1" }, null), /cultivar \(with traits\) required/);
  assert.throws(() => Rainelles.buildRainelleGroup({ id: "r1" }, {}), /cultivar \(with traits\) required/);
});

test("every founder cultivar builds a rainelle group without throwing", () => {
  for (const f of Genetics.founders) {
    assert.doesNotThrow(() => Rainelles.buildRainelleGroup({ id: "r-" + f.id }, cultivarFor(f.id)), f.id);
  }
});

test("visual output is deterministic: same rainelle id + cultivar yields byte-identical geometry twice", () => {
  const cultivar = cultivarFor("clochette-du-soir");
  const a = Rainelles.buildRainelleGroup({ id: "r42" }, cultivar);
  const b = Rainelles.buildRainelleGroup({ id: "r42" }, cultivar);
  assert.deepEqual(serialize(a), serialize(b));
  assert.equal(a.userData.mark.hex, b.userData.mark.hex);
  assert.equal(a.userData.mark.side, b.userData.mark.side);
});

test("two DIFFERENT rainelle ids on the SAME cultivar are visually distinguishable (mark differs)", () => {
  const cultivar = cultivarFor("menthe-de-velours");
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const g = Rainelles.buildRainelleGroup({ id: "r-mark-" + i }, cultivar);
    seen.add(g.userData.mark.hex + ":" + g.userData.mark.side);
  }
  assert.ok(seen.size > 1, "expected at least two distinct marks across 8 different ids");
});

test("two rainelles of the SAME cultivar share leaf geometry/material objects (no triangle duplication)", () => {
  const cultivar = cultivarFor("fraise-timide");
  const a = Rainelles.buildRainelleGroup({ id: "r-a" }, cultivar);
  const b = Rainelles.buildRainelleGroup({ id: "r-b" }, cultivar);
  const leafA = a.userData.organs[0].branch;
  const leafB = b.userData.organs[0].branch;
  const meshA = leafA.children.find((c) => c.isMesh) || leafA.children[0].children?.[0];
  const meshB = leafB.children.find((c) => c.isMesh) || leafB.children[0].children?.[0];
  assert.ok(meshA && meshB, "expected at least one mesh under each leaf organ");
  assert.equal(meshA.geometry, meshB.geometry, "leaf geometry must be the identical object");
  assert.equal(meshA.material, meshB.material, "leaf material must be the identical object");
});

test("two rainelles (any cultivar) share the SAME body geometry/material objects (shared common body)", () => {
  const a = Rainelles.buildRainelleGroup({ id: "body-a" }, cultivarFor("oreille-de-pluie"));
  const b = Rainelles.buildRainelleGroup({ id: "body-b" }, cultivarFor("ronce-a-rubans"));
  const torsoA = a.children[0].children[0];
  const torsoB = b.children[0].children[0];
  assert.equal(torsoA.geometry, torsoB.geometry, "torso geometry must be shared across cultivars");
  assert.equal(torsoA.material, torsoB.material, "torso material must be shared across cultivars");
});

test("botany-hybrids.js's own leaf material cache is reused: the SAME (colour,roughness) leaf on a plant and on a rainelle share the material object", () => {
  const founder = Genetics.founders.find((f) => f.id === "aster-des-vents");
  const plant = Hybrids.buildSpecimenGroup({ id: founder.id, traits: founder.traits });
  const plantLeaf = plant.userData.organs.find((o) => o.kind === "leaf");
  const plantMesh = plantLeaf.branch.children.find((c) => c.isMesh) || plantLeaf.branch.children[0].children?.[0];

  const rainelle = Rainelles.buildRainelleGroup({ id: "r-shared" }, { id: founder.id, traits: founder.traits });
  const rainelleLeaf = rainelle.userData.organs[0].branch;
  const rainelleMesh = rainelleLeaf.children.find((c) => c.isMesh) || rainelleLeaf.children[0].children?.[0];

  assert.equal(plantMesh.material, rainelleMesh.material, "leaf material objects must be identical, not merely equal");
});

test("a cultivar with no feuilles trait grows no foliage organs, but the body still builds", () => {
  const traits = { ...Genetics.founders[0].traits, feuilles: undefined };
  const g = Rainelles.buildRainelleGroup({ id: "r-bald" }, { id: "bald", traits });
  assert.equal(g.userData.organs.length, 0);
  assert.ok(g.children[0].children.length > 0, "body meshes must still be present");
});

test("no material is metallic; roughness stays within the documented 0.15-0.48 range", () => {
  for (const f of Genetics.founders) {
    const g = Rainelles.buildRainelleGroup({ id: "r-range-" + f.id }, cultivarFor(f.id));
    for (const m of collectMaterials(g)) {
      assert.equal(m.metalness, 0, `${f.id}: unexpected metalness on ${m.uuid}`);
      assert.ok(m.roughness >= 0.15 && m.roughness <= 0.48, `${f.id}: roughness ${m.roughness} out of range`);
    }
  }
});

test("every mark colour used is one of the five documented MARK_COLORS", () => {
  for (let i = 0; i < 20; i++) {
    const g = Rainelles.buildRainelleGroup({ id: "r-palette-" + i }, cultivarFor("clochette-du-soir"));
    assert.ok(Rainelles.MARK_COLORS.includes(g.userData.mark.hex), `unexpected mark hex ${g.userData.mark.hex}`);
  }
});

test("no mesh has a non-finite vertex position", () => {
  for (const f of Genetics.founders) {
    const g = Rainelles.buildRainelleGroup({ id: "r-finite-" + f.id }, cultivarFor(f.id));
    assert.ok(allFinite(g), `${f.id}: non-finite vertex position found`);
  }
});

test("no material is ever transparent", () => {
  for (const f of Genetics.founders) {
    const g = Rainelles.buildRainelleGroup({ id: "r-opaque-" + f.id }, cultivarFor(f.id));
    for (const m of collectMaterials(g)) assert.equal(m.transparent, false, `${f.id}: unexpected transparent material`);
  }
});

test("emissive is applied to foliage only when the cultivar's fonction is 'eclairer', at the documented 0.35 intensity", () => {
  const clochette = Genetics.founders.find((f) => f.id === "clochette-du-soir");
  const g = Rainelles.buildRainelleGroup({ id: "r-glow" }, cultivarFor(clochette.id));
  const leaf = g.userData.organs[0].branch;
  const leafMesh = leaf.children.find((c) => c.isMesh) || leaf.children[0].children?.[0];
  assert.equal(leafMesh.material.emissiveIntensity, 0.35);

  const nonEclairer = Genetics.founders.find(
    (f) => f.traits.feuilles && (!f.traits.fonction || f.traits.fonction.type !== "eclairer"),
  );
  const g2 = Rainelles.buildRainelleGroup({ id: "r-noglow" }, cultivarFor(nonEclairer.id));
  const leaf2 = g2.userData.organs[0].branch;
  const leafMesh2 = leaf2.children.find((c) => c.isMesh) || leaf2.children[0].children?.[0];
  assert.equal(leafMesh2.material.emissive.getHex(), 0, "non-eclairer foliage must not carry an emissive colour");
});

test("a real hybrid trait set (not just a founder) also builds and stays deterministic", () => {
  const reachable = Genetics.enumerateReachableTraitSets("menthe-de-velours", "fougere-decho").find((r) => r.valid);
  assert.ok(reachable, "expected at least one valid combination for this compatible pair");
  const a = Rainelles.buildRainelleGroup({ id: "r-hybrid" }, { id: "hybrid-test-1", traits: reachable.traits });
  const b = Rainelles.buildRainelleGroup({ id: "r-hybrid" }, { id: "hybrid-test-1", traits: reachable.traits });
  assert.deepEqual(serialize(a), serialize(b));
  assert.ok(allFinite(a));
});

// Epic C7.13 — body/mark instance pooling (syncRainelleModels), on the model of
// tests/campaign-specimen-render.cjs's own pooling section (C7.9/C7.10).

function cultivarEntry(id) {
  return cultivarFor(id); // {id, traits} is the only shape syncRainelleModels/buildRainelleGroup need
}

test("omitting bodyPools (3-argument call) leaves every body/mark mesh a normal child of the Group, unchanged from before this epic", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const s = {
    rainelles: [{ id: "r1", cultivarId: "oreille-de-pluie", x: 0, z: 0 }],
    cultivars: [cultivarEntry("oreille-de-pluie")],
  };

  Rainelles.syncRainelleModels(registry, scene, s);

  const rm = registry.get("r1");
  assert.equal(rm.bodyPoolEntries, null);
  for (const bm of rm.group.userData.bodyMeshes)
    assert.equal(bm.mesh.parent, rm.group.children[0], "body/mark mesh must stay a child of the structure");
  let instancedMeshCount = 0;
  scene.traverse((o) => {
    if (o.isInstancedMesh) instancedMeshCount++;
  });
  assert.equal(instancedMeshCount, 0, "no InstancedMesh must exist when bodyPools is omitted");
});

test("with bodyPools provided, a rainelle's body+mark meshes are detached from its Group and pooled into shared InstancedMeshes", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const bodyPools = new Map();
  const s = {
    rainelles: [{ id: "r1", cultivarId: "oreille-de-pluie", x: 3, z: -2 }],
    cultivars: [cultivarEntry("oreille-de-pluie")],
  };

  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);

  const rm = registry.get("r1");
  assert.ok(rm.bodyPoolEntries, "expected pooled entries recorded on the registry entry");
  assert.equal(rm.bodyPoolEntries.length, 9, "torso+head+2 eyes+4 legs+mark = 9 pooled pieces");
  for (const entry of rm.bodyPoolEntries) {
    assert.equal(entry.pool.mesh.isInstancedMesh, true);
    assert.equal(entry.pool.mesh.parent, scene, "each pool's InstancedMesh must be added to the real scene");
  }
  let stillChild = false;
  rm.group.traverse((o) => {
    if (rm.group.userData.bodyMeshes.some((bm) => bm.mesh === o)) stillChild = true;
  });
  assert.equal(stillChild, false, "every body/mark mesh must be detached from the rainelle Group");
});

test("the whole body population never creates more than 4 body pools + 5 mark pools, regardless of population size or cultivar mix", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const bodyPools = new Map();
  const founders = Genetics.founders.slice(0, 4);
  const s = {
    rainelles: Array.from({ length: 20 }, (_, i) => ({
      id: "r" + i,
      cultivarId: founders[i % founders.length].id,
      x: i,
      z: 0,
    })),
    cultivars: founders.map((f) => cultivarEntry(f.id)),
  };

  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);

  const distinctPools = new Set();
  for (const byMaterial of bodyPools.values())
    for (const pool of byMaterial.values()) distinctPools.add(pool);
  assert.ok(distinctPools.size <= 9, `expected at most 9 distinct pools, found ${distinctPools.size}`);

  let instancedMeshCount = 0;
  scene.traverse((o) => {
    if (o.isInstancedMesh) instancedMeshCount++;
  });
  assert.equal(instancedMeshCount, distinctPools.size, "one InstancedMesh per distinct pool, no more");

  // torso/head pool: exactly one instance per rainelle; eye pool: two per rainelle; leg pool: four.
  const first = registry.get("r0");
  const torsoEntry = first.bodyPoolEntries.find((e) => e.key === "torso");
  const eyeEntry = first.bodyPoolEntries.find((e) => e.key === "eye0");
  const legEntry = first.bodyPoolEntries.find((e) => e.key === "leg0");
  assert.equal(torsoEntry.pool.mesh.count, 20, "one torso instance per rainelle");
  assert.equal(eyeEntry.pool.mesh.count, 40, "two eye instances per rainelle");
  assert.equal(legEntry.pool.mesh.count, 80, "four leg instances per rainelle");
});

test("removing a rainelle releases every one of its pooled ids without leaving a hole", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const bodyPools = new Map();
  const s = {
    rainelles: [
      { id: "r1", cultivarId: "oreille-de-pluie", x: 0, z: 0 },
      { id: "r2", cultivarId: "oreille-de-pluie", x: 1, z: 0 },
      { id: "r3", cultivarId: "oreille-de-pluie", x: 2, z: 0 },
    ],
    cultivars: [cultivarEntry("oreille-de-pluie")],
  };

  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);
  const torsoPool = registry.get("r3").bodyPoolEntries.find((e) => e.key === "torso").pool;
  assert.equal(torsoPool.mesh.count, 3);

  // "r2" disappears from the real save (no in-game command does this today — see the module's own
  // header — but the code must stay correct if a future one ever does).
  s.rainelles = s.rainelles.filter((r) => r.id !== "r2");
  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);

  assert.equal(registry.has("r2"), false, "the removed rainelle's Group must leave the registry");
  assert.equal(torsoPool.mesh.count, 2, "exactly two active torso instances must remain");
  assert.equal(torsoPool.indexOf.has("r2:torso"), false);
  // swap-and-pop: the remaining ids must occupy a dense [0, size) range, no holes.
  const remainingIndices = ["r1:torso", "r3:torso"].map((id) => torsoPool.indexOf.get(id)).sort();
  assert.deepEqual(remainingIndices, [0, 1]);
});

test("a resynchronisation with no position/heading change never rewrites an already-correct instance matrix", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const bodyPools = new Map();
  const s = {
    rainelles: [
      { id: "r1", cultivarId: "oreille-de-pluie", x: 4, z: 6 },
      { id: "r2", cultivarId: "oreille-de-pluie", x: -2, z: 1 },
    ],
    cultivars: [cultivarEntry("oreille-de-pluie")],
  };

  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);
  // THREE's BufferAttribute#needsUpdate is a write-only setter (bumps .version, no getter) — read
  // .version itself as the actual signal that the GPU buffer was touched again.
  const versionsBefore = new Map();
  for (const byMaterial of bodyPools.values())
    for (const pool of byMaterial.values()) versionsBefore.set(pool, pool.mesh.instanceMatrix.version);

  Rainelles.syncRainelleModels(registry, scene, s, bodyPools); // identical positions, replayed

  for (const byMaterial of bodyPools.values())
    for (const pool of byMaterial.values())
      assert.equal(
        pool.mesh.instanceMatrix.version,
        versionsBefore.get(pool),
        "an unchanged resync must never touch an instance matrix already correct",
      );
});

test("a rainelle that actually moves DOES get its pooled instance matrices rewritten on the next sync", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const bodyPools = new Map();
  const s = {
    rainelles: [{ id: "r1", cultivarId: "oreille-de-pluie", x: 0, z: 0 }],
    cultivars: [cultivarEntry("oreille-de-pluie")],
  };

  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);
  const versionsBefore = new Map();
  for (const byMaterial of bodyPools.values())
    for (const pool of byMaterial.values()) versionsBefore.set(pool, pool.mesh.instanceMatrix.version);

  s.rainelles[0].x = 5; // a real move
  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);

  let anyBumped = false;
  for (const byMaterial of bodyPools.values())
    for (const pool of byMaterial.values())
      if (pool.mesh.instanceMatrix.version !== versionsBefore.get(pool)) anyBumped = true;
  assert.ok(anyBumped, "a real move must rewrite at least one pooled instance matrix");
});

test("the pooled torso instance matrix encodes the rainelle's real world position and heading", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const bodyPools = new Map();
  const s = {
    rainelles: [{ id: "r1", cultivarId: "oreille-de-pluie", x: 0, z: 0 }],
    cultivars: [cultivarEntry("oreille-de-pluie")],
  };
  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);

  // A real move fixes a known heading (atan2(dx, dz)) so the composition below is exact, not
  // merely "unchanged from an arbitrary default rotation".
  s.rainelles[0].x = 5;
  s.rainelles[0].z = 0;
  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);

  const rm = registry.get("r1");
  const torsoEntry = rm.bodyPoolEntries.find((e) => e.key === "torso");
  const m = new THREE.Matrix4();
  torsoEntry.pool.mesh.getMatrixAt(torsoEntry.pool.indexOf.get("r1:torso"), m);

  const expectedWorld = new THREE.Matrix4().compose(
    rm.group.position,
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rm.group.rotation.y),
    new THREE.Vector3(1, 1, 1),
  );
  const expected = new THREE.Matrix4().multiplyMatrices(expectedWorld, torsoEntry.localMatrix);

  const EPS = 1e-6; // Float32Array instance buffer, same tolerance rationale as the specimen test above
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(m.elements[i] - expected.elements[i]) < EPS, `element ${i} mismatch`);
});

test("a rainelle whose cultivar cannot be resolved yet is skipped, never throws, even with bodyPools provided", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const bodyPools = new Map();
  const s = {
    rainelles: [{ id: "r1", cultivarId: "does-not-exist", x: 0, z: 0 }],
    cultivars: [],
  };
  assert.doesNotThrow(() => Rainelles.syncRainelleModels(registry, scene, s, bodyPools));
  assert.equal(registry.size, 0);
});

// Epic C7.13 — groupBounds: render-items.js's beginGestureScene/opening-shots code used to frame
// its camera with a plain `new THREE.Box3().setFromObject(rm.group)`, which silently stops seeing
// the body/mark once they are pooled out of `rm.group`'s own descendants (a bald cultivar with no
// foliage would otherwise yield an EMPTY box — NaN center/size once decomposed). groupBounds is
// the drop-in replacement, correct whether or not bodyPools was used.

test("groupBounds is never empty even for a cultivar with no foliage and pooled body meshes", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const bodyPools = new Map();
  const traits = { ...Genetics.founders[0].traits, feuilles: undefined };
  const s = {
    rainelles: [{ id: "r1", cultivarId: "bald", x: 0, z: 0 }],
    cultivars: [{ id: "bald", traits }],
  };
  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);
  const rm = registry.get("r1");

  // Confirm the setup actually exercises the risk: no foliage AND the body meshes are really gone
  // from rm.group's own descendants (pooled), so a plain setFromObject(rm.group) would be empty.
  assert.equal(rm.group.userData.organs.length, 0, "expected no foliage for this bald cultivar");
  const naiveBox = new THREE.Box3().setFromObject(rm.group);
  assert.ok(naiveBox.isEmpty(), "sanity check: the naive box must be empty once the body is pooled out");

  const box = Rainelles.groupBounds(rm.group);
  assert.equal(box.isEmpty(), false, "groupBounds must never be empty even with no foliage and a pooled body");
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  assert.ok(Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z));
  assert.ok(size.x > 0 && size.y > 0 && size.z > 0, "expected a real, non-degenerate body extent");
});

test("groupBounds matches the plain setFromObject box when bodyPools is not used (no behaviour change in that case)", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const s = {
    rainelles: [{ id: "r1", cultivarId: "oreille-de-pluie", x: 1, z: 2 }],
    cultivars: [cultivarEntry("oreille-de-pluie")],
  };
  Rainelles.syncRainelleModels(registry, scene, s); // no bodyPools: body stays a normal child
  const rm = registry.get("r1");

  const naiveBox = new THREE.Box3().setFromObject(rm.group);
  const box = Rainelles.groupBounds(rm.group);
  const EPS = 1e-6;
  assert.ok(naiveBox.min.distanceTo(box.min) < EPS && naiveBox.max.distanceTo(box.max) < EPS);
});

test("groupBounds follows the rainelle's real world position (translated, not stuck at the origin)", () => {
  const scene = new THREE.Group();
  const registry = new Map();
  const bodyPools = new Map();
  const s = {
    rainelles: [{ id: "r1", cultivarId: "oreille-de-pluie", x: 50, z: -30 }],
    cultivars: [cultivarEntry("oreille-de-pluie")],
  };
  Rainelles.syncRainelleModels(registry, scene, s, bodyPools);
  const rm = registry.get("r1");
  const center = Rainelles.groupBounds(rm.group).getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center.x - 50) < 1, "expected the bounds center near the real world x");
  assert.ok(Math.abs(center.z - -30) < 1, "expected the bounds center near the real world z");
});
