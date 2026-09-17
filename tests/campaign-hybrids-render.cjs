// Epic C1.7 (docs/campagne-backlog.md) — programmatic audit of the hybrid rendering module,
// in the spirit of tests/garden-material-audit.cjs but runnable in plain Node (no Playwright,
// no canvas): public/game/botany-hybrids.js has no DOM dependency, so it is required directly
// against public/vendor/three.min.js, the same way tests/garden-model-attachments.cjs proves
// attach-point precision for the free garden's plants without a browser.
const { test } = require("node:test");
const assert = require("node:assert/strict");

global.THREE = require("../public/vendor/three.min.js");
const Hybrids = require("../public/game/botany-hybrids.js");
const Genetics = require("../public/game/botany-genetics.js");

function serializeOrgans(group) {
  return group.userData.organs.map((o) => ({
    kind: o.kind,
    position: o.branch.position.toArray(),
    rotation: [o.branch.rotation.x, o.branch.rotation.y, o.branch.rotation.z],
  }));
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

test("every palette label used by the eight founding species maps to a real hex", () => {
  for (const f of Genetics.founders) {
    for (const key of ["dominante1", "dominante2", "accent"]) {
      const label = f.traits.palette[key];
      if (label == null) continue;
      assert.doesNotThrow(() => Hybrids.paletteColor(label), `${f.id}: ${key}=${label}`);
    }
  }
});

test("an unmapped palette label is refused explicitly", () => {
  assert.throws(() => Hybrids.paletteColor("magenta-improbable"), /unmapped palette label/);
});

test("all five port values used by the founders build without throwing", () => {
  const ports = new Set(Genetics.founders.map((f) => f.traits.port));
  assert.deepEqual([...ports].sort(), ["grimpant", "retombant", "rosette", "tige-dressee", "touffe"].sort());
  for (const f of Genetics.founders) {
    assert.doesNotThrow(() => Hybrids.buildSpecimenGroup({ id: f.id, traits: f.traits }), f.id);
  }
});

test("an unknown port is refused explicitly, not silently substituted", () => {
  const traits = { ...Genetics.founders[0].traits, port: "improbable" };
  assert.throws(() => Hybrids.buildSpecimenGroup({ id: "x", traits }), /unknown port/);
});

test("visual seed is deterministic: same cultivar id yields byte-identical organ layout twice", () => {
  const founder = Genetics.founders.find((f) => f.traits.fleurs && f.traits.feuilles);
  const a = Hybrids.buildSpecimenGroup({ id: founder.id, traits: founder.traits });
  const b = Hybrids.buildSpecimenGroup({ id: founder.id, traits: founder.traits });
  assert.deepEqual(serializeOrgans(a), serializeOrgans(b));
});

test("visual seed depends on the cultivar id, not just its traits: two ids diverge", () => {
  const traits = Genetics.founders[0].traits;
  const a = Hybrids.buildSpecimenGroup({ id: "cultivar-a", traits });
  const b = Hybrids.buildSpecimenGroup({ id: "cultivar-b", traits });
  assert.notDeepEqual(serializeOrgans(a), serializeOrgans(b));
});

test("every organ sits exactly on its declared skeleton attach point", () => {
  for (const f of Genetics.founders) {
    const group = Hybrids.buildSpecimenGroup({ id: f.id, traits: f.traits });
    for (const organ of group.userData.organs) {
      assert.ok(
        organ.branch.position.distanceTo(organ.attach.point) < 1e-9,
        `${f.id}: organ off its attach point`,
      );
    }
  }
});

test("no fleurs trait produces zero flower organs; a fleurs trait produces at least one", () => {
  for (const f of Genetics.founders) {
    const group = Hybrids.buildSpecimenGroup({ id: f.id, traits: f.traits });
    const flowerCount = group.userData.organs.filter((o) => o.kind === "flower").length;
    if (f.traits.fleurs) assert.ok(flowerCount > 0, `${f.id} should have flower organs`);
    else assert.equal(flowerCount, 0, `${f.id} should have no flower organs`);
  }
});

test("two specimens of the SAME cultivar share geometry and material objects (no triangle duplication)", () => {
  const founder = Genetics.founders.find((f) => f.traits.feuilles);
  const a = Hybrids.buildSpecimenGroup({ id: founder.id, traits: founder.traits });
  const b = Hybrids.buildSpecimenGroup({ id: founder.id, traits: founder.traits });
  const leafA = a.userData.organs.find((o) => o.kind === "leaf");
  const leafB = b.userData.organs.find((o) => o.kind === "leaf");
  const meshA = leafA.branch.children.find((c) => c.isMesh) || leafA.branch.children[0].children?.[0];
  const meshB = leafB.branch.children.find((c) => c.isMesh) || leafB.branch.children[0].children?.[0];
  assert.ok(meshA && meshB, "expected at least one mesh under each leaf organ");
  assert.equal(meshA.geometry, meshB.geometry, "leaf geometry must be the identical object");
  assert.equal(meshA.material, meshB.material, "leaf material must be the identical object");
  assert.notEqual(a, b, "specimens must still be distinct Group instances");
});

test("no material is metallic; roughness stays within the documented 0.15-0.48 range", () => {
  for (const f of Genetics.founders) {
    const group = Hybrids.buildSpecimenGroup({ id: f.id, traits: f.traits });
    for (const m of collectMaterials(group)) {
      assert.equal(m.metalness, 0, `${f.id}: unexpected metalness on ${m.uuid}`);
      assert.ok(m.roughness >= 0.15 && m.roughness <= 0.48, `${f.id}: roughness ${m.roughness} out of range`);
    }
  }
});

test("emissive is applied only to the eclairer function's flower, at the documented 0.35 intensity", () => {
  const clochette = Genetics.founders.find((f) => f.id === "clochette-du-soir");
  const group = Hybrids.buildSpecimenGroup({ id: clochette.id, traits: clochette.traits });
  const flower = group.userData.organs.find((o) => o.kind === "flower");
  const mesh = flower.branch.children.find((c) => c.isMesh) || flower.branch.children[0].children[0];
  assert.equal(mesh.material.emissiveIntensity, 0.35);

  const nonEmissive = Genetics.founders.filter(
    (f) => f.traits.fleurs && (!f.traits.fonction || f.traits.fonction.type !== "eclairer"),
  );
  assert.ok(nonEmissive.length > 0, "expected at least one flowering, non-eclairer founder to compare against");
  for (const f of nonEmissive) {
    const g = Hybrids.buildSpecimenGroup({ id: f.id, traits: f.traits });
    const fl = g.userData.organs.find((o) => o.kind === "flower");
    const m = fl.branch.children.find((c) => c.isMesh) || fl.branch.children[0].children[0];
    // THREE.MeshStandardMaterial defaults emissiveIntensity to 1 even when unset; what actually
    // matters is the emissive colour itself staying black (no contribution), which is THREE's
    // own default left untouched here — only the eclairer branch above ever sets it.
    assert.equal(m.material.emissive.getHex(), 0, `${f.id}: unexpected emissive colour`);
  }
});

test("no mesh in any founder's specimen has a non-finite vertex position", () => {
  for (const f of Genetics.founders) {
    const group = Hybrids.buildSpecimenGroup({ id: f.id, traits: f.traits });
    assert.ok(allFinite(group), `${f.id}: non-finite vertex position found`);
  }
});

test("a real hybrid trait set (not just a founder) also builds and stays deterministic", () => {
  const reachable = Genetics.enumerateReachableTraitSets("menthe-de-velours", "fougere-decho").find((r) => r.valid);
  assert.ok(reachable, "expected at least one valid combination for this compatible pair");
  const a = Hybrids.buildSpecimenGroup({ id: "hybrid-test-1", traits: reachable.traits });
  const b = Hybrids.buildSpecimenGroup({ id: "hybrid-test-1", traits: reachable.traits });
  assert.deepEqual(serializeOrgans(a), serializeOrgans(b));
  assert.ok(allFinite(a));
});
