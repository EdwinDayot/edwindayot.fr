/* Generic dynamic Three.js instance pool, epic C7.8 (docs/campagne-backlog.md). A foundation for
   any future rendering system that needs many copies of the SAME (geometry, material) pair added
   and removed by identifier over time (a specimen population, a future Rainelle population...),
   generalising the InstancedMesh usage already in production for the free garden's shoreline
   stones / tree crowns / moss (public/game/render-world.js, ~lines 322-393) — those allocate a
   fixed InstancedMesh once at world construction and never add/remove an instance afterwards;
   this module is the missing "add/update/remove by id, grow on demand" layer on top of the same
   primitive, not a second instancing mechanism.

   Deliberately generic: this file knows nothing about specimens, cultivars or the campaign, and
   is not wired into render-specimens.js/botany-hybrids.js/syncSpecimenModels by this epic — that
   wiring is a separate future epic once this foundation is proven by its own tests, exactly the
   sequencing already used by campaign-stations.js (C2.6a, posed alone) before its real wiring
   (C2.6c).

   No DOM dependency (only THREE), so this loads and runs identically in a plain Node vm sandbox
   against public/vendor/three.min.js and in the browser — the same posture already documented by
   botany-hybrids.js/render-specimens.js's own headers, proven the same way by
   tests/campaign-render-instances.cjs (global.THREE = require(...), no Playwright/canvas).

   Ownership: the geometry and material passed to createInstancePool are shared, caller-owned
   objects — this module never calls .dispose() on either of them, the same discipline already
   documented by botany-hybrids.js's own geometry/material cache. The InstancedMesh objects this
   module allocates for itself (one at creation, a fresh one on every capacity growth) ARE this
   module's own resource: the one retired on growth has its own .dispose() called (releases its
   instance-attribute GPU buffer only — InstancedMesh#dispose() never touches geometry/material),
   to avoid leaking one InstancedMesh per growth step over a long play session. */
(function (root) {
  const T = root.THREE;
  if (!T) return;

  function allocateMesh(geometry, material, capacity) {
    const mesh = new T.InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    return mesh;
  }

  // createInstancePool(scene, geometry, material, initialCapacity): one InstancedMesh for this
  // (geometry, material) pair, added to `scene` immediately. Capacity is clamped to at least 1
  // (a pool that could never hold any instance would just loop forever doubling zero on first
  // `set`) — never a silent cap beyond that: any positive request is honoured as given.
  function createInstancePool(scene, geometry, material, initialCapacity) {
    const capacity = Math.max(1, initialCapacity | 0);
    const mesh = allocateMesh(geometry, material, capacity);
    scene.add(mesh);
    return {
      scene,
      geometry,
      material,
      mesh,
      capacity,
      ids: [], // index -> id, dense (no holes) between 0 and ids.length-1
      indexOf: new Map(), // id -> index, inverse of `ids`
    };
  }

  // Doubles capacity, migrates every active instance's exact matrix, swaps the InstancedMesh in
  // the real scene (new one added before the old one is removed, per the epic's own ordering),
  // and retires the old mesh's own GPU resource — never the shared geometry/material.
  function grow(pool) {
    const nextCapacity = pool.capacity * 2;
    const nextMesh = allocateMesh(pool.geometry, pool.material, nextCapacity);
    const m = new T.Matrix4();
    for (let i = 0; i < pool.ids.length; i++) {
      pool.mesh.getMatrixAt(i, m);
      nextMesh.setMatrixAt(i, m);
    }
    nextMesh.count = pool.ids.length;
    nextMesh.instanceMatrix.needsUpdate = true;
    pool.scene.add(nextMesh);
    pool.scene.remove(pool.mesh);
    pool.mesh.dispose();
    pool.mesh = nextMesh;
    pool.capacity = nextCapacity;
  }

  // set(pool, id, matrix): a new id is appended (growing the pool first if already at capacity);
  // an existing id has its matrix updated in place — never a second index for the same id.
  function set(pool, id, matrix) {
    let index = pool.indexOf.get(id);
    if (index === undefined) {
      if (pool.ids.length >= pool.capacity) grow(pool);
      index = pool.ids.length;
      pool.ids.push(id);
      pool.indexOf.set(id, index);
      pool.mesh.count = pool.ids.length;
    }
    pool.mesh.setMatrixAt(index, matrix);
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  // remove(pool, id): swap-and-pop, so the active range [0, size) never has a hole — the last
  // active id (if it wasn't already the one being removed) takes over the freed index.
  function remove(pool, id) {
    const index = pool.indexOf.get(id);
    if (index === undefined) return;
    const lastIndex = pool.ids.length - 1;
    if (index !== lastIndex) {
      const lastId = pool.ids[lastIndex];
      const m = new T.Matrix4();
      pool.mesh.getMatrixAt(lastIndex, m);
      pool.mesh.setMatrixAt(index, m);
      pool.ids[index] = lastId;
      pool.indexOf.set(lastId, index);
    }
    pool.ids.pop();
    pool.indexOf.delete(id);
    pool.mesh.count = pool.ids.length;
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  function size(pool) {
    return pool.ids.length;
  }

  const api = { createInstancePool, set, remove, size };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderInstances = api;
})(typeof window !== "undefined" ? window : globalThis);
