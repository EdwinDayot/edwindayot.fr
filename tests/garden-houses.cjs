const { chromium } = require("playwright");
const assert = require("node:assert/strict");
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
  const { page, use, state, click } = require("./garden-play-helpers.cjs")(
    browser,
    url,
    errors,
  );
  try {
    const p = await page({ viewport: { width: 1440, height: 1000 } });
    // Overview of the three houses in a row, viewed from the portal.
    await p.evaluate(() => {
      __view.position = { x: 0, z: 2 };
      __view.overview = true;
      __view.span = 24;
      __view.angle = 0.5;
    });
    await p.waitForTimeout(300);
    const doorsClosed = await p.evaluate(() =>
      __view.doors.map((d) => d.pivot.rotation.y),
    );
    assert.ok(
      doorsClosed.every((r) => Math.abs(r) < 0.01),
      "doors start closed while nobody is near",
    );
    await p.screenshot({ path: "/tmp/garden-houses-row.png" });
    // Walk through the door: click Léa from a distance (the ground point
    // under her is also under the roof, exercising the raycast fallback).
    await use(p, "lea");
    assert.equal(await p.evaluate(() => __view.selected?.id), "lea");
    const doorOpen = await p.evaluate(() => __view.doors[0].pivot.rotation.y);
    assert.ok(
      Math.abs(doorOpen) > 0.5,
      "the door opens once the player is inside",
    );
    await p.evaluate(() => {
      __view.overview = false;
      __view.span = 8;
    });
    await p.waitForTimeout(200);
    await p.screenshot({ path: "/tmp/garden-houses-interior.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Canvas desktop: closed doors from afar, the three houses render, and the door opens once inside.",
    );
    // Noé (vendor role) opens his shop and sells a real purchase through the
    // generic "buy" command; Iris (botanist role) grants her first collection
    // milestone. Both go through the same role dispatch as Léa above, not a
    // per-id branch. Selected via dispatch("go") (same mechanism as a
    // map-panel row) rather than a screen click: clicking a visitor's exact
    // ground pixel can hit an unrelated tree canopy along that camera ray
    // first (a pre-existing raycast quirk, not a role-dispatch one — out of
    // scope here, this test only exercises the role logic). dispatch("go")
    // (a map-panel row) only walks there, it doesn't auto-act on arrival the
    // way a world click does — press E once arrived, same as a player would
    // after walking there from the map.
    await p.evaluate(() => __hud.dispatch("go", { id: "noe" }));
    await p.waitForFunction(() => !__view.routes.length, null, {
      timeout: 20000,
    });
    await p.waitForTimeout(200);
    await p.keyboard.press("e");
    await p.waitForFunction(() => __hud.model.panel === "shop");
    const before = await state(p);
    await click(p, "row-0");
    const after = await state(p);
    assert.equal(after.inventory.coins, before.inventory.coins - 8);
    assert.equal(
      after.inventory.pot || 0,
      (before.inventory.pot || 0) + 1,
      "buying a pot from Noé adds one to the placeable inventory",
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    const rewardsBefore = await p.evaluate(
      () => __view.game.s.botanyRewards.length,
    );
    await p.evaluate(() => __hud.dispatch("go", { id: "iris" }));
    await p.waitForFunction(() => !__view.routes.length, null, {
      timeout: 20000,
    });
    await p.waitForTimeout(200);
    await p.keyboard.press("e");
    await p.waitForFunction(
      (before) => __view.game.s.botanyRewards.length === before + 1,
      rewardsBefore,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS Canvas desktop: Noé (vendor) and Iris (botanist) role dispatch works end-to-end.",
    );
    // Mobile: joystick a player into a house and back out (door regression).
    const m = await page({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await m.evaluate(() => {
      __view.position = { x: -2.5, z: 3 };
    });
    const j = await (async () => {
      await m.waitForFunction(() =>
        __hud.buttons.some((b) => b.id === "joystick"),
      );
      return m.evaluate(() => {
        const b = __hud.buttons.find((b) => b.id === "joystick");
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      });
    })();
    const insideNoe = () =>
      Math.abs(__view.position.x - -2.5) < 1.6 &&
      __view.position.z > 5.4 &&
      __view.position.z < 8.6;
    const cdp = await m.context().newCDPSession(m);
    for (let i = 0; i < 40 && !(await m.evaluate(insideNoe)); i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: j.x, y: j.y + 24 }],
      });
      await m.waitForTimeout(150);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.ok(
      await m.evaluate(insideNoe),
      `the joystick walked the player inside Noé's house, got ${JSON.stringify(await m.evaluate(() => __view.position))}`,
    );
    await m.screenshot({ path: "/tmp/garden-houses-mobile.png" });
    for (let i = 0; i < 40 && (await m.evaluate(insideNoe)); i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: j.x, y: j.y - 24 }],
      });
      await m.waitForTimeout(150);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal(
      await m.evaluate(insideNoe),
      false,
      "the joystick walked the player back out",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS Mobile joystick: walking into and back out of a house through its door.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
