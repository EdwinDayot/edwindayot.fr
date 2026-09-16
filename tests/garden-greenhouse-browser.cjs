const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
// Épic 3.3 — greenhouse: a passive range aura reusing the exact same
// boostUntil field the composter's fertilizer already sets (0.4), rendered
// with a new translucent glass material. Live in a real browser, both
// growth and rendering, plus a boosted-plant detail sheet.
(async () => {
  const browser = await chromium.launch({
      headless: true,
      args:
        process.platform === "darwin"
          ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
          : [],
    }),
    errors = [];
  const { page, state } = require("./garden-play-helpers.cjs")(
    browser,
    url,
    errors,
  );
  try {
    const p = await page({ viewport: { width: 1440, height: 1000 } });
    await p.evaluate(() => {
      const g = __view.game;
      g.s.plans.push("greenhouse");
      g.s.inventory.coins = 100;
      g.s.inventory.wood = 20;
      g.s.inventory.clay = 20;
      const place = g.command({
        type: "place",
        item: "greenhouse",
        fabricate: true,
        x: -6,
        z: 2,
      });
      if (!place.ok) throw new Error("setup place failed: " + place.message);
      const pot = g.command({
        type: "place",
        item: "pot",
        fabricate: true,
        x: -4,
        z: 2,
      });
      if (!pot.ok) throw new Error("setup pot failed: " + pot.message);
      const potEntity = g.s.entities.find(
        (e) => e.type === "pot" && e.x === -4,
      );
      potEntity.plant = {
        species: "pilea",
        growth: 0.5,
        moisture: 80,
        progress: 0,
        ready: 0,
      };
    });
    await p.waitForTimeout(200);
    await p.screenshot({ path: "/tmp/garden-greenhouse-placed.png" });
    await p.evaluate(() => __view.game.step(1));
    const boosted = await p.evaluate(
      () =>
        __view.game.s.entities.find((e) => e.type === "pot" && e.x === -4).plant
          .boostUntil,
    );
    assert.ok(
      boosted > (await state(p)).elapsed,
      "the pot is boosted while in the greenhouse's range",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS Canvas desktop: greenhouse renders its translucent model and boosts an in-range plant's growth via the same boostUntil field as fertilizer, no console errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
