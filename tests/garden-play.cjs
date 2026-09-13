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
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
