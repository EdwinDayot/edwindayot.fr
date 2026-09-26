/* Persistent rendering of cultivar specimens (s.specimens), epic C7.4 (docs/campagne-backlog.md).
   Mirrors render-rainelles.js in spirit — a module dedicated to this one rendering concern, never
   mixed into render-houses.js/render-rainelles.js — but, unlike that module, owns its own
   synchronisation function rather than leaving the registry loop inline in render-flow.js: a
   specimen's Group must be entirely rebuilt (never mutated) whenever its derived growth stage
   changes, a piece of logic specific enough to this one registry that keeping it here, tested
   directly in Node (tests/campaign-specimen-render.cjs), is clearer than duplicating it inline.

   No new geometry/material cache of its own: every Group comes from botany-hybrids.js's own
   buildSpecimenGroup(cultivar, stage), the exact function already used for the six founder
   species (C1.7/C1.8) and, until this epic, only ever built transiently for the epilogue scene
   (render-items.js's beginEpilogueScene — corrected by this same epic to read the derived stage
   too, see that file's own comment). Two specimens of the same cultivar at the same stage already
   share geometry/material objects via that function's own cache — nothing here duplicates that
   guarantee (direction-artistique.md: "un cultivar = une signature visuelle réutilisée").

   Self-contained beyond THREE and its three sibling modules (botany-hybrids.js, cultivars.js,
   terrain.js, render-instances.js), so this loads and runs identically in a plain Node vm sandbox
   and in the browser — same posture render-rainelles.js's own header already documents for the
   same reason.

   Epic C7.9: first real branching of render-instances.js's generic pool (C7.8) onto this module —
   the stem Mesh botany-hybrids.js now exposes as `group.userData.stemMesh` (null for "rosette",
   which never has one) is detached from its Group and registered instead in a shared
   THREE.InstancedMesh, keyed by the (geometry, material) object pair's OWN identity (both already
   cached/shared by botany-hybrids.js — never a key recomputed separately, never a second cache).
   `stemPools` is an optional 4th argument, a nested `Map<geometry, Map<material, pool>>` owned by
   the caller (render.js's `this.specimenStemPools`, alongside `this.specimenModels`) — omitting it
   (every existing 3-argument call site, including every test written before this epic) leaves the
   stem exactly where it always was, as a normal child of the Group, byte-for-byte the prior
   behaviour. A specimen never moves once planted and a cultivar's traits are fixed for life, so in
   practice `set()` below always finds the same pool for a given specimen id again — but the code
   stays correct even if that stopped being true. */
