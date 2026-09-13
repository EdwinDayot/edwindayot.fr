const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
(async () => {
  const browser = await chromium.launch({
      headless: true,
      args:
        process.platform === "darwin"
          ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
          : [],
    }),
    errors = [];
  const { state, page, button, click, point, use, equip, place } =
    require("./garden-play-helpers.cjs")(browser, url, errors);
  try {
    const m = await page({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await click(m, "open-inventory", true);
    await click(m, "item-seed:calathea", true);
    await click(m, "assign-2", true);
    await m.waitForTimeout(250);
    await m.screenshot({ path: "/tmp/garden-canvas-mobile-inventory.png" });
    await click(m, "close", true);
    await click(m, "slot-2", true);
    assert.equal((await state(m)).hotbar[2], "seed:calathea");
    const j = await button(m, "joystick"),
      touchCdp = await m.context().newCDPSession(m),
      pos = await m.evaluate(() => ({ ...__view.position }));
    await touchCdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: j.x + 24, y: j.y - 20 }],
    });
    await m.waitForTimeout(600);
    await touchCdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.notDeepEqual(await m.evaluate(() => ({ ...__view.position })), pos);
    assert.equal(
      await m.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await m.screenshot({ path: "/tmp/garden-canvas-mobile.png" });
    const t = await page({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await t.waitForTimeout(1200);
    const xy = await point(t, { x: -3, z: 0 });
    await t.touchscreen.tap(xy.x, xy.y);
    await t.waitForFunction(() => !__view.routes.length);
    await t.waitForTimeout(300);
    await click(t, "move", true);
    await click(t, "build-store", true);
    assert.equal((await state(t)).entities[0].stored, true);
    await click(t, "open-inventory", true);
    await click(t, "reserve", true);
    await click(t, "row-0", true);
    await click(t, "build-rotate", true);
    const restore = await point(t, { x: -2, z: 0 });
    await t.touchscreen.tap(restore.x, restore.y);
    assert.equal((await state(t)).entities[0].stored, false);
    assert.equal((await state(t)).entities[0].rotation, 1);
    // Reach a resource through the Canvas map, then hold the tactile action button.
    await click(t, "slot-2", true);
    await click(t, "open-map", true);
    await click(t, "row-1", true);
    await t.waitForFunction(() => !__view.routes.length);
    await t.waitForTimeout(300);
    const act = await button(t, "act"),
      tc = await t.context().newCDPSession(t),
      wood = (await state(t)).inventory.wood;
    await tc.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [act],
    });
    await t.waitForFunction(
      () => __view.game.s.resources[0].ready > __view.game.s.elapsed,
      null,
      { timeout: 6000 },
    );
    await tc.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal((await state(t)).inventory.wood, wood + 3);
    await t.screenshot({ path: "/tmp/garden-canvas-touch-mining.png" });
    const nojs = await browser.newPage({ javaScriptEnabled: false });
    await nojs.goto(url);
    assert.equal(await nojs.locator("#garden-fallback").isVisible(), true);
    await nojs.locator("#garden-fallback a").click();
    assert.match(nojs.url(), /portfolio/);
    const nogl = await browser.newPage();
    await nogl.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type.includes("webgl")
          ? null
          : original.call(this, type, ...args);
      };
    });
    await nogl.goto(url);
    assert.equal(await nogl.locator("#garden-fallback").isVisible(), true);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      "/tmp/garden-browser-result.json",
      JSON.stringify(
        {
          canvas: true,
          desktop: true,
          mobile: true,
          mining: ["wood", "stone", "clay"],
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS Canvas touch: inventory, joystick hold, moving/storing/replacing, held tree cutting; no JS/WebGL fallbacks and no application errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
