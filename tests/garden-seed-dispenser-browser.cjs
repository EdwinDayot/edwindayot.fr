const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
// Épic 3.4 (optional) — seed dispenser: a self-refilling buffer that feeds
// nearby auto-planters. Live in a real browser: placement, the real tick
// loop manufacturing and handing off a seed, no console errors.
(async () => {
  const browser = await chromium.launch({
      headless: true,
      args:
        process.platform === "darwin"
          ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
          : [],
    }),
    errors = [];
  const { page } = require("./garden-play-helpers.cjs")(browser, url, errors);
  try {
    const p = await page({ viewport: { width: 1440, height: 1000 } });
    await p.evaluate(() => {
      const g = __view.game;
      g.s.plans.push("seedDispenser", "autoPlanter");
      g.s.inventory.coins = 100;
      g.s.inventory.wood = 20;
      g.s.inventory.clay = 20;
      const dispenser = g.command({
        type: "place",
        item: "seedDispenser",
        fabricate: true,
        x: -6,
        z: 2,
      });
      if (!dispenser.ok)
        throw new Error("setup dispenser failed: " + dispenser.message);
      const planter = g.command({
        type: "place",
        item: "autoPlanter",
        fabricate: true,
        x: -3.5,
        z: 2,
      });
      if (!planter.ok)
        throw new Error("setup planter failed: " + planter.message);
    });
    await p.waitForTimeout(200);
    await p.screenshot({ path: "/tmp/garden-seed-dispenser-placed.png" });
    const every = await p.evaluate(
      () => GardenData.recipes.seedDispenser.dispense.every,
    );
    await p.evaluate((n) => {
      for (let i = 0; i < n + 1; i++) __view.game.step(1);
    }, every);
    const planterBuffer = await p.evaluate(
      () => __view.game.s.entities.find((e) => e.type === "autoPlanter").buffer,
    );
    const total = Object.values(planterBuffer).reduce((a, b) => a + b, 0);
    assert.ok(total > 0, "the dispenser manufactured and handed off a seed");
    await p.screenshot({ path: "/tmp/garden-seed-dispenser-fed.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Canvas desktop: seed dispenser renders and feeds a nearby auto-planter through the real tick loop, no console errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
