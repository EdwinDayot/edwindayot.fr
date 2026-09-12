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
  const state = (p) => p.evaluate(() => __view.game.serialize());
  async function page(options = {}) {
    const p = await browser.newPage(options);
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    // Read-only hit-area and projection hooks. All state changes use keyboard, mouse or touch.
    await p.addInitScript(() => {
      for (const [name, key] of [
        ["GardenView", "__view"],
        ["GardenHUD", "__hud"],
      ]) {
        let Wrapped;
        Object.defineProperty(window, name, {
          configurable: true,
          get: () => Wrapped,
          set: (Base) => {
            Wrapped = class extends Base {
              constructor(...args) {
                super(...args);
                window[key] = this;
              }
            };
          },
        });
      }
    });
    await p.goto(url);
    await p.waitForFunction(() => window.__hud?.model);
    return p;
  }
  async function button(p, id) {
    await p.waitForFunction(
      (id) => __hud.buttons.some((b) => b.id === id && !b.disabled),
      id,
    );
    return p.evaluate((id) => {
      const b = __hud.buttons.find((b) => b.id === id);
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }, id);
  }
  async function click(p, id, touch = false) {
    const b = await button(p, id);
    if (touch) await p.touchscreen.tap(b.x, b.y);
    else await p.mouse.click(b.x, b.y);
    await p.waitForTimeout(80);
  }
  async function point(p, obj) {
    return p.evaluate((obj) => __view.screenPoint(obj, 0), obj);
  }
  async function use(p, id) {
    const e = await p.evaluate(
      (id) =>
        __view.game.s.entities.find((e) => e.id === id) ||
        __view.game.s.resources.find((e) => e.id === id) ||
        GardenData.visitors.find((e) => e.id === id) ||
        (id === "river" ? { x: 3.5, z: 4 } : null),
      id,
    );
    const xy = await point(p, e);
    console.log("use", id);
    await p.mouse.click(xy.x, xy.y);
    await p.waitForFunction(() => !__view.routes.length, null, {
      timeout: 25000,
    });
    await p.waitForTimeout(350);
  }
  async function equip(p, item, slot, craft = false) {
    await p.keyboard.press("i");
    await p.waitForFunction(() => __hud.model.panel === "inventory");
    await click(p, craft ? "tab-craft" : "tab-bag");
    await click(p, "item-" + item);
    await p.keyboard.press(String(slot));
    assert.equal((await state(p)).hotbar[slot - 1], item);
    await p.keyboard.press("i");
    await p.waitForFunction(() => __hud.model.panel === "");
    await p.keyboard.press(String(slot));
  }
  async function place(p, x, z) {
    const pt = await point(p, { x, z });
    await p.mouse.move(pt.x, pt.y);
    await p.waitForTimeout(300);
    assert.equal(
      await p.evaluate(() => __hud.model.build?.error),
      null,
      await p.evaluate(() =>
        JSON.stringify({ build: __hud.model.build, position: __view.position }),
      ),
    );
    await p.keyboard.press("e");
    await p.waitForTimeout(200);
  }
  try {
    const p = await page({ viewport: { width: 1440, height: 1000 } });
    assert.equal(
      await p.locator("main button,main dialog").count(),
      0,
      "The visible game UI is Canvas, not DOM panels",
    );
    const start = await p.evaluate(() => ({ ...__view.position }));
    await p.keyboard.down("ArrowDown");
    await p.waitForTimeout(400);
    await p.keyboard.up("ArrowDown");
    assert.notDeepEqual(
      await p.evaluate(() => ({ ...__view.position })),
      start,
    );
    await use(p, "e1");
    assert.equal((await state(p)).inventory["cutting:pilea"], 1);
    await equip(p, "seed:pilea", 3);
    await use(p, "e2");
    assert.equal((await state(p)).inventory["seed:pilea"], 1);
    await p.keyboard.press("1");
    await use(p, "e2");
    assert.equal((await state(p)).water, 80);
    await equip(p, "seed:monstera", 3);
    await use(p, "e3");
    assert.equal((await state(p)).inventory["seed:monstera"], 1);
    await p.keyboard.press("2");
    await use(p, "lea");
    assert.equal((await state(p)).trades, 1);
    assert.equal(await p.evaluate(() => __hud.model.panel), "");
    await equip(p, "pot", 4, true);
    await place(p, -3, 2);
    await p.keyboard.press("r");
    await place(p, -5.5, 2);
    assert.equal((await state(p)).entities.length, 5);
    assert.equal((await state(p)).entities[4].rotation, 1);
    assert.ok(
      await p.evaluate(() => __hud.model.build),
      "Repeated placement stays equipped",
    );
    const before = await p.evaluate(() => ({ ...__view.position }));
    await p.keyboard.down("ArrowRight");
    await p.waitForTimeout(300);
    await p.keyboard.up("ArrowRight");
    assert.notDeepEqual(
      await p.evaluate(() => ({ ...__view.position })),
      before,
    );
    await p.keyboard.press("Escape");
    for (const [type, tool] of [
      ["wood", "axe"],
      ["stone", "pickaxe"],
      ["clay", "shovel"],
    ]) {
      await equip(p, tool, 3);
      const amount = (await state(p)).inventory[type] || 0;
      await use(p, "resource-0-" + type);
      assert.equal(
        (await state(p)).inventory[type] || 0,
        amount,
        "One strike does not yield material",
      );
      await p.keyboard.down("e");
      await p.waitForFunction(
        (type) =>
          __view.game.s.resources.find((r) => r.id === "resource-0-" + type)
            .ready > __view.game.s.elapsed,
        type,
        { timeout: 6500 },
      );
      await p.keyboard.up("e");
      assert.equal((await state(p)).inventory[type], amount + 3);
      assert.equal(
        await p.evaluate(
          (type) =>
            __view.nodes.get("resource-0-" + type).userData.depleted.visible,
          type,
        ),
        true,
      );
      await p.screenshot({ path: "/tmp/garden-mining-" + type + ".png" });
    }
    await p.keyboard.press("1");
    await use(p, "river");
    await equip(p, "tank", 4, true);
    await place(p, 2, 1);
    await p.keyboard.press("Escape");
    await equip(p, "drip", 4, true);
    await place(p, 1, 0);
    await p.keyboard.press("Escape");
    await p.keyboard.press("1");
    await use(p, "river");
    await use(p, "e6");
    assert.ok((await state(p)).entities[5].water > 95);
    await equip(p, "hose", 5);
    await use(p, "e6");
    await use(p, "e7");
    await use(p, "e2");
    assert.equal((await state(p)).links.length, 2);
    await p.waitForTimeout(1500);
    assert.equal(
      await p.evaluate(
        () =>
          GardenIrrigation.status(__view.game.s, __view.game.s.entities[5])
            .kind,
      ),
      "flowing",
    );
    assert.ok(
      await p.evaluate(() =>
        __view.connectionGroup.children.some((o) => o.isMesh),
      ),
    );
    await p.keyboard.press("2");
    await p.keyboard.press("n");
    await p.screenshot({ path: "/tmp/garden-canvas-irrigation.png" });
    await p.keyboard.press("f");
    await place(p, 0.5, -1.5);
    assert.equal((await state(p)).links.length, 2);
    await use(p, "e2");
    await click(p, "move");
    await click(p, "build-store");
    assert.equal((await state(p)).entities[1].stored, true);
    await p.keyboard.press("i");
    await click(p, "reserve");
    await click(p, "row-0");
    await place(p, 0.5, -1.5);
    assert.equal((await state(p)).entities[1].plant.species, "pilea");
    await p.keyboard.press("i");
    await click(p, "tab-bag");
    const water = await button(p, "item-water"),
      slot = await button(p, "assign-4");
    await p.mouse.move(water.x, water.y);
    await p.mouse.down();
    await p.mouse.move(slot.x, slot.y, { steps: 8 });
    await p.mouse.up();
    assert.equal((await state(p)).hotbar[4], "water");
    await p.screenshot({ path: "/tmp/garden-canvas-inventory.png" });
    await p.keyboard.press("i");
    const a = await button(p, "slot-0"),
      b = await button(p, "slot-2");
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps: 8 });
    await p.mouse.up();
    assert.equal((await state(p)).hotbar[2], "water");
    const slots = (await state(p)).hotbar;
    await p.reload();
    await p.waitForFunction(() => window.__hud?.model);
    assert.deepEqual((await state(p)).hotbar, slots);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: '"',
      code: "Digit3",
      windowsVirtualKeyCode: 51,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: '"',
      code: "Digit3",
      windowsVirtualKeyCode: 51,
    });
    await p.waitForFunction(() => __hud.model.activeSlot === 2);
    await p.keyboard.press("i");
    await p.keyboard.press("Tab");
    await p.keyboard.press("Escape");
    const resume = await p.evaluate(() => ({ ...__view.position }));
    await p.keyboard.down("ArrowDown");
    await p.waitForTimeout(350);
    await p.keyboard.up("ArrowDown");
    assert.notDeepEqual(
      await p.evaluate(() => ({ ...__view.position })),
      resume,
    );
    await p.screenshot({ path: "/tmp/garden-canvas-desktop.png" });
    await p.locator(".portfolio-link").click();
    await p.locator("#plant-calendar summary").click();
    await p.locator(".phone-row img").first().click();
    assert.equal(await p.locator("dialog[open]").count(), 1);
    await p.keyboard.press("Escape");
    await p.goto(url + "#projets");
    await p.waitForURL("**/portfolio/#projets");
    console.log(
      "PASS Canvas desktop: configurable/dragged slots, AZERTY, planting, three held mining tools, production once, trading, repeated placement, water flow, storing and reload.",
    );
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
