const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const p = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await p.route("**/garden.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await p.goto(process.env.GARDEN_URL || "http://127.0.0.1:4174/");
    const result = await p.evaluate(() => {
      const g = new GardenRules.GardenState(),
        T = THREE;
      g.s.entities = [
        { id: "e1", type: "lantern", x: -5, z: 1, rotation: 0, stored: false },
        {
          id: "e2",
          type: "tank",
          x: -5.9,
          z: 1,
          rotation: 0,
          stored: false,
          water: 80,
        },
      ];
      g.s.elapsed = 750;
      const v = new GardenView(document.getElementById("garden-world"), g);
      window.shadowView = v;
      v.position = { x: -6, z: 2 };
      v.span = 8;
      v.sync();
      v.frame(0.016, {}, true);
      v.ambient.intensity = 0.05;
      v.moon.intensity = 0;
      const light = v.localLights.find((l) => l.intensity > 0),
        gl = v.renderer.getContext(),
        w = gl.drawingBufferWidth,
        h = gl.drawingBufferHeight;
      function pixels(shadows) {
        light.castShadow = shadows;
        v.renderer.render(v.scene, v.camera);
        const out = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
        return out;
      }
      const withShadows = pixels(true),
        without = pixels(false);
      let darkened = 0,
        maxDifference = 0;
      for (let i = 0; i < withShadows.length; i += 4) {
        const diff =
          without[i] +
          without[i + 1] +
          without[i + 2] -
          withShadows[i] -
          withShadows[i + 1] -
          withShadows[i + 2];
        if (diff > 18) darkened++;
        maxDifference = Math.max(maxDifference, diff);
      }
      pixels(true);
      const batch = v.instanceRoot.uuid;
      g.s.elapsed = 400;
      v.frame(0.016, {}, true);
      const stable = batch === v.instanceRoot.uuid;
      v.showPreview({ item: "tank", x: -3, z: 1, rotation: 0 });
      v.frame(0.016, {}, true);
      const previewShadows = v.batches.some(
        (b) =>
          b.sources.some((s) => s.material.userData.preview) &&
          b.mesh.castShadow,
      );
      for (let i = 0; i < 800; i++) v.adaptQuality(0.05);
      return {
        darkened,
        maxDifference,
        stable,
        previewShadows,
        quality: v.quality,
        size: v.sun.shadow.mapSize.x,
        localSize: light.shadow.mapSize.x,
        enabled: v.renderer.shadowMap.enabled,
      };
    });
    assert.ok(result.darkened > 100, JSON.stringify(result));
    assert.ok(result.maxDifference > 30);
    assert.equal(result.stable, true);
    assert.equal(result.previewShadows, false);
    assert.equal(result.quality, 0);
    assert.equal(result.size, 512);
    assert.equal(result.localSize, 256);
    assert.equal(result.enabled, true);
    await p.screenshot({ path: "/tmp/garden-shadow-occlusion.png" });
    console.log(
      "PASS actual local-light occlusion, stable batches, shadow-free previews and adaptive maps",
      result,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
