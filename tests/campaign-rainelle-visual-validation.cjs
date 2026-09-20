/* Epic C5.12 (docs/campagne-backlog.md) — "Prototype visuel de validation des Rainelles". Unlike
   tests/campaign-rainelle-visual.cjs (C5.9), which only ever checked a STATIC comparison bench
   (Groups built in isolation via buildRainelleGroup, never moved), this epic's own criterion
   explicitly names "en mouvement réel" — the first Rainelle visual test that has to prove
   something over TIME, through the real engine (garden-state.js's tick()/step(), C5.10/C5.11's
   rainelle-movement.js), not a single static frame.

   So this fixture drives the LIVE game (window.GardenApp.game/view), not a dedicated off-screen
   scene: several founders' worth of Rainelles plus two individuals of the same cultivar are
   placed at real, programmatically-verified-walkable positions inside zone 0 (never guessed
   coordinates — Construction.walkable is queried live, same discipline C3.5/C5.10 already
   documented for their own "verify before assuming a spot is usable" steps), a habitat is
   registered so there is a real target to route toward, then the real per-second tick loop
   (A.game.step(1)) is run repeatedly with v.sync() called after each step — the exact call sites
   a real session's own requestAnimationFrame loop already uses (render-flow.js/garden-frame.js),
   never a bespoke movement shortcut.

   Checked PROGRAMMATICALLY at every single tick, never only once at the end and never only by a
   human/model looking at the final screenshot (that judgment stays a documented secondary
   complement, per direction-artistique.md/execution-continue.md): no two Rainelle bounding boxes
   ever intersect while they walk ("absence de pénétration de maillage grossière... pendant le
   déplacement" — the criterion's own wording, which C5.9's static bench could never have proven).
   A screenshot is still saved and meant to be read afterwards for composition/scale, exactly as a
   complement, never a substitute. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { GardenState } = require("../public/garden-state.js");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    // Same documented fallback as tests/garden-material-audit.cjs / campaign-rainelle-visual.cjs.
    executablePath: require("node:fs").existsSync("/opt/pw-browsers/chromium")
      ? "/opt/pw-browsers/chromium"
      : undefined,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    // A fresh, deterministic save (no leftover entities from whatever demo state the served page
    // might otherwise carry) — same posture as campaign-nightfall-browser.cjs/campaign-narrative-
    // browser.cjs before it, seeded through localStorage rather than through in-page mutation of
    // an unknown starting save.
    const fresh = new GardenState(null, 1000);
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const consoleErrors = [];
    p.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    p.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));
    await p.addInitScript((state) => {
      localStorage.setItem("edwin-garden-v3", JSON.stringify(state));
    }, fresh.serialize());
    await p.goto(url, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      () =>
        window.THREE &&
        window.GardenGenetics &&
        window.GardenRenderRainelles &&
        window.GardenBotanyHybrids &&
        window.GardenCampaignStations &&
        window.GardenConstruction &&
        window.GardenApp &&
        window.GardenApp.game &&
        window.GardenApp.view,
      null,
      { timeout: 30000 },
    );

    const result = await p.evaluate(() => {
      const T = THREE;
      const s = window.GardenApp.game.s;
      const v = window.GardenApp.view;
      const Genetics = window.GardenGenetics;
      const Stations = window.GardenCampaignStations;
      const Construction = window.GardenConstruction;
      const Hybrids = window.GardenBotanyHybrids;

      // Sample real, currently-walkable half-unit-ish points inside zone 0's own bounds (data-
      // world.js: x:[-16,4], z:[-5,19]), kept a couple of units clear of the rectangle's edges —
      // never a hardcoded coordinate guessed to be free of the visitors/houses/trees zone 0
      // already carries, queried live instead exactly as C3.5/C5.10 both required of themselves.
      const candidates = [];
      for (let x = -14; x <= 2; x += 1)
        for (let z = -3; z <= 17; z += 1)
          if (Construction.walkable(s, x, z)) candidates.push({ x, z });

      // Greedy farthest-point spread: without it, a naive slice of `candidates` could hand out
      // several immediately-adjacent points, and the very first tick would already have every
      // Rainelle on or next to its target — nothing left to actually observe moving over several
      // ticks, defeating this epic's own "en mouvement réel" criterion.
      function spreadPoints(pool, n) {
        const chosen = [pool[0]];
        while (chosen.length < n && chosen.length < pool.length) {
          let best = null,
            bestD = -1;
          for (const c of pool) {
            if (chosen.includes(c)) continue;
            const d = Math.min(
              ...chosen.map((k) => (k.x - c.x) ** 2 + (k.z - c.z) ** 2),
            );
            if (d > bestD) {
              bestD = d;
              best = c;
            }
          }
          chosen.push(best);
        }
        return chosen;
      }

      const founders = Genetics.founders;
      const NEEDED = founders.length + 2 + 1; // one Rainelle per founder + two same-cultivar twins + one habitat
      const points = spreadPoints(candidates, NEEDED);
      if (points.length < NEEDED)
        throw new Error(
          `Zone 0 n'offre pas assez de points praticables pour ce banc (${points.length}/${NEEDED}).`,
        );

      const habitatPoint = points[0];
      const starts = points.slice(1);

      Stations.registerStation(s.campaignStations, "habitat", {
        x: habitatPoint.x,
        z: habitatPoint.z,
        capacity: founders.length + 2,
      });

      s.cultivars.push(
        ...founders.map((f) => ({
          id: "val-cv-" + f.id,
          name: f.name || f.id,
          parentIds: [],
          traits: f.traits,
        })),
      );
      founders.forEach((f, i) => {
        s.rainelles.push({
          id: "val-r" + i,
          cultivarId: "val-cv-" + f.id,
          name: "",
          geste: null,
          job: null,
          bourgeon: null,
          founder: false,
          x: starts[i].x,
          z: starts[i].z,
        });
      });
      // The "deux instances du même cultivar" case the criterion names explicitly, exactly like
      // C5.9's own twin row — started from two more distinct spread points, never the same start.
      const twinFounder = founders[0];
      const twinStartA = starts[founders.length],
        twinStartB = starts[founders.length + 1];
      s.rainelles.push({
        id: "val-twin-a",
        cultivarId: "val-cv-" + twinFounder.id,
        name: "",
        geste: null,
        job: null,
        bourgeon: null,
        founder: false,
        x: twinStartA.x,
        z: twinStartA.z,
      });
      s.rainelles.push({
        id: "val-twin-b",
        cultivarId: "val-cv-" + twinFounder.id,
        name: "",
        geste: null,
        job: null,
        bourgeon: null,
        founder: false,
        x: twinStartB.x,
        z: twinStartB.z,
      });

      v.sync();
      const initial = new Map(s.rainelles.map((r) => [r.id, { x: r.x, z: r.z }]));

      // The real per-second tick loop, run repeatedly — exactly what a real session's own
      // requestAnimationFrame loop already does (render-flow.js's sync() is the same call site
      // garden-frame.js's A.frame calls every real frame), never a movement shortcut bespoke to
      // this test.
      let overlapDetected = false;
      const overlapPairs = [];
      const TICKS = 15;
      for (let t = 0; t < TICKS; t++) {
        window.GardenApp.game.step(1);
        v.sync();
        const groups = [...v.rainelleModels.values()].map((rm) => rm.group);
        for (let i = 0; i < groups.length; i++)
          for (let j = i + 1; j < groups.length; j++) {
            const bi = new T.Box3().setFromObject(groups[i]);
            const bj = new T.Box3().setFromObject(groups[j]);
            if (bi.intersectsBox(bj)) {
              overlapDetected = true;
              overlapPairs.push([
                groups[i].userData.rainelleId,
                groups[j].userData.rainelleId,
                t,
              ]);
            }
          }
      }

      let moved = 0;
      for (const r of s.rainelles) {
        const i0 = initial.get(r.id);
        if (r.x !== i0.x || r.z !== i0.z) moved++;
      }

      const nanMeshes = [];
      for (const rm of v.rainelleModels.values())
        rm.group.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const pos = o.geometry.attributes.position;
          for (let k = 0; k < pos.array.length; k++)
            if (!Number.isFinite(pos.array[k])) {
              nanMeshes.push(rm.group.userData.rainelleId);
              break;
            }
        });

      // Scale sanity against the two other things already sharing this scene: the real, already-
      // in-place player model (v.player, built once at world-build time, never rebuilt here) and a
      // founder plant built the same way C5.9's own bench did.
      const anyGroup = [...v.rainelleModels.values()][0].group;
      const rainelleSize = new T.Box3().setFromObject(anyGroup).getSize(new T.Vector3());
      const playerSize = new T.Box3().setFromObject(v.player).getSize(new T.Vector3());
      const plantGroup = Hybrids.buildSpecimenGroup({
        id: "val-scale-ref",
        traits: twinFounder.traits,
      });
      const plantSize = new T.Box3().setFromObject(plantGroup).getSize(new T.Vector3());

      // Steer the LIVE camera toward the bench for the screenshot / multimodal review only — a
      // one-off render() with a throwaway camera was tried first and discarded: the real
      // requestAnimationFrame loop (garden-frame.js's own A.frame, still running under this
      // fixture, never paused) re-renders with the real v.camera on the very next frame and would
      // simply overwrite it before Playwright's own screenshot() call landed. Setting `v.position`
      // (the same field player movement itself writes to, see render-frame.js's movePlayer — left
      // untouched here since axis is never non-zero) lets that same real camera-follow lerp
      // (render-camera.js's updateCamera) glide there on its own over the next few real frames.
      const allPos = s.rainelles.map((r) => ({ x: r.x, z: r.z })).concat([habitatPoint]);
      const cx = allPos.reduce((a, pt) => a + pt.x, 0) / allPos.length;
      const cz = allPos.reduce((a, pt) => a + pt.z, 0) / allPos.length;
      v.position.x = cx;
      v.position.z = cz;

      return {
        rainelleCount: s.rainelles.length,
        foundersCount: founders.length,
        pointsFound: points.length,
        overlapDetected,
        overlapPairs,
        moved,
        nanMeshes,
        rainelleSize: rainelleSize.toArray(),
        playerSize: playerSize.toArray(),
        plantSize: plantSize.toArray(),
      };
    });

    if (consoleErrors.length)
      throw new Error(
        "Console errors while running the C5.12 movement bench:\n" + consoleErrors.join("\n"),
      );

    assert.equal(
      result.rainelleCount,
      result.foundersCount + 2,
      "expected one Rainelle per founder cultivar plus 2 same-cultivar twins",
    );
    assert.deepEqual(
      result.nanMeshes,
      [],
      "Non-finite vertex positions: " + result.nanMeshes.join(", "),
    );
    assert.equal(
      result.overlapDetected,
      false,
      "Gross mesh penetration while moving: " + JSON.stringify(result.overlapPairs),
    );
    assert.ok(
      result.moved > 0,
      "no Rainelle moved across 15 real ticks — this test would not actually exercise movement",
    );

    // Let the live camera-follow lerp (updateCamera, real requestAnimationFrame frames) actually
    // glide to the bench (v.position, set above) before capturing — a screenshot taken immediately
    // would still show wherever the camera started.
    await p.waitForTimeout(1200);
    await p.screenshot({ path: "/tmp/campaign-rainelle-visual-validation.png" });

    console.log(
      "PASS campaign-rainelle-visual-validation:",
      JSON.stringify({
        rainelleCount: result.rainelleCount,
        moved: result.moved,
        overlapDetected: result.overlapDetected,
        rainelleSize: result.rainelleSize,
        playerSize: result.playerSize,
        plantSize: result.plantSize,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-rainelle-visual-validation:", e.message);
  process.exit(1);
});
