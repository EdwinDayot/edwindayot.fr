const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal"), "--window-size=1280,960"],
  });
  const p = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  p.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERROR:", m.text().slice(0, 200)); });
  await p.goto("http://127.0.0.1:4174/", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => window.GardenApp && window.GardenApp.view, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  const info = await p.evaluate(() => {
    const A = window.GardenApp, v = A.view, g = A.game;
    // Frame once so the lighting clock settles (updateLighting runs INSIDE frame and
    // re-applies GardenLighting.at() — overrides must be applied AFTER the frame).
    g.s.elapsed = 300;
    v.position = { x: -6.5, z: 2.5 };
    v.span = 14;
    v.quality = 2;
    v.sync && v.sync();
    v.updateCamera(1, true);
    v.frame(0.016, {}, true);
    const gl = v.renderer.getContext();
    const W = v.canvas.width, H = v.canvas.height;
    const buf = new Uint8Array(W * H * 4);
    const setCase = (amb, sunOn, shadow) => {
      v.frame(0.016, {}, true); // let the clock re-apply lighting first
      v.ambient.intensity = amb;
      v.sun.intensity = sunOn ? 2.6 : 0;
      v.moon.intensity = 0;
      v.scene.traverse((o) => { if (o.isLight) o.castShadow = shadow && o.intensity > 0; });
      v.renderer.render(v.scene, v.camera);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf.slice();
    };
    const shots = {
      hiShadow: setCase(2.1, true, true),
      hiNoShadow: setCase(2.1, true, false),
      hiNoSun: setCase(2.1, false, true),
      loShadow: setCase(0.7, true, true),
      loNoShadow: setCase(0.7, true, false),
      loNoSun: setCase(0.7, false, true),
    };
    const px = (s, x, y) => {
      const i = ((H - 1 - y) * W + x) * 4;
      return [s[i], s[i + 1], s[i + 2]];
    };
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const diff = (a, b, thresh) => {
      let n = 0, sum = 0, maxd = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (d > thresh) { n++; sum += d; if (d > maxd) maxd = d; }
      }
      return { px: n, pct: ((100 * n) / (W * H)).toFixed(1) + "%", avg: n ? (sum / n).toFixed(1) : "0", max: maxd };
    };
    const band = (s, y0, y1, x0, x1) => {
      let mn = 1e9, mx = -1e9, sum = 0, n = 0;
      for (let y = y0; y < y1; y += 2)
        for (let x = x0; x < x1; x += 2) {
          const l = lum(px(s, x, y));
          if (l < mn) mn = l; if (l > mx) mx = l; sum += l; n++;
        }
      return { min: mn.toFixed(0), max: mx.toFixed(0), mean: (sum / n).toFixed(0), range: (mx - mn).toFixed(0) };
    };
    const cy = Math.floor(H / 2), cx = Math.floor(W / 2);
    const profile = (s, y, x0, x1) => {
      const out = [];
      for (let x = x0; x < x1; x += Math.floor((x1 - x0) / 15)) out.push(lum(px(s, x, y)).toFixed(0));
      return out;
    };
    const r = {
      W, H,
      sunContribution_hiAmb: diff(shots.hiNoShadow, shots.hiNoSun, 8),
      shadowOnly_hiAmb: diff(shots.hiShadow, shots.hiNoShadow, 8),
      sunContribution_loAmb: diff(shots.loNoShadow, shots.loNoSun, 8),
      shadowOnly_loAmb: diff(shots.loShadow, shots.loNoShadow, 8),
      relief_hiShadow: band(shots.hiShadow, Math.floor(H * 0.3), Math.floor(H * 0.6), Math.floor(W * 0.3), Math.floor(W * 0.7)),
      relief_hiNoShadow: band(shots.hiNoShadow, Math.floor(H * 0.3), Math.floor(H * 0.6), Math.floor(W * 0.3), Math.floor(W * 0.7)),
      relief_loShadow: band(shots.loShadow, Math.floor(H * 0.3), Math.floor(H * 0.6), Math.floor(W * 0.3), Math.floor(W * 0.7)),
      relief_loNoShadow: band(shots.loNoShadow, Math.floor(H * 0.3), Math.floor(H * 0.6), Math.floor(W * 0.3), Math.floor(W * 0.7)),
      profileHill_hiShadow: profile(shots.hiShadow, cy, Math.floor(W * 0.25), Math.floor(W * 0.75)),
      profileHill_loShadow: profile(shots.loShadow, cy, Math.floor(W * 0.25), Math.floor(W * 0.75)),
      samples: {
        center_hiShadow: px(shots.hiShadow, cx, cy),
        center_loShadow: px(shots.loShadow, cx, cy),
        bg_hiShadow: px(shots.hiShadow, Math.floor(W * 0.1), Math.floor(H * 0.2)),
        bg_loShadow: px(shots.loShadow, Math.floor(W * 0.1), Math.floor(H * 0.2)),
      },
    };
    // restore for the screenshots
    g.s.elapsed = 300;
    v.updateLighting && v.updateLighting(0.016);
    return r;
  });
  console.log(JSON.stringify(info, null, 1));
  const save = async (name, amb, shadow) => {
    await p.evaluate(({ amb, shadow }) => {
      const A = window.GardenApp, v = A.view, g = A.game;
      g.s.elapsed = 300;
      v.frame(0.016, {}, true);
      v.ambient.intensity = amb;
      v.sun.intensity = 2.6;
      v.moon.intensity = 0;
      v.scene.traverse((o) => { if (o.isLight) o.castShadow = shadow && o.intensity > 0; });
      v.renderer.render(v.scene, v.camera);
    }, { amb, shadow });
    await p.screenshot({ path: `/tmp/garden-matrix-${name}.png` });
  };
  await save("hisun-shadows", 2.1, true);
  await save("hisun-noshadows", 2.1, false);
  await save("losun-shadows", 0.7, true);
  await save("losun-noshadows", 0.7, false);
  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
