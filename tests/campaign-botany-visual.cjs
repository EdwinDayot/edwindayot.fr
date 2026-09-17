// Epic C1.8 (docs/campagne-backlog.md) — "Prototype visuel de validation", the exit gate of
// phase 1 (docs/campagne-backlog.md, docs/orchestration.md "Portes de phase"). Builds the real
// comparison scene the design asks for (game-design.md §14: "six plantes fondatrices
// représentées à trois stades, croisements entre leurs familles compatibles, comparaison côte à
// côte avec leurs parents") through public/game/botany-hybrids.js (epics C1.7/C1.8) and checks
// it PROGRAMMATICALLY, the same way tests/garden-material-audit.cjs is the real gate for C1.7 —
// never a screenshot a human or a model "looks at" and judges. A multimodal read of the capture
// this script saves is a documented complement only (docs/execution-continue.md), performed
// separately by whoever runs this script, never a substitute for the assertions below.
//
// Six founders, not all eight in public/game/botany-genetics.js: that module's own header
// already earmarks this ("C1.8 (visual prototype) picks six of these to model first"), matching
// game-design.md §14's number and covering all five port skeletons plus a no-flower, an
// emissive (éclairer) and a no-fonction case:
//   oreille-de-pluie (rosette, feuille coupe, retenir_eau, sans fleur)
//   clochette-du-soir (tige-dressée, fleur cloche simple, éclairer/émissif)
//   menthe-de-velours (touffe, fleur épi groupée, parfumer)
//   ronce-a-rubans (grimpant, sans fleur, sans fonction)
//   fraise-timide (retombant, fleur étoile simple, sans fonction)
//   aster-des-vents (tige-dressée, fleur étoile groupée, violet, sans fonction)
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");

const FOUNDER_IDS = [
  "oreille-de-pluie",
  "clochette-du-soir",
  "menthe-de-velours",
  "ronce-a-rubans",
  "fraise-timide",
  "aster-des-vents",
];
// Compatible pairs (crossCompatible: humidity preference within one rank), each producing at
// least one structurally valid trait set (traitCombinationValid) — verified by the page itself
// below, not assumed here.
const CROSSINGS = [
  ["oreille-de-pluie", "clochette-du-soir"],
  ["aster-des-vents", "menthe-de-velours"],
];

