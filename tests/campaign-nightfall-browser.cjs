/* Epic C2.2v (docs/campagne-backlog.md), browser fixture: campaign-clock.js was pure Node-tested
   data since C2.1 and never wired to the live page; render-campaign-house.js's refuge house had
   geometry and a Node test but no world position and no live call site since C3.2. This fixture
   proves both are now actually live: the house is really in the real scene graph (not just
   Node-buildable), the real requestAnimationFrame loop (garden-frame.js's A.frame, already
   running since garden-boot.js) notices nightfall on its own once the clock reaches the day's
   cap, cancels an in-progress build at no cost, starts the camera transition and opens the real
   "nightfall" HUD panel, and confirming it calls the real "sleep" command and unwinds everything.
   Fast-forwarding is done by writing s.campaignClock.gameSeconds directly (a real day is ~24
   real minutes; this only ever advances state a test could reach by playing that long) rather
   than waiting on the wall clock or calling internal frame-loop functions directly — the same
   "drive it through what the page already runs" posture as campaign-narrative-browser.cjs. */
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
    }, g.serialize());
    await p.goto(url, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      () => window.GardenApp && window.GardenApp.view,
      null,
      {
        timeout: 30000,
      },
    );
    await p.waitForTimeout(300);
    assert.deepEqual(
      errors,
      [],
      "no console/page error on load: " + errors.join(" | "),
    );

    // The refuge house is actually in the live scene (not just Node-buildable), at the world
    // position render-campaign-house.js's own CAMPAIGN_HOUSE_X/Z export, built once at
    // world-build time.
    const house = await p.evaluate(() => {
      const v = window.GardenApp.view,
        CH = window.GardenRenderCampaignHouse;
      return {
        hasGroup: !!v.campaignHouseGroup,
        inScene: v.scene.children.includes(v.campaignHouseGroup),
        x: v.campaignHouseGroup.position.x,
        z: v.campaignHouseGroup.position.z,
        expectedX: CH.CAMPAIGN_HOUSE_X,
        expectedZ: CH.CAMPAIGN_HOUSE_Z,
        repaired: v.campaignHouseGroup.userData.repaired,
      };
    });
    assert.equal(
      house.hasGroup,
      true,
      "refuge house group built at world-build time",
    );
    assert.equal(
      house.inScene,
      true,
      "refuge house group actually added to the scene",
    );
    assert.equal(house.x, house.expectedX);
    assert.equal(house.z, house.expectedZ);
    assert.equal(
      house.repaired,
      false,
      "fresh save: pièce d'accueil still delabre",
    );

    // Appearance refreshes when (and only when) accueil's status actually changes, via the real
    // repairHouseSpace command — not rebuilt every frame.
    await p.evaluate(() => {
      window.GardenApp.game.s.inventory.wood = 99;
      window.GardenApp.game.s.inventory.clay = 99;
    });
    const repairResult = await p.evaluate(() =>
      window.GardenApp.game.command({
        type: "repairHouseSpace",
        space: "accueil",
      }),
    );
    assert.equal(repairResult.ok, true, repairResult.message);
    await p.waitForFunction(
      () => window.GardenApp.view.campaignHouseGroup.userData.repaired === true,
    );
    const afterRepair = await p.evaluate(() => ({
      inScene: window.GardenApp.view.scene.children.includes(
        window.GardenApp.view.campaignHouseGroup,
      ),
    }));
    assert.equal(
      afterRepair.inScene,
      true,
      "rebuilt group is the one actually in the scene",
    );

    // Simulate a construction placement in progress, then fast-forward the campaign clock to
    // the day's cap (23h) by writing s.campaignClock.gameSeconds directly — the already-running
    // requestAnimationFrame loop (garden-frame.js, started by garden-boot.js at page load) must
    // notice this on its own, with no extra call from this test.
    await p.evaluate(() => {
      window.GardenApp.build = {
        item: "pot",
        id: null,
        x: 0,
        z: 0,
        rotation: 0,
      };
      window.GardenApp.game.s.campaignClock.gameSeconds =
        window.GardenCampaignClock.DAY_SECONDS;
    });
    await p.waitForFunction(
      () => window.GardenApp.panel === "nightfall",
      null,
      {
        timeout: 5000,
      },
    );
    const atNightfall = await p.evaluate(() => ({
      build: window.GardenApp.build,
      nightSequence: window.GardenApp.nightSequence,
      cameraNightfall: !!window.GardenApp.view.nightfall,
      panel: window.GardenApp.panel,
    }));
    assert.equal(
      atNightfall.build,
      null,
      "in-progress build cancelled at no cost",
    );
    assert.equal(atNightfall.nightSequence, true);
    assert.equal(
      atNightfall.cameraNightfall,
      true,
      "scripted camera transition started",
    );
    assert.equal(atNightfall.panel, "nightfall");
    // No resources were spent cancelling the build (only the accueil repair above touched wood).
    const inventoryAfterCancel = await p.evaluate(
      () => window.GardenApp.game.s.inventory.wood,
    );
    assert.equal(
      inventoryAfterCancel,
      99 - 4,
      "cancelling the pending build cost nothing",
    );

    // The real hud-panel.js branch, showing the pot's actual (empty, on a fresh save — sowPot
    // has no UI call site anywhere yet) state and one real action — read straight off the
    // actual running A.ui instance (already fed the "nightfall" model by the same
    // requestAnimationFrame loop just exercised above), not a freshly constructed duplicate.
    const rows = await p.evaluate(() => {
      const hud = window.GardenApp.ui;
      return hud.buildPanelRows(hud.model, hud.w, 0, 0, 700, 600, hud.palette);
    });
    assert.ok(rows.some((r) => r.title === "Le pot est vide"));
    const confirmRow = rows.find((r) => r.action === "confirm-night");
    assert.ok(confirmRow, "a real confirm-and-sleep action row exists");

    // Confirming, through the real dispatch(), calls the already-tested "sleep" command and
    // unwinds the whole sequence. Read state back in the very same evaluate() call as the
    // dispatch itself (both synchronous, no await in between) — the page's own
    // requestAnimationFrame loop keeps running in real time around this test, so gameSeconds
    // legitimately drifts up from sleep's exact 0 reset within a couple of real seconds once
    // the clock is unpaused again (panel closed, no longer paused-by-panel) — asserting on the
    // very same tick sleep itself ran in is what actually pins down sleep's own behaviour.
    const beforeDay = await p.evaluate(
      () => window.GardenApp.game.s.campaignDay,
    );
    const immediatelyAfterConfirm = await p.evaluate(() => {
      window.GardenApp.dispatch("confirm-night");
      return {
        day: window.GardenApp.game.s.campaignDay,
        gameSeconds: window.GardenApp.game.s.campaignClock.gameSeconds,
        panel: window.GardenApp.panel,
      };
    });
    assert.equal(
      immediatelyAfterConfirm.day,
      beforeDay + 1,
      "sleep actually resolved the night",
    );
    assert.equal(
      immediatelyAfterConfirm.gameSeconds,
      0,
      "a new day starts at 7h",
    );
    assert.equal(
      immediatelyAfterConfirm.panel,
      "",
      "panel closed by confirm-night's own dispatch",
    );
    await p.waitForFunction(
      () => window.GardenApp.nightSequence === false,
      null,
      {
        timeout: 5000,
      },
    );
    await p.waitForFunction(() => !window.GardenApp.view.nightfall, null, {
      timeout: 5000,
    });
    // And the clock is genuinely ticking again afterwards (unpaused, no longer capped at 23h) —
    // the actual point of resetting it, not just the instant-after snapshot above.
    await p.waitForFunction(
      () => window.GardenApp.game.s.campaignClock.gameSeconds > 0,
      null,
      { timeout: 5000 },
    );
    const stillBelowCap = await p.evaluate(
      () =>
        window.GardenApp.game.s.campaignClock.gameSeconds <
        window.GardenCampaignClock.DAY_SECONDS,
    );
    assert.equal(
      stillBelowCap,
      true,
      "new day genuinely under way, not re-capped at nightfall",
    );

    assert.deepEqual(
      errors,
      [],
      "no console/page error after the whole sequence",
    );
    console.log(
      "PASS campaign nightfall (C2.2v): refuge house live in the real scene at its documented position, appearance refresh on repair, requestAnimationFrame loop notices nightfall on its own, build cancelled at no cost, real nightfall panel shows the real pot state, confirm-night calls the real sleep command and unwinds camera/panel/nightSequence, no console error.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-nightfall-browser:", e.message);
  process.exit(1);
});
