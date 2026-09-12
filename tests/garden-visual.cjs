const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const p = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    });
    await p.route("**/garden.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await p.goto(url);
    await p.waitForFunction(() => window.GardenView);
    await p.evaluate(() => {
      document.querySelector(".garden-shell").remove();
      const canvas = document.createElement("canvas");
      canvas.id = "atlas";
      document.body.append(canvas);
      const T = THREE;
      window.atlasRenderer = new T.WebGLRenderer({ canvas, antialias: true });
      atlasRenderer.setSize(1600, 900);
      atlasRenderer.outputColorSpace = T.SRGBColorSpace;
      atlasRenderer.toneMapping = T.ACESFilmicToneMapping;
      atlasRenderer.toneMappingExposure = 1.1;
    });
    for (let group = 0; group < 4; group++) {
      await p.evaluate((group) => {
        const T = THREE,
          scene = new T.Scene();
        scene.background = new T.Color(0xe5eadc);
        scene.add(new T.HemisphereLight(0xfff6e0, 0x718d76, 2.3));
        const sun = new T.DirectionalLight(0xffeaca, 2.4);
        sun.position.set(-5, 10, 8);
        scene.add(sun);
        const camera = new T.OrthographicCamera(-8.9, 8.9, 5, -5, 0.1, 100);
        camera.position.set(0, 10, 20);
        camera.lookAt(0, 0, 0);
        let count = 0;
        for (let row = 0; row < 3; row++)
          for (let stage = 0; stage < 4; stage++) {
            const sp = GardenData.species[group * 3 + row],
              root = new T.Group();
            root.position.set(-6 + stage * 4, 0, -7 + row * 7);
            scene.add(root);
            const pot = GardenModels.pot(0xc99476);
            root.add(pot);
            pot.userData.seed.visible = stage === 0;
            if (stage) {
              const plant = GardenBotany.create(sp.id);
              plant.position.y = 0.66;
              plant.scale.setScalar([0, 0.17, 0.45, 0.85][stage]);
              root.add(plant);
            }
            const c = document.createElement("canvas");
            c.width = 512;
            c.height = 96;
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#304f40";
            ctx.font = "36px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
              sp.name + " · " + ["graine", "germe", "jeune", "adulte"][stage],
              256,
              60,
            );
            const map = new T.CanvasTexture(c);
            map.colorSpace = T.SRGBColorSpace;
            const label = new T.Sprite(new T.SpriteMaterial({ map }));
            label.scale.set(2.8, 0.525, 1);
            label.position.set(0, 0.1, 1.1);
            root.add(label);
            count++;
          }
        atlasRenderer.render(scene, camera);
        return count;
      }, group);
      await p
        .locator("#atlas")
        .screenshot({ path: `/tmp/garden-botany-${group + 1}.png` });
    }
    // The maximum save is a dedicated load fixture, separate from the first-session economy test.
    const result = await p.evaluate(async () => {
      const D = GardenData,
        g = new GardenRules.GardenState();
      g.s.entities = [];
      g.s.unlocked = [0, 1, 2, 3];
      g.s.discovered = D.species.map((p) => p.id);
      let id = 1;
      for (let i = 0; i < 48; i++)
        g.s.entities.push({
          id: `e${id++}`,
          type: "pot",
          x: -16 + (i % 8) * 2.5,
          z: -12 + Math.floor(i / 8) * 3,
          rotation: 0,
          stored: false,
          plant: {
            species: D.species[i % 12].id,
            growth: 1,
            moisture: 60,
            progress: 0,
            ready: 3,
          },
        });
      let n = 0;
      for (let z = -13.5; z < 6.5 && n < 192; z += 0.5)
        for (let x = -17.5; x < 3.5 && n < 192; x += 0.5) {
          if (g.s.entities.every((e) => Math.hypot(e.x - x, e.z - z) > 1)) {
            g.s.entities.push({
              id: `e${id++}`,
              type: n % 5 === 0 ? "lantern" : "path",
              x,
              z,
              rotation: 0,
              stored: false,
            });
            n++;
          }
        }
      g.s.nextId = id;
      const start = performance.now();
      g.step(28800);
      const offlineMs = performance.now() - start;
      document.querySelector("#atlas").remove();
      const wrap = document.createElement("div");
      wrap.style.cssText = "width:1440px;height:900px;position:relative";
      const canvas = document.createElement("canvas");
      wrap.append(canvas);
      document.body.append(wrap);
      const view = new GardenView(canvas, g);
      view.network = true;
      view.span = 32;
      view.overview = true;
      view.position = { x: -7, z: -4 };
      view.sync();
      view.renderer.setPixelRatio(1);
      view.renderer.shadowMap.enabled = true;
      view.frame(0.016, {}, true);
      const hudCanvas = document.createElement("canvas");
      hudCanvas.style.cssText =
        "position:absolute;inset:0;width:1440px;height:900px";
      wrap.append(hudCanvas);
      const hud = new GardenHUD(hudCanvas, view, () => {}),
        hudModel = {
          s: g.s,
          activeSlot: 2,
          held: "axe",
          panel: "",
          tab: "bag",
          item: "axe",
          selected: null,
          build: null,
          context: {
            label: "E · Agir",
            status: "Scène de charge · 48 pots et 192 décorations",
          },
          canMove: false,
          network: false,
          stick: { x: 0, z: 0 },
          touch: false,
          paused: false,
          toast: "",
          toastUntil: 0,
          zone: "Jardin de charge",
          hint: "",
        };
      hud.draw(hudModel);
      const phases = [];
      for (const [phase, time] of [
        ["day", 150],
        ["night", 750],
      ]) {
        g.s.elapsed = time;
        g.s.remainder = 0;
        const renderStart = performance.now();
        let frames = 0,
          last = renderStart;
        await new Promise((resolve) => {
          function frame(now) {
            const dt = (now - last) / 1000;
            last = now;
            view.frame(Math.min(dt, 0.08), {}, true);
            view.adaptQuality(dt);
            hud.draw(hudModel);
            frames++;
            if (performance.now() - renderStart < 14000)
              requestAnimationFrame(frame);
            else resolve();
          }
          requestAnimationFrame(frame);
        });
        phases.push({
          phase,
          frames,
          fps: (frames / (performance.now() - renderStart)) * 1000,
          quality: view.quality,
          shadowSize: view.sun.shadow.mapSize.x,
          localShadows: view.localLights.filter((l) => l.castShadow).length,
          drawCalls: view.renderer.info.render.calls,
          triangles: view.renderer.info.render.triangles,
        });
      }
      const gl = view.renderer.getContext(),
        ext = gl.getExtension("WEBGL_debug_renderer_info");
      const result = {
        canvasHUD: true,
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown",
        pots: 48,
        decor: n,
        phases,
        drawCalls: view.renderer.info.render.calls,
        triangles: view.renderer.info.render.triangles,
        offlineMs,
      };
      window.loadView = view;
      return result;
    });
    assert.equal(result.decor, 192);
    await p.screenshot({ path: "/tmp/garden-load.png" });
    fs.writeFileSync(
      "/tmp/garden-performance.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    await p.evaluate(async () => {
      loadView.position = { x: -27, z: 7 };
      loadView.span = 20;
      loadView.overview = false;
      loadView.game.s.player = { ...loadView.position };
      loadView.sync();
      for (let i = 0; i < 120; i++) loadView.frame(0.016, {}, true);
    });
    await p.screenshot({ path: "/tmp/garden-woodland.png" });
    assert.ok(
      (await p.evaluate(
        () =>
          loadView.treeData.filter(
            (t) => GardenConstruction.zoneAt(t.x, t.z)?.id === 1,
          ).length,
      )) >= 20,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
