/* Epic C4.1 (design §10, chapitre 1), browser fixture: confirms the generic narrative mechanism
   (data-narrative.js/s.campaignFlags) actually works once loaded in the real page — same
   "wire it into the live page, don't just prove it in Node" posture as
   campaign-notebook-browser.cjs. Loads a fresh save, calls the real chooseFurnitureTreatment
   command through GardenState.command() (no dedicated UI button/armoire object exists yet — see
   campagne.md for this epic's honestly-documented limit), opens the notebook (key "J") and
   checks the revealed letter appears as a read-only row built by the real hud-panel.js. */
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

    // A fresh page-loaded save already carries the makeshift tool from C4.1's fresh().
    assert.deepEqual(
      await p.evaluate(() => __view.game.s.campaignTools),
      ["outil-de-fortune"],
    );

    // The notebook shows no narrative row before any choice is made.
    await p.keyboard.press("j");
    await p.waitForFunction(() => __hud.model.panel === "notebook");
    const beforeRows = await p.evaluate(() =>
      __hud.buildPanelRows(__hud.model, __hud.w, 0, 0, __hud.w, __hud.h, __hud.palette),
    );
    assert.ok(
      !beforeRows.some((r) => r.title === "Lettre d’Alma"),
      "no narrative row before the furniture choice is made",
    );

    // The real command, through GardenState.command() (no dedicated UI button exists yet for
    // this interaction — see this epic's own documented limit).
    const r = await p.evaluate(() =>
      __view.game.command({ type: "chooseFurnitureTreatment", choice: "conserve" }),
    );
    assert.equal(r.ok, true);
    assert.equal(
      await p.evaluate(() => __view.game.s.campaignHouse.furnitureMarks),
      "conserve",
    );

    const afterRows = await p.evaluate(() =>
      __hud.buildPanelRows(__hud.model, __hud.w, 0, 0, __hud.w, __hud.h, __hud.palette),
    );
    const letter = afterRows.find((row) => row.title === "Lettre d’Alma");
    assert.ok(letter, "the revealed letter shows up as a real notebook row");
    assert.match(letter.detail, /Tu peux déplacer les meubles/);
    assert.equal(letter.action, null, "a narrative row is read-only, no button");

    // A second attempt is refused explicitly through the real command, and the notebook still
    // lists the letter exactly once.
    const refused = await p.evaluate(() =>
      __view.game.command({ type: "chooseFurnitureTreatment", choice: "encadre" }),
    );
    assert.equal(refused.ok, false);
    const afterSecond = await p.evaluate(() =>
      __hud.buildPanelRows(__hud.model, __hud.w, 0, 0, __hud.w, __hud.h, __hud.palette),
    );
    assert.equal(
      afterSecond.filter((row) => row.title === "Lettre d’Alma").length,
      1,
      "the letter is never listed twice",
    );

    assert.deepEqual(errors, []);
    console.log(
      "PASS Narrative mechanism (C4.1): chooseFurnitureTreatment round-trips through the real command, reveals Alma's letter exactly once, listed read-only in the real notebook panel, no console error.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
