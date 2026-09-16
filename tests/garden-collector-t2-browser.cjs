const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
// Épic 3.2 — collector tier 2: a pure data entry (bigger capacity/range,
// same buffer mechanism). This exercises the UI layer generalized from a
// literal e.type === "collector" check to D.recipes[e.type]?.buffer, which
// only the browser-only context()/hud-inspect code paths can prove.
(async () => {
  const browser = await chromium.launch({
      headless: true,
      args:
        process.platform === "darwin"
          ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
          : [],
    }),
    errors = [];
  const { page, use, state } = require("./garden-play-helpers.cjs")(
    browser,
    url,
    errors,
  );
  try {
    const p = await page({ viewport: { width: 1440, height: 1000 } });
    await p.evaluate(() => {
      const g = __view.game;
      g.s.plans.push("collectorT2");
      g.s.inventory.coins = 100;
      g.s.inventory.wood = 20;
      g.s.inventory.stone = 20;
      const place = g.command({
        type: "place",
        item: "collectorT2",
        fabricate: true,
        x: -6,
        z: 2,
      });
      if (!place.ok) throw new Error("setup place failed: " + place.message);
    });
    await p.waitForTimeout(200);
    await use(
      p,
      (await state(p)).entities.find((e) => e.type === "collectorT2").id,
    );
    const status = await p.evaluate(() => __hud.model.context?.status);
    assert.ok(
      status?.includes("Collecteur amélioré") && status?.includes("/48"),
      `context status should name the tier-2 recipe and its own capacity, got: ${status}`,
    );
    await p.screenshot({ path: "/tmp/garden-collector-t2.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Canvas desktop: collectorT2 renders and its E-context/status line are driven by D.recipes generically, no console errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
