/* Epic C7.5 (docs/campagne-backlog.md) — load scene and measured rendering budget for cultivar
   specimens (public/game/render-specimens.js, C7.4). Builds three named specimen-count tiers
   (40/120/240 — design §14's three reference load volumes, transposed to specimens alone, per
   this epic's own criterion) across two cultivars and all three growth stages, synced through the
   real `RenderSpecimens.syncSpecimenModels` (via the live page's own `v.sync()`, never an isolated
   `buildSpecimenGroup()` call — same discipline as tests/garden-material-audit.cjs's own C7.4
   extension), then reads `view.renderer.info.render.calls`/`.triangles`/`.memory.geometries` —
   the exact same API tests/garden-visual.cjs already uses, never reinvented.

   Deviation from the epic's literal wording, MEASURED before writing a single assertion below, not
   assumed (tests/_probe.cjs, run against this exact page, discarded after use — see the commit
   message for the raw numbers): the backlog text predicted render.calls/render.triangles would
   grow "strictement moins que linéairement" with specimen count as proof of geometry sharing. That
   is not what a real, unshared-per-mesh renderer does: botany-hybrids.js's buildSpecimenGroup()
   gives every specimen its OWN Mesh objects (Group/Mesh nodes, one draw call each), only their
   geometry/material objects are shared — Three.js's WebGLRenderer issues one draw call per Mesh
   regardless of whether its geometry buffer is deduplicated, and counts that mesh's triangles every
   time it draws, so calls and triangles scale with visible MESH count, i.e. essentially linearly
   with specimen count. Measured: ~6 draw calls and ~475 triangles added per specimen, consistent to
   within ~1% whether the tier is 40 or 240 specimens (see the assertion below, computed
   independently in this file, never copied from that throwaway probe). What DOES stay flat
   regardless of specimen count is `renderer.info.memory.geometries` — the number of distinct
   BufferGeometry objects the renderer has ever seen — because every specimen of the same cultivar
   reuses the identical cached geometry objects (botany-hybrids.js's own `sharedGeometry` cache).
   That is the actual, verifiable "un cultivar = une signature visuelle réutilisée" guarantee at
   scale (already proven for two specimens by tests/campaign-specimen-render.cjs's own Node test;
   this epic is the first to prove it holds at 240). This test therefore asserts the TRUE, measured
   properties — bounded geometry memory regardless of scale, and a per-specimen draw/triangle cost
   that stays stable (not accelerating) across tiers — rather than an assertion that would either
   be false or would have to be silently weakened to pass. Consigné aussi dans docs/campagne.md,
   pas seulement ici.

   Epic C7.9 update, MEASURED against this exact updated page before writing the new assertion
   below (raw numbers: baseline calls=116 at n=0; deltas 224/680/1360 at n=40/120/240 — see the
   commit message): per-specimen draw calls dropped from the ~6 recorded above to ~5.6–5.67 once
   stems are pooled into a shared InstancedMesh (render-instances.js) instead of one Mesh per
   specimen — only one of this test's two cultivars (`charge-b`, tige-dressee) has a stem at all
   (`charge-a` is oreille-de-pluie, port "rosette", no stem — botany-hybrids.js's buildSkeleton
   never builds one for it), so the population-wide average drop is roughly half a call per
   specimen, not a full one, exactly as expected for a 50/50 mix of the two cultivars. Triangle
   count is unaffected (removing a Mesh from the scene graph and adding its exact same geometry to
   an InstancedMesh changes draw-call count, never triangle count). `renderer.info.memory.geometries`
   stays exactly as flat as before (the pooled stem geometry is the SAME cached object, never a new
   one). The number of distinct stem pools (`v.specimenStemPools`) must also stay flat regardless of
   tier size — bounded by the number of distinct (geometry, material) pairs actually present among
   the fixed set of cultivars this test creates (one, here: only `charge-b` has a stem), never by
   specimen count.

   Epic C7.10 update — organs (leaves/flowers) pooled too, MEASURED against this exact updated page
   before writing the new assertion below (tests/_probe.cjs, discarded after use, same discipline as
   above; raw numbers in the commit message): once every organ Mesh is ALSO detached into a shared
   InstancedMesh (render-specimens.js's `organPools`), a specimen's own Group is left holding no
   Mesh at all any more (stem AND every leaf/flower already pooled) — draw calls therefore stop
   scaling with specimen count altogether. Measured: calls delta above baseline is the EXACT SAME
   120 - 116 = 4 at n=40, n=120 AND n=240 (never growing), the 4 being exactly `v.specimenStemPools`'s
   1 pool plus `v.specimenOrganPools`'s 3 distinct (geometry, material) pairs actually used by this
   test's two cultivars (charge-a/oreille-de-pluie: one leaf shape/colour, no flowers; charge-b/
   clochette-du-soir: one leaf shape/colour, one flower shape/colour — 1 + 1 + 1 = 3, verified by
   this file's own `organPoolCount` measurement below, never assumed). This is the further "chute"
   this epic's own criterion asks to measure and document against the C7.9 figure above: per-specimen
   draw calls at the largest tier (240) fall from ~5.62 (C7.9) to 4/240 ≈ 0.017 — over two orders of
   magnitude lower, because virtually the entire population now renders through a small, FIXED number
   of InstancedMesh draw calls instead of one Mesh per specimen part. Triangle count is unaffected,
   same reasoning as the C7.9 note above (pooling moves WHERE a Mesh's geometry is submitted from,
   never how many triangles it contributes once submitted) — still ~472-476 triangles/specimen,
   stable across tiers. `renderer.info.memory.geometries` stays exactly as flat as before (every
   pooled organ geometry is one of botany-hybrids.js's own already-cached objects, never a new one).
   The number of distinct organ pools (`v.specimenOrganPools`) must also stay flat regardless of tier
   size, same "bounded by the number of distinct (geometry, material) pairs actually present, never
   by specimen count" guarantee already established for stem pools — measured at exactly 3 for this
   test's fixed two-cultivar population. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

// Design §14's three reference load volumes, transposed to specimens alone (this epic's own
// criterion) — named here, not a magic array inlined below.
const TIERS = [40, 120, 240];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    // Same documented fallback as every other Playwright test in this suite.
    executablePath: fs.existsSync("/opt/pw-browsers/chromium")
      ? "/opt/pw-browsers/chromium"
      : undefined,
    args: process.platform === "darwin" ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")] : [],
  });
  try {
    const p = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const consoleErrors = [];
    p.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    p.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));
    await p.goto(url, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      () =>
        window.GardenApp &&
        window.GardenApp.view &&
        window.GardenCultivars &&
        window.GardenGenetics &&
        window.GardenRenderSpecimens,
      null,
      { timeout: 30000 },
    );
    await p.waitForTimeout(500);

    const measured = await p.evaluate((tiers) => {
      const s = window.GardenApp.game.s;
      const v = window.GardenApp.view;
      const Cultivars = window.GardenCultivars;
      const Genetics = window.GardenGenetics;

      // At least two cultivars, exercising the three growth stages, per this epic's criterion.
      const cultivarA = Cultivars.createCultivar(s, { name: "charge-a", traits: Genetics.founders[0].traits });
      const cultivarB = Cultivars.createCultivar(s, { name: "charge-b", traits: Genetics.founders[1].traits });
      const cultivarIds = [cultivarA.id, cultivarB.id];
      const stages = [0, 1, Cultivars.MATURE_STAGE];

      const nanMeshNames = [];
      function checkFinite(group) {
        group.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const pos = o.geometry.attributes.position;
          if (!pos) return;
          for (let i = 0; i < pos.array.length; i++) {
            if (!Number.isFinite(pos.array[i])) {
              nanMeshNames.push(o.name || o.type);
              break;
            }
          }
        });
      }

      // Positioned far off the playable area, same convention as every block in
      // tests/garden-material-audit.cjs — this test measures the scene graph/renderer counters,
      // never a screenshot a human or model looks at, so proximity to the player never matters.
      function buildTier(n) {
        s.specimens = [];
        v.sync(); // tears down the previous tier's Groups through the real removal path first.
        const perRow = Math.ceil(Math.sqrt(n)) || 1;
        for (let i = 0; i < n; i++) {
          Cultivars.createSpecimen(s, {
            cultivarId: cultivarIds[i % cultivarIds.length],
            x: 300 + (i % perRow) * 1.2,
            z: 300 + Math.floor(i / perRow) * 1.2,
            stage: stages[i % stages.length],
          });
        }
        v.sync();
        // This test measures the specimen registry's OWN rendering budget, independent of
        // whichever way the live camera's frustum happens to be pointed (irrelevant here, same
        // spirit as render-world.js/render-light.js already setting frustumCulled = false on
        // content that must always contribute regardless of view direction) — never a claim about
        // real gameplay camera framing, only about what this registry submits to the renderer.
        for (const sm of v.specimenModels.values()) sm.group.traverse((o) => (o.frustumCulled = false));
        // Epic C7.9: pooled stem InstancedMesh objects are added directly to the scene, never as
        // children of a specimen Group any more (see render-specimens.js) — the loop above never
        // reaches them, so they need the same frustumCulled override to be measured correctly
        // regardless of camera framing, same reasoning as that loop's own comment.
        let stemPoolCount = 0;
        for (const byMaterial of v.specimenStemPools.values())
          for (const pool of byMaterial.values()) {
            pool.mesh.frustumCulled = false;
            stemPoolCount++;
          }
        // Epic C7.10: same treatment, generalised to the pooled organ (leaf/flower) InstancedMesh
        // objects — also added directly to the scene, never reached by the specimen-Group loop
        // above, and never by the stem loop just above either (a distinct Map, `v.specimenOrganPools`).
        let organPoolCount = 0;
        for (const byMaterial of v.specimenOrganPools.values())
          for (const pool of byMaterial.values()) {
            pool.mesh.frustumCulled = false;
            organPoolCount++;
          }
        v.frame(0.016, {}, true);
        return {
          n,
          registrySize: v.specimenModels.size,
          calls: v.renderer.info.render.calls,
          triangles: v.renderer.info.render.triangles,
          geometries: v.renderer.info.memory.geometries,
          stemPoolCount,
          organPoolCount,
        };
      }

      const baseline = buildTier(0);
      const results = tiers.map(buildTier);
      for (const sm of v.specimenModels.values()) checkFinite(sm.group);
      // Epic C7.9: the pooled stem InstancedMesh objects live outside any specimen Group now, so
      // the loop above never reaches their (shared, unchanged) geometry — checked explicitly here.
      for (const byMaterial of v.specimenStemPools.values())
        for (const pool of byMaterial.values()) checkFinite(pool.mesh);
      // Epic C7.10: same check, generalised to the pooled organ InstancedMesh objects.
      for (const byMaterial of v.specimenOrganPools.values())
        for (const pool of byMaterial.values()) checkFinite(pool.mesh);

      // Resync with no state change at the largest tier already built: nothing should move.
      v.sync();
      v.frame(0.016, {}, true);
      const resynced = {
        registrySize: v.specimenModels.size,
        calls: v.renderer.info.render.calls,
        triangles: v.renderer.info.render.triangles,
        geometries: v.renderer.info.memory.geometries,
      };

      return { baseline, results, resynced, nanMeshNames };
    }, TIERS);

    if (consoleErrors.length)
      throw new Error("Console errors during the C7.5 load scene:\n" + consoleErrors.join("\n"));

    assert.deepEqual(
      measured.nanMeshNames,
      [],
      "Non-finite vertex position(s) in the largest specimen load tier: " + measured.nanMeshNames.join(", "),
    );

    for (const r of measured.results) {
      assert.equal(r.registrySize, r.n, `tier ${r.n}: registry did not hold exactly ${r.n} specimens`);
    }

    // Bounded geometry memory regardless of scale — the real, verified sharing guarantee at this
    // size (see header comment): the SAME delta above baseline whether the tier is the smallest or
    // the largest, never growing with specimen count.
    const geomDeltas = measured.results.map((r) => r.geometries - measured.baseline.geometries);
    assert.equal(
      geomDeltas[0],
      geomDeltas[geomDeltas.length - 1],
      "geometry object count grew with specimen count (" +
        JSON.stringify(geomDeltas) +
        ") — geometry sharing across specimens of the same cultivar/stage broke at scale",
    );
    assert.ok(geomDeltas[0] > 0 && geomDeltas[0] < 20, "unexpected geometry delta: " + geomDeltas[0]);

    // Per-specimen triangle cost stays stable across tiers (linear growth is expected and correct
    // — see header comment — but it must never accelerate, which would signal an accidental
    // quadratic cost somewhere in the sync loop). Pooling never changes triangle count (only WHERE
    // a Mesh's geometry gets submitted from), so this check is unaffected by C7.10.
    const perSpecimen = measured.results.map((r) => ({
      n: r.n,
      calls: (r.calls - measured.baseline.calls) / r.n,
      triangles: (r.triangles - measured.baseline.triangles) / r.n,
    }));
    const smallest = perSpecimen[0],
      largest = perSpecimen[perSpecimen.length - 1];
    const trianglesRatio = largest.triangles / smallest.triangles;
    assert.ok(
      trianglesRatio > 0.9 && trianglesRatio < 1.1,
      `per-specimen triangle cost is not stable across tiers (smallest=${smallest.triangles}, largest=${largest.triangles}, ratio=${trianglesRatio})`,
    );

    // Epic C7.10: draw calls no longer scale with specimen count AT ALL once organs are pooled
    // alongside the stem (header comment above) — every specimen part that used to submit its own
    // Mesh now goes through one of a small, fixed number of InstancedMesh draw calls instead. The
    // delta above baseline must therefore be the EXACT SAME value at every tier, never merely
    // "stable within a ratio" as the pre-C7.10 per-specimen check used to assert (that check no
    // longer makes sense once the per-specimen cost trends toward zero, rather than toward a
    // stable positive constant).
    const callDeltas = measured.results.map((r) => r.calls - measured.baseline.calls);
    assert.equal(
      callDeltas[0],
      callDeltas[callDeltas.length - 1],
      "draw-call delta above baseline grew with specimen count (" +
        JSON.stringify(callDeltas) +
        ") — organ/stem pooling regression: some organ Mesh is being submitted per-specimen again instead of through a shared pool",
    );
    // Bounded above by the C7.9 measurement (that epic alone already got draw calls down near
    // n * ~5.6) and by a generous margin over the 4 actually observed (1 stem pool + 3 organ
    // pools for this test's fixed two-cultivar population) — loose enough to tolerate a future
    // cultivar/founder added to this same test needing one or two more pools, tight enough to
    // catch a regression that silently stopped pooling organs (which would push this back up
    // towards linear growth with n).
    assert.ok(callDeltas[0] > 0 && callDeltas[0] < 20, "unexpected constant draw-call delta: " + callDeltas[0]);

    // Epic C7.10: per-specimen draw-call cost at the largest tier must have genuinely dropped far
    // below the ~5.6-5.67 recorded by C7.9 (header comment above) now that organs are pooled too —
    // measured at 4/240 ≈ 0.017 for this exact fixture. The bound is loose (still an order of
    // magnitude of margin) but strictly below the C7.9 figure, so a regression that silently kept
    // organs unpooled (leaving per-specimen cost near 5.6 again) fails loudly here.
    const largestTierCalls = perSpecimen[perSpecimen.length - 1].calls;
    assert.ok(
      largestTierCalls < 1,
      `tier ${TIERS[TIERS.length - 1]}: per-specimen draw calls (${largestTierCalls}) did not drop far below the pre-C7.10 ~5.6/specimen baseline (C7.9) — organ pooling regression?`,
    );

    // Bounded stem-pool count regardless of scale — same "distinct object identity, not specimen
    // count" guarantee as the geometry check above, for the pools themselves this time.
    const stemPoolCounts = measured.results.map((r) => r.stemPoolCount);
    assert.equal(
      stemPoolCounts[0],
      stemPoolCounts[stemPoolCounts.length - 1],
      "stem pool count grew with specimen count (" + JSON.stringify(stemPoolCounts) + ") — pooling by (geometry, material) identity broke at scale",
    );
    assert.ok(stemPoolCounts[0] > 0 && stemPoolCounts[0] < 5, "unexpected stem pool count: " + stemPoolCounts[0]);

    // Epic C7.10: same "bounded, never proportional to specimen count" guarantee, for organ pools
    // — measured at exactly 3 for this test's fixed two-cultivar population (see header comment).
    const organPoolCounts = measured.results.map((r) => r.organPoolCount);
    assert.equal(
      organPoolCounts[0],
      organPoolCounts[organPoolCounts.length - 1],
      "organ pool count grew with specimen count (" + JSON.stringify(organPoolCounts) + ") — pooling by (geometry, material) identity broke at scale",
    );
    assert.ok(organPoolCounts[0] > 0 && organPoolCounts[0] < 20, "unexpected organ pool count: " + organPoolCounts[0]);

    // Resyncing with no state change must never rebuild anything (no phantom Group churn, no
    // renderer counter drift) — same "reused without change" guarantee as
    // tests/campaign-specimen-render.cjs's own Node test, here exercised at the largest tier.
    const lastTier = measured.results[measured.results.length - 1];
    assert.equal(measured.resynced.registrySize, lastTier.registrySize, "resync changed registry size");
    assert.equal(measured.resynced.calls, lastTier.calls, "resync changed draw-call count with no state change");
    assert.equal(measured.resynced.triangles, lastTier.triangles, "resync changed triangle count with no state change");
    assert.equal(measured.resynced.geometries, lastTier.geometries, "resync changed geometry object count with no state change");

    fs.writeFileSync("/tmp/campaign-specimen-load.json", JSON.stringify(measured, null, 2));
    console.log(
      "PASS campaign-specimen-load:",
      JSON.stringify({
        tiers: TIERS,
        geometryDeltaConstant: geomDeltas[0],
        stemPoolCountConstant: stemPoolCounts[0],
        organPoolCountConstant: organPoolCounts[0],
        callDeltaConstant: callDeltas[0],
        perSpecimenCallsAtLargestTier: largestTierCalls,
        perSpecimen,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-specimen-load:", e.message);
  process.exit(1);
});
