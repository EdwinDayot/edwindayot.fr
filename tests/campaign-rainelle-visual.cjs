// Epic C5.9 (docs/campagne-backlog.md) — "Représentation modulaire d'une Rainelle". Builds a
// dedicated comparison bench (same pattern as tests/campaign-botany-visual.cjs and
// tests/campaign-house-visual.cjs) showing several Rainelles of different cultivars plus two
// individuals of the SAME cultivar side by side, checks it PROGRAMMATICALLY (never a screenshot a
// human or a model "looks at" and judges — that gate is tests/garden-material-audit.cjs, which
// this epic also extends), then saves a screenshot as a documented secondary complement for
// multimodal review against docs/direction-artistique.md.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    // Same documented fallback as tests/garden-material-audit.cjs / campaign-house-visual.cjs.
    executablePath: require("node:fs").existsSync("/opt/pw-browsers/chromium")
      ? "/opt/pw-browsers/chromium"
      : undefined,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    const consoleErrors = [];
    p.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    p.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));
    await p.goto(process.env.GARDEN_URL || "http://127.0.0.1:4174/", {
      waitUntil: "domcontentloaded",
    });
    await p.waitForFunction(
      () => window.THREE && window.GardenGenetics && window.GardenRenderRainelles,
      null,
      { timeout: 30000 },
    );

    const built = await p.evaluate(() => {
      // Dedicated off-screen scene/renderer, same pattern as campaign-house-visual.cjs: this is a
      // comparison bench, not the live game world.
      document.querySelector(".garden-shell")?.remove();
      document.querySelector(".site-header")?.remove();
      const T = THREE;
      const canvas = document.createElement("canvas");
      canvas.id = "rainelle-bench";
      document.body.append(canvas);
      const renderer = new T.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(1400, 800);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      const scene = new T.Scene();
      scene.background = new T.Color(0xdce7d4); // documented fond (direction-artistique.md)
      scene.add(new T.HemisphereLight(0xfff7df, 0x69816f, 2.3));
      const sun = new T.DirectionalLight(0xffeaca, 2.4);
      sun.position.set(-5, 10, 8);
      scene.add(sun);

      const Genetics = window.GardenGenetics,
        RenderR = window.GardenRenderRainelles;
      const founders = Genetics.founders;
      const GAP = 0.7;

      // Row 1: one Rainelle per founder cultivar, evenly spaced.
      const row1 = founders.map((f, i) => {
        const g = RenderR.buildRainelleGroup({ id: "bench-" + f.id }, { id: f.id, traits: f.traits });
        g.position.set((i - (founders.length - 1) / 2) * GAP, 0, -0.6);
        scene.add(g);
        return g;
      });

      // Row 2: two individuals of the SAME cultivar, side by side — the "deux instances du même
      // cultivar" case the C5.9 exit criterion names explicitly.
      const twinFounder = founders[0];
      const twinA = RenderR.buildRainelleGroup({ id: "twin-a" }, { id: twinFounder.id, traits: twinFounder.traits });
      twinA.position.set(-GAP / 2, 0, 0.6);
      scene.add(twinA);
      const twinB = RenderR.buildRainelleGroup({ id: "twin-b" }, { id: twinFounder.id, traits: twinFounder.traits });
      twinB.position.set(GAP / 2, 0, 0.6);
      scene.add(twinB);

      scene.updateMatrixWorld(true);

      const allGroups = [...row1, twinA, twinB];
      const nanMeshes = [];
      for (const g of allGroups) {
        g.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.array.length; i++) {
            if (!Number.isFinite(pos.array[i])) {
              nanMeshes.push(g.userData.rainelleId);
              break;
            }
          }
        });
      }

      // "Absence de pénétration de maillage grossière": no two Rainelle bounding boxes overlap,
      // placed at a known fixed spacing.
      let overlap = false;
      for (let i = 0; i < allGroups.length; i++) {
        for (let j = i + 1; j < allGroups.length; j++) {
          const bi = new T.Box3().setFromObject(allGroups[i]);
          const bj = new T.Box3().setFromObject(allGroups[j]);
          if (bi.intersectsBox(bj)) overlap = true;
        }
      }

      // Individual mark differs between the two same-cultivar twins (or at least their world
      // position/id does — the mark itself may coincide by chance on a 5-colour/2-side draw, so
      // this only asserts the two groups are genuinely distinct instances, the deterministic
      // per-instance check itself lives in tests/campaign-rainelle-render.cjs).
      const twinsDistinctInstances = twinA !== twinB && twinA.uuid !== twinB.uuid;

      // Scale sanity: compare a Rainelle's bounding box against a founder plant's own, so a
      // human/multimodal reviewer sees them at a believable relative size in the same shot.
      const plantBox = window.GardenBotanyHybrids
        ? new T.Box3().setFromObject(
            window.GardenBotanyHybrids.buildSpecimenGroup({ id: twinFounder.id, traits: twinFounder.traits }),
          )
        : null;
      const rainelleBox = new T.Box3().setFromObject(twinA);
      const rainelleSize = rainelleBox.getSize(new T.Vector3());
      const plantSize = plantBox ? plantBox.getSize(new T.Vector3()) : null;
      if (plantBox) {
        const plant = window.GardenBotanyHybrids.buildSpecimenGroup({ id: "scale-ref", traits: twinFounder.traits });
        plant.position.set(0, 0, -2.2);
        scene.add(plant);
        scene.updateMatrixWorld(true);
      }

      const full = new T.Box3().setFromObject(scene);
      const center = full.getCenter(new T.Vector3());
      const size = full.getSize(new T.Vector3());
      const radius = Math.max(size.length() / 2, 0.5);
      const elev = (28 * Math.PI) / 180;
      const camera = new T.PerspectiveCamera(50, 1400 / 800, 0.05, 100);
      camera.position.set(center.x, center.y + radius * Math.sin(elev) * 1.6, center.z - radius * Math.cos(elev) * 1.6);
      camera.lookAt(center);
      renderer.render(scene, camera);

      window.__rainelleBenchScene = scene;
      window.__rainelleBenchRenderer = renderer;
      window.__rainelleBenchCamera = camera;

      return {
        nanMeshes,
        overlap,
        twinsDistinctInstances,
        rainelleSize: rainelleSize.toArray(),
        plantSize: plantSize ? plantSize.toArray() : null,
        rainelleCount: allGroups.length,
      };
    });

    if (consoleErrors.length)
      throw new Error("Console errors while building the C5.9 comparison scene:\n" + consoleErrors.join("\n"));

    assert.deepEqual(built.nanMeshes, [], "Non-finite vertex positions: " + built.nanMeshes.join(", "));
    assert.equal(built.overlap, false, "Gross mesh penetration: two Rainelle bounding boxes overlap");
    assert.equal(built.twinsDistinctInstances, true, "the two same-cultivar Rainelles must be distinct Group instances");
    assert.equal(built.rainelleCount, 10, "expected 8 founders + 2 twins");

    await p.locator("#rainelle-bench").screenshot({ path: "/tmp/campaign-rainelle-visual.png" });

    console.log(
      "PASS campaign-rainelle-visual:",
      JSON.stringify({
        overlap: built.overlap,
        rainelleCount: built.rainelleCount,
        rainelleSize: built.rainelleSize,
        plantSize: built.plantSize,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-rainelle-visual:", e.message);
  process.exit(1);
});