(function (root) {
  const T = root.THREE;
  if (!T) return;
  const Hybrids =
    typeof module !== "undefined" ? require("./botany-hybrids.js") : root.GardenBotanyHybrids;
  const Cultivars =
    typeof module !== "undefined" ? require("./cultivars.js") : root.GardenCultivars;
  const Terrain =
    typeof module !== "undefined" ? require("./terrain.js") : root.GardenTerrain;
  const RenderInstances =
    typeof module !== "undefined" ? require("./render-instances.js") : root.GardenRenderInstances;
  if (!Hybrids || !Cultivars || !Terrain || !RenderInstances) return;

  // First estimate, named and revisable (same posture as botany-hybrids.js's own STAGE_SCALE
  // etc.) — render-instances.js grows a pool automatically past this, never a hard cap.
  const STEM_POOL_INITIAL_CAPACITY = 8;

  // stemPools: Map<geometry, Map<material, pool>> -> the one pool for this exact (geometry,
  // material) object pair, creating both the pool and any missing map level on first use.
  function stemPoolFor(stemPools, scene, geometry, material) {
    let byMaterial = stemPools.get(geometry);
    if (!byMaterial) {
      byMaterial = new Map();
      stemPools.set(geometry, byMaterial);
    }
    let pool = byMaterial.get(material);
    if (!pool) {
      pool = RenderInstances.createInstancePool(scene, geometry, material, STEM_POOL_INITIAL_CAPACITY);
      byMaterial.set(material, pool);
    }
    return pool;
  }

  // Scratch objects reused across calls (render-instances.js's own `set()` copies the matrix
  // elements into the InstancedMesh's instance buffer immediately, so nothing here is retained
  // by reference beyond a single call) — no per-call allocation for what runs every sync().
  const _stemQuat = new T.Quaternion(); // identity, never rotated: a specimen never turns in place.
  const _stemScale = new T.Vector3();
  const _stemMatrix = new T.Matrix4();
  function stemInstanceMatrix(position, scaleScalar) {
    _stemScale.set(scaleScalar, scaleScalar, scaleScalar);
    return _stemMatrix.compose(position, _stemQuat, _stemScale);
  }

  // registry: a Map id -> { group, stemPool }, owned by the caller (render.js's
  // this.specimenModels, one entry per s.specimens element) — same convention as
  // this.rainelleModels/this.stationModels. `stemPool` is the pool (if any) this specimen's stem
  // instance currently lives in, `null` when stemPools is omitted or the port has no stem
  // (rosette).
  // scene: the THREE.Scene (or any object exposing add/remove) Groups/pools are added to/removed
  // from.
  // s: the live GardenState save (s.specimens/s.cultivars).
  // stemPools: optional, see the header comment above.
  //
  // Each call: removes the Group (and any pooled stem instance) of any specimen no longer in
  // s.specimens (delivered via a contract, garden-state-cmd-r.js's deliverContract — the only site
  // that ever shortens s.specimens, verified before writing this module); builds the Group of any
  // new specimen id; rebuilds ENTIRELY (never mutates in place — buildSpecimenGroup cannot change
  // its own stage after construction) the Group of any specimen whose derived stage
  // (Cultivars.specimenStage(s, specimen), never the raw specimen.stage field, stale since C7.2)
  // no longer matches the stage already recorded on group.userData by buildSpecimenGroup itself —
  // never a second, duplicated tracking field. A specimen whose cultivar cannot be resolved yet
  // is skipped, same defensive posture render-flow.js's own Rainelle sync already uses for the
  // same situation.
  function syncSpecimenModels(registry, scene, s, stemPools) {
    const liveIds = new Set(s.specimens.map((sp) => sp.id));
    for (const [id, sm] of registry) {
      if (!liveIds.has(id)) {
        scene.remove(sm.group);
        if (sm.stemPool) RenderInstances.remove(sm.stemPool, id);
        registry.delete(id);
      }
    }
    for (const specimen of s.specimens) {
      const cultivar = s.cultivars.find((c) => c.id === specimen.cultivarId);
      if (!cultivar) continue;
      const stage = Cultivars.specimenStage(s, specimen);
      let sm = registry.get(specimen.id);
      if (sm && sm.group.userData.stage !== stage) {
        scene.remove(sm.group);
        if (sm.stemPool) RenderInstances.remove(sm.stemPool, specimen.id);
        registry.delete(specimen.id);
        sm = null;
      }
      if (!sm) {
        const group = Hybrids.buildSpecimenGroup(cultivar, stage);
        let stemPool = null;
        if (stemPools) {
          const stemMesh = group.userData.stemMesh;
          if (stemMesh) {
            stemMesh.parent.remove(stemMesh);
            stemPool = stemPoolFor(stemPools, scene, stemMesh.geometry, stemMesh.material);
          }
        }
        scene.add(group);
        sm = { group, stemPool };
        registry.set(specimen.id, sm);
      }
      sm.group.position.set(
        specimen.x,
        Terrain.terrainHeight(specimen.x, specimen.z),
        specimen.z,
      );
      if (sm.stemPool) {
        RenderInstances.set(
          sm.stemPool,
          specimen.id,
          stemInstanceMatrix(sm.group.position, sm.group.scale.x),
        );
      }
    }
  }

  const api = { syncSpecimenModels };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderSpecimens = api;
})(typeof window !== "undefined" ? window : globalThis);
