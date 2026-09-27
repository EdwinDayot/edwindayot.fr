/* Rainelle body rendering (epic C5.9, docs/campagne-backlog.md): builds a Group for one
   Rainelle (rainelles.js schema) wearing the foliage of the cultivar it carries (cultivars.js),
   reusing botany-hybrids.js's own leaf-organ library and material cache rather than a second one
   (design §5: "les Rainelles partagent un corps animé commun et des points d'attache végétaux";
   execution-continue.md/direction-artistique.md: reuse the existing style, never invent a
   parallel one).

   The creature body itself — torso, head, eyes, legs — is this module's own asset, never a plant
   skeleton: a small four-legged silhouette shared, geometry AND material alike, by every
   Rainelle regardless of cultivar (design §5: "un corps animé commun... jamais recalculés par
   individu"). Only the foliage organs attached to its back are botany-hybrids.js's own
   buildLeafOrgan/organMaterial, called here exactly as botany-hybrids.js calls them on a plant's
   own skeleton — never a second leaf geometry/material cache.

   Visual seed: derived from the RAINELLE's own id (Hybrids.seedFromId/mulberry32 — the exact
   same PRNG family already used for plant organ layout, not a second one), never the cultivar id
   alone: two Rainelles sharing a cultivar would otherwise be pixel-identical, contradicting
   design chapter 6's "une marque distinctive... qui ne se perdent jamais dans un lot". That seed
   fixes only the one minor, individually-owned variation the C5.9 criterion asks for (an
   accent-coloured mark, MARK_COLORS below) — the foliage LAYOUT (which attach point gets which
   azimuth/tilt) is a fixed shape shared by every Rainelle; only the foliage's colour/geometry
   comes from the referenced cultivar and is already shared across that cultivar's own specimens
   by botany-hybrids.js's own cache, nothing here duplicates that guarantee.

   buildRainelleGroup itself still takes no position/movement — epic C5.9's own explicit scope
   limit (see its backlog entry: "sans position ni déplacement") — and stays a pure function
   returning a detached Group, exercised directly by tests/campaign-rainelle-render.cjs (Node, no
   browser), by the comparison bench in tests/campaign-rainelle-visual.cjs, and by the live-page
   block added to tests/garden-material-audit.cjs — the same two-tier pattern already used for
   botany-hybrids.js (C1.7/C1.8) and render-campaign-house.js (C3.2/C2.2v). CORRECTION (epic C7.13,
   see its own Cartographe note in docs/campagne-backlog.md/campagne.md): the claim once written
   here that this module had "no call site in the real render loop" was already false and never
   re-checked — render-flow.js has called buildRainelleGroup from sync() since epic C5.11, exactly
   the wiring that C7.9/C7.10 already assumed didn't exist for Rainelles. It does now, so this file
   also exposes syncRainelleModels (below), the pool-aware sync render-flow.js delegates to, on the
   exact model render-specimens.js's own syncSpecimenModels already established.

   Epic C7.13: the shared body (torso, head, two eyes, four legs) and the individual mark built by
   buildBody()/attachMark() above are exposed as group.userData.bodyMeshes — a flat
   `[{mesh, key, localMatrix}]` list, `key` a stable per-piece suffix ("torso", "head", "eye0",
   "eye1", "leg0".."leg3", "mark") and `localMatrix` each Mesh's fixed transform relative to
   `group`'s own frame, captured once via `structure.updateMatrixWorld(true)` +
   `mesh.matrixWorld.clone()` — the exact technique botany-hybrids.js's own organMeshes capture
   (C7.10) already documents and this file reuses rather than reinventing. Foliage organs
   (attachFoliage) are deliberately NOT included here (a real second difficulty — geometry/material
   vary by cultivar rather than being fixed for every Rainelle — left to a future epic, same
   sequencing C7.9 -> C7.10 already used for specimens). buildRainelleGroup itself never detaches or
   pools anything — same "pure builder" contract as before this epic — that is syncRainelleModels's
   job, exactly mirroring how botany-hybrids.js exposes stemMesh/organMeshes without pooling them
   itself.

   Self-contained beyond botany-hybrids.js, render-instances.js (C7.8) and terrain.js: only THREE
   and those three sibling modules are required, so this loads and runs identically in a plain Node
   vm sandbox and in the browser (same posture documented in each of those files' own headers). */
