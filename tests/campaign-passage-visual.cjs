// Epic C6.14 (docs/campagne-backlog.md) — "Rendu du passage (mare/berge)". Builds a dedicated
// comparison bench (same pattern as tests/campaign-house-visual.cjs) showing the passage point in
// both states (bloqué/franchissable) side by side, checks it PROGRAMMATICALLY (never a screenshot
// a human or a model "looks at" and judges — that gate is tests/garden-material-audit.cjs, which
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
    await p.waitForFunction(() => window.THREE && window.GardenRenderCampaignPassage, null, {
      timeout: 30000,
    });

    const built = await p.evaluate(() => {
      // Dedicated off-screen scene/renderer, same pattern as campaign-house-visual.cjs: this is a
      // comparison bench, not the live game world.
      document.querySelector(".garden-shell")?.remove();
      document.querySelector(".site-header")?.remove();
      const T = THREE;
      const canvas = document.createElement("canvas");
      canvas.id = "passage-bench";
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

      const RenderPassage = window.GardenRenderCampaignPassage;
      const GAP = RenderPassage.BANK_RADIUS * 2 + 1.2;

      const blocked = RenderPassage.buildPassageGroup(true);
      blocked.position.set(-GAP / 2, 0, 0);
      scene.add(blocked);

      const open = RenderPassage.buildPassageGroup(false);
      open.position.set(GAP / 2, 0, 0);
      scene.add(open);

      scene.updateMatrixWorld(true);

      const nanMeshes = [];
      for (const [label, group] of [
        ["blocked", blocked],
        ["open", open],
      ]) {
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

      // "Absence de pénétration de maillage grossière" between the two states, placed at a known
      // fixed spacing — same check as campaign-house-visual.cjs.
      const boxBlocked = new T.Box3().setFromObject(blocked);
      const boxOpen = new T.Box3().setFromObject(open);
      const overlap = boxBlocked.intersectsBox(boxOpen);

      // Frame both states in one shot, elevated three-quarter view so the obstruction/pond
      // difference is actually visible in the capture.
      const full = new T.Box3().setFromObject(scene);
      const center = full.getCenter(new T.Vector3());
      const size = full.getSize(new T.Vector3());
      const radius = Math.max(size.length() / 2, 0.5);
      const elev = (35 * Math.PI) / 180;
      const camera = new T.PerspectiveCamera(50, 1400 / 800, 0.1, 100);
      camera.position.set(
        center.x,
        center.y + radius * Math.sin(elev) * 2.4,
        center.z - radius * Math.cos(elev) * 2.4,
      );
      camera.lookAt(center);
      renderer.render(scene, camera);

      window.__passageBenchScene = scene;
      window.__passageBenchRenderer = renderer;
      window.__passageBenchCamera = camera;

      let blockedMeshCount = 0,
        openMeshCount = 0;
      blocked.traverse((o) => o.isMesh && blockedMeshCount++);
      open.traverse((o) => o.isMesh && openMeshCount++);

      return { nanMeshes, overlap, blockedMeshCount, openMeshCount };
    });

    if (consoleErrors.length)
      throw new Error("Console errors while building the C6.14 comparison scene:\n" + consoleErrors.join("\n"));

    assert.deepEqual(built.nanMeshes, [], "Non-finite vertex positions: " + built.nanMeshes.join(", "));
    assert.equal(built.overlap, false, "Gross mesh penetration: the two passage states' bounding boxes overlap");
    assert.notEqual(built.blockedMeshCount, built.openMeshCount, "mesh count must differ between states");

    await p.locator("#passage-bench").screenshot({ path: "/tmp/campaign-passage-visual.png" });

    console.log(
      "PASS campaign-passage-visual:",
      JSON.stringify({
        overlap: built.overlap,
        blockedMeshCount: built.blockedMeshCount,
        openMeshCount: built.openMeshCount,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-passage-visual:", e.message);
  process.exit(1);
});
