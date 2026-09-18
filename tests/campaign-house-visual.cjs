// Epic C3.2 (docs/campagne-backlog.md) — "Rendu de la maison refuge". Builds a dedicated
// comparison bench (same pattern as tests/campaign-botany-visual.cjs) showing the refuge house
// in both states (delabre/repare) side by side, checks it PROGRAMMATICALLY (never a screenshot a
// human or a model "looks at" and judges — that gate is tests/garden-material-audit.cjs, which
// this epic also extends), then saves a screenshot as a documented secondary complement for
// multimodal review against docs/direction-artistique.md.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    // Same documented fallback as tests/garden-material-audit.cjs / campaign-botany-visual.cjs.
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
      () => window.THREE && window.GardenCampaignHouse && window.GardenRenderCampaignHouse,
      null,
      { timeout: 30000 },
    );

    const built = await p.evaluate(() => {
      // Dedicated off-screen scene/renderer, same pattern as campaign-botany-visual.cjs: this is
      // a comparison bench, not the live game world.
      document.querySelector(".garden-shell")?.remove();
      document.querySelector(".site-header")?.remove();
      const T = THREE;
      const canvas = document.createElement("canvas");
      canvas.id = "house-bench";
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

      const House = window.GardenCampaignHouse,
        RenderHouse = window.GardenRenderCampaignHouse;
      const GAP = RenderHouse.HOUSE_W + 1.5;

      const delabre = RenderHouse.buildRefugeHouseGroup(House.freshHouse());
      delabre.position.set(-GAP / 2, 0, 0);
      scene.add(delabre);

      const repairedHouse = House.freshHouse();
      repairedHouse.spaces.accueil.status = "repare";
      const repare = RenderHouse.buildRefugeHouseGroup(repairedHouse);
      repare.position.set(GAP / 2, 0, 0);
      scene.add(repare);

      scene.updateMatrixWorld(true);

      const nanMeshes = [];
      for (const [label, group] of [["delabre", delabre], ["repare", repare]]) {
        group.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.array.length; i++) {
            if (!Number.isFinite(pos.array[i])) {
              nanMeshes.push(label);
              break;
            }
          }
        });
      }

      // "Absence de pénétration de maillage grossière" between the two houses, placed at a known
      // fixed spacing — same check as campaign-botany-visual.cjs.
      const boxDelabre = new T.Box3().setFromObject(delabre);
      const boxRepare = new T.Box3().setFromObject(repare);
      const overlap = boxDelabre.intersectsBox(boxRepare);

      // Frame both houses in one shot, elevated three-quarter view from the front (-z, where the
      // door sits — and, for the delabre house, where its one collapsed roof panel is, per
      // roof()'s own front/back split) so the door-style and roof-panel differences are both
      // actually visible in the capture, not hidden behind the camera.
      const full = new T.Box3().setFromObject(scene);
      const center = full.getCenter(new T.Vector3());
      const size = full.getSize(new T.Vector3());
      const radius = Math.max(size.length() / 2, 0.5);
      const elev = (20 * Math.PI) / 180;
      const camera = new T.PerspectiveCamera(50, 1400 / 800, 0.1, 100);
      camera.position.set(center.x, center.y + radius * Math.sin(elev) * 1.9, center.z - radius * Math.cos(elev) * 1.9);
      camera.lookAt(center);
      renderer.render(scene, camera);

      window.__houseBenchScene = scene;
      window.__houseBenchRenderer = renderer;
      window.__houseBenchCamera = camera;

      return {
        nanMeshes,
        overlap,
        delabreRoofPanelCount: delabre.userData.roofPanelCount,
        repareRoofPanelCount: repare.userData.roofPanelCount,
        delabreDoorStyle: delabre.userData.doorStyle,
        repareDoorStyle: repare.userData.doorStyle,
      };
    });

    if (consoleErrors.length)
      throw new Error("Console errors while building the C3.2 comparison scene:\n" + consoleErrors.join("\n"));

    assert.deepEqual(built.nanMeshes, [], "Non-finite vertex positions: " + built.nanMeshes.join(", "));
    assert.equal(built.overlap, false, "Gross mesh penetration: the two houses' bounding boxes overlap");
    assert.notEqual(built.delabreRoofPanelCount, built.repareRoofPanelCount, "roof panel count must differ between states");
    assert.notEqual(built.delabreDoorStyle, built.repareDoorStyle, "door style must differ between states");

    await p.locator("#house-bench").screenshot({ path: "/tmp/campaign-house-visual.png" });

    console.log(
      "PASS campaign-house-visual:",
      JSON.stringify({
        overlap: built.overlap,
        delabreRoofPanelCount: built.delabreRoofPanelCount,
        repareRoofPanelCount: built.repareRoofPanelCount,
        delabreDoorStyle: built.delabreDoorStyle,
        repareDoorStyle: built.repareDoorStyle,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-house-visual:", e.message);
  process.exit(1);
});
