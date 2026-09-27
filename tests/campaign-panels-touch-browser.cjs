/* Epic C7.12 (docs/campagne-backlog.md): every campaign HUD panel is drawn through the same
   generic path — hud.js's render() calls buildPanelRows() then drawPanelRows() (hud-panel-
   rows.js), which already floors every button it creates to 44×44 via hud-widgets.js's button()
   (locked at its source by tests/campaign-panels-touch-targets.cjs). That floor was never
   positively exercised against any of the six panels unique to the campaign, though — this file
   drives the real page (real RAF loop, real dispatch(), no reimplemented model) to each of
   "notebook", "teaching", "observation", "gesture-scene", "nightfall", "epilogue-scene" in turn,
   with real state that produces at least one non-empty row (never an empty panel that would pass
   this test by having nothing to check), and asserts every button __hud registers is at or above
   the floor.

   "gesture-scene" and "epilogue-scene" are read-only narrative screens by construction
   (hud-panel.js's own header comments for both: dismissed only via Échap/the × button, never a
   bespoke in-row action) — buildPanelRows() never gives either of them a row with `action` set.
   For these two the guard against a vacuous pass is "at least one row was actually rendered", not
   "at least one row-level action button", since the product has none; the always-present
   close/prev/next buttons (drawn outside the per-row loop, for every panel) are still checked
   against the same floor. The other four panels are additionally required to register at least
   one row-derived button (id "row-*"/"alternate-*"), so a future panel that quietly bypasses
   button() with a hand-drawn rectangle cannot pass this test by relying on pagination alone. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { GardenState } = require("../public/garden-state.js");
const Cultivars = require("../public/game/cultivars.js");
const Rainelles = require("../public/game/rainelles.js");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

function buildSave() {
  const g = new GardenState(null, 1000);
  // A pending cultivar (no disposition yet) so "notebook" has a row-level action beyond the
  // read-only species list — same fixture shape as tests/campaign-notebook-browser.cjs.
  Cultivars.createCultivar(g.s, {
    name: "",
    parentIds: ["ronce-a-rubans", "fraise-timide"],
    traits: {
      port: "grimpant",
      feuilles: { forme: "ronde", taille: "moyenne" },
      fleurs: { forme: "etoile", groupement: "simple" },
      palette: { dominante1: "vert-clair", dominante2: "rouge", accent: "blanc" },
      humidite: "frais",
      fonction: null,
    },
  });
  // A real Rainelle for the "observation" panel's per-Rainelle row and the "teaching" panel's
  // real beginTeaching entry point.
  const cultivar = Cultivars.createCultivar(g.s, { name: "Semis", traits: { port: "touffe" } });
  const rainelle = Rainelles.createRainelle(g.s, { cultivarId: cultivar.id, name: "Test" });
  return { state: g.serialize(), rainelleId: rainelle.id };
}

// Panels whose rows never carry `action` (see header comment) — checked for a non-empty render
// only, never for a row-derived button.
const READ_ONLY_SCENES = new Set(["gesture-scene", "epilogue-scene"]);
const PANELS = [
  "notebook",
  "teaching",
  "observation",
  "gesture-scene",
  "nightfall",
  "epilogue-scene",
];

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
    const { state, rainelleId } = buildSave();
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
    await p.waitForFunction(() => window.GardenApp && window.GardenApp.ui, null, {
      timeout: 30000,
    });
    await p.waitForTimeout(300);
    assert.deepEqual(errors, [], "no console/page error on load: " + errors.join(" | "));

    // The real tick loop must give the seeded Rainelle a real position and a real rendered model
    // on its own before beginGestureScene() (used below, for both "teaching" and "gesture-scene")
    // can compute a real camera framing from it — same precondition
    // tests/campaign-teaching-screen-browser.cjs waits on for the same reason.
    await p.waitForFunction(
      (id) => {
        const v = window.GardenApp.view,
          r = window.GardenApp.game.s.rainelles.find((r) => r.id === id);
        return r && Number.isFinite(r.x) && v.rainelleModels.has(id);
      },
      rainelleId,
      { timeout: 5000 },
    );

    for (const panel of PANELS) {
      if (panel === "teaching") {
        // The real trigger (garden-dispatch.js's "begin-teaching"): runs the real beginTeaching
        // command, seeds the real teachingDraft scratch and opens the real "teaching" panel —
        // never a hand-set A.panel for this one, since the panel's own rows read m.teachingDraft,
        // which only this dispatch populates.
        const result = await p.evaluate(
          (id) => window.GardenApp.dispatch("begin-teaching", { id }),
          rainelleId,
        );
        void result;
      } else if (panel === "gesture-scene") {
        // No command wrapper exists to reach this narrative screen from a cold, unrelated state
        // (it is normally entered mid-sleep, see garden-dispatch.js's "confirm-night"). The real
        // view.beginGestureScene() is called directly instead of hand-setting view.gestureScene:
        // it computes `center`/`span` from the Rainelle's real rendered model (rainelleModels,
        // waited on above) — a hand-set stub without those fields crashes the camera code on the
        // very next animation frame (Cannot read properties of undefined (reading 'clone'),
        // caught while writing this test), which is exactly the kind of defect this epic exists
        // to catch rather than paper over.
        await p.evaluate(
          (id) => {
            window.GardenApp.view.beginGestureScene({ rainelleId: id, kind: "persistance" });
            window.GardenApp.dispatch("panel", { panel: "gesture-scene" });
          },
          rainelleId,
        );
      } else if (panel === "epilogue-scene") {
        // Same "posed directly" precedent, for the same reason: reaching this screen for real
        // requires the full epilogue-eligibility gate (Epilogue.canOpen), out of scope here — only
        // the two already-static narrative texts this panel reads are needed to exercise its rows.
        await p.evaluate(() => {
          window.GardenApp.game.s.campaignEpilogue.orientation = "durable";
          window.GardenApp.dispatch("panel", { panel: "epilogue-scene" });
        });
      } else {
        await p.evaluate((pn) => window.GardenApp.dispatch("panel", { panel: pn }), panel);
      }
      await p.waitForFunction(
        (pn) => window.GardenApp.ui.model?.panel === pn,
        panel,
        { timeout: 5000 },
      );

      const { rowCount, buttons } = await p.evaluate(() => {
        const hud = window.GardenApp.ui;
        hud.buttons = [];
        // Same "×" close button hud.js's own render() draws immediately before buildPanelRows/
        // drawPanelRows (line ~213), same call/geometry — omitting it would leave this test's own
        // "close/prev/next are checked too" claim false, since neither buildPanelRows nor
        // drawPanelRows registers it themselves.
        hud.button("close", "×", 700 - 58, 10, 43, 39, "close");
        const rows = hud.buildPanelRows(hud.model, hud.w, 0, 0, 700, 600, hud.palette);
        hud.drawPanelRows(rows, hud.model, hud.w, 0, 0, 700, 600, hud.palette);
        return {
          rowCount: rows.length,
          buttons: hud.buttons.map((btn) => ({ id: btn.id, w: btn.w, h: btn.h })),
        };
      });

      assert.ok(rowCount > 0, `panel "${panel}" rendered zero rows — cannot be a vacuous pass`);
      assert.ok(buttons.length > 0, `panel "${panel}" registered zero buttons`);
      for (const btn of buttons)
        assert.ok(
          btn.w >= 44 && btn.h >= 44,
          `panel "${panel}" button "${btn.id}" is ${btn.w}×${btn.h}, below the 44×44 floor`,
        );
      if (!READ_ONLY_SCENES.has(panel))
        assert.ok(
          buttons.some((btn) => btn.id.startsWith("row-") || btn.id.startsWith("alternate-")),
          `panel "${panel}" has no row-level action button — pagination/close alone would let ` +
            `this test pass without checking anything panel-specific`,
        );

      await p.evaluate(() => window.GardenApp.dispatch("close"));
    }

    assert.deepEqual(errors, []);
    console.log(
      "PASS Every campaign HUD panel (notebook, teaching, observation, gesture-scene, " +
        "nightfall, epilogue-scene) registers only buttons at or above the 44×44 touch floor, " +
        "checked against real, non-empty state for each.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
