/* Epic C2.5v-b (docs/campagne-backlog.md): C2.5's own three deferred rendering clauses (screen,
   real-world trajectory, "Regarde-moi" camera) had no HUD panel, world overlay or real trigger
   until this epic — engine-only since C2.5/C2.5v-a (garden-state-cmd-k.js's
   beginTeaching/demonstrateGesture/reviseGesturePhrase/confirmTeaching/cancelTeaching,
   campaign-teaching-trajectory.js's resolveTrajectory). Same fixture shape as
   campaign-gesture-scene-browser.cjs (a real save with a real, positioned Rainelle, loaded via
   localStorage, driven through the real RAF loop): proves the real trigger (a row on a Rainelle
   in the observation panel, C2.9) opens the real "teaching" screen, the real HUD panel shows and
   lets a player correct the proposed phrase, C2.5v-a's real trajectory becomes a real overlay in
   the scene graph, the camera genuinely frames the Rainelle concerned (position-compared, not
   merely "a camera moved" — C5.14's beginGestureScene/endGestureScene, never a fourth mechanism),
   confirming actually applies the gesture and closes everything, cancelling closes everything
   without applying anything, and closing any other way (Échap/closePanel) never strands the
   lesson mid-review with the campaign clock paused forever. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { GardenState } = require("../public/garden-state.js");
const Stations = require("../public/game/campaign-stations.js");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function buildSave() {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 6, z: 6 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 10, z: 10 });
  return {
    state: g.serialize(),
    rainelleId: rainelle.id,
    stationIds: { borne: borne.id, zone: zone.id, panier: panier.id },
  };
}

(async () => {
  const browser = await chromium.launch({
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
    const { state, rainelleId, stationIds } = buildSave();
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
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
    // exactly the same precondition campaign-gesture-scene-browser.cjs waits on.
    await p.waitForFunction(
      (id) => {
        const v = window.GardenApp.view,
          r = window.GardenApp.game.s.rainelles.find((r) => r.id === id);
        return r && Number.isFinite(r.x) && v.rainelleModels.has(id);
      },
      rainelleId,
      { timeout: 5000 },
    );

    // 1. The real trigger: a row on this Rainelle in the real observation panel.
    await p.evaluate(() => window.GardenApp.dispatch("panel", { panel: "observation" }));
    const obsRow = await p.evaluate((id) => {
      const hud = window.GardenApp.ui;
      const rows = hud.buildPanelRows(hud.model, hud.w, 0, 0, 700, 600, hud.palette);
      const row = rows.find((r) => r.action === "begin-teaching" && r.data?.id === id);
      return row ? { title: row.title, disabled: !!row.disabled } : null;
    }, rainelleId);
    assert.ok(obsRow, "no 'begin-teaching' row for this Rainelle in the real observation panel");
    assert.equal(obsRow.disabled, false);

    // 2. Firing it opens the real screen, pauses the clock, and stages the real camera scene.
    const afterBegin = await p.evaluate((id) => {
      window.GardenApp.dispatch("begin-teaching", { id });
      const A = window.GardenApp;
      return {
        panel: A.panel,
        teaching: A.game.s.campaignTeaching,
        clockPaused: A.game.s.campaignClock.paused,
        gestureScene: A.view.gestureScene
          ? { kind: A.view.gestureScene.kind, rainelleId: A.view.gestureScene.rainelleId }
          : null,
      };
    }, rainelleId);
    assert.equal(afterBegin.panel, "teaching");
    assert.deepEqual(afterBegin.teaching, { rainelleId, step: "watching", draft: null });
    assert.equal(afterBegin.clockPaused, true, "« Regarde-moi » must pause the campaign clock");
    assert.deepEqual(afterBegin.gestureScene, { kind: "teaching", rainelleId });

    // Let the camera lerp actually run for a few real frames, then compare its look target to the
    // Rainelle's own real position — not merely "a camera moved" (same check as C5.14's own
    // browser fixture).
    await p.waitForTimeout(700);
    const framing = await p.evaluate((id) => {
      const v = window.GardenApp.view,
        r = window.GardenApp.game.s.rainelles.find((r) => r.id === id);
      return {
        lookDistanceToRainelle: Math.hypot(v.look.x - r.x, v.look.z - r.z),
        lookDistanceToPlayer: Math.hypot(v.look.x - v.position.x, v.look.z - v.position.z),
      };
    }, rainelleId);
    assert.ok(
      framing.lookDistanceToRainelle < 1.5,
      "camera look target did not converge on the Rainelle's real position: " +
        framing.lookDistanceToRainelle,
    );
    assert.ok(
      framing.lookDistanceToPlayer > framing.lookDistanceToRainelle,
      "camera is not genuinely closer to the Rainelle than to the player",
    );

    // 3. Fill the gesture through the real screen: cycling the verb, editing each field via the
    // real HTML input (index.html's #campaign-text-input, wired in garden-boot.js).
    await p.evaluate(() => window.GardenApp.dispatch("teaching-cycle-verb"));
    const verb = await p.evaluate(() => window.GardenApp.teachingDraft.verbe);
    assert.equal(verb, "arroser", "cycling from empty must land on VERBS[0]");

    async function fillField(field, value) {
      await p.evaluate((f) => window.GardenApp.dispatch("teaching-edit-field", { field: f }), field);
      const input = p.locator("#campaign-text-input");
      await assert.doesNotReject(() => input.waitFor({ state: "visible" }));
      await input.fill(value);
      await input.press("Enter");
      await p.waitForFunction(() => document.getElementById("campaign-text-input").hidden);
    }
    await fillField("poste", stationIds.zone);
    await fillField("source", stationIds.borne);
    await fillField("destination", stationIds.panier);
    const draft = await p.evaluate(() => window.GardenApp.teachingDraft);
    assert.deepEqual(draft, {
      verbe: "arroser",
      poste: stationIds.zone,
      source: stationIds.borne,
      destination: stationIds.panier,
      condition: "",
    });

    // 4. Demonstrating moves the real command state to "reviewing" and produces a real phrase +
    // trajectory — and the real trajectory overlay (render-flow.js's sync(), reusing C2.5v-a's
    // resolveTrajectory) actually enters the scene graph.
    const afterDemonstrate = await p.evaluate(() => {
      window.GardenApp.dispatch("demonstrate-teaching");
      const A = window.GardenApp,
        teaching = A.game.s.campaignTeaching,
        overlay = A.view.teachingTrajectoryModel;
      return {
        step: teaching?.step,
        phrase: teaching?.draft?.phrase,
        trajectory: teaching?.draft?.trajectory,
        overlayInScene: overlay ? overlay.parent === A.view.scene : false,
        tileCount: overlay ? overlay.children.length : 0,
        tileHex: overlay?.children[0]?.material.color.getHexString(),
        tileOpacity: overlay?.children[0]?.material.opacity,
      };
    });
    assert.equal(afterDemonstrate.step, "reviewing");
    assert.equal(
      afterDemonstrate.phrase,
      `Remplir l'arrosoir à ${stationIds.borne} ; humidifier les plantes de ${stationIds.zone}.`,
    );
    assert.deepEqual(afterDemonstrate.trajectory, [
      stationIds.borne,
      stationIds.zone,
      stationIds.panier,
    ]);
    assert.equal(afterDemonstrate.overlayInScene, true, "trajectory overlay never entered the scene");
    // At least one tile per resolved station point (3) — possibly more if the real navigation
    // grid (construction.js's Construction.path, reused verbatim by resolveTrajectory) finds a
    // walkable route between them, in which case every intermediate cell gets its own tile too.
    // Never asserted as an exact count: whether that route exists at all depends on the default
    // map's own unlocked zones/obstacles, not on anything this epic controls.
    assert.ok(
      afterDemonstrate.tileCount >= 3,
      "expected at least one tile per resolved station point, got " + afterDemonstrate.tileCount,
    );
    assert.equal(afterDemonstrate.tileHex, "6d9365", "overlay must reuse the documented hex");
    assert.ok(afterDemonstrate.tileOpacity <= 0.15, "overlay opacity exceeds the audit's ceiling");

    // 5. The real HUD panel shows that exact phrase, and lets it be corrected via
    // reviseGesturePhrase — never a second, independent text.
    const rowsBeforeRevise = await p.evaluate(() => {
      const hud = window.GardenApp.ui;
      return hud.buildPanelRows(hud.model, hud.w, 0, 0, 700, 600, hud.palette);
    });
    assert.ok(
      rowsBeforeRevise.some(
        (r) => r.title === "Phrase proposée" && r.detail === afterDemonstrate.phrase,
      ),
      "the real panel does not show the exact proposed phrase",
    );
    await p.evaluate(() => window.GardenApp.dispatch("revise-phrase-edit"));
    const phraseInput = p.locator("#campaign-text-input");
    await assert.doesNotReject(() => phraseInput.waitFor({ state: "visible" }));
    await phraseInput.fill("Remplir l'arrosoir, puis arroser doucement.");
    await phraseInput.press("Enter");
    await p.waitForFunction(() => document.getElementById("campaign-text-input").hidden);
    const revisedPhrase = await p.evaluate(
      () => window.GardenApp.game.s.campaignTeaching.draft.phrase,
    );
    assert.equal(revisedPhrase, "Remplir l'arrosoir, puis arroser doucement.");

    // 6. Confirming applies the real gesture to the Rainelle and closes everything.
    const afterConfirm = await p.evaluate((id) => {
      window.GardenApp.dispatch("confirm-teaching");
      const A = window.GardenApp,
        rainelle = A.game.s.rainelles.find((r) => r.id === id);
      return {
        panel: A.panel,
        teaching: A.game.s.campaignTeaching,
        clockPaused: A.game.s.campaignClock.paused,
        gestureScene: A.view.gestureScene,
        overlay: A.view.teachingTrajectoryModel,
        geste: rainelle.geste,
      };
    }, rainelleId);
    assert.equal(afterConfirm.panel, "");
    assert.equal(afterConfirm.teaching, null);
    assert.equal(afterConfirm.clockPaused, false, "confirming must resume the campaign clock");
    assert.equal(afterConfirm.gestureScene, null);
    assert.equal(afterConfirm.overlay, null, "trajectory overlay must be removed once confirmed");
    assert.equal(afterConfirm.geste.verbe, "arroser", "confirmTeaching never applied the gesture");
    assert.equal(afterConfirm.geste.poste, stationIds.zone);
    assert.equal(afterConfirm.geste.source, stationIds.borne);
    assert.equal(afterConfirm.geste.destination, stationIds.panier);

    // 7. A second lesson: cancelling closes everything without applying anything.
    const afterCancel = await p.evaluate((id) => {
      const A = window.GardenApp;
      A.dispatch("begin-teaching", { id });
      A.teachingDraft = { verbe: "recolter", poste: "z9", source: "z9", destination: "pn9", condition: "" };
      A.dispatch("demonstrate-teaching");
      const beforeCancelGeste = { ...A.game.s.rainelles.find((r) => r.id === id).geste };
      A.dispatch("cancel-teaching");
      const rainelle = A.game.s.rainelles.find((r) => r.id === id);
      return {
        panel: A.panel,
        teaching: A.game.s.campaignTeaching,
        clockPaused: A.game.s.campaignClock.paused,
        overlay: A.view.teachingTrajectoryModel,
        gesteUnchanged: JSON.stringify(rainelle.geste) === JSON.stringify(beforeCancelGeste),
      };
    }, rainelleId);
    assert.equal(afterCancel.panel, "");
    assert.equal(afterCancel.teaching, null);
    assert.equal(afterCancel.clockPaused, false);
    assert.equal(afterCancel.overlay, null);
    assert.equal(afterCancel.gesteUnchanged, true, "cancelTeaching must never apply the gesture");

    // 8. A third lesson, left mid-review: closing any other way (Échap/closePanel) must not
    // strand the lesson with the campaign clock paused forever (garden-cmd.js's own closePanel
    // guard, added by this epic).
    const afterStrayClose = await p.evaluate((id) => {
      const A = window.GardenApp;
      A.dispatch("begin-teaching", { id });
      A.teachingDraft = { verbe: "trier", poste: "z9", source: "z9", destination: "pn9", condition: "" };
      A.dispatch("demonstrate-teaching");
      A.closePanel(); // the exact function Échap and the panel's own × button call
      return {
        panel: A.panel,
        teaching: A.game.s.campaignTeaching,
        clockPaused: A.game.s.campaignClock.paused,
        overlay: A.view.teachingTrajectoryModel,
      };
    }, rainelleId);
    assert.equal(afterStrayClose.panel, "");
    assert.equal(afterStrayClose.teaching, null, "closePanel must not strand a mid-review lesson");
    assert.equal(afterStrayClose.clockPaused, false);
    assert.equal(afterStrayClose.overlay, null);

    assert.deepEqual(errors, [], "no console/page error: " + errors.join(" | "));
    await p.close();

    console.log(
      "PASS campaign teaching screen (C2.5v-b): the real observation-panel row opens the real " +
        "'teaching' screen and stages the real beginGestureScene camera on the Rainelle actually " +
        "concerned, the real HUD panel shows and lets a player correct the proposed phrase, " +
        "C2.5v-a's real trajectory becomes a real, documented-family overlay in the scene graph, " +
        "confirming applies the gesture and closes everything, cancelling and a stray close both " +
        "close everything without applying anything, zero console error.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-teaching-screen-browser:", e.message);
  process.exit(1);
});
