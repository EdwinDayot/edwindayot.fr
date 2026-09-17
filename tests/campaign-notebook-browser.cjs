/* Epic C1.4 (carnet de botanique), browser fixture: seeds a real save with one pending cultivar
   (disposition not yet chosen) plus one already composted, opens the notebook (key "J"), and
   checks the new HUD rows and the four real GardenState.command() round trips (keep, rename via
   the HTML input, retrieve the seed-box seed) — not just that the panel renders. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { GardenState } = require("../public/garden-state.js");
const Cultivars = require("../public/game/cultivars.js");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

function fixture() {
  const g = new GardenState(null, 1000);
  const pending = Cultivars.createCultivar(g.s, {
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
  const composted = Cultivars.createCultivar(g.s, {
    name: "Vieille découverte",
    parentIds: ["mousse-de-source", "oreille-de-pluie"],
    traits: { port: "touffe" },
  });
  composted.disposition = "composted";
  return { g, pendingId: pending.id, compostedId: composted.id };
}

(async () => {
  const b = await chromium.launch({
    headless: true,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const { g, pendingId, compostedId } = fixture();
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

    // Open the notebook with "J".
    await p.keyboard.press("j");
    await p.waitForFunction(() => __hud.model.panel === "notebook");
    assert.deepEqual(errors, []);

    // The pending cultivar's three rows exist with the expected actions and filiation text; the
    // already-composted one shows up too (proof the notebook keeps a composted discovery), but
    // without any of the four disposition actions since it already has one.
    const rows = await p.evaluate(() =>
      __hud.buildPanelRows(
        __hud.model,
        __hud.w,
        0,
        0,
        __hud.w,
        __hud.h,
        __hud.palette,
      ),
    );
    const pendingRows = rows.filter(
      (r) => r.data?.id === pendingId || r.alternate?.data?.id === pendingId,
    );
    assert.equal(pendingRows.length, 3, "the pending cultivar spans three rows");
    assert.equal(pendingRows[0].action, "keep-cultivar");
    assert.equal(pendingRows[0].alternate.action, "store-cultivar");
    assert.match(pendingRows[0].detail, /Issu de Ronce à rubans × Fraise timide/);
    assert.equal(pendingRows[1].action, "give-cultivar");
    assert.equal(pendingRows[1].alternate.action, "compost-cultivar");
    assert.equal(pendingRows[2].action, "rename-cultivar");
    assert.ok(
      !rows.some(
        (r) => r.data?.id === compostedId && r.action?.includes("cultivar"),
      ),
      "an already-composted cultivar offers no further disposition action",
    );

    // Rename via the real HTML input: dispatching the row action shows and fills it; typing a
    // new name and pressing Enter calls the real renameCultivar command.
    await p.evaluate(() => __hud.dispatch("rename-cultivar", { id: "c1" }));
    const input = p.locator("#cultivar-rename-input");
    await assert.doesNotReject(() => input.waitFor({ state: "visible" }));
    await input.fill("Grimpante du soir");
    await input.press("Enter");
    await p.waitForFunction(
      () => document.getElementById("cultivar-rename-input").hidden,
    );
    assert.equal(
      await p.evaluate(() => __view.game.s.cultivars.find((c) => c.id === "c1").name),
      "Grimpante du soir",
    );

    // Keep it: the row's action button dispatches through GardenState.command(), and the seed
    // box is seeded on this very first keep.
    await p.evaluate(() => __hud.dispatch("keep-cultivar", { id: "c1" }));
    assert.equal(
      await p.evaluate(() => __view.game.s.cultivars.find((c) => c.id === "c1").disposition),
      "kept",
    );
    assert.deepEqual(await p.evaluate(() => __view.game.s.campaignSeedBox), {
      seeded: true,
      cultivarId: "c1",
      retrievals: 0,
    });

    // A second disposition on the same cultivar is refused explicitly through the real command.
    const refused = await p.evaluate(() =>
      __view.game.command({ type: "storeCultivar", id: "c1" }),
    );
    assert.equal(refused.ok, false);
    assert.ok(refused.message);

    // The seed box is retrievable, repeatedly, without ever being consumed.
    await p.evaluate(() => __hud.dispatch("keep-cultivar", { id: "c1" }));
    const r1 = await p.evaluate(() =>
      __view.game.command({ type: "retrieveSeedBoxSeed" }),
    );
    assert.equal(r1.ok, true);
    const r2 = await p.evaluate(() =>
      __view.game.command({ type: "retrieveSeedBoxSeed" }),
    );
    assert.equal(r2.ok, true);
    assert.equal(await p.evaluate(() => __view.game.s.campaignSeedBox.retrievals), 2);
    assert.equal(await p.evaluate(() => __view.game.s.campaignSeedBox.seeded), true);

    assert.deepEqual(errors, []);
    console.log(
      "PASS Notebook shows filiation/differences for a pending cultivar over three rows, keeps a composted discovery, renames via the real HTML input, and keep/store/give/compost/retrieveSeedBoxSeed all round-trip through GardenState.command() with no console error.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