const ROW_SPACING = 3;
const COL_SPACING = 2;
const CROSS_ROW_SPACING = 3;
const CROSS_COL_SPACING = 2.4;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    // This environment's PLAYWRIGHT_BROWSERS_PATH only carries a Chromium revision that
    // predates the one playwright@1.63.0 (package-lock.json) expects for its default headless
    // shell; the pre-installed /opt/pw-browsers/chromium binary is the documented fallback for
    // this exact situation (see the session's own environment notes), so it is preferred when
    // present rather than left to Playwright's revision resolution.
    executablePath: require("node:fs").existsSync("/opt/pw-browsers/chromium")
      ? "/opt/pw-browsers/chromium"
      : undefined,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const p = await browser.newPage({ viewport: { width: 1900, height: 1100 } });
    const consoleErrors = [];
    p.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    p.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));
    await p.goto(process.env.GARDEN_URL || "http://127.0.0.1:4174/", {
      waitUntil: "domcontentloaded",
    });
    await p.waitForFunction(
      () => window.THREE && window.GardenGenetics && window.GardenBotanyHybrids,
      null,
      { timeout: 30000 },
    );

    // Dedicated off-screen scene/renderer, on the same pattern as tests/garden-visual-atlas.cjs:
    // this is a comparison bench, not the live game world, so the main app is torn down first.
    const built = await p.evaluate(
      ({ founderIds, crossings, rowSpacing, colSpacing, crossRowSpacing, crossColSpacing }) => {
        document.querySelector(".garden-shell")?.remove();
        document.querySelector(".site-header")?.remove();
        const T = THREE;
        const canvas = document.createElement("canvas");
        canvas.id = "botany-bench";
        document.body.append(canvas);
        const renderer = new T.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(1900, 1100);
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;

        // Frames an OrthographicCamera on a Box3 from a chosen (roughly side-on, elevated)
        // viewing direction, computed exactly from the box's eight corners rather than guessed
        // — so every shot below is fully framed regardless of how large the scene is, and a
        // silhouette-hiding near-top-down angle (easy to get wrong by hand) never happens.
        function frameBox(box, elevationDeg, margin) {
          const center = box.getCenter(new T.Vector3());
          const size = box.getSize(new T.Vector3());
          const radius = Math.max(size.length() / 2, 0.5);
          const elev = (elevationDeg * Math.PI) / 180;
          const forward = new T.Vector3(0, -Math.sin(elev), -Math.cos(elev)).normalize();
          const worldUp = new T.Vector3(0, 1, 0);
          const right = new T.Vector3().crossVectors(forward, worldUp).normalize();
          const up = new T.Vector3().crossVectors(right, forward).normalize();
          const corners = [
            [box.min.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.min.z],
            [box.min.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.min.z],
            [box.min.x, box.min.y, box.max.z], [box.max.x, box.min.y, box.max.z],
            [box.min.x, box.max.y, box.max.z], [box.max.x, box.max.y, box.max.z],
          ].map((c) => new T.Vector3(...c));
          let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
          for (const c of corners) {
            const r = c.dot(right), u = c.dot(up);
            minR = Math.min(minR, r); maxR = Math.max(maxR, r);
            minU = Math.min(minU, u); maxU = Math.max(maxU, u);
          }
          const cr = center.dot(right), cu = center.dot(up);
          const camera = new T.OrthographicCamera(
            (minR - cr) * margin, (maxR - cr) * margin,
            (maxU - cu) * margin, (minU - cu) * margin,
            0.1, radius * 6 + 20,
          );
          camera.position.copy(center).addScaledVector(forward, -(radius * 4 + 10));
          camera.up.copy(up);
          camera.lookAt(center);
          return camera;
        }
        window.__frameBox = frameBox;

        const scene = new T.Scene();
        scene.background = new T.Color(0xdce7d4); // fond documenté (direction-artistique.md)
        scene.add(new T.HemisphereLight(0xfff7df, 0x69816f, 2.3));
        const sun = new T.DirectionalLight(0xffeaca, 2.4);
        sun.position.set(-5, 10, 8);
        scene.add(sun);

        const Genetics = window.GardenGenetics,
          Hybrids = window.GardenBotanyHybrids;
        const founders = founderIds.map((id) => Genetics.founders.find((f) => f.id === id));
        founders.forEach((f) => {
          if (!f) throw new Error("unknown founder id in test setup");
        });

        const specimens = []; // {kind, label, group}

        // Six founders x three growth stages, one row per founder.
        founders.forEach((f, row) => {
          for (let stage = 0; stage < Hybrids.STAGE_COUNT; stage++) {
            const group = Hybrids.buildSpecimenGroup({ id: f.id, traits: f.traits }, stage);
            group.position.set(stage * colSpacing, 0, row * rowSpacing);
            scene.add(group);
            specimens.push({ kind: "founder", label: `${f.id}@stage${stage}`, group });
          }
        });

        // Crossings, in a separate band below the grid: each valid combination is displayed
        // mature, flanked by its two mature parents (design §14: "comparaison côte à côte avec
        // leurs parents").
        const gridDepth = founders.length * rowSpacing;
        const crossingResults = [];
        crossings.forEach(([idA, idB], i) => {
          if (!Genetics.crossCompatible(idA, idB)) throw new Error(`${idA}/${idB} not compatible per crossCompatible`);
          const reachable = Genetics.enumerateReachableTraitSets(idA, idB).find((r) => r.valid);
          if (!reachable) throw new Error(`no valid combination for ${idA} x ${idB}`);
          const parentA = Genetics.founders.find((f) => f.id === idA);
          const parentB = Genetics.founders.find((f) => f.id === idB);
          const z = gridDepth + crossRowSpacing + i * crossRowSpacing;
          const hybridId = `prototype-hybrid-${i + 1}`;

          const groupA = Hybrids.buildSpecimenGroup({ id: parentA.id, traits: parentA.traits }, Hybrids.MATURE_STAGE);
          groupA.position.set(-crossColSpacing, 0, z);
          scene.add(groupA);
          specimens.push({ kind: "parent", label: `${idA} (parent A of cross ${i + 1})`, group: groupA });

          const groupHybrid = Hybrids.buildSpecimenGroup({ id: hybridId, traits: reachable.traits }, Hybrids.MATURE_STAGE);
          groupHybrid.position.set(0, 0, z);
          scene.add(groupHybrid);
          specimens.push({ kind: "hybrid", label: `cross ${i + 1}: ${idA} x ${idB}`, group: groupHybrid });

          const groupB = Hybrids.buildSpecimenGroup({ id: parentB.id, traits: parentB.traits }, Hybrids.MATURE_STAGE);
          groupB.position.set(crossColSpacing, 0, z);
          scene.add(groupB);
          specimens.push({ kind: "parent", label: `${idB} (parent B of cross ${i + 1})`, group: groupB });

          crossingResults.push({ idA, idB, hybridId, valid: true });
        });

        scene.updateMatrixWorld(true);

        // Programmatic checks live here, against the real Three.js objects — never against
        // pixels. Same spirit as tests/garden-material-audit.cjs. No ground-plane check: unlike
        // the free garden's terrain audit, this bench has no pot/soil mesh at y=0, and the
        // "retombant" port is deliberately built to trail downward from a rim height (see its
        // profile comment in botany-hybrids.js) — a lower bound at y=0 would fail a working
        // hanging-pot silhouette by design, not catch a real defect.
        const nanMeshes = [];
        specimens.forEach(({ label, group }) => {
          group.traverse((o) => {
            if (!o.isMesh || !o.geometry) return;
            const pos = o.geometry.attributes.position;
            for (let i = 0; i < pos.array.length; i++) {
              if (!Number.isFinite(pos.array[i])) {
                nanMeshes.push(label);
                break;
              }
            }
          });
        });

        // "Absence de pénétration de maillage grossière" between neighbouring specimens placed
        // in this comparison layout: with a known, fixed grid spacing, no two specimens' world
        // bounding boxes may overlap. This also stands in for "cohérence d'échelle" — it fails
        // the moment a stage or a hybrid renders unexpectedly larger than the spacing allows.
        const boxes = specimens.map((s) => ({ label: s.label, box: new T.Box3().setFromObject(s.group) }));
        const overlaps = [];
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            if (boxes[i].box.intersectsBox(boxes[j].box)) {
              overlaps.push(`${boxes[i].label} <-> ${boxes[j].label}`);
            }
          }
        }

        // Scale consistency across the three stages, measured on the actual rendered bounding
        // box (stronger than the Node-level scale-factor check in
        // tests/campaign-hybrids-render.cjs, which never touches a real Box3).
        const stageSizes = founders.map((f) => {
          const sizes = [];
          for (let stage = 0; stage < Hybrids.STAGE_COUNT; stage++) {
            const entry = boxes.find((b) => b.label === `${f.id}@stage${stage}`);
            const size = new T.Vector3();
            entry.box.getSize(size);
            sizes.push(Math.max(size.x, size.y, size.z));
          }
          return { id: f.id, sizes };
        });

        window.__benchScene = scene;
        window.__benchRenderer = renderer;
        window.__benchGroups = Object.fromEntries(specimens.map((s) => [s.label, s.group]));

        return {
          nanMeshes,
          overlaps,
          stageSizes,
          crossingResults,
          specimenCount: specimens.length,
        };
      },
      {
        founderIds: FOUNDER_IDS,
        crossings: CROSSINGS,
        rowSpacing: ROW_SPACING,
        colSpacing: COL_SPACING,
        crossRowSpacing: CROSS_ROW_SPACING,
        crossColSpacing: CROSS_COL_SPACING,
      },
    );

    if (consoleErrors.length)
      throw new Error("Console errors while building the C1.8 comparison scene:\n" + consoleErrors.join("\n"));

    assert.deepEqual(built.nanMeshes, [], "Non-finite vertex positions: " + built.nanMeshes.join(", "));
    assert.deepEqual(
      built.overlaps,
      [],
      "Gross mesh penetration: overlapping world bounding boxes between neighbouring specimens: " +
        built.overlaps.join(", "),
    );
    assert.equal(built.specimenCount, FOUNDER_IDS.length * 3 + CROSSINGS.length * 3, "expected 6 founders x 3 stages + 3 specimens per crossing");

    for (const { id, sizes } of built.stageSizes) {
      assert.equal(sizes.length, 3, `${id}: expected exactly three growth stages`);
      for (let i = 1; i < sizes.length; i++) {
        assert.ok(sizes[i] > sizes[i - 1], `${id}: stage ${i} (${sizes[i]}) not larger than stage ${i - 1} (${sizes[i - 1]}) — scale inconsistent`);
      }
    }

    for (const c of built.crossingResults) assert.ok(c.valid, `${c.idA} x ${c.idB} did not produce a valid trait set`);

    // Three separately framed captures for multimodal review (documented complement only, see
    // file header — the gate above already passed independently of them). Each one lays its
    // specimens out along a SINGLE axis at a constant depth: a grid camera that mixes a "row"
    // axis into screen-depth-plus-elevation (like the gate's own layout above, chosen there for
    // its clean, spacing-provable overlap check, not for how it looks) reads as visually melted
    // plants once elevated — a lesson learned re-deriving this shot, kept here as the reason a
    // single-axis strip is used for legibility instead of reusing the gate's own 2-D grid.
    async function captureRow(file, buildLabelPairs, elevation, margin) {
      await p.evaluate(
        ({ pairs, elevation, margin }) => {
          const T = THREE;
          const Hybrids = window.GardenBotanyHybrids;
          const scene = new T.Scene();
          scene.background = new T.Color(0xdce7d4);
          scene.add(new T.HemisphereLight(0xfff7df, 0x69816f, 2.3));
          const sun = new T.DirectionalLight(0xffeaca, 2.4);
          sun.position.set(-5, 10, 8);
          scene.add(sun);
          let x = 0;
          for (const { id, traits, stage, gapAfter } of pairs) {
            const g = Hybrids.buildSpecimenGroup({ id, traits }, stage);
            g.position.set(x, 0, 0);
            scene.add(g);
            x += (gapAfter || 1) * 1.9;
          }
          scene.updateMatrixWorld(true);
          const box = new T.Box3().setFromObject(scene);
          const camera = window.__frameBox(box, elevation, margin);
          window.__benchRenderer.render(scene, camera);
        },
        { pairs: buildLabelPairs, elevation, margin },
      );
      await p.locator("#botany-bench").screenshot({ path: file });
    }

    const foundersForShots = await p.evaluate(
      (ids) => window.GardenGenetics.founders.filter((f) => ids.includes(f.id)),
      FOUNDER_IDS,
    );

    await captureRow(
      "/tmp/campaign-botany-visual-founders.png",
      foundersForShots.map((f) => ({ id: f.id, traits: f.traits, stage: 2 })),
      18,
      1.2,
    );

    await captureRow(
      "/tmp/campaign-botany-visual-stages.png",
      foundersForShots.flatMap((f, i) =>
        [0, 1, 2].map((stage) => ({ id: f.id, traits: f.traits, stage, gapAfter: stage === 2 ? 2.4 : 1 })),
      ),
      18,
      1.2,
    );

    const crossingsForShot = await p.evaluate(
      (crossings) => {
        const Genetics = window.GardenGenetics;
        return crossings.map(([idA, idB], i) => {
          const reachable = Genetics.enumerateReachableTraitSets(idA, idB).find((r) => r.valid);
          const parentA = Genetics.founders.find((f) => f.id === idA);
          const parentB = Genetics.founders.find((f) => f.id === idB);
          return {
            hybridId: `prototype-hybrid-${i + 1}`,
            hybridTraits: reachable.traits,
            parentA: { id: parentA.id, traits: parentA.traits },
            parentB: { id: parentB.id, traits: parentB.traits },
          };
        });
      },
      CROSSINGS,
    );
    await captureRow(
      "/tmp/campaign-botany-visual-crossings.png",
      crossingsForShot.flatMap((c, i) => [
        { id: c.parentA.id, traits: c.parentA.traits, stage: 2 },
        { id: c.hybridId, traits: c.hybridTraits, stage: 2 },
        { id: c.parentB.id, traits: c.parentB.traits, stage: 2, gapAfter: i < crossingsForShot.length - 1 ? 2.4 : 1 },
      ]),
      18,
      1.2,
    );

    console.log(
      "PASS campaign-botany-visual:",
      JSON.stringify({
        specimenCount: built.specimenCount,
        founders: FOUNDER_IDS.length,
        stagesPerFounder: 3,
        crossings: built.crossingResults.length,
        overlaps: built.overlaps.length,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-botany-visual:", e.message);
  process.exit(1);
});
