const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
// Wave 1 (the artisans' quarter, Épic 1.1): four vendor NPCs added as pure
// data rows in game/data-buildings.js. This fixture is deliberately generic
// on the visitor id — proving that reaching any of them resolves to the
// same vendor dispatch already exercised for Noé, with zero id-specific code.
(async () => {
  const browser = await chromium.launch({
      headless: true,
      args:
        process.platform === "darwin"
          ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
          : [],
    }),
    errors = [];
  const { page, state, click } = require("./garden-play-helpers.cjs")(
    browser,
    url,
    errors,
  );
  try {
    const p = await page({ viewport: { width: 1440, height: 1000 } });
    // Selected via dispatch("go") (a map-panel row), not a screen click:
    // clicking a visitor's exact ground pixel can hit an unrelated tree
    // canopy along that camera ray first — a pre-existing raycast quirk
    // (see the Noé/Iris comment in garden-houses.cjs), already proven
    // generic for a real click via the Léa test in that same file.
    for (const id of ["mira", "basile", "anouk", "ines"]) {
      await p.evaluate((id) => __hud.dispatch("go", { id }), id);
      await p.waitForFunction(() => !__view.routes.length, null, {
        timeout: 20000,
      });
      await p.waitForTimeout(200);
      assert.equal(
        await p.evaluate(() => __view.selected?.id),
        id,
        `walking to ${id} should select them`,
      );
      await p.keyboard.press("e");
      await p.waitForFunction(() => __hud.model.panel === "shop");
      const rowCount = await p.evaluate(
        (id) =>
          __hud.buttons.filter(
            (b) => b.action === "buy" && b.data.vendor === id,
          ).length,
        id,
      );
      const wares = await p.evaluate(
        (id) =>
          GardenData.buildings.find((b) => b.visitorId === id).roleData.wares
            .length,
        id,
      );
      assert.equal(
        rowCount,
        wares,
        `${id}'s shop should list exactly their roleData.wares, same generic dispatch as Noé`,
      );
      const doorOpen = await p.evaluate((id) => {
        const i = GardenData.buildings.findIndex((b) => b.visitorId === id);
        return Math.abs(__view.doors[i].pivot.rotation.y) > 0.5;
      }, id);
      assert.ok(doorOpen, `${id}'s door should open while inside`);
      // Mira is the multi-item vendor (reservoir 14 coins, bench 10 coins);
      // a fresh save only has 8, so both rows must be disabled — the button
      // helper refuses to click a disabled row, so check the state directly.
      if (id === "mira") {
        const disabled = await p.evaluate(() =>
          __hud.buttons
            .filter((b) => b.action === "buy")
            .map((b) => b.disabled),
        );
        assert.deepEqual(
          disabled,
          [true, true],
          "both of Mira's wares should be unaffordable on a fresh save",
        );
      }
      // Basile's single item (lantern, 6 coins) is affordable from a fresh
      // save: a real purchase should pay coins and add exactly one lantern.
      if (id === "basile") {
        const before = await state(p);
        await click(p, "row-0");
        const after = await state(p);
        assert.equal(after.inventory.coins, before.inventory.coins - 6);
        assert.equal(
          after.inventory.lantern || 0,
          (before.inventory.lantern || 0) + 1,
        );
      }
      await p.keyboard.press("Escape");
      await p.waitForTimeout(150);
    }
    await p.evaluate(() => {
      __view.overview = true;
      __view.position = { x: -6, z: 9 };
      __view.span = 30;
      __view.angle = 0.5;
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: "/tmp/garden-village-wave1.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Canvas desktop: all four wave-1 artisans (mira/basile/anouk/ines) reached, selected, open their door and dispatch through the generic vendor role — zero id-specific code.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
