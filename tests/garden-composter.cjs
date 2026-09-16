const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fixture = require("./fixtures/network-substance.cjs");
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
        viewport: { width: 1280, height: 900 },
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.addInitScript((state) => {
      localStorage.setItem("edwin-garden-v3", JSON.stringify(state));
      let W, H;
      Object.defineProperty(window, "GardenView", {
        get: () => W,
        set: (B) =>
          (W = class extends B {
            constructor(...a) {
              super(...a);
              window.__view = this;
            }
          }),
      });
      Object.defineProperty(window, "GardenHUD", {
        get: () => H,
        set: (B) =>
          (H = class extends B {
            constructor(...a) {
              super(...a);
              window.__hud = this;
            }
          }),
      });
    }, fixture().serialize());
    await p.goto(url);
    await p.waitForFunction(() => window.__hud?.model);
    for (let i = 0; i < 12; i++) await p.evaluate(() => __view.game.step(1));
    await p.evaluate(() => __view.sync());
    const state = await p.evaluate(() => {
      const s = __view.game.s,
        pot = s.entities.find((e) => e.id === "e5"),
        tank = s.entities.find((e) => e.id === "e2");
      return {
        boosted: pot.plant.boostUntil > s.elapsed,
        moistureUnchanged: pot.plant.moisture <= 50,
        tankWater: tank.water,
        composterModelBuilt: !!__view.models.get("e1"),
      };
    });
    assert.equal(state.boosted, true, "the pot was fertilizer-boosted");
    assert.equal(state.moistureUnchanged, true);
    assert.ok(state.tankWater > 0, "the composter filled the tank");
    assert.equal(state.composterModelBuilt, true, "composter has a 3D model");
    // V-inspect the composter and the fertilizer tank through the real HUD.
    await p.evaluate(() => {
      __view.position = { x: -9, z: 3.5 };
      __view.overview = true;
      __view.span = 10;
      __view.angle = 0.5;
    });
    await p.waitForTimeout(300);
    await p.evaluate(() => __hud.dispatch("inspect", { id: "e1" }));
    await p.waitForFunction(() => __hud.model.panel === "inspection");
    const composterSheet = await p.evaluate(() => __hud.buttons.length > 0);
    assert.ok(composterSheet, "the composter detail sheet has a close button");
    await p.screenshot({ path: "/tmp/garden-composter-detail.png" });
    await p.evaluate(() => __hud.dispatch("close"));
    await p.evaluate(() => __hud.dispatch("inspect", { id: "e2" }));
    await p.waitForFunction(() => __hud.model.panel === "inspection");
    await p.waitForTimeout(150);
    await p.screenshot({ path: "/tmp/garden-composter-tank-detail.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Composter -> tank -> pipe -> drip network renders, fills, boosts a plant, and both detail sheets open without console errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
