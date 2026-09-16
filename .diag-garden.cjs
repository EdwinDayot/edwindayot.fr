const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")],
  });
  const p = await browser.newPage({ viewport: { width: 960, height: 720 } });
  p.on("console", (m) => {
    if (m.type() === "error") console.log("PAGE ERROR:", m.text().slice(0, 300));
  });
  await p.goto("http://127.0.0.1:4174/");
  await p.waitForTimeout(2500);
  const info = await p.evaluate((cam) => {
    const A = window.GardenApp;
    if (!A || !A.view) return { ok: false, hasApp: !!A, keys: Object.keys(A || {}) };
    const v = A.view,
      g = A.game,
      L = window.GardenLighting.at(g.s.elapsed + g.s.remainder);
    // center on zone0 hill at (-6.5, 2.5)
    v.position = { x: cam.x, z: cam.z };
    v.span = cam.span;
    v.sync && v.sync();
    g.s.elapsed = cam.elapsed; // day
    v.frame(0.016, {}, true);
    v.frame(0.016, {}, true);
    v.updateCamera(1, true);
    v.frame(0.016, {}, true);
    const gl = v.renderer.getContext();
    const out = {
      ok: true,
      webgl: gl instanceof WebGL2RenderingContext ? 2 : 1,
      shadowMapEnabled: v.renderer.shadowMap.enabled,
      shadowAutoUpdate: v.renderer.shadowMap.autoUpdate,
      sun: {
        intensity: v.sun.intensity,
        castShadow: v.sun.castShadow,
        pos: v.sun.position.toArray().map((n) => +n.toFixed(1)),
        target: v.sun.target.position.toArray().map((n) => +n.toFixed(1)),
        mapSize: [v.sun.shadow.mapSize.x, v.sun.shadow.mapSize.y],
        bias: v.sun.shadow.bias,
        normalBias: v.sun.shadow.normalBias,
        hasMap: !!v.sun.shadow.map,
      },
      ambient: v.ambient.intensity,
      moon: { intensity: v.moon.intensity, castShadow: v.moon.castShadow },
      lighting: { sunIntensity: L.sunIntensity, ambient: L.ambient, height: L.height, dir: L.direction.map((n) => +n.toFixed(3)) },
      quality: v.quality,
      ratio: v.ratio,
      camTop: v.camera.top, camRight: v.camera.right,
      ground: (() => {
        let found = 0;
        v.scene.traverse((o) => {
          if (o.isMesh && !o.isInstancedMesh) return;
        });
        // count cast/receive shadows
        let cast = 0, recv = 0, inst = 0;
        v.scene.traverse((o) => {
          if (!o.isMesh) return;
          if (o.castShadow) cast++;
          if (o.receiveShadow) recv++;
          if (o.isInstancedMesh) inst++;
        });
        return { cast, recv, instanced: inst };
      })(),
      toneMapping: v.renderer.toneMapping,
      exposure: v.renderer.toneMappingExposure,
      pixelRatio: v.renderer.getPixelRatio(),
    };
    return out;
  }, { x: Number(process.env.GARDEN_X || -6.5), z: Number(process.env.GARDEN_Z || 2.5), span: Number(process.env.GARDEN_SPAN || 14), elapsed: Number(process.env.GARDEN_ELAPSED || 300) });
  console.log(JSON.stringify(info, null, 1));
  // daytime sun ON screenshot
  await p.evaluate((cam) => {
    const A = window.GardenApp, v = A.view, g = A.game;
    g.s.elapsed = cam.elapsed;
    v.frame(0.016, {}, true);
  }, { x: -6.5, z: 2.5, span: 14, elapsed: Number(process.env.GARDEN_ELAPSED || 300) });
  await p.screenshot({ path: process.env.GARDEN_OUT || "/tmp/garden-diag-day-sun.png" });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
