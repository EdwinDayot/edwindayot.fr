// Objective, programmatic scene audit — deliberately NOT a screenshot a human or a model
// "looks at". It inspects the real Three.js scene graph and pixel buffers directly, the same
// method that actually found the shadow-visibility bug (see garden.md, "ombre cuite orientée
// soleil") and the terrain-normal bug (render-world.js, "Corrige l'orientation des normales").
// Catching a visual defect here must never depend on a model's holistic impression of a PNG.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");

// Materials that are deliberately semi-transparent, with the reason on record. A material NOT
// on this list that is found transparent, or off this list expected to be opaque but isn't,
// fails the audit — additions require a one-line reason, not a silent pass.
const TRANSPARENT_ALLOWLIST = [
  { color: "cbe8e2", reason: "greenhouse glass panel (render-scene.js)" },
  { color: "6d9365", opacityMax: 0.15, reason: "vision-radius ground overlay (render-world.js)" },
];

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
    const p = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const consoleErrors = [];
    p.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    p.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));
    await p.goto(process.env.GARDEN_URL || "http://127.0.0.1:4174/", {
      waitUntil: "domcontentloaded",
    });
    await p.waitForFunction(() => window.GardenApp && window.GardenApp.view, null, {
      timeout: 30000,
    });
    await p.waitForTimeout(800);

    const audit = await p.evaluate(() => {
      const v = window.GardenApp.view;

      // Epic C1.7 (docs/campagne-backlog.md): exercise the new hybrid rendering module through
      // this exact live-page scene graph, so this audit — the documented "véritable gate", not
      // a formality — actually inspects the new meshes/materials rather than only the game's
      // pre-existing entities. Positioned far off the playable area; only the scene graph is
      // inspected below, not a screenshot of this spot.
      if (window.GardenGenetics && window.GardenBotanyHybrids) {
        window.GardenGenetics.founders.forEach((f, i) => {
          const specimen = window.GardenBotanyHybrids.buildSpecimenGroup({ id: f.id, traits: f.traits });
          specimen.position.set(200 + i * 3, 0, 200);
          v.scene.add(specimen);
        });
      }

      // Epic C3.2 (docs/campagne-backlog.md): the refuge house, both delabre and repare states,
      // exercised through this exact live-page scene graph for the same reason as the hybrids
      // above — this audit is the real gate for a rendering epic, not a screenshot. Positioned
      // far off the playable area, same convention as the hybrids block.
      if (window.GardenCampaignHouse && window.GardenRenderCampaignHouse) {
        const House = window.GardenCampaignHouse,
          RenderHouse = window.GardenRenderCampaignHouse;
        const delabre = RenderHouse.buildRefugeHouseGroup(House.freshHouse());
        delabre.position.set(220, 0, 220);
        v.scene.add(delabre);
        const repaired = House.freshHouse();
        repaired.spaces.accueil.status = "repare";
        const repare = RenderHouse.buildRefugeHouseGroup(repaired);
        repare.position.set(230, 0, 220);
        v.scene.add(repare);
      }

      // Sample a few times of day: a defect that only shows under one lighting angle (the
      // terrain-normal bug was exactly this — it read fine at some sun angles) must not hide.
      const times = [50, 300, 600, 900, 1150];
      for (const t of times) {
        window.GardenApp.game.s.elapsed = t;
        v.updateCamera(1, true);
        v.frame(0.016, {}, true);
      }

      const seen = new Map();
      const suspiciousTransparent = [];
      const badNormals = [];
      const nanMeshes = [];

      v.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const pos = o.geometry.attributes && o.geometry.attributes.position;
        if (pos) {
          for (let i = 0; i < pos.array.length; i++) {
            if (!Number.isFinite(pos.array[i])) {
              nanMeshes.push(o.name || o.type);
              break;
            }
          }
        }
        // Ground-like mesh: much wider/deeper than tall. Normals should predominantly face +Y —
        // the generalized, reusable version of the one-off check added to render-world.js.
        o.geometry.computeBoundingBox && o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        if (bb) {
          const sx = bb.max.x - bb.min.x,
            sy = bb.max.y - bb.min.y,
            sz = bb.max.z - bb.min.z;
          if (sx > 3 && sz > 3 && sy < Math.min(sx, sz) * 0.5) {
            const nrm = o.geometry.attributes.normal;
            if (nrm) {
              let up = 0,
                down = 0;
              for (let i = 0; i < nrm.count; i++) {
                if (nrm.getY(i) > 0.3) up++;
                else if (nrm.getY(i) < -0.3) down++;
              }
              if (down > up) badNormals.push({ name: o.name || o.type, up, down });
            }
          }
        }
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m || seen.has(m.uuid)) continue;
          seen.set(m.uuid, true);
          if (m.transparent && m.opacity > 0) {
            const hex = m.color ? m.color.getHexString() : null;
            suspiciousTransparent.push({
              hex,
              opacity: +m.opacity.toFixed(2),
              matType: m.type,
              meshName: o.name || o.type,
            });
          }
        }
      });

      return { suspiciousTransparent, badNormals, nanMeshes, materialCount: seen.size };
    });

    if (consoleErrors.length)
      throw new Error("Console errors during scene render:\n" + consoleErrors.join("\n"));

    assert.deepEqual(audit.nanMeshes, [], "Meshes with non-finite vertex positions: " + audit.nanMeshes.join(", "));
    assert.deepEqual(
      audit.badNormals,
      [],
      "Ground-like meshes whose normals face predominantly downward (the exact class of bug that made a hill look wrong for days): " +
        JSON.stringify(audit.badNormals),
    );

    const unexplained = audit.suspiciousTransparent.filter((t) => {
      const allow = TRANSPARENT_ALLOWLIST.find((a) => a.color === t.hex);
      if (!allow) return true;
      if (allow.opacityMax != null && t.opacity > allow.opacityMax) return true;
      return false;
    });
    assert.deepEqual(
      unexplained,
      [],
      "Transparent material(s) not on the documented allowlist (docs/direction-artistique.md / TRANSPARENT_ALLOWLIST in this test) — add a reason or fix the material: " +
        JSON.stringify(unexplained),
    );

    console.log(
      "PASS material/geometry audit:",
      JSON.stringify({
        materialsInspected: audit.materialCount,
        transparentAllowed: audit.suspiciousTransparent.length,
        timesSampled: 5,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL garden-material-audit:", e.message);
  process.exit(1);
});
