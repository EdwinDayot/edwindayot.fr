/* Epic C7.15 (docs/campagne-backlog.md) — load scene and measured rendering budget for the
   Rainelle body/foliage pools (public/game/render-rainelles.js, C7.13/C7.14). Transposes design
   §14's three reference load volumes (6/20/40 — "jardin simple/pépinière intermédiaire/domaine
   avancé") to Rainelles alone, exactly this epic's own criterion, NEVER the 40/120/240 specimen
   volumes tests/campaign-specimen-load.cjs (C7.5) already measured on the distinct specimen-pool
   system. Method deliberately copied from that file: a real campaign save built through the live
   page's own `s.cultivars`/`s.rainelles` + `v.sync()` call path (never an isolated
   `buildRainelleGroup()` call — same discipline as tests/garden-material-audit.cjs's own
   `rainelleBodyWiring`/`rainelleFoliageWiring` blocks, C7.13/C7.14, this file measures the same
   system at a much larger scale, not a replacement for it), reading
   `view.renderer.info.render.calls`/`.triangles`/`.memory.geometries` — the exact same API, never
   reinvented.

   Deviation from a naive reading, MEASURED before writing a single assertion below (this file's
   own `mark-color coverage` note just below), not assumed: unlike a specimen's stem/organ pools
   (keyed only by cultivar traits), a Rainelle's individual accent MARK is keyed by its own id via
   Hybrids.mulberry32(Hybrids.seedFromId(id)) (render-rainelles.js's attachMark) — a hash of the
   id STRING, not of anything this test controls directly through cultivar assignment. Since
   render.js's `this.rainelleBodyPools` Map only ever GROWS for the lifetime of the page (a pool,
   once created for a (geometry, material) pair, is never deleted even after every Rainelle
   referencing it is removed — see poolFor/releaseBodyMeshPools), the raw *count* of distinct mark
   pools discovered so far would, left to chance, tend to grow as MORE Rainelles (more random ids)
   are added between the smallest and largest tier — not because sharing broke, but simply because
   more individuals have more chances to roll a mark hue this view has never seen before. That
   would make criterion 1's "reste identique au plus petit et au plus grand palier" assertion
   depend on luck, which is not an acceptable basis for a real test. Fix, applied BEFORE any tier
   is built: this file brute-forces (using the exact real `Hybrids.mulberry32`/`Hybrids.seedFromId`
   this module already uses, never a second reimplementation) five fixed id strings, one per mark
   colour index, and materializes five permanent "seed" Rainelles carrying them — present in EVERY
   tier below, including the n=0 baseline. This deterministically discovers all five mark-colour
   pools (plus the four fixed body-piece pools: torso/head/eye/leg, discovered by the very first
   Rainelle ever synced) before baseline is even measured, so growing the population from 6 to 40
   afterward can only ever reuse those nine pools, never discover a tenth. Measured: exactly 9 body/
   mark pools at every one of the three tiers (see the commit message for the raw JSON). This is
   engineering the fixture for a deterministic test, not weakening the assertion: the real
   render-rainelles.js sharing guarantee (an already-created pool for a given (geometry, material)
   pair is reused, never duplicated) is exactly what makes a pre-seeded population behave this way
   at all — a broken implementation would still grow the pool count as new Rainelles/marks arrive
   even after seeding, since a broken pool-lookup would recreate pools it should have found.

   Foliage pools need no such seeding: keyed only by (leaf geometry, leaf material) — both derived
   from a CULTIVAR's own `feuilles.forme`/`palette.dominante1` (botany-hybrids.js's own shared
   cache), never from a Rainelle's individual id — so as long as every cultivar used by this test's
   population appears at least once in the smallest tier (guaranteed below: 6 Rainelles round-robin
   across exactly 4 cultivars), all of this test's foliage pools are already discovered by the
   smallest tier and stay flat through the largest one, no pre-seeding required. Four cultivars are
   used, per this epic's own criterion: `cvA` (feuilles "coupe"/"vert-sauge", founders[0]'s traits),
   `cvB` (feuilles "fine"/"bleu-nuit", founders[1]'s traits, a DIFFERENT forme+dominante1 from cvA,
   so its own distinct leaf pool), `cvBald` (founders[0]'s traits with `feuilles` deleted entirely —
   exercises the documented "no foliage pool at all" case, C7.14), and `cvTwin` (founders[0]'s
   traits again but a different `port`/`fleurs`/`fonction` and a DIFFERENT cultivar id — same
   `feuilles.forme`/`palette.dominante1` as cvA, so it must land in cvA's EXACT SAME leaf pool,
   never a second one keyed by cultivar identity — the inter-cultivar sharing C7.14 already proved
   functionally at small scale, exercised here at this epic's own larger volumes). */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

