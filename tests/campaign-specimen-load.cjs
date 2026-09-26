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
   pas seulement ici. */
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
        v.frame(0.016, {}, true);
        return {
          n,
          registrySize: v.specimenModels.size,
          calls: v.renderer.info.render.calls,
          triangles: v.renderer.info.render.triangles,
          geometries: v.renderer.info.memory.geometries,
        };
      }

      const baseline = buildTier(0);
      const results = tiers.map(buildTier);
      for (const sm of v.specimenModels.values()) checkFinite(sm.group);

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

    // Per-specimen draw-call/triangle cost stays stable across tiers (linear growth is expected
    // and correct — see header comment — but it must never accelerate, which would signal an
    // accidental quadratic cost somewhere in the sync loop).
    const perSpecimen = measured.results.map((r) => ({
      n: r.n,
      calls: (r.calls - measured.baseline.calls) / r.n,
      triangles: (r.triangles - measured.baseline.triangles) / r.n,
    }));
    const smallest = perSpecimen[0],
      largest = perSpecimen[perSpecimen.length - 1];
    const callsRatio = largest.calls / smallest.calls;
    const trianglesRatio = largest.triangles / smallest.triangles;
    assert.ok(
      callsRatio > 0.9 && callsRatio < 1.1,
      `per-specimen draw-call cost is not stable across tiers (smallest=${smallest.calls}, largest=${largest.calls}, ratio=${callsRatio})`,
    );
    assert.ok(
      trianglesRatio > 0.9 && trianglesRatio < 1.1,
      `per-specimen triangle cost is not stable across tiers (smallest=${smallest.triangles}, largest=${largest.triangles}, ratio=${trianglesRatio})`,
    );

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
