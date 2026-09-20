/* Epic C6.2: the observation panel (C2.9) has displayed veilleuse/priseFortDebit in read-only
   detail text since its own introduction, but setVeilleuse/setPriseFortDebit (C5.2/C5.4) had no
   dispatch case reaching them (verified before writing this file: no "toggle-veilleuse"/
   "toggle-prise-fort-debit" case existed anywhere in garden-dispatch.js) — exactly the same
   "moteur posé avant l'écran qui l'atteint" gap C2.5v-b already closed for teaching. This file
   drives the real page end to end: it reads the real button objects the real draw loop produces
   (window.GardenApp.ui.buttons, populated by hud-panel.js's buildPanelRows/hud-panel-rows.js's
   drawPanelRows every animation frame while the panel is open) and calls the real click handler
   (window.GardenApp.ui.activate(btn), the exact function hud.js's own pointer handler calls on a
   real click) rather than hand-crafting a dispatch payload — so a bug in how the row computes its
   own `data.active`/label would be caught here, not just a bug in the command itself (already
   covered by tests/campaign-veilleuses.cjs and tests/campaign-fort-debit.cjs at the Node level). */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
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
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(url);
    await p.waitForFunction(() => window.GardenApp?.ui?.model);
    assert.deepEqual(errors, []);

    // Real stations, posed directly (registerStation has no command wrapper yet, same precedent
    // already used by campaign-observation-browser.cjs/campaign-station-render.cjs).
    const { zoneId, borneId } = await p.evaluate(() => {
      const A = window.GardenApp,
        s = A.game.s;
      const Stations = window.GardenCampaignStations;
      const zone = Stations.registerStation(s.campaignStations, "zone", {
        x: 4,
        z: 4,
      });
      const borne = Stations.registerStation(s.campaignStations, "borne", {
        x: 1,
        z: 1,
      });
      A.paused = true;
      A.panel = "observation";
      return { zoneId: zone.id, borneId: borne.id };
    });
    await p.waitForFunction(() => window.GardenApp.ui.model?.panel === "observation");
    // A real animation frame has to elapse for buildPanelRows/drawPanelRows to actually run and
    // populate window.GardenApp.ui.buttons — the panel just switched, no frame has drawn it yet.
    await p.waitForFunction(
      (ids) =>
        window.GardenApp.ui.buttons.some((btn) => btn.action === "toggle-veilleuse") &&
        window.GardenApp.ui.buttons.some(
          (btn) => btn.action === "toggle-prise-fort-debit",
        ),
      null,
    );

    // Opening/redrawing the panel by itself, before any click, must never mutate s — the same
    // guarantee tests/campaign-observation-browser.cjs already proved for the rest of this panel,
    // now re-checked for these two new rows specifically.
    const before = await p.evaluate(() => JSON.stringify(window.GardenApp.game.s));
    await p.waitForTimeout(300);
    const afterIdle = await p.evaluate(() => JSON.stringify(window.GardenApp.game.s));
    assert.equal(
      afterIdle,
      before,
      "opening/redrawing the observation panel never mutates s on its own",
    );

    async function readToggleButton(action) {
      return p.evaluate(
        (action) => window.GardenApp.ui.buttons.find((btn) => btn.action === action),
        action,
      );
    }

    // --- Zone veilleuse ---
    let zoneBtn = await readToggleButton("toggle-veilleuse");
    assert.equal(zoneBtn.data.zoneId, zoneId);
    assert.equal(zoneBtn.data.active, true, "off by default, so the button proposes turning it on");
    assert.equal(zoneBtn.buttonText, "Allumer", "button label reflects the current (off) state");
    let zoneState = await p.evaluate(
      (id) => window.GardenApp.game.s.campaignStations.zones.find((z) => z.id === id).veilleuse,
      zoneId,
    );
    assert.equal(zoneState, false);

    // Real click: read the real button object, call the real click handler on it (the exact
    // function hud.js's own pointer-up path calls), never a hand-built dispatch payload.
    await p.evaluate((btn) => window.GardenApp.ui.activate(btn), zoneBtn);
    await p.waitForTimeout(80);
    zoneState = await p.evaluate(
      (id) => window.GardenApp.game.s.campaignStations.zones.find((z) => z.id === id).veilleuse,
      zoneId,
    );
    assert.equal(zoneState, true, "a real click flips the real state in s.campaignStations");
    zoneBtn = await readToggleButton("toggle-veilleuse");
    assert.equal(zoneBtn.data.active, false, "next click now proposes turning it back off");
    assert.equal(zoneBtn.buttonText, "Éteindre", "button label flips with the new state");

    // Click again: state and label must return exactly to where they started.
    await p.evaluate((btn) => window.GardenApp.ui.activate(btn), zoneBtn);
    await p.waitForTimeout(80);
    zoneState = await p.evaluate(
      (id) => window.GardenApp.game.s.campaignStations.zones.find((z) => z.id === id).veilleuse,
      zoneId,
    );
    assert.equal(zoneState, false, "a second real click flips it back off");
    zoneBtn = await readToggleButton("toggle-veilleuse");
    assert.equal(zoneBtn.buttonText, "Allumer");

    // --- Borne priseFortDebit ---
    let borneBtn = await readToggleButton("toggle-prise-fort-debit");
    assert.equal(borneBtn.data.borneId, borneId);
    assert.equal(borneBtn.buttonText, "Allumer");
    let borneState = await p.evaluate(
      (id) =>
        window.GardenApp.game.s.campaignStations.bornes.find((bo) => bo.id === id)
          .priseFortDebit,
      borneId,
    );
    assert.equal(borneState, false);

    await p.evaluate((btn) => window.GardenApp.ui.activate(btn), borneBtn);
    await p.waitForTimeout(80);
    borneState = await p.evaluate(
      (id) =>
        window.GardenApp.game.s.campaignStations.bornes.find((bo) => bo.id === id)
          .priseFortDebit,
      borneId,
    );
    assert.equal(borneState, true, "a real click flips the real state in s.campaignStations");
    borneBtn = await readToggleButton("toggle-prise-fort-debit");
    assert.equal(borneBtn.buttonText, "Éteindre");

    await p.evaluate((btn) => window.GardenApp.ui.activate(btn), borneBtn);
    await p.waitForTimeout(80);
    borneState = await p.evaluate(
      (id) =>
        window.GardenApp.game.s.campaignStations.bornes.find((bo) => bo.id === id)
          .priseFortDebit,
      borneId,
    );
    assert.equal(borneState, false, "a second real click flips it back off");

    assert.deepEqual(errors, []);
    console.log(
      "PASS Observation panel controls (C6.2): a real click on the zone/borne rows flips veilleuse/priseFortDebit in s.campaignStations and the button label reflects the current state, without the panel mutating anything on its own.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
