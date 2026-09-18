const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const p = await browser.newPage({ viewport: { width: 1200, height: 800 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/garden.js", (r) =>
      r.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await p.goto(url);
    await p.waitForFunction(() => window.GardenView);
    // Dedicated rendering fixture: freeze simulation and sway to isolate distance/zoom from growth.
    const result = await p.evaluate(() => {
      const g = new GardenRules.GardenState();
      g.s.unlocked = GardenData.zones.map((z) => z.id);
      g.s.entities = GardenData.species.map((sp, i) => ({
        id: "e" + (i + 1),
        type: "pot",
        x: -12 + (i % 4) * 3,
        z: -2 - Math.floor(i / 4) * 3,
        rotation: 0,
        stored: false,
        plant: {
          species: sp.id,
          growth: 0.3,
          moisture: 60,
          progress: 0,
          ready: 0,
        },
      }));
      g.s.nextId = 13;
      const view = new GardenView(document.getElementById("garden-world"), g),
        failures = [];
      let checks = 0;
      const bounds = (object) => {
        const box = new THREE.Box3().setFromObject(object, true);
        return [...box.min.toArray(), ...box.max.toArray()];
      };
      for (const e of g.s.entities) {
        let previousHeight = 0;
        for (const growth of [0.3, 0.6, 1]) {
          e.plant.growth = growth;
          view.position = { x: e.x + 4, z: e.z };
          view.span = 17;
          view.overview = false;
          view.frame(0.016, { x: 0, z: 0 }, true);
          const model = view.models.get(e.id).foliage,
            uuid = model.uuid,
            expected = bounds(model),
            height = expected[4] - expected[1];
          if (height <= previousHeight)
            failures.push(e.plant.species + " no longer grows");
          previousHeight = height;
          for (const [distance, span, overview] of [
            [6, 17, false],
            [4, 17, false],
            [5.1, 17, false],
            [4.9, 17, false],
            [6, 24, false],
            [4, 34, true],
            [4, 17, false],
          ]) {
            view.position = { x: e.x + distance, z: e.z };
            view.span = span;
            view.overview = overview;
            view.frame(0.016, { x: 0, z: 0 }, true);
            const next = view.models.get(e.id).foliage,
              actual = bounds(next);
            if (
              next.uuid !== uuid ||
              actual.some((n, i) => Math.abs(n - expected[i]) > 1e-6)
            )
              failures.push(
                `${e.plant.species} growth ${growth}, distance ${distance}, zoom ${span}`,
              );
            checks++;
          }
        }
      }
      return { checks, failures };
    });
    assert.deepEqual(result.failures, []);
    assert.equal(result.checks, 252);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 12 species × 3 growth stages × 7 distance/zoom cases retain the same model and world bounds; growth still changes size.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
