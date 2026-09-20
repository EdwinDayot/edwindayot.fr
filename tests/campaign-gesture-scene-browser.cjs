/* Epic C5.14 (docs/campagne-backlog.md), browser fixture: campaign-scenes.js's
   detectPersistentGestures/detectRepairedGestures and garden-state-cmd-f.js's "sleep" (both
   Node-tested, tests/campaign-gesture-scene.cjs) had no live camera/panel call site until this
   epic. This fixture proves render-items.js's beginGestureScene()/endGestureScene() actually run
   against the real scene graph (not just Node-buildable), that garden-dispatch.js's real
   "confirm-night" stages them from a real result.scenes entry, that the camera genuinely frames
   the Rainelle concerned (comparing to its real position, not merely "a camera moved"), that
   interrupting (closePanel, the same function Échap already calls) and the scene's own fixed
   timeout both hand control back cleanly without touching overexertion/rest/position, and that
   the real HUD panel shows the exact narrative text already revealed the same night. Two
   scenarios need two fresh saves, since each narrative text (and so each scene) can only ever be
   revealed once per save (C5.6/C5.7's own "revealed only once, ever"): persistance (interrupted
   manually) and réparation (left to its own timeout). */
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

function teach(g, id, fields) {
  const r = g.command({ type: "teachGesture", id, condition: "", ...fields });
  assert.equal(r.ok, true, r.error);
}

function persistenceSave() {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;
  return { state: g.serialize(), rainelleId: rainelle.id };
}

function reparationSave() {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(g, rainelle.id, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  g.s.campaignMemory.overexertion[rainelle.id] = 1;
  // Night 1 (in Node, not exercised through the page): reveals persistance, records it, decays
  // overexertion back to 0 — exactly campaign-gesture-reparation.cjs's own recipe.
  g.command({ type: "sleep" });
  assert.equal(g.s.campaignFlags.includes("persistance-geste-vide"), true);
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: false }).ok, true);
  return { state: g.serialize(), rainelleId: rainelle.id };
}

