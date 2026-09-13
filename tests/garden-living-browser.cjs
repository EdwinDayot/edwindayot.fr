const { chromium } = require("playwright");
const { GardenState } = require("../public/garden-state.js");
const runA = require("./garden-living-scenario-a.cjs");
const runB = require("./garden-living-scenario-b.cjs");
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
    for (const mobile of [false, true]) {
      const r = await runA(browser, url, mobile);
      await runB(r.p, r.old, mobile, r.errors);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