// Design §14's three reference load volumes, transposed to Rainelles alone (this epic's own
// criterion) — named here, not a magic array inlined below. Deliberately NOT the 40/120/240
// specimen volumes tests/campaign-specimen-load.cjs (C7.5) already measured on a distinct system.
const TIERS = [6, 20, 40];

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
        window.GardenRainelles &&
        window.GardenGenetics &&
        window.GardenBotanyHybrids &&
        window.GardenRenderRainelles,
      null,
      { timeout: 30000 },
    );
    await p.waitForTimeout(500);

    const measured = await p.evaluate((tiers) => {
      const s = window.GardenApp.game.s;
      const v = window.GardenApp.view;
      const Cultivars = window.GardenCultivars;
      const Rainelles = window.GardenRainelles;
      const Genetics = window.GardenGenetics;
      const Hybrids = window.GardenBotanyHybrids;
      const RR = window.GardenRenderRainelles;

      // Four cultivars per this epic's own criterion — see header comment for the reasoning
      // behind each one's exact trait shape.
      const founders = Genetics.founders;
      const cvA = Cultivars.createCultivar(s, { name: "charge-rainelle-a", traits: founders[0].traits });
      const cvB = Cultivars.createCultivar(s, { name: "charge-rainelle-b", traits: founders[1].traits });
      const cvBald = Cultivars.createCultivar(s, {
        name: "charge-rainelle-bald",
        traits: { ...founders[0].traits, feuilles: undefined },
      });
      const cvTwin = Cultivars.createCultivar(s, {
        name: "charge-rainelle-twin",
        traits: { ...founders[0].traits, port: "grimpant", fleurs: null, fonction: null },
      });
      const cultivarIds = [cvA.id, cvB.id, cvBald.id, cvTwin.id];

      // Header comment's mark-colour pre-seeding: brute-force five id strings, one per
      // MARK_COLORS index, using the exact real hash render-rainelles.js's own attachMark uses
      // (never a second reimplementation of mulberry32/seedFromId).
      function markIndexForId(id) {
        const rng = Hybrids.mulberry32(Hybrids.seedFromId(id));
        return Math.floor(rng() * RR.MARK_COLORS.length);
      }
      const seedIdByIndex = {};
      for (let i = 0; Object.keys(seedIdByIndex).length < RR.MARK_COLORS.length && i < 5000; i++) {
        const candidate = "markseed" + i;
        const idx = markIndexForId(candidate);
        if (!(idx in seedIdByIndex)) seedIdByIndex[idx] = candidate;
      }
      const seedFoundAllColors = Object.keys(seedIdByIndex).length === RR.MARK_COLORS.length;
      const seedRainelles = Object.values(seedIdByIndex).map((id, i) => ({
        id,
        cultivarId: cvA.id,
        name: "",
        geste: null,
        job: null,
        bourgeon: null,
        founder: false,
        x: 500 + i,
        z: 500,
      }));
      s.rainelles.push(...seedRainelles);
      v.sync(); // materializes all nine body/mark pools once, before baseline is measured.

      const nanMeshNames = [];
      function checkFinite(obj) {
        obj.traverse((o) => {
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

      // Positioned far off the playable area, same convention as every load-scene block in this
      // suite (tests/campaign-specimen-load.cjs, tests/garden-material-audit.cjs) — this test
      // measures the registry/renderer counters, never a screenshot, so proximity to the player
      // never matters.
      function buildTier(n) {
        s.rainelles = seedRainelles.slice(); // keep the five permanent mark-colour seeds only.
        v.sync(); // tears down the previous tier's Groups/pool instances through the real removal path.
        const perRow = Math.ceil(Math.sqrt(n)) || 1;
        for (let i = 0; i < n; i++) {
          const r = Rainelles.createRainelle(s, { cultivarId: cultivarIds[i % cultivarIds.length], name: "" });
          r.x = 700 + (i % perRow) * 1.2;
          r.z = 700 + Math.floor(i / perRow) * 1.2;
        }
        v.sync();
        // This test measures the Rainelle registry's OWN rendering budget, independent of the
        // live camera's frustum, same reasoning as campaign-specimen-load.cjs's own equivalent
        // loop (and render-world.js/render-light.js's own frustumCulled = false precedent).
        for (const rm of v.rainelleModels.values()) rm.group.traverse((o) => (o.frustumCulled = false));
        let bodyPoolCount = 0;
        for (const byMaterial of v.rainelleBodyPools.values())
          for (const pool of byMaterial.values()) {
            pool.mesh.frustumCulled = false;
            bodyPoolCount++;
          }
        let foliagePoolCount = 0;
        for (const byMaterial of v.rainelleFoliagePools.values())
          for (const pool of byMaterial.values()) {
            pool.mesh.frustumCulled = false;
            foliagePoolCount++;
          }
        v.frame(0.016, {}, true);
        // Criterion 2's "does a pooled Rainelle's Group still hold its own Mesh" check —
        // measured directly on the real registry, never assumed either way.
        let ownMeshCount = 0;
        for (const rm of v.rainelleModels.values())
          rm.group.traverse((o) => {
            if (o.isMesh) ownMeshCount++;
          });
        return {
          n,
          registrySize: v.rainelleModels.size,
          calls: v.renderer.info.render.calls,
          triangles: v.renderer.info.render.triangles,
          geometries: v.renderer.info.memory.geometries,
          bodyPoolCount,
          foliagePoolCount,
          ownMeshCount,
        };
      }

      const baseline = buildTier(0);
      const results = tiers.map(buildTier);

      // Criterion 4: no non-finite vertex on the largest tier's scene — both the registry's own
      // Groups (foliage/mark meshes not pooled, if any) and every active pool's InstancedMesh
      // (body and foliage alike), exactly the same two-part check campaign-specimen-load.cjs
      // already established for the specimen stem/organ pools.
      for (const rm of v.rainelleModels.values()) checkFinite(rm.group);
      for (const byMaterial of v.rainelleBodyPools.values())
        for (const pool of byMaterial.values()) checkFinite(pool.mesh);
      for (const byMaterial of v.rainelleFoliagePools.values())
        for (const pool of byMaterial.values()) checkFinite(pool.mesh);

      // Criterion 3: resync with no state change at the largest tier already built — nothing
      // should move. Snapshots one body pool's and one foliage pool's raw instance-matrix buffer
      // before/after so an unwarranted matrix rewrite (not just a changed COUNT) would be caught.
      let sampleBodyMatrixBefore = null,
        sampleFoliageMatrixBefore = null;
      const sampleBodyPool = [...v.rainelleBodyPools.values()][0]?.values().next().value;
      const sampleFoliagePool = [...v.rainelleFoliagePools.values()][0]?.values().next().value;
      if (sampleBodyPool) sampleBodyMatrixBefore = Array.from(sampleBodyPool.mesh.instanceMatrix.array);
      if (sampleFoliagePool) sampleFoliageMatrixBefore = Array.from(sampleFoliagePool.mesh.instanceMatrix.array);

      v.sync();
      v.frame(0.016, {}, true);
      const resynced = {
        registrySize: v.rainelleModels.size,
        calls: v.renderer.info.render.calls,
        triangles: v.renderer.info.render.triangles,
        geometries: v.renderer.info.memory.geometries,
        sampleBodyMatrixAfter: sampleBodyPool ? Array.from(sampleBodyPool.mesh.instanceMatrix.array) : null,
        sampleFoliageMatrixAfter: sampleFoliagePool
          ? Array.from(sampleFoliagePool.mesh.instanceMatrix.array)
          : null,
      };

      return {
        baseline,
        results,
        resynced,
        nanMeshNames,
        seedFoundAllColors,
        sampleBodyMatrixBefore,
        sampleFoliageMatrixBefore,
      };
    }, TIERS);

    if (consoleErrors.length)
      throw new Error("Console errors during the C7.15 Rainelle load scene:\n" + consoleErrors.join("\n"));

    assert.equal(
      measured.seedFoundAllColors,
      true,
      "C7.15 fixture bug: the mark-colour brute force did not find an id for every MARK_COLORS index within 5000 tries",
    );

    assert.deepEqual(
      measured.nanMeshNames,
      [],
      "Non-finite vertex position(s) in the largest Rainelle load tier: " + measured.nanMeshNames.join(", "),
    );

    // Criterion 1: pool counts (body/mark, foliage) stay identical between the smallest and the
    // largest tier — never growing with Rainelle count. See header comment for why the five
    // mark-colour seeds make this deterministic rather than luck-dependent.
    const bodyPoolCounts = measured.results.map((r) => r.bodyPoolCount);
    assert.equal(
      bodyPoolCounts[0],
      bodyPoolCounts[bodyPoolCounts.length - 1],
      "body/mark pool count grew with Rainelle count (" +
        JSON.stringify(bodyPoolCounts) +
        ") — pooling by (geometry, material) identity broke at scale",
    );
    assert.equal(bodyPoolCounts[0], 9, "unexpected body/mark pool count: " + bodyPoolCounts[0]);

    const foliagePoolCounts = measured.results.map((r) => r.foliagePoolCount);
    assert.equal(
      foliagePoolCounts[0],
      foliagePoolCounts[foliagePoolCounts.length - 1],
      "foliage pool count grew with Rainelle count (" +
        JSON.stringify(foliagePoolCounts) +
        ") — pooling by (geometry, material) identity broke at scale",
    );
    assert.equal(foliagePoolCounts[0], 2, "unexpected foliage pool count: " + foliagePoolCounts[0]);

    for (const r of measured.results) {
      // +5: the permanent mark-colour seed Rainelles, present in every tier (see header comment).
      assert.equal(
        r.registrySize,
        r.n + 5,
        `tier ${r.n}: registry did not hold exactly ${r.n} + 5 seed Rainelles`,
      );
    }

    // Criterion 2: measure (never assume) the render cost per Rainelle at the largest tier, and
    // whether a pooled Rainelle's Group still carries any Mesh of its own.
    const largest = measured.results[measured.results.length - 1];
    assert.equal(
      largest.ownMeshCount,
      0,
      "C7.15 measured fact: a pooled Rainelle's Group unexpectedly still carries " +
        largest.ownMeshCount +
        " Mesh(es) of its own — body and foliage are both pooled, so this was expected to be exactly zero",
    );
    const callsPerRainelle = (largest.calls - measured.baseline.calls) / largest.n;
    const trianglesPerRainelle = (largest.triangles - measured.baseline.triangles) / largest.n;
    assert.ok(
      Number.isFinite(callsPerRainelle) && Number.isFinite(trianglesPerRainelle),
      "render cost per Rainelle at the largest tier was not a finite measurement",
    );
    // Draw-call delta above baseline must never scale with Rainelle count once body AND foliage
    // are both pooled — exactly the C7.10 guarantee already established for specimen organs,
    // measured (not assumed) here for Rainelles at this epic's own volumes.
    const callDeltas = measured.results.map((r) => r.calls - measured.baseline.calls);
    assert.equal(
      callDeltas[0],
      callDeltas[callDeltas.length - 1],
      "draw-call delta above baseline grew with Rainelle count (" +
        JSON.stringify(callDeltas) +
        ") — body/foliage pooling regression: some mesh is being submitted per-Rainelle again instead of through a shared pool",
    );

    // Bounded geometry memory regardless of scale — the same sharing guarantee already measured
    // for specimens (campaign-specimen-load.cjs), here for Rainelles: the SAME delta above
    // baseline whether the tier is the smallest or the largest, never growing with Rainelle count.
    const geomDeltas = measured.results.map((r) => r.geometries - measured.baseline.geometries);
    assert.equal(
      geomDeltas[0],
      geomDeltas[geomDeltas.length - 1],
      "geometry object count grew with Rainelle count (" +
        JSON.stringify(geomDeltas) +
        ") — geometry sharing across Rainelles broke at scale",
    );

    // Criterion 3: resyncing with no state change must never rebuild anything, and must never
    // rewrite an already-correct instance matrix.
    assert.equal(measured.resynced.registrySize, largest.registrySize, "resync changed registry size");
    assert.equal(measured.resynced.calls, largest.calls, "resync changed draw-call count with no state change");
    assert.equal(
      measured.resynced.triangles,
      largest.triangles,
      "resync changed triangle count with no state change",
    );
    assert.equal(
      measured.resynced.geometries,
      largest.geometries,
      "resync changed geometry object count with no state change",
    );
    assert.deepEqual(
      measured.resynced.sampleBodyMatrixAfter,
      measured.sampleBodyMatrixBefore,
      "resync rewrote an already-correct body-pool instance matrix with no state change",
    );
    assert.deepEqual(
      measured.resynced.sampleFoliageMatrixAfter,
      measured.sampleFoliageMatrixBefore,
      "resync rewrote an already-correct foliage-pool instance matrix with no state change",
    );

    fs.writeFileSync("/tmp/campaign-rainelle-load.json", JSON.stringify(measured, null, 2));
    console.log(
      "PASS campaign-rainelle-load:",
      JSON.stringify({
        tiers: TIERS,
        bodyPoolCountConstant: bodyPoolCounts[0],
        foliagePoolCountConstant: foliagePoolCounts[0],
        callDeltaConstant: callDeltas[0],
        geometryDeltaConstant: geomDeltas[0],
        largestTierN: largest.n,
        callsPerRainelleAtLargestTier: callsPerRainelle,
        trianglesPerRainelleAtLargestTier: trianglesPerRainelle,
        ownMeshCountAtLargestTier: largest.ownMeshCount,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-rainelle-load:", e.message);
  process.exit(1);
});