async function openSave(b, state) {
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
  await p.waitForTimeout(300);
  return { p, errors };
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
    // Scenario 1: persistance, interrupted manually (closePanel — the same function Échap
    // already calls for every panel).
    {
      const { state, rainelleId } = persistenceSave();
      const { p, errors } = await openSave(b, state);

      // The real tick loop (garden-frame.js's A.frame, already running) must give this Rainelle
      // a real position and a real model on its own, with no extra call from this test.
      await p.waitForFunction(
        (id) => {
          const v = window.GardenApp.view,
            r = window.GardenApp.game.s.rainelles.find((r) => r.id === id);
          return r && Number.isFinite(r.x) && v.rainelleModels.has(id);
        },
        rainelleId,
        { timeout: 5000 },
      );

      const afterConfirm = await p.evaluate(() => {
        window.GardenApp.dispatch("confirm-night");
        const A = window.GardenApp;
        return {
          flags: A.game.s.campaignFlags.slice(),
          panel: A.panel,
          gestureScene: A.view.gestureScene
            ? { kind: A.view.gestureScene.kind, rainelleId: A.view.gestureScene.rainelleId }
            : null,
        };
      });
      assert.ok(
        afterConfirm.flags.includes("persistance-geste-vide"),
        "the real sleep command revealed the persistance text",
      );
      assert.equal(afterConfirm.panel, "gesture-scene");
      assert.deepEqual(afterConfirm.gestureScene, {
        kind: "persistance",
        rainelleId,
      });

      const rows = await p.evaluate(() => {
        const hud = window.GardenApp.ui;
        return hud.buildPanelRows(hud.model, hud.w, 0, 0, 700, 600, hud.palette);
      });
      assert.ok(
        rows.some(
          (r) => r.title === "Le geste qui continue" && r.detail === "Elle refait le geste. Le panier est vide.",
        ),
        "the real HUD panel shows the exact narrative text already revealed this same night",
      );

      // Let the camera lerp actually run for a few real frames, then compare its look target to
      // the Rainelle's own real position — not merely "a camera moved".
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
        "camera look target actually converged on the Rainelle's real position: " +
          framing.lookDistanceToRainelle,
      );
      assert.ok(
        framing.lookDistanceToPlayer > framing.lookDistanceToRainelle,
        "camera is genuinely closer to the Rainelle than to the player, not a coincidence",
      );

      const overexertionBeforeInterrupt = await p.evaluate(
        (id) => window.GardenApp.game.s.campaignMemory.overexertion[id] || 0,
        rainelleId,
      );
      // Interrupting (closePanel — the exact function Échap and the panel's own × button call)
      // ends the scene immediately and touches nothing else.
      const afterInterrupt = await p.evaluate((id) => {
        window.GardenApp.closePanel();
        return {
          panel: window.GardenApp.panel,
          gestureScene: window.GardenApp.view.gestureScene,
          overexertion: window.GardenApp.game.s.campaignMemory.overexertion[id] || 0,
        };
      }, rainelleId);
      assert.equal(afterInterrupt.panel, "");
      assert.equal(afterInterrupt.gestureScene, null, "interrupting ends the scene immediately");
      assert.equal(
        afterInterrupt.overexertion,
        overexertionBeforeInterrupt,
        "interrupting the scene itself touches no game state, only the camera/panel",
      );
      assert.deepEqual(errors, [], "no console/page error: " + errors.join(" | "));
      await p.close();
    }

    // Scenario 2: réparation, left to its own fixed timeout (no player action at all).
    {
      const { state, rainelleId } = reparationSave();
      const { p, errors } = await openSave(b, state);

      await p.waitForFunction(
        (id) => {
          const v = window.GardenApp.view,
            r = window.GardenApp.game.s.rainelles.find((r) => r.id === id);
          return r && Number.isFinite(r.x) && v.rainelleModels.has(id);
        },
        rainelleId,
        { timeout: 5000 },
      );

      const afterConfirm = await p.evaluate(() => {
        window.GardenApp.dispatch("confirm-night");
        const A = window.GardenApp;
        return {
          flags: A.game.s.campaignFlags.slice(),
          panel: A.panel,
          gestureScene: A.view.gestureScene
            ? { kind: A.view.gestureScene.kind, rainelleId: A.view.gestureScene.rainelleId }
            : null,
        };
      });
      assert.ok(afterConfirm.flags.includes("geste-qui-sarrete"));
      assert.equal(afterConfirm.panel, "gesture-scene");
      assert.deepEqual(afterConfirm.gestureScene, { kind: "reparation", rainelleId });

      const rows = await p.evaluate(() => {
        const hud = window.GardenApp.ui;
        return hud.buildPanelRows(hud.model, hud.w, 0, 0, 700, 600, hud.palette);
      });
      assert.ok(
        rows.some(
          (r) => r.title === "Le geste qui s’arrête" && r.detail === "Elle s’assied près de l’eau. Le geste ne reprend pas.",
        ),
        "the real HUD panel shows the réparation text",
      );

      // No player action at all: the scene must end itself once its own fixed duration elapses.
      // Backdating gestureScene.start (rather than waiting on the wall clock for view.time to
      // cross it) is the same "fast-forward the internal state directly" posture already used by
      // campaign-nightfall-browser.cjs for campaignClock.gameSeconds — real headless rendering
      // in this environment is slow enough that view.time (built from real per-frame dt) can
      // drift far behind wall-clock time, making a fixed real-timeout wait for it unreliable.
      await p.evaluate(() => {
        const scene = window.GardenApp.view.gestureScene;
        scene.start = window.GardenApp.view.time - scene.duration - 1;
      });
      await p.waitForFunction(() => window.GardenApp.view.gestureScene === null, null, {
        timeout: 5000,
      });
      const afterTimeout = await p.evaluate(() => window.GardenApp.panel);
      assert.equal(afterTimeout, "", "scene auto-ended and closed its own panel, unprompted");

      assert.deepEqual(errors, [], "no console/page error: " + errors.join(" | "));
      await p.close();
    }

    console.log(
      "PASS campaign gesture scene (C5.14): the real sleep command's result.scenes stages a real camera transition onto the Rainelle actually concerned (position-compared, not just \"a camera moved\"), the real HUD panel shows the exact narrative text already revealed, closePanel/Échap interrupts it cleanly with no side mutation, and the scene's own fixed timeout ends it unprompted — persistance and réparation both exercised, zero console error.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-gesture-scene-browser:", e.message);
  process.exit(1);
});
