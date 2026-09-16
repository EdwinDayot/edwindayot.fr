const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
// Épic 3.1 — auto-planter: places, loads a seed by walking up with it held
// (same "held tool + E" interaction as watering/mining, no new UI), then
// ticks it into an empty pot in range, all live in a real browser.
(async () => {
  const browser = await chromium.launch({
      headless: true,
      args:
        process.platform === "darwin"
          ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
          : [],
    }),
    errors = [];
  const { page, use, equip, state } = require("./garden-play-helpers.cjs")(
    browser,
    url,
    errors,
  );
  try {
    const p = await page({ viewport: { width: 1440, height: 1000 } });
    // No pot placed yet: the live per-frame loop keeps stepping the
    // simulation for real, so with an eligible pot already in range the
    // planter could drain the seed before this script gets to inspect the
    // intermediate "loaded but not yet sown" state.
    await p.evaluate(() => {
      const g = __view.game;
      g.s.plans.push("autoPlanter");
      g.s.inventory.coins = 100;
      g.s.inventory.wood = 20;
      g.s.inventory.clay = 20;
      const place = g.command({
        type: "place",
        item: "autoPlanter",
        fabricate: true,
        x: -6,
        z: 2,
      });
      if (!place.ok) throw new Error("setup place failed: " + place.message);
    });
    await p.waitForTimeout(200);
    await p.screenshot({ path: "/tmp/garden-autoplanter-placed.png" });
    await equip(p, "seed:pilea", 2);
    const planterId = await p.evaluate(
      () => __view.game.s.entities.find((e) => e.type === "autoPlanter").id,
    );
    await use(p, planterId);
    assert.equal(
      (await state(p)).inventory["seed:pilea"],
      1,
      "one seed spent loading",
    );
    const buffer = await p.evaluate(
      () => __view.game.s.entities.find((e) => e.type === "autoPlanter").buffer,
    );
    assert.equal(
      buffer["seed:pilea"],
      1,
      "the seed landed in the planter's buffer",
    );
    await p.evaluate(() => {
      const g = __view.game,
        pot = g.command({
          type: "place",
          item: "pot",
          fabricate: true,
          x: -4.5,
          z: 2,
        });
      if (!pot.ok) throw new Error("setup pot failed: " + pot.message);
    });
    await p.waitForFunction(
      () =>
        !!__view.game.s.entities.find((e) => e.type === "pot" && e.x === -4.5)
          ?.plant,
      null,
      { timeout: 10000 },
    );
    const potPlanted = await p.evaluate(
      () =>
        __view.game.s.entities.find((e) => e.type === "pot" && e.x === -4.5)
          .plant,
    );
    assert.equal(potPlanted.species, "pilea");
    await p.waitForTimeout(200);
    await p.screenshot({ path: "/tmp/garden-autoplanter-planted.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Canvas desktop: auto-planter loaded by walking up with a held seed, then plants it into an empty pot on tick, no console errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