(function (root) {
  const T = root.THREE;
  if (!T) return;
  const Hybrids =
    typeof module !== "undefined" ? require("./botany-hybrids.js") : root.GardenBotanyHybrids;
  const RenderInstances =
    typeof module !== "undefined" ? require("./render-instances.js") : root.GardenRenderInstances;
  const Terrain = typeof module !== "undefined" ? require("./terrain.js") : root.GardenTerrain;
  if (!Hybrids || !RenderInstances || !Terrain) return;

  // Skin/eye: literal hex values already documented in direction-artistique.md — "peau" 0xe1b08a
  // from the "accents chauds" family row, 0x493323 from the "terre/argile/graine" row. This
  // module's own small material cache, kept separate from Hybrids.organMaterial (reserved below
  // strictly for the reused foliage organs, whose colours come from a cultivar's trait *labels*,
  // not a literal hex) — same separation render-campaign-house.js already uses for its own walls
  // rather than calling into botany-hybrids.js for an unrelated asset.
  const SKIN = 0xe1b08a,
    EYE = 0x493323;

  // Individual accent mark: five hues, all already documented in direction-artistique.md's
  // "accents chauds" family, none of them tagged there for an already-reserved use (unlike
  // "joueur" 0xedc08b or the two lantern tones, deliberately excluded) — a Rainelle's own mark is
  // an incidental new use of an existing family, not an invented colour.
  const MARK_COLORS = [0xe8bd53, 0xd7a3ac, 0xe1b153, 0xcb9f97, 0xeac987];

  const materialCache = new Map();
  function bodyMaterial(hex, roughness) {
    const key = hex + ":" + roughness;
    if (!materialCache.has(key))
      materialCache.set(
        key,
        new T.MeshStandardMaterial({ color: hex, roughness, metalness: 0 }),
      );
    return materialCache.get(key);
  }

  const geometryCache = new Map();
  function sharedGeometry(key, create) {
    if (!geometryCache.has(key)) geometryCache.set(key, create());
    return geometryCache.get(key);
  }

  function mesh(geometry, mat, parent, x, y, z) {
    const m = new T.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // Fixed positions in the body's own local space — shared, never derived from any id or
  // cultivar, since only the accent mark (below) is meant to vary per individual.
  const BACK_ATTACH_POINTS = [
    { point: new T.Vector3(-0.07, 0.2, 0.02), azimuth: -0.5, tilt: 0.55 },
    { point: new T.Vector3(0, 0.23, -0.03), azimuth: 0, tilt: 0.5 },
    { point: new T.Vector3(0.07, 0.2, 0.02), azimuth: 0.5, tilt: 0.55 },
  ];
  // Botany-hybrids.js's own leaf organs are sized for a plant; scaled down here so they read as
  // foliage on a small creature's back rather than dwarfing it.
  const FOLIAGE_SCALE = 0.42;

  const LEG_POSITIONS = [
    [-0.08, 0.063, 0.07],
    [0.08, 0.063, 0.07],
    [-0.08, 0.063, -0.06],
    [0.08, 0.063, -0.06],
  ];

  // The shared body: torso capsule, rounded head, two eyes, four leg stubs — simple primitives
  // only (direction-artistique.md: "formes composées de primitives simples, jamais de maillage
  // sculpté à la main"). A fresh Group per call (so each Rainelle can be positioned/removed
  // independently later), but every mesh inside references the SAME cached geometry/material
  // objects regardless of which Rainelle or cultivar called it — design §5's "corps animé
  // commun... jamais recalculés par individu".
  // Returns { structure, bodyMeshes }: bodyMeshes is a flat [{mesh, key}] list, one entry per real
  // body Mesh, `key` the stable per-piece suffix syncRainelleModels/poolBodyMeshes use to build
  // each pooled instance's id (epic C7.13) — `localMatrix` is filled in by buildRainelleGroup once
  // the mark (attachMark, below) is also in place, never here (this function knows nothing about
  // pooling itself, same separation buildSkeleton/buildSpecimenGroup already keep in
  // botany-hybrids.js).
  function buildBody() {
    const structure = new T.Group();
    const skinMat = bodyMaterial(SKIN, 0.4);
    const eyeMat = bodyMaterial(EYE, 0.25);
    const bodyMeshes = [];

    const torsoGeo = sharedGeometry("torso", () => {
      const g = new T.CapsuleGeometry(0.1, 0.12, 4, 10);
      g.rotateX(Math.PI / 2); // capsule's default long axis (Y) -> Z, front-to-back body
      return g;
    });
    bodyMeshes.push({ mesh: mesh(torsoGeo, skinMat, structure, 0, 0.13, 0), key: "torso" });

    const headGeo = sharedGeometry("head", () => new T.SphereGeometry(0.085, 10, 8));
    bodyMeshes.push({ mesh: mesh(headGeo, skinMat, structure, 0, 0.15, -0.14), key: "head" });

    const eyeGeo = sharedGeometry("eye", () => new T.SphereGeometry(0.018, 6, 6));
    bodyMeshes.push({ mesh: mesh(eyeGeo, eyeMat, structure, -0.045, 0.2, -0.19), key: "eye0" });
    bodyMeshes.push({ mesh: mesh(eyeGeo, eyeMat, structure, 0.045, 0.2, -0.19), key: "eye1" });

    const legGeo = sharedGeometry("leg", () => new T.CapsuleGeometry(0.028, 0.07, 3, 6));
    LEG_POSITIONS.forEach(([x, y, z], i) => {
      bodyMeshes.push({ mesh: mesh(legGeo, skinMat, structure, x, y, z), key: "leg" + i });
    });

    return { structure, bodyMeshes };
  }

  // Foliage: reuses Hybrids.buildLeafOrgan/organMaterial verbatim (see header) — never a second
  // leaf library. Only feuilles are attached (a Rainelle carries "le feuillage du cultivar
  // croisé cette nuit-là", design §5 — not its parent cultivar's flowers, which never bloom on a
  // creature; a cultivar with no feuilles trait simply grows no foliage here either).
  function attachFoliage(structure, traits) {
    if (!traits.feuilles) return [];
    const isEclairer = !!(traits.fonction && traits.fonction.type === "eclairer");
    const leafMat = Hybrids.organMaterial(traits.palette.dominante1, 0.46, isEclairer);
    const organs = [];
    for (const ap of BACK_ATTACH_POINTS) {
      const branch = Hybrids.buildLeafOrgan(traits.feuilles, leafMat, ap.azimuth, ap.tilt);
      branch.position.copy(ap.point);
      branch.scale.setScalar(FOLIAGE_SCALE);
      structure.add(branch);
      organs.push({ kind: "leaf", branch, attach: ap });
    }
    return organs;
  }

  // Individual mark: a small flattened patch, colour + side picked by a seed derived from the
  // RAINELLE's own id (never the cultivar's) — see header. Placed on the flank rather than the
  // back (kept clear of BACK_ATTACH_POINTS above, whose foliage otherwise hides a mark placed
  // among it — found during this epic's own multimodal review, see campagne.md) so it stays
  // legible instead of buried under the foliage crown. Geometry is shared (one flattened sphere,
  // cached); only its material/placement differs per individual, and even those materials are
  // cached/shared across every Rainelle that happens to draw the same hue.
  function attachMark(structure, rainelleId) {
    const rng = Hybrids.mulberry32(Hybrids.seedFromId(rainelleId));
    const hex = MARK_COLORS[Math.floor(rng() * MARK_COLORS.length)];
    const side = rng() < 0.5 ? -1 : 1;
    const geo = sharedGeometry("mark", () => {
      const g = new T.SphereGeometry(0.028, 8, 6);
      g.scale(1, 0.7, 0.5);
      return g;
    });
    const mat = bodyMaterial(hex, 0.35);
    const m = mesh(geo, mat, structure, side * 0.097, 0.13, -0.02);
    m.rotation.y = side * (Math.PI / 2);
    return { hex, side, mesh: m };
  }

  // Builds one Rainelle's Group. `rainelle` needs only `.id` (rainelles.js schema); `cultivar`
  // needs only `.traits`, matching the exact shape botany-hybrids.js itself accepts (a
  // cultivars.js entry `{id, name, parentIds, traits}`, or a plain founder/hybrid trait object
  // with `{id, traits}`) — resolving the real cultivar object from a Rainelle's cultivarId is the
  // caller's job (e.g. `s.cultivars.find(c => c.id === rainelle.cultivarId)`, the same lookup
  // cultivars.js's own specimenTraits() already does), never duplicated here.
  function buildRainelleGroup(rainelle, cultivar) {
    if (!rainelle || !rainelle.id) throw new Error("rainelle id required");
    if (!cultivar || !cultivar.traits) throw new Error("cultivar (with traits) required");
    const group = new T.Group();
    const { structure, bodyMeshes } = buildBody();
    group.add(structure);
    const organs = attachFoliage(structure, cultivar.traits);
    const mark = attachMark(structure, rainelle.id);
    bodyMeshes.push({ mesh: mark.mesh, key: "mark" });
    // Epic C7.13: capture each body/mark Mesh's transform relative to `group`'s OWN frame, once,
    // right here — the exact technique botany-hybrids.js's own organMeshes capture (C7.10) already
    // documents in full. `group` was just created above and never had updateMatrixWorld called on
    // it, so its matrixWorld is still THREE's default identity; structure.updateMatrixWorld(true)
    // forces a fresh computation for `structure` and every descendant (body, foliage, mark) using
    // that identity as the parent matrix — exactly why the result already equals each Mesh's fixed
    // transform in group's own frame. These positions never change after construction (design: a
    // fixed body/mark layout), so a one-time capture is correct forever, not merely at this instant.
    structure.updateMatrixWorld(true);
    for (const bm of bodyMeshes) bm.localMatrix = bm.mesh.matrixWorld.clone();
    group.userData = { rainelleId: rainelle.id, cultivarId: cultivar.id, organs, mark, bodyMeshes };
    return group;
  }

  // ---- Epic C7.13: pooling the shared body/mark meshes into render-instances.js pools ----

  // First estimate, named and revisable (same posture as render-specimens.js's own
  // STEM_POOL_INITIAL_CAPACITY) — render-instances.js grows a pool automatically past this, never
  // a hard cap.
  const BODY_POOL_INITIAL_CAPACITY = 8;

  // pools: Map<geometry, Map<material, pool>> -> the one pool for this exact (geometry, material)
  // object pair, creating both the pool and any missing map level on first use — same generic
  // lookup already established by render-specimens.js's own poolFor, never a second divergent
  // implementation of the same nested-Map pattern.
  function poolFor(pools, scene, geometry, material) {
    let byMaterial = pools.get(geometry);
    if (!byMaterial) {
      byMaterial = new Map();
      pools.set(geometry, byMaterial);
    }
    let pool = byMaterial.get(material);
    if (!pool) {
      pool = RenderInstances.createInstancePool(scene, geometry, material, BODY_POOL_INITIAL_CAPACITY);
      byMaterial.set(material, pool);
    }
    return pool;
  }

  // Detaches every body/mark Mesh of a freshly built Rainelle Group from its (real, in-scene)
  // structure and registers each into its shared pool. Returns an array parallel to
  // group.userData.bodyMeshes: [{key, localMatrix, pool}] — the per-Rainelle bookkeeping
  // syncRainelleModels keeps in its registry to later update (syncBodyMeshInstances) or release
  // (releaseBodyMeshPools) these instances. Two Rainelles of the SAME cultivar share their eight
  // body pools (torso/head/eye0/eye1/leg0..3, keyed by the shared geometry+material objects, never
  // recomputed) exactly as much as two Rainelles of DIFFERENT cultivars do — the body is common to
  // every Rainelle regardless of cultivar (design §5, already true before this epic). Each
  // Rainelle's own mark lands in one of at most five pools (MARK_COLORS.length), keyed by its own
  // material object — never a per-Rainelle pool.
  function poolBodyMeshes(bodyPools, scene, group) {
    return group.userData.bodyMeshes.map((bm) => {
      bm.mesh.parent.remove(bm.mesh);
      const pool = poolFor(bodyPools, scene, bm.mesh.geometry, bm.mesh.material);
      return { key: bm.key, localMatrix: bm.localMatrix, pool };
    });
  }

  // Removes every pooled instance a Rainelle's bodyPoolEntries currently hold — swap-and-pop,
  // never a hole, guaranteed by render-instances.js's own remove(). No command deletes a Rainelle
  // from s.rainelles today (see this file's header), so this path is currently unreachable from
  // real gameplay, but syncRainelleModels below calls it correctly if a future epic ever shrinks
  // s.rainelles, on the same "stay correct even if that stopped being true" posture
  // render-specimens.js's own header already documents for its stem pool.
  function releaseBodyMeshPools(bodyPoolEntries, rainelleId) {
    if (!bodyPoolEntries) return;
    for (const entry of bodyPoolEntries) RenderInstances.remove(entry.pool, `${rainelleId}:${entry.key}`);
  }

  // Scratch objects reused across calls (render-instances.js's own set() copies the matrix
  // elements into the InstancedMesh's instance buffer immediately, so nothing here is retained by
  // reference beyond a single call) — no per-call allocation for what runs every sync().
  const UP = new T.Vector3(0, 1, 0);
  const _quat = new T.Quaternion();
  const _scale = new T.Vector3(1, 1, 1); // a Rainelle's Group is never scaled, unlike a specimen's stage scale
  const _worldMatrix = new T.Matrix4();
  const _instanceMatrix = new T.Matrix4();

  // The Rainelle Group's real world transform: position + heading (Y rotation only — a Rainelle
  // never tilts/rolls), composed once per id that actually needs updating (see
  // syncRainelleModels's own "isNew || moved" guard) rather than once per body piece, then combined
  // below with each piece's own fixed localMatrix.
  function rainelleWorldMatrix(position, rotationY) {
    _quat.setFromAxisAngle(UP, rotationY);
    return _worldMatrix.compose(position, _quat, _scale);
  }
  // Must be called only right after rainelleWorldMatrix() for the SAME Rainelle (reads the shared
  // `_worldMatrix` scratch that call just filled) — mirrors render-specimens.js's own
  // organInstanceMatrix in spirit.
  function bodyInstanceMatrix(localMatrix) {
    return _instanceMatrix.multiplyMatrices(_worldMatrix, localMatrix);
  }

  // Writes every pooled instance matrix for one Rainelle — called only when its position/heading
  // actually changed (or it was just created), never on an unchanged resync: render-instances.js's
  // own set() would otherwise mark instanceMatrix.needsUpdate on every one of these pools every
  // ~0.25s tick for every idle Rainelle, for no observable change — exactly the "jamais de travail
  // fantôme" discipline C7.9/C7.10 already established for specimens (whose position is fixed for
  // life, so the question never arose there the same way).
  function syncBodyMeshInstances(bodyPoolEntries, rainelleId, position, rotationY) {
    if (!bodyPoolEntries) return;
    rainelleWorldMatrix(position, rotationY);
    for (const entry of bodyPoolEntries)
      RenderInstances.set(entry.pool, `${rainelleId}:${entry.key}`, bodyInstanceMatrix(entry.localMatrix));
  }

  // registry: a Map id -> { group, x, z, bodyPoolEntries }, owned by the caller (render.js's
  // this.rainelleModels) — same convention as render-specimens.js's this.specimenModels.
  // scene: the THREE.Scene (or any object exposing add/remove) Groups/pools are added to/removed
  // from.
  // s: the live GardenState save (s.rainelles/s.cultivars).
  // bodyPools: optional Map<geometry, Map<material, pool>> (render.js's this.rainelleBodyPools).
  // Omitting it (every existing call site before this epic) leaves every body/mark Mesh exactly
  // where it always was, a normal child of the Group, byte-for-byte the prior behaviour.
  //
  // Replaces the sync loop render-flow.js's own sync() carried inline since epic C5.11, moved here
  // so it can be exercised directly in Node (tests/campaign-rainelle-render.cjs) rather than only
  // through a live page — the exact reasoning render-specimens.js's own header already gives for
  // why syncSpecimenModels lives there rather than inline in render-flow.js. Returns
  // { batchDirty }, since render-flow.js's `this.batchDirty = true` on a newly built Group (byte-
  // for-byte the pre-C7.13 behaviour) is a caller-owned field this module has no access to.
  function syncRainelleModels(registry, scene, s, bodyPools) {
    let batchDirty = false;
    const liveIds = new Set(s.rainelles.map((r) => r.id));
    for (const [id, rm] of registry) {
      if (!liveIds.has(id)) {
        scene.remove(rm.group);
        releaseBodyMeshPools(rm.bodyPoolEntries, id);
        registry.delete(id);
        batchDirty = true;
      }
    }
    for (const r of s.rainelles) {
      if (!Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
      let rm = registry.get(r.id);
      let isNew = false;
      if (!rm) {
        const cultivar = s.cultivars.find((c) => c.id === r.cultivarId);
        if (!cultivar) continue; // no cultivar to draw foliage from yet — nothing to add
        const group = buildRainelleGroup(r, cultivar);
        const bodyPoolEntries = bodyPools ? poolBodyMeshes(bodyPools, scene, group) : null;
        scene.add(group);
        rm = { group, x: r.x, z: r.z, bodyPoolEntries };
        registry.set(r.id, rm);
        batchDirty = true;
        isNew = true;
      }
      const y = Terrain.terrainHeight(r.x, r.z);
      // Face the direction actually walked this step — a Rainelle standing still (already on its
      // target cell) keeps whatever heading it last had, never snaps to a default.
      let moved = false;
      if (r.x !== rm.x || r.z !== rm.z) {
        rm.group.rotation.y = Math.atan2(r.x - rm.x, r.z - rm.z);
        rm.x = r.x;
        rm.z = r.z;
        moved = true;
      }
      rm.group.position.set(r.x, y, r.z);
      if (rm.bodyPoolEntries && (isNew || moved))
        syncBodyMeshInstances(rm.bodyPoolEntries, r.id, rm.group.position, rm.group.rotation.y);
    }
    return { batchDirty };
  }

  // ---- Epic C7.13: bounding-box helper, corrected for pooled body/mark meshes ----

  // Built once from a throwaway body (never added to any scene, never pooled): the fixed body
  // shape (torso/head/eyes/legs) is identical for every Rainelle regardless of cultivar (see
  // buildBody's own header), so its LOCAL bounding box (in `group`'s own frame, same convention as
  // every localMatrix captured above) is a true constant, computed once and memoised rather than
  // per call.
  let _bodyLocalBounds = null;
  function bodyLocalBounds() {
    if (_bodyLocalBounds) return _bodyLocalBounds;
    const { structure, bodyMeshes } = buildBody();
    structure.updateMatrixWorld(true);
    const box = new T.Box3();
    const pieceBox = new T.Box3();
    for (const bm of bodyMeshes) {
      bm.mesh.geometry.computeBoundingBox();
      pieceBox.copy(bm.mesh.geometry.boundingBox).applyMatrix4(bm.mesh.matrixWorld);
      box.union(pieceBox);
    }
    _bodyLocalBounds = box;
    return box;
  }

  // Drop-in replacement for `new T.Box3().setFromObject(group)` — what render-items.js's
  // beginGestureScene/opening-shots code used, before this epic, to frame a camera on a Rainelle.
  // That call alone is no longer correct once bodyPools is used: a pooled body/mark instance lives
  // in a shared InstancedMesh elsewhere in the scene, not as a descendant of `group` any more, so
  // setFromObject(group) would see only the foliage (or nothing at all, for a Rainelle whose
  // cultivar grows none) — exactly the silent regression this function exists to prevent. Correct
  // and safe to call unconditionally, whether or not this particular Group's body is pooled:
  // `setFromObject(group)` still picks up the body directly when it is NOT pooled (a normal child),
  // and unioning with the transformed body bounds a second time in that case is harmless (union of
  // an already-covered region changes nothing).
  function groupBounds(group) {
    group.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(group);
    box.union(bodyLocalBounds().clone().applyMatrix4(group.matrixWorld));
    return box;
  }

  const api = {
    SKIN,
    EYE,
    MARK_COLORS,
    FOLIAGE_SCALE,
    buildRainelleGroup,
    syncRainelleModels,
    groupBounds,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderRainelles = api;
})(typeof window !== "undefined" ? window : globalThis);
