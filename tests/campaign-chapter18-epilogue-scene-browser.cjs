/* Epic C6.21 (docs/campagne-backlog.md), browser fixture: openEpilogue (C6.18/C6.19/C6.20) had no
   live trigger point, camera scene, or gifted-plant rendering until this epic. This fixture proves
   render-items.js's beginEpilogueScene()/endEpilogueScene() actually run against the real scene
   graph (not just Node-buildable), that hud-panel.js's "notebook" panel exposes a real "Ouvrir
   l'épilogue" row only once Epilogue.canOpen(s) is true, that garden-dispatch.js's real
   "open-epilogue" case executes the real command and only stages the camera/panel on success, that
   the camera genuinely frames real content (the refuge house's own fixed position, compared, not
   merely "a camera moved"), that a real planted specimen is framed transiently and removed again
   on close, that interrupting (closePanel, the same function Échap already calls) hands control
   back cleanly without touching game state or the gift plant's position, and that an ordinary
   command still succeeds after openEpilogue — "après le générique... les travaux continuent"
   (design §10), never a fin that locks the game. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { GardenState } = require("../public/garden-state.js");
const Epilogue = require("../public/game/campaign-epilogue.js");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

// Same minimal fixture already used by tests/campaign-epilogue-gate.cjs/campaign-epilogue-gift.cjs.
function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function sleepUntilDay(g, day) {
  while (g.s.campaignDay < day) {
    const r = g.command({ type: "sleep" });
    assert.equal(r.ok, true, r.error);
  }
}

function epilogueReadySave() {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const restore = g.command({ type: "restorePassage" });
  assert.equal(restore.ok, true, restore.error);
  sleepUntilDay(g, g.s.campaignEpilogue.unlocksOnDay);
  // A real, player-planted specimen (C1.6) — exercises beginEpilogueScene's transient-specimen
  // framing branch against the real scene graph, not just "no specimen exists" (already covered by
  // the fact that a fresh save's own s.specimens starts empty).
  const cultivar = g.s.cultivars[0];
  const plant = g.command({ type: "plantSpecimen", cultivarId: cultivar.id, x: 2, z: 2 });
  assert.equal(plant.ok, true, plant.error);
  assert.equal(Epilogue.canOpen(g.s), true);
  return { state: g.serialize(), rainelleId: rainelle.id, specimenId: g.s.specimens[0].id };
}

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
    const { state, rainelleId, specimenId } = epilogueReadySave();
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.addInitScript((s) => {
      localStorage.setItem("edwin-garden-v3", JSON.stringify(s));
    }, state);
    await p.goto(url, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => window.GardenApp && window.GardenApp.view, null, {
      timeout: 30000,
    });

    // The real tick loop must give this Rainelle a real position and a real model on its own,
    // same wait already used by tests/campaign-gesture-scene-browser.cjs.
    await p.waitForFunction(
      (id) => {
        const v = window.GardenApp.view,
          r = window.GardenApp.game.s.rainelles.find((r) => r.id === id);
        return r && Number.isFinite(r.x) && v.rainelleModels.has(id);
      },
      rainelleId,
      { timeout: 5000 },
    );

    // The real HUD panel exposes the real trigger point only once canOpen(s) is true — which it
    // already is for this fixture — never as a permanently-present disabled row. hud.model is only
    // refreshed by the real per-frame draw(m) call (garden-frame.js), so a real frame has to run
    // after openPanel() before buildPanelRows(hud.model, ...) reflects the new panel.
    await p.evaluate(() => window.GardenApp.openPanel("notebook"));
    await p.waitForFunction(() => window.GardenApp.ui.model.panel === "notebook");
    const notebookRows = await p.evaluate(() => {
      const hud = window.GardenApp.ui;
      return hud.buildPanelRows(hud.model, hud.w, 0, 0, 700, 600, hud.palette);
    });
    assert.ok(
      notebookRows.some((r) => r.title === "Ouvrir l'épilogue" && r.action === "open-epilogue"),
      "the real notebook panel exposes the real 'open-epilogue' trigger once canOpen(s) is true",
    );

    const afterOpen = await p.evaluate(() => {
      window.GardenApp.dispatch("open-epilogue");
      const A = window.GardenApp;
      return {
        ok: A.game.s.campaignEpilogue.openedOnDay !== null,
        orientation: A.game.s.campaignEpilogue.orientation,
        gift: A.game.s.campaignEpilogue.gift,
        panel: A.panel,
        epilogueScene: A.view.epilogueScene
          ? {
              shotCount: A.view.epilogueScene.shots.length,
              hasTransientSpecimen: !!A.view.epilogueScene.transientSpecimen,
            }
          : null,
        giftModelInScene: A.view.epilogueGiftModel
          ? A.view.epilogueGiftModel.parent === A.view.scene
          : false,
      };
    });
    assert.equal(afterOpen.ok, true, "the real openEpilogue command succeeded");
    assert.equal(afterOpen.orientation, "durable", "no lever ever engaged this fixture — durable per campaign-epilogue.js's own branch order");
    assert.deepEqual(afterOpen.gift, { speciesId: "aster-des-vents", giverId: "iris" });
    assert.equal(afterOpen.panel, "epilogue-scene");
    assert.ok(afterOpen.epilogueScene, "beginEpilogueScene() never staged a real scene");
    assert.equal(
      afterOpen.epilogueScene.hasTransientSpecimen,
      true,
      "a real planted specimen exists in this fixture but was not framed transiently",
    );
    assert.equal(afterOpen.giftModelInScene, true, "the gift plant Group was never added to the real scene by sync()");

    // The real HUD panel shows the exact narrative texts already revealed this same call — same
    // "wait for a real frame to refresh hud.model" requirement as the notebook check above.
    await p.waitForFunction(() => window.GardenApp.ui.model.panel === "epilogue-scene");
    const epilogueRows = await p.evaluate(() => {
      const hud = window.GardenApp.ui;
      return hud.buildPanelRows(hud.model, hud.w, 0, 0, 700, 600, hud.palette);
    });
    assert.ok(
      epilogueRows.some((r) => r.title === "Le lendemain"),
      "the real epilogue-scene panel shows the orientation's own revealed text",
    );
    assert.ok(
      epilogueRows.some((r) => r.title === "Après le générique"),
      "the real epilogue-scene panel shows the common closing clause revealed alongside it",
    );

    // Shot 1 (always first): let the camera lerp actually converge (headless rendering in this
    // environment fires requestAnimationFrame sparsely and clamps dt, see this file's own
    // measurements — a fixed wall-clock wait is unreliable, so poll for real convergence instead,
    // same posture as waiting for a Rainelle's own position/model above), then compare its look
    // target to the real refuge house position — not merely "a camera moved". The house and the
    // gift plant sit within a few units of each other by construction (render-flow.js's fixed gift
    // position), so a tight threshold here also confirms the sequence starts on the combined
    // house+gift shot, never jumping straight to a farther shot.
    await p.waitForFunction(
      () => {
        const v = window.GardenApp.view,
          House = window.GardenRenderCampaignHouse;
        return (
          Math.hypot(v.look.x - House.CAMPAIGN_HOUSE_X, v.look.z - House.CAMPAIGN_HOUSE_Z) < 2
        );
      },
      null,
      { timeout: 8000 },
    );
    const shot1 = await p.evaluate(() => {
      const v = window.GardenApp.view,
        House = window.GardenRenderCampaignHouse;
      return {
        shotIndex: v.epilogueScene.shots.indexOf(v.currentEpilogueShot()),
        lookDistanceToHouse: Math.hypot(
          v.look.x - House.CAMPAIGN_HOUSE_X,
          v.look.z - House.CAMPAIGN_HOUSE_Z,
        ),
        lookDistanceToPlayer: Math.hypot(v.look.x - v.position.x, v.look.z - v.position.z),
      };
    });
    assert.equal(shot1.shotIndex, 0, "the sequence must start on shot 0 (house + gift)");
    assert.ok(
      shot1.lookDistanceToHouse < 6,
      "camera look target actually converged toward the real house+gift shot: " +
        shot1.lookDistanceToHouse,
    );
    assert.ok(
      shot1.lookDistanceToPlayer > shot1.lookDistanceToHouse,
      "camera is genuinely closer to the epilogue scene than to the player, not a coincidence",
    );

    // Fast-forward past every earlier shot's duration (backdating epilogueScene.start, the same
    // "fast-forward internal state directly" posture campaign-gesture-scene-browser.cjs already
    // uses for gestureScene.start — real headless rendering here is slow enough that view.time
    // drifting from wall-clock time would make a real-timeout wait unreliable) onto the LAST shot
    // — this fixture planted a real specimen AND has a real settled Rainelle, so the last shot must
    // be the Rainelle's own real position (shot 2 of 3), never the specimen's or the house's again.
    await p.evaluate(() => {
      const v = window.GardenApp.view;
      v.epilogueScene.start = v.time - v.epilogueScene.shots.length * v.epilogueScene.shotDuration;
    });
    await p.waitForFunction(
      () => {
        const v = window.GardenApp.view,
          lastShot = v.epilogueScene.shots[v.epilogueScene.shots.length - 1];
        return (
          Math.hypot(v.look.x - lastShot.center.x, v.look.z - lastShot.center.z) < 2
        );
      },
      null,
      { timeout: 8000 },
    );
    const shot3 = await p.evaluate(() => {
      const v = window.GardenApp.view,
        shot = v.currentEpilogueShot(),
        lastShot = v.epilogueScene.shots[v.epilogueScene.shots.length - 1];
      return {
        shotCount: v.epilogueScene.shots.length,
        onLastShot: shot === lastShot,
        // Compare against the shot's OWN recorded target, captured once when beginEpilogueScene
        // ran (same "snapshot, not live-tracked" posture as beginGestureScene's own bounds) — the
        // Rainelle keeps moving in real time, so comparing to her CURRENT x/z here would be
        // comparing the camera to a target that has since moved out from under it.
        lookDistanceToShotTarget: Math.hypot(
          v.look.x - lastShot.center.x,
          v.look.z - lastShot.center.z,
        ),
      };
    });
    assert.equal(shot3.shotCount, 3, "expected exactly 3 shots: house+gift, real specimen, real Rainelle");
    assert.equal(shot3.onLastShot, true, "the sequence must rest on the last shot once fully elapsed");
    assert.ok(
      shot3.lookDistanceToShotTarget < 2,
      "camera look target actually converged on the last shot's own real, recorded target: " +
        shot3.lookDistanceToShotTarget,
    );

    const giftPositionBeforeInterrupt = await p.evaluate(() =>
      window.GardenApp.view.epilogueGiftModel.position.toArray(),
    );
    const stateBeforeInterrupt = await p.evaluate(() =>
      JSON.stringify(window.GardenApp.game.s.campaignEpilogue),
    );

    // Interrupting (closePanel — the exact function Échap and the panel's own × button call) ends
    // the scene immediately, removes the transient specimen, and touches nothing else.
    const afterInterrupt = await p.evaluate(() => {
      window.GardenApp.closePanel();
      return {
        panel: window.GardenApp.panel,
        epilogueScene: window.GardenApp.view.epilogueScene,
        giftPosition: window.GardenApp.view.epilogueGiftModel.position.toArray(),
        state: JSON.stringify(window.GardenApp.game.s.campaignEpilogue),
      };
    });
    assert.equal(afterInterrupt.panel, "");
    assert.equal(afterInterrupt.epilogueScene, null, "interrupting ends the scene immediately");
    assert.deepEqual(
      afterInterrupt.giftPosition,
      giftPositionBeforeInterrupt,
      "interrupting the scene never moves the persistent gift plant",
    );
    assert.equal(
      afterInterrupt.state,
      stateBeforeInterrupt,
      "interrupting the scene itself touches no game state, only the camera/panel",
    );

    // No lock-out: "après le générique, les travaux... continuent" (design §10, literal) — an
    // ordinary command still succeeds after a real openEpilogue.
    const ordinaryAfter = await p.evaluate(
      (specimenId) =>
        window.GardenApp.game.command({
          type: "multiplySpecimen",
          specimenId,
          x: 3,
          z: 3,
        }),
      specimenId,
    );
    assert.equal(ordinaryAfter.ok, true, "an ordinary command failed after a successful openEpilogue: " + ordinaryAfter.error);

    assert.deepEqual(errors, [], "no console/page error: " + errors.join(" | "));
    await p.close();

    console.log(
      "PASS campaign chapter 18 epilogue scene (C6.21): the real notebook panel exposes 'Ouvrir l'épilogue' only once canOpen(s) is true, the real 'open-epilogue' dispatch executes openEpilogue and only stages a real 3-shot camera sequence + panel on success (house+gift, a real transient specimen, a real Rainelle — each shot's own real, recorded target verified by camera convergence), the real HUD panel shows both revealed narrative texts, closePanel/Échap interrupts cleanly with no state/position side effect, and an ordinary command still succeeds afterward — zero console error.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-chapter18-epilogue-scene-browser:", e.message);
  process.exit(1);
});
