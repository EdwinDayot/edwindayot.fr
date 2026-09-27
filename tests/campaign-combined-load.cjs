/* Epic C7.16 (docs/campagne-backlog.md) — the combined load scene neither C7.5 nor C7.15
   attempted: both registries (cultivar specimens AND Rainelles) populated SIMULTANEOUSLY in one
   real campaign save, at the two "domaine avancé" volumes design §14 already names and each of
   those two prior epics already measured in isolation — 240 specimens
   (tests/campaign-specimen-load.cjs, C7.5) and 40 Rainelles (tests/campaign-rainelle-load.cjs,
   C7.15) — never a new volume invented for this epic. Synced through the two real functions both
   prior epics already rely on (`RenderSpecimens.syncSpecimenModels`/`RenderRainelles.syncRainelleModels`,
   both reached via the live page's own single `v.sync()` call, never an isolated construction of
   either registry), reading the exact same `view.renderer.info.render.calls`/`.triangles`/
   `.memory.geometries` API as both C7.5 and C7.15, never reinvented a third time.

   Fixture reused verbatim from each prior epic's own file, not redesigned: the same two specimen
   cultivars (charge-a/charge-b, tests/campaign-specimen-load.cjs) and the same four Rainelle
   cultivars plus five brute-forced mark-colour seed Rainelles (tests/campaign-rainelle-load.cjs) —
   this file's only job is to build BOTH populations in the SAME save/scene at once and measure
   whether the two independent pool systems (four separate Maps in render.js: specimenStemPools,
   specimenOrganPools, rainelleBodyPools, rainelleFoliagePools) interfere with each other, which
   neither prior epic's isolated test could ever have exercised. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

// Design §14's "domaine avancé" volumes, already named and measured in isolation by C7.5
// (specimens) and C7.15 (Rainelles) — reused verbatim, never a new volume invented here.
const SPECIMEN_N = 240;
const RAINELLE_N = 40;

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
        window.GardenRenderSpecimens &&
        window.GardenRenderRainelles,
      null,
      { timeout: 30000 },
    );
    await p.waitForTimeout(500);

    const measured = await p.evaluate(
      ({ specimenN, rainelleN }) => {
        const s = window.GardenApp.game.s;
        const v = window.GardenApp.view;
        const Cultivars = window.GardenCultivars;
        const Rainelles = window.GardenRainelles;
        const Genetics = window.GardenGenetics;
        const Hybrids = window.GardenBotanyHybrids;
        const RR = window.GardenRenderRainelles;

        // Specimen fixture — verbatim from tests/campaign-specimen-load.cjs (C7.5): two cultivars,
        // all three growth stages.
        const specimenCvA = Cultivars.createCultivar(s, {
          name: "combined-specimen-a",
          traits: Genetics.founders[0].traits,
        });
        const specimenCvB = Cultivars.createCultivar(s, {
          name: "combined-specimen-b",
          traits: Genetics.founders[1].traits,
        });
        const specimenCultivarIds = [specimenCvA.id, specimenCvB.id];
        const stages = [0, 1, Cultivars.MATURE_STAGE];

        // Rainelle fixture — verbatim from tests/campaign-rainelle-load.cjs (C7.15): four
        // cultivars (with/without foliage, an inter-cultivar leaf-pool twin) plus the five
        // brute-forced mark-colour seeds, same reasoning as that file's own header comment (a
        // Rainelle's individual accent mark is hashed by id, never by cultivar, so without a
        // deterministic seed the count of discovered mark pools would depend on the luck of the
        // ids this test happens to generate).
        const founders = Genetics.founders;
        const rainelleCvA = Cultivars.createCultivar(s, {
          name: "combined-rainelle-a",
          traits: founders[0].traits,
        });
        const rainelleCvB = Cultivars.createCultivar(s, {
          name: "combined-rainelle-b",
          traits: founders[1].traits,
        });
        const rainelleCvBald = Cultivars.createCultivar(s, {
          name: "combined-rainelle-bald",
          traits: { ...founders[0].traits, feuilles: undefined },
        });
        const rainelleCvTwin = Cultivars.createCultivar(s, {
          name: "combined-rainelle-twin",
          traits: { ...founders[0].traits, port: "grimpant", fleurs: null, fonction: null },
        });
        const rainelleCultivarIds = [
          rainelleCvA.id,
          rainelleCvB.id,
          rainelleCvBald.id,
          rainelleCvTwin.id,
        ];

        function markIndexForId(id) {
          const rng = Hybrids.mulberry32(Hybrids.seedFromId(id));
          return Math.floor(rng() * RR.MARK_COLORS.length);
        }
        const seedIdByIndex = {};
        for (let i = 0; Object.keys(seedIdByIndex).length < RR.MARK_COLORS.length && i < 5000; i++) {
          const candidate = "combinedmarkseed" + i;
          const idx = markIndexForId(candidate);
          if (!(idx in seedIdByIndex)) seedIdByIndex[idx] = candidate;
        }
        const seedFoundAllColors = Object.keys(seedIdByIndex).length === RR.MARK_COLORS.length;
        const seedRainelles = Object.values(seedIdByIndex).map((id, i) => ({
          id,
          cultivarId: rainelleCvA.id,
          name: "",
          geste: null,
          job: null,
          bourgeon: null,
          founder: false,
          x: 900 + i,
          z: 900,
        }));

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

        // Both registries populated in the SAME scene, positioned in two disjoint, off-map
        // regions (specimens near {300,300}, Rainelles near {900,900}) so this test's own
        // fixtures never overlap each other — proximity is irrelevant either way since this test
        // measures registry/renderer counters, never a screenshot.
        s.specimens = [];
        s.rainelles = seedRainelles.slice();
        v.sync(); // tears down any previous state through the real removal path first.
        const baseline = {
          calls: v.renderer.info.render.calls,
          triangles: v.renderer.info.render.triangles,
          geometries: v.renderer.info.memory.geometries,
        };

        const specimenPerRow = Math.ceil(Math.sqrt(specimenN)) || 1;
        for (let i = 0; i < specimenN; i++) {
          Cultivars.createSpecimen(s, {
            cultivarId: specimenCultivarIds[i % specimenCultivarIds.length],
            x: 300 + (i % specimenPerRow) * 1.2,
            z: 300 + Math.floor(i / specimenPerRow) * 1.2,
            stage: stages[i % stages.length],
          });
        }
        const rainellePerRow = Math.ceil(Math.sqrt(rainelleN)) || 1;
        for (let i = 0; i < rainelleN; i++) {
          const r = Rainelles.createRainelle(s, {
            cultivarId: rainelleCultivarIds[i % rainelleCultivarIds.length],
            name: "",
          });
          r.x = 900 + (i % rainellePerRow) * 1.2;
          r.z = 900 + Math.floor(i / rainellePerRow) * 1.2;
        }
        v.sync();

        // Same frustumCulled override every load-scene block in this suite already applies (this
        // test measures the registries' own rendering budget, independent of the live camera's
        // frustum) — generalised here to every registry AND every pool of both families.
        for (const sm of v.specimenModels.values()) sm.group.traverse((o) => (o.frustumCulled = false));
        for (const rm of v.rainelleModels.values()) rm.group.traverse((o) => (o.frustumCulled = false));
        let specimenStemPoolCount = 0;
        for (const byMaterial of v.specimenStemPools.values())
          for (const pool of byMaterial.values()) {
            pool.mesh.frustumCulled = false;
            specimenStemPoolCount++;
          }
        let specimenOrganPoolCount = 0;
        for (const byMaterial of v.specimenOrganPools.values())
          for (const pool of byMaterial.values()) {
            pool.mesh.frustumCulled = false;
            specimenOrganPoolCount++;
          }
        let rainelleBodyPoolCount = 0;
        for (const byMaterial of v.rainelleBodyPools.values())
          for (const pool of byMaterial.values()) {
            pool.mesh.frustumCulled = false;
            rainelleBodyPoolCount++;
          }
        let rainelleFoliagePoolCount = 0;
        for (const byMaterial of v.rainelleFoliagePools.values())
          for (const pool of byMaterial.values()) {
            pool.mesh.frustumCulled = false;
            rainelleFoliagePoolCount++;
          }
        v.frame(0.016, {}, true);

        // Criterion 2: count every shadow-casting Mesh in the combined scene via a real
        // scene.traverse — a relevé, never an asserted threshold (no shadow-map-resolution
        // budget is documented anywhere beyond the adaptive, non-deterministic mechanism
        // garden-structure.md already describes — see this epic's own criterion).
        let castShadowCount = 0;
        v.scene.traverse((o) => {
          if (o.isMesh && o.castShadow === true) castShadowCount++;
        });

        const populated = {
          specimenRegistrySize: v.specimenModels.size,
          rainelleRegistrySize: v.rainelleModels.size,
          specimenStemPoolCount,
          specimenOrganPoolCount,
          rainelleBodyPoolCount,
          rainelleFoliagePoolCount,
          calls: v.renderer.info.render.calls,
          triangles: v.renderer.info.render.triangles,
          geometries: v.renderer.info.memory.geometries,
          castShadowCount,
        };

        checkFinite(v.scene);

        // Criterion 3: resync with no state change at this fully-populated combined scene —
        // nothing should move. Snapshots one pool's raw instance-matrix buffer from each of the
        // four pool families before/after so an unwarranted matrix rewrite (not just a changed
        // COUNT) would be caught, same discipline as tests/campaign-rainelle-load.cjs.
        const sampleStemPool = [...v.specimenStemPools.values()][0]?.values().next().value;
        const sampleOrganPool = [...v.specimenOrganPools.values()][0]?.values().next().value;
        const sampleBodyPool = [...v.rainelleBodyPools.values()][0]?.values().next().value;
        const sampleFoliagePool = [...v.rainelleFoliagePools.values()][0]?.values().next().value;
        const before = {
          stem: sampleStemPool ? Array.from(sampleStemPool.mesh.instanceMatrix.array) : null,
          organ: sampleOrganPool ? Array.from(sampleOrganPool.mesh.instanceMatrix.array) : null,
          body: sampleBodyPool ? Array.from(sampleBodyPool.mesh.instanceMatrix.array) : null,
          foliage: sampleFoliagePool ? Array.from(sampleFoliagePool.mesh.instanceMatrix.array) : null,
        };

        v.sync();
        v.frame(0.016, {}, true);
        const resynced = {
          specimenRegistrySize: v.specimenModels.size,
          rainelleRegistrySize: v.rainelleModels.size,
          calls: v.renderer.info.render.calls,
          triangles: v.renderer.info.render.triangles,
          geometries: v.renderer.info.memory.geometries,
          after: {
            stem: sampleStemPool ? Array.from(sampleStemPool.mesh.instanceMatrix.array) : null,
            organ: sampleOrganPool ? Array.from(sampleOrganPool.mesh.instanceMatrix.array) : null,
            body: sampleBodyPool ? Array.from(sampleBodyPool.mesh.instanceMatrix.array) : null,
            foliage: sampleFoliagePool ? Array.from(sampleFoliagePool.mesh.instanceMatrix.array) : null,
          },
        };

        return { baseline, populated, resynced, nanMeshNames, seedFoundAllColors, before };
      },
      { specimenN: SPECIMEN_N, rainelleN: RAINELLE_N },
    );

    if (consoleErrors.length)
      throw new Error("Console errors during the C7.16 combined load scene:\n" + consoleErrors.join("\n"));

    assert.equal(
      measured.seedFoundAllColors,
      true,
      "C7.16 fixture bug: the mark-colour brute force did not find an id for every MARK_COLORS index within 5000 tries",
    );

    assert.deepEqual(
      measured.nanMeshNames,
      [],
      "Non-finite vertex position(s) in the combined load scene: " + measured.nanMeshNames.join(", "),
    );

    assert.equal(
      measured.populated.specimenRegistrySize,
      SPECIMEN_N,
      "specimen registry did not hold exactly " + SPECIMEN_N + " specimens in the combined scene",
    );
    // +5: the permanent mark-colour seed Rainelles, same convention as tests/campaign-rainelle-load.cjs.
    assert.equal(
      measured.populated.rainelleRegistrySize,
      RAINELLE_N + 5,
      "rainelle registry did not hold exactly " + RAINELLE_N + " + 5 seed Rainelles in the combined scene",
    );

    // Criterion 1: pool counts measured in this combined scene must match each prior epic's own
    // isolated measurement exactly — proof neither of render.js's two independent Map pairs
    // (specimenStemPools/specimenOrganPools vs rainelleBodyPools/rainelleFoliagePools) shares or
    // pollutes the other's pools when both are populated at once. C7.10's own two-cultivar
    // population yields exactly 1 stem pool + 3 organ pools; C7.15's own four-cultivar population
    // yields exactly 9 body/mark pools + 2 foliage pools — reused verbatim here, never a new
    // number invented for this epic.
    assert.equal(
      measured.populated.specimenStemPoolCount,
      1,
      "specimen stem pool count in the combined scene (" +
        measured.populated.specimenStemPoolCount +
        ") does not match C7.9/C7.10's own isolated measurement (1) — pool interference between the two registries?",
    );
    assert.equal(
      measured.populated.specimenOrganPoolCount,
      3,
      "specimen organ pool count in the combined scene (" +
        measured.populated.specimenOrganPoolCount +
        ") does not match C7.10's own isolated measurement (3) — pool interference between the two registries?",
    );
    assert.equal(
      measured.populated.rainelleBodyPoolCount,
      9,
      "rainelle body/mark pool count in the combined scene (" +
        measured.populated.rainelleBodyPoolCount +
        ") does not match C7.15's own isolated measurement (9) — pool interference between the two registries?",
    );
    assert.equal(
      measured.populated.rainelleFoliagePoolCount,
      2,
      "rainelle foliage pool count in the combined scene (" +
        measured.populated.rainelleFoliagePoolCount +
        ") does not match C7.15's own isolated measurement (2) — pool interference between the two registries?",
    );

    // Criterion 2: shadow-casting mesh count is a relevé, consigned in docs/campagne.md, never an
    // asserted threshold — only its finiteness/non-negativity is checked here.
    assert.ok(
      Number.isInteger(measured.populated.castShadowCount) && measured.populated.castShadowCount >= 0,
      "shadow-casting mesh count in the combined scene was not a valid measurement",
    );

    // Criterion 3: resyncing the fully-populated combined scene with no state change must never
    // rebuild anything in either registry, and must never rewrite an already-correct instance
    // matrix in any of the four pool families.
    assert.equal(
      measured.resynced.specimenRegistrySize,
      measured.populated.specimenRegistrySize,
      "resync changed specimen registry size in the combined scene",
    );
    assert.equal(
      measured.resynced.rainelleRegistrySize,
      measured.populated.rainelleRegistrySize,
      "resync changed rainelle registry size in the combined scene",
    );
    assert.equal(
      measured.resynced.calls,
      measured.populated.calls,
      "resync changed draw-call count with no state change in the combined scene",
    );
    assert.equal(
      measured.resynced.triangles,
      measured.populated.triangles,
      "resync changed triangle count with no state change in the combined scene",
    );
    assert.equal(
      measured.resynced.geometries,
      measured.populated.geometries,
      "resync changed geometry object count with no state change in the combined scene",
    );
    assert.deepEqual(
      measured.resynced.after.stem,
      measured.before.stem,
      "resync rewrote an already-correct specimen stem-pool instance matrix with no state change",
    );
    assert.deepEqual(
      measured.resynced.after.organ,
      measured.before.organ,
      "resync rewrote an already-correct specimen organ-pool instance matrix with no state change",
    );
    assert.deepEqual(
      measured.resynced.after.body,
      measured.before.body,
      "resync rewrote an already-correct rainelle body-pool instance matrix with no state change",
    );
    assert.deepEqual(
      measured.resynced.after.foliage,
      measured.before.foliage,
      "resync rewrote an already-correct rainelle foliage-pool instance matrix with no state change",
    );

    fs.writeFileSync("/tmp/campaign-combined-load.json", JSON.stringify(measured, null, 2));
    console.log(
      "PASS campaign-combined-load:",
      JSON.stringify({
        specimenN: SPECIMEN_N,
        rainelleN: RAINELLE_N,
        specimenStemPoolCount: measured.populated.specimenStemPoolCount,
        specimenOrganPoolCount: measured.populated.specimenOrganPoolCount,
        rainelleBodyPoolCount: measured.populated.rainelleBodyPoolCount,
        rainelleFoliagePoolCount: measured.populated.rainelleFoliagePoolCount,
        castShadowCount: measured.populated.castShadowCount,
        callsDeltaFromBaseline: measured.populated.calls - measured.baseline.calls,
        trianglesDeltaFromBaseline: measured.populated.triangles - measured.baseline.triangles,
        geometriesDeltaFromBaseline: measured.populated.geometries - measured.baseline.geometries,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-combined-load:", e.message);
  process.exit(1);
});
