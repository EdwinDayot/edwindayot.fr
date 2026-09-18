/* Epic C1.5, browser fixture: confirms pinTrait/sowPot actually work once loaded in the real
   page, same "wire it into the live page, don't just prove it in Node" posture as
   campaign-narrative-browser.cjs — worth doing here specifically because this epic also moved
   botany-genetics.js's <script> tag earlier in index.html (garden-state-validate.js now reads
   root.GardenGenetics at its own script-execution time), exactly the class of ordering bug
   documented repeatedly across this campaign (campaign-clock.js/rainelles.js/cultivars.js). */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { GardenState } = require("../public/garden-state.js");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: require("node:fs").existsSync("/opt/pw-browsers/chromium")
      ? "/opt/pw-browsers/chromium"
      : undefined,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const g = new GardenState(null, 1000);
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.addInitScript((state) => {
      localStorage.setItem("edwin-garden-v3", JSON.stringify(state));
      let W, H;
      Object.defineProperty(window, "GardenView", {
        get: () => W,
        set: (B) =>
          (W = class extends B {
            constructor(...a) {
              super(...a);
              window.__view = this;
            }
          }),
      });
      Object.defineProperty(window, "GardenHUD", {
        get: () => H,
        set: (B) =>
          (H = class extends B {
            constructor(...a) {
              super(...a);
              window.__hud = this;
            }
          }),
      });
    }, g.serialize());
    await p.goto(url);
    await p.waitForFunction(() => window.__hud?.model);
    assert.deepEqual(errors, []);

    // Refused before meetIris, through the real command.
    const early = await p.evaluate(() =>
      __view.game.command({ type: "pinTrait", axis: "port", speciesId: "fraise-timide" }),
    );
    assert.equal(early.ok, false);

    const met = await p.evaluate(() => __view.game.command({ type: "meetIris" }));
    assert.equal(met.ok, true);

    const pinned = await p.evaluate(() =>
      __view.game.command({ type: "pinTrait", axis: "port", speciesId: "fraise-timide" }),
    );
    assert.equal(pinned.ok, true);
    assert.deepEqual(await p.evaluate(() => __view.game.s.campaignPin), {
      axis: "port",
      speciesId: "fraise-timide",
    });

    const sown = await p.evaluate(() =>
      __view.game.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }),
    );
    assert.equal(sown.ok, true);
    assert.equal(await p.evaluate(() => __view.game.s.campaignPin), null);

    const slept = await p.evaluate(() => __view.game.command({ type: "sleep" }));
    assert.equal(slept.ok, true);
    const port = await p.evaluate(() => __view.game.s.cultivars[0].traits.port);
    const fraisePort = await p.evaluate(
      () => window.GardenGenetics.founders.find((f) => f.id === "fraise-timide").traits.port,
    );
    assert.equal(port, fraisePort, "the pinned axis is honoured end to end in the live page");

    assert.deepEqual(errors, []);
    console.log(
      "PASS Trait pinning (C1.5): pinTrait/sowPot/sleep round-trip through the real command in the live page, guaranteed axis honoured, no console error.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
