// Epic C7.8 (docs/campagne-backlog.md) — programmatic audit of the dynamic instance pool
// foundation, in the spirit of tests/campaign-hybrids-render.cjs: public/game/render-instances.js
// has no DOM dependency, so it is required directly against public/vendor/three.min.js, no
// Playwright/canvas involved.
const { test } = require("node:test");
const assert = require("node:assert/strict");

global.THREE = require("../public/vendor/three.min.js");
const T = THREE;
const Instances = require("../public/game/render-instances.js");

function matrixAt(mesh, index) {
  const m = new T.Matrix4();
  mesh.getMatrixAt(index, m);
  return m.toArray();
}

function translationMatrix(x, y, z) {
  return new T.Matrix4().makeTranslation(x, y, z);
}

function allFinite(mesh) {
  const arr = mesh.instanceMatrix.array;
  for (let i = 0; i < mesh.count * 16; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
}

test("createInstancePool returns an InstancedMesh added to the real scene", () => {
  const scene = new T.Scene();
  const geo = new T.SphereGeometry(1, 4, 4);
  const mat = new T.MeshStandardMaterial();
  const pool = Instances.createInstancePool(scene, geo, mat, 4);
  assert.equal(pool.mesh.isInstancedMesh, true);
  assert.ok(scene.children.includes(pool.mesh));
  assert.equal(pool.geometry, geo);
  assert.equal(pool.material, mat);
  assert.equal(Instances.size(pool), 0);
});

test("set of a new id places the matrix at a coherent index and increments size", () => {
  const scene = new T.Scene();
  const pool = Instances.createInstancePool(
    scene,
    new T.SphereGeometry(1, 4, 4),
    new T.MeshStandardMaterial(),
    4,
  );
  Instances.set(pool, "a", translationMatrix(1, 0, 0));
  assert.equal(Instances.size(pool), 1);
  assert.equal(pool.mesh.count, 1);
  assert.deepEqual(matrixAt(pool.mesh, 0), translationMatrix(1, 0, 0).toArray());
  Instances.set(pool, "b", translationMatrix(2, 0, 0));
  assert.equal(Instances.size(pool), 2);
  assert.deepEqual(matrixAt(pool.mesh, 1), translationMatrix(2, 0, 0).toArray());
});

test("set of an already known id updates its matrix without creating a second index", () => {
  const scene = new T.Scene();
  const pool = Instances.createInstancePool(
    scene,
    new T.SphereGeometry(1, 4, 4),
    new T.MeshStandardMaterial(),
    4,
  );
  Instances.set(pool, "a", translationMatrix(1, 0, 0));
  Instances.set(pool, "b", translationMatrix(2, 0, 0));
  Instances.set(pool, "a", translationMatrix(9, 9, 9));
  assert.equal(Instances.size(pool), 2);
  assert.equal(pool.indexOf.get("a"), 0);
  assert.deepEqual(matrixAt(pool.mesh, 0), translationMatrix(9, 9, 9).toArray());
  assert.deepEqual(matrixAt(pool.mesh, 1), translationMatrix(2, 0, 0).toArray());
});

test("remove of a middle id leaves no hole (swap-and-pop)", () => {
  const scene = new T.Scene();
  const pool = Instances.createInstancePool(
    scene,
    new T.SphereGeometry(1, 4, 4),
    new T.MeshStandardMaterial(),
    8,
  );
  Instances.set(pool, "a", translationMatrix(1, 0, 0));
  Instances.set(pool, "b", translationMatrix(2, 0, 0));
  Instances.set(pool, "c", translationMatrix(3, 0, 0));
  assert.equal(Instances.size(pool), 3);
  Instances.remove(pool, "a");
  assert.equal(Instances.size(pool), 2);
  assert.equal(pool.mesh.count, 2);
  // "c" (formerly last, index 2) now occupies the freed index 0.
  assert.equal(pool.indexOf.get("c"), 0);
  assert.deepEqual(matrixAt(pool.mesh, 0), translationMatrix(3, 0, 0).toArray());
  assert.equal(pool.indexOf.get("b"), 1);
  assert.deepEqual(matrixAt(pool.mesh, 1), translationMatrix(2, 0, 0).toArray());
  assert.equal(pool.indexOf.has("a"), false);
});

test("removing the last id needs no swap and still shrinks size by exactly one", () => {
  const scene = new T.Scene();
  const pool = Instances.createInstancePool(
    scene,
    new T.SphereGeometry(1, 4, 4),
    new T.MeshStandardMaterial(),
    4,
  );
  Instances.set(pool, "a", translationMatrix(1, 0, 0));
  Instances.set(pool, "b", translationMatrix(2, 0, 0));
  Instances.remove(pool, "b");
  assert.equal(Instances.size(pool), 1);
  assert.equal(pool.indexOf.get("a"), 0);
  assert.deepEqual(matrixAt(pool.mesh, 0), translationMatrix(1, 0, 0).toArray());
});

test("removing an unknown id is a no-op", () => {
  const scene = new T.Scene();
  const pool = Instances.createInstancePool(
    scene,
    new T.SphereGeometry(1, 4, 4),
    new T.MeshStandardMaterial(),
    4,
  );
  Instances.set(pool, "a", translationMatrix(1, 0, 0));
  Instances.remove(pool, "does-not-exist");
  assert.equal(Instances.size(pool), 1);
});

test("exceeding initial capacity reallocates: new InstancedMesh in the scene, old one removed, all instances migrated with exact matrices", () => {
  const scene = new T.Scene();
  const geo = new T.SphereGeometry(1, 4, 4);
  const mat = new T.MeshStandardMaterial();
  const pool = Instances.createInstancePool(scene, geo, mat, 2);
  const originalMesh = pool.mesh;
  Instances.set(pool, "a", translationMatrix(1, 0, 0));
  Instances.set(pool, "b", translationMatrix(2, 0, 0));
  assert.equal(pool.capacity, 2);
  // Third id exceeds the initial capacity of 2: must trigger a doubling reallocation.
  Instances.set(pool, "c", translationMatrix(3, 0, 0));
  assert.equal(pool.capacity, 4);
  assert.notEqual(pool.mesh, originalMesh);
  assert.ok(scene.children.includes(pool.mesh));
  assert.ok(!scene.children.includes(originalMesh));
  assert.equal(pool.mesh.geometry, geo);
  assert.equal(pool.mesh.material, mat);
  assert.equal(Instances.size(pool), 3);
  assert.deepEqual(matrixAt(pool.mesh, pool.indexOf.get("a")), translationMatrix(1, 0, 0).toArray());
  assert.deepEqual(matrixAt(pool.mesh, pool.indexOf.get("b")), translationMatrix(2, 0, 0).toArray());
  assert.deepEqual(matrixAt(pool.mesh, pool.indexOf.get("c")), translationMatrix(3, 0, 0).toArray());
});

test("a realistic mixed sequence (add many, remove some, add past old capacity) leaves a coherent final state", () => {
  const scene = new T.Scene();
  const pool = Instances.createInstancePool(
    scene,
    new T.SphereGeometry(1, 4, 4),
    new T.MeshStandardMaterial(),
    4,
  );
  const expected = new Map();
  for (let i = 0; i < 6; i++) {
    const m = translationMatrix(i, 0, 0);
    Instances.set(pool, `id-${i}`, m);
    expected.set(`id-${i}`, m.toArray());
  }
  assert.equal(Instances.size(pool), 6);
  assert.ok(pool.capacity >= 6);

  for (const id of ["id-1", "id-3"]) {
    Instances.remove(pool, id);
    expected.delete(id);
  }
  assert.equal(Instances.size(pool), 4);

  for (let i = 6; i < 10; i++) {
    const m = translationMatrix(i, 100, 0);
    Instances.set(pool, `id-${i}`, m);
    expected.set(`id-${i}`, m.toArray());
  }
  assert.equal(Instances.size(pool), 8);
  assert.equal(pool.ids.length, 8);
  assert.equal(pool.mesh.count, 8);

  // No phantom instance: every remaining id resolves to its exact matrix, and the dense
  // index range [0, size) exactly matches `ids`/`indexOf` with no gap or duplicate.
  const seenIndices = new Set();
  for (const [id, matrixArray] of expected) {
    const index = pool.indexOf.get(id);
    assert.ok(index !== undefined, `${id} missing from indexOf`);
    assert.ok(index >= 0 && index < Instances.size(pool));
    assert.ok(!seenIndices.has(index), `duplicate index ${index}`);
    seenIndices.add(index);
    assert.deepEqual(matrixAt(pool.mesh, index), matrixArray);
  }
  assert.equal(seenIndices.size, expected.size);
  assert.ok(allFinite(pool.mesh));
});

test("the pool never disposes the shared geometry/material it was given", () => {
  const scene = new T.Scene();
  const geo = new T.SphereGeometry(1, 4, 4);
  const mat = new T.MeshStandardMaterial();
  let geoDisposed = false;
  let matDisposed = false;
  geo.addEventListener("dispose", () => (geoDisposed = true));
  mat.addEventListener("dispose", () => (matDisposed = true));
  const pool = Instances.createInstancePool(scene, geo, mat, 1);
  for (let i = 0; i < 5; i++) Instances.set(pool, `id-${i}`, translationMatrix(i, 0, 0));
  assert.ok(pool.capacity > 1, "expected at least one growth to have happened");
  assert.equal(geoDisposed, false);
  assert.equal(matDisposed, false);
});
