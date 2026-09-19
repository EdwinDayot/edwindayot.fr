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
