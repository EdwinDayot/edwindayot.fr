// Epic C6.24 (docs/campagne-backlog.md) — "Habillage visuel distinctif de la serre commune de
// Jeanne". Checks the real, live-game building group (built by the real buildHouses()/buildHouse()
// wiring from the real D.buildings entry, never an isolated hand-built bench) PROGRAMMATICALLY —
// the actual gate is tests/garden-material-audit.cjs, which this epic also extends (widened
// TRANSPARENT_ALLOWLIST/cbe8e2 reason) — then saves a screenshot as a documented secondary
// complement for multimodal review against docs/direction-artistique.md, never the sole proof.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    // Same documented fallback as tests/garden-material-audit.cjs / campaign-house-visual.cjs.
    executablePath: require("node:fs").existsSync("/opt/pw-browsers/chromium")
      ? "/opt/pw-browsers/chromium"
      : undefined,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const p = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const consoleErrors = [];
    p.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    p.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));
    await p.goto(process.env.GARDEN_URL || "http://127.0.0.1:4174/", {
      waitUntil: "domcontentloaded",
    });
    await p.waitForFunction(
      () => window.GardenApp && window.GardenApp.view,
      null,
      {
        timeout: 30000,
      },
    );
    await p.waitForTimeout(500);

    const inspected = await p.evaluate(() => {
      const v = window.GardenApp.view;
      const jeanne = v.nodes.get("jeanne");
      // Non-greenhouse control building, same buildHouse() code path, to prove the glass
      // treatment is isolated to Jeanne rather than leaking into every resident house.
      const control = v.nodes.get("hugo");

      function classify(group) {
        const glass = [],
          stone = [],
          roof = [],
          nanMeshes = [];
        group.traverse((o) => {
          if (!o.isMesh || !o.geometry || !o.material) return;
          const pos = o.geometry.attributes && o.geometry.attributes.position;
          if (pos)
            for (let i = 0; i < pos.array.length; i++)
              if (!Number.isFinite(pos.array[i])) {
                nanMeshes.push(o.name || o.type);
                break;
              }
          const mat = o.material;
          const hex = mat.color ? mat.color.getHexString() : null;
          if (hex === "cbe8e2" && mat.transparent)
            glass.push({ opacity: mat.opacity, roughness: mat.roughness });
          else if (hex === "c5c5b2") stone.push(hex);
          else if (hex === "4a5a42") roof.push(hex);
        });
        return {
          glassCount: glass.length,
          glassSample: glass[0] || null,
          stoneCount: stone.length,
          roofCount: roof.length,
          nanMeshes,
        };
      }

      const jeanneInfo = jeanne ? classify(jeanne) : null;
      const controlInfo = control ? classify(control) : null;

      // Real, rendered bounding-box check against the closest real neighbour building placed by
      // C6.22 ("villageois-2", the nearest wallCircle per its own position comment in
      // data-buildings.js) — geometry-level, not just the abstract-distance check the Node
      // foundation test (campaign-jeanne-greenhouse-foundation.cjs) already covers.
      const neighbour = v.nodes.get("villageois-2");
      let overlap = null;
      if (jeanne && neighbour) {
        const T = window.THREE;
        jeanne.updateMatrixWorld(true);
        neighbour.updateMatrixWorld(true);
        const boxJeanne = new T.Box3().setFromObject(jeanne);
        const boxNeighbour = new T.Box3().setFromObject(neighbour);
        overlap = boxJeanne.intersectsBox(boxNeighbour);
      }

      return {
        jeanneFound: !!jeanne,
        controlFound: !!control,
        neighbourFound: !!neighbour,
        jeanneInfo,
        controlInfo,
        overlap,
      };
    });

    if (consoleErrors.length)
      throw new Error(
        "Console errors while inspecting the C6.24 greenhouse building:\n" +
          consoleErrors.join("\n"),
      );

    assert.equal(
      inspected.jeanneFound,
      true,
      "v.nodes never registered a group for jeanne (buildHouse wiring)",
    );
    assert.equal(
      inspected.controlFound,
      true,
      "control building (hugo) not found",
    );
    assert.equal(
      inspected.neighbourFound,
      true,
      "neighbour building (villageois-2) not found",
    );

    assert.deepEqual(
      inspected.jeanneInfo.nanMeshes,
      [],
      "Non-finite vertex positions in Jeanne's building: " +
        inspected.jeanneInfo.nanMeshes.join(", "),
    );
    assert.equal(
      inspected.jeanneInfo.glassCount,
      5,
      "Jeanne's building must show exactly the 4 flat wall panels (back, 2 sides, front split by the door = 5 box meshes) in the documented greenhouse glass material",
    );
    assert.equal(
      inspected.jeanneInfo.glassSample.opacity,
      0.4,
      "glass opacity must match the documented greenhouse material exactly (render-scene.js), not an invented value",
    );
    assert.equal(
      inspected.jeanneInfo.glassSample.roughness,
      0.15,
      "glass roughness must match the documented greenhouse material exactly (render-scene.js), not an invented value",
    );
    assert.ok(
      inspected.jeanneInfo.stoneCount > 0,
      "the gable caps, studs, quoins and jambs must stay opaque stone (limite honnête: pignons inchangés)",
    );
    assert.ok(
      inspected.jeanneInfo.roofCount > 0,
      "the roof panels must stay opaque roofColor (limite honnête: toit inchangé)",
    );

    assert.equal(
      inspected.controlInfo.glassCount,
      0,
      "a non-greenhouse resident (hugo) must show zero glass wall panels — regression: the effect leaked beyond b.greenhouse",
    );
    assert.ok(
      inspected.controlInfo.stoneCount > 0,
      "control building lost its stone walls entirely, unrelated regression",
    );

    assert.equal(
      inspected.overlap,
      false,
      "Gross mesh penetration: Jeanne's building bounding box overlaps its nearest real neighbour (villageois-2)",
    );

    // Frame Jeanne's real, live building (cx:3, cz:32, data-buildings.js) for the documented
    // secondary multimodal review — same overview/span/angle knobs tests/garden-houses.cjs already
    // uses, pointed at the door side (-z) so the glass panels are actually in frame.
    await p.evaluate(() => {
      const v = window.GardenApp.view;
      v.position = { x: 3, z: 32 };
      v.overview = true;
      v.span = 7;
      v.angle = 0.35;
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: "/tmp/campaign-jeanne-greenhouse-visual.png" });

    console.log(
      "PASS campaign-jeanne-greenhouse-visual:",
      JSON.stringify({
        jeanneGlassCount: inspected.jeanneInfo.glassCount,
        jeanneStoneCount: inspected.jeanneInfo.stoneCount,
        jeanneRoofCount: inspected.jeanneInfo.roofCount,
        controlGlassCount: inspected.controlInfo.glassCount,
        overlap: inspected.overlap,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-jeanne-greenhouse-visual:", e.message);
  process.exit(1);
});
