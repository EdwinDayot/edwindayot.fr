const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal"), "--window-size=1280,960"],
  });
  const p = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  p.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERROR:", m.text().slice(0, 300)); });
  await p.goto("http://127.0.0.1:4174/", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => window.GardenApp && window.GardenApp.view, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  const info = await p.evaluate(() => {
    const A = window.GardenApp, v = A.view, g = A.game;
    v.position = { x: -6.5, z: 2.5 };
    v.span = 14;
    v.quality = 2;
    v.sync && v.sync();
    g.s.elapsed = 300;
    v.updateCamera(1, true);
    v.frame(0.016, {}, true);
    v.frame(0.016, {}, true);
    const gl = v.renderer.getContext();
    const W = v.canvas.width, H = v.canvas.height;
    const buf = new Uint8Array(W * H * 4);
    const snap = (tag) => {
      v.renderer.render(v.scene, v.camera);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const c = (x, y) => {
        const i = ((H - 1 - y) * W + x) * 4;
        return [buf[i], buf[i + 1], buf[i + 2]];
      };
      return { tag, buf: buf.slice(), center: c(W >> 1, H >> 1), q1: c(W >> 2, H >> 2), q3: c((W * 3) >> 2, H >> 2) };
    };
    const lights = [];
    v.scene.traverse((o) => {
      if (o.isLight)
        lights.push({
          type: o.type,
          intensity: +o.intensity.toFixed(2),
          castShadow: o.castShadow,
          inScene: true,
          pos: o.position && [o.position.x, o.position.y, o.position.z].map((n) => +n.toFixed(1)),
          mapSize: o.shadow ? o.shadow.mapSize && [o.shadow.mapSize.x, o.shadow.mapSize.y] : null,
          isSun: o === v.sun,
          isMoon: o === v.moon,
          isAmbient: o === v.ambient,
        });
    });
    const v2 = {
      ambient: v.ambient && { type: v.ambient.type, intensity: v.ambient.intensity, color: v.ambient.color && v.ambient.color.getHexString() },
      sun: v.sun && { type: v.sun.type, intensity: v.sun.intensity, pos: v.sun.position.toArray().map((n) => +n.toFixed(1)), target: v.sun.target && v.sun.target.position.toArray().map((n) => +n.toFixed(1)) },
      moon: v.moon && { type: v.moon.type, intensity: v.moon.intensity },
      shadowMapEnabled: v.renderer.shadowMap && v.renderer.shadowMap.enabled,
      toneMapping: v.renderer.toneMapping,
      exposure: v.renderer.toneMappingExposure,
      fog: v.scene.fog && [v.scene.fog.near, v.scene.fog.far, v.scene.fog.color.getHexString()],
      bg: v.scene.background && v.scene.background.getHexString ? v.scene.background.getHexString() : String(v.scene.background).slice(0, 30),
      localLights: (v.localLights || []).map((l) => ({ type: l.type, i: +l.intensity.toFixed(2), cs: l.castShadow })),
    };
    // raw toggles, no frame() between — pure render-path probe
    const base = snap("base");
    const sunI = v.sun.intensity; v.sun.intensity = 0;
    const noSun = snap("noSun");
    v.sun.intensity = sunI;
    const ambI = v.ambient.intensity; v.ambient.intensity = 0.1;
    const dimAmb = snap("dimAmb");
    v.ambient.intensity = ambI;
    v.scene.traverse((o) => { if (o.isLight && o.isDirectionalLight) o.castShadow = false; });
    const noDirShadow = snap("noDirShadow");
    v.scene.traverse((o) => { if (o.isLight && o.isDirectionalLight) o.castShadow = true; });
    const restored = snap("restored");
    return { v2, lights, base, noSun, dimAmb, noDirShadow, restored, W, H };
  });
  // diff in node space
  const D = (a, b, thr = 8) => {
    let n = 0, sum = 0, max = 0;
    for (let i = 0; i < a.length; i += 4) {
      const dd = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (dd > thr) { n++; sum += dd; if (dd > max) max = dd; }
    }
    return { px: n, pct: ((100 * n) / (info.W * info.H)).toFixed(1) + "%", avg: n ? (sum / n).toFixed(1) : "0", max };
  };
  console.log(JSON.stringify({ ...info, diffs: {
    noSun_vs_base: D(info.noSun.buf, info.base.buf),
    dimAmb_vs_base: D(info.dimAmb.buf, info.base.buf),
    noDirShadow_vs_base: D(info.noDirShadow.buf, info.base.buf),
    restored_vs_base: D(info.restored.buf, info.base.buf),
  } }, null, 1));
  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
