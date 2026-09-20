/* Epic C2.9, browser fixture: the observation panel's rows are memoized in hud-panel.js on
   `s.elapsed` (garden-state.js's per-tick counter) to avoid re-running RainelleMovement.routeTo's
   grid BFS on every animation frame while the panel sits open (a real cost flagged by
   /code-review on this epic's own diff, campaign-observation.js's pure functions were never
   themselves the concern). That memoization has a real failure mode a Node test cannot exercise:
   a command that changes what the panel shows (teaching a gesture, changing a panier's
   min/capacity) never itself calls tick(), so caching on elapsed alone would keep showing stale
   rows if the player left this panel and came back before the next real tick — exactly the
   "attentive pas-à-pas" use case this epic exists for, where the game is deliberately paused and
   `elapsed` does not move on its own. hud.js's own panel-change reset (`this.lastPanel !== m.panel`)
   is extended to also drop the observation cache on *any* panel switch, guaranteeing a fresh read
   the instant this panel becomes visible again. This file drives the real page (real RAF loop,
   real hud.js/hud-panel.js, no reimplemented model object) to prove both halves at once: opening
   and redrawing the panel repeatedly while paused never mutates `s` at all, and reopening it after
   an out-of-tick mutation never shows the old value. */
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

    // Real stations/rainelles, posed directly (campaign-stations.js's own registerStation has no
    // command wrapper yet, same precedent already used by C5.11's own browser fixture pushing
    // real objects into window.GardenApp.game.s).
    const pan2Id = await p.evaluate(() => {
      const A = window.GardenApp,
        s = A.game.s;
      const Stations = window.GardenCampaignStations,
        Cultivars = window.GardenCultivars,
        Rainelles = window.GardenRainelles;
      const borne = Stations.registerStation(s.campaignStations, "borne", { x: 1, z: 1 });
      const zone = Stations.registerStation(s.campaignStations, "zone", { x: 6, z: 6 });
      const pan1 = Stations.registerStation(s.campaignStations, "panier", { x: 8, z: 8 });
      const pan2 = Stations.registerStation(s.campaignStations, "panier", { x: 10, z: 10 });
      const cultivar = Cultivars.createCultivar(s, { name: "T", traits: {} });
      const r1 = Rainelles.createRainelle(s, { cultivarId: cultivar.id, name: "R1" });
      const r2 = Rainelles.createRainelle(s, { cultivarId: cultivar.id, name: "R2" });
      const res1 = Rainelles.applyGesture(r1, {
        verbe: "arroser",
        source: borne.id,
        poste: zone.id,
        destination: "x",
        condition: "",
      });
      if (res1.ok) r1.geste = res1.geste || (res1.rainelle && res1.rainelle.geste);
      const res2 = Rainelles.applyGesture(r2, {
        verbe: "transporter",
        source: pan1.id,
        destination: pan2.id,
        poste: "x",
        condition: "",
      });
      if (res2.ok) r2.geste = res2.geste || (res2.rainelle && res2.rainelle.geste);
      A.game.tick(); // gives both rainelles a real position (rainelle-movement.js's ensurePosition)
      A.paused = true;
      A.panel = "observation";
      return pan2.id;
    });
    await p.waitForFunction(() => window.GardenApp.ui.model?.panel === "observation");

    const before = await p.evaluate(() => JSON.stringify(window.GardenApp.game.s));
    // Several real animation frames, panel open, game paused, no step taken: drawing repeatedly
    // must never itself advance or otherwise mutate the simulation.
    await p.waitForTimeout(500);
    const afterIdle = await p.evaluate(() => JSON.stringify(window.GardenApp.game.s));
    assert.equal(afterIdle, before, "opening/redrawing the panel never mutates s on its own");

    const initialRows = await p.evaluate(
      () => window.GardenApp.ui._observationCache?.rows.length,
    );
    assert.ok(initialRows > 0, "the panel lists real rows for the seeded stations/rainelles");

    // Leave the panel, mutate a station out-of-tick (no tick() call), come back: the cache must
    // not serve the pre-mutation snapshot.
    await p.evaluate(() => {
      window.GardenApp.panel = null;
    });
    await p.waitForTimeout(150);
    await p.evaluate((id) => {
      const s = window.GardenApp.game.s;
      const panier = s.campaignStations.paniers.find((pn) => pn.id === id);
      panier.min = 3;
      window.GardenApp.panel = "observation";
    }, pan2Id);
    await p.waitForTimeout(150);

    const rows = await p.evaluate(() => window.GardenApp.ui._observationCache.rows);
    const panierRow = rows.find((r) => r.title.includes(pan2Id));
    assert.ok(panierRow, "the mutated panier still has a row after reopening the panel");
    assert.match(
      panierRow.detail,
      /seuil 3/,
      "reopening the panel after an out-of-tick mutation shows the fresh value, never a stale cache",
    );

    assert.deepEqual(errors, []);
    console.log(
      "PASS Observation panel (C2.9): opening/redrawing while paused never mutates the simulation, and reopening after an out-of-tick station change never serves a stale cached row.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
