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

      // Epic C5.9 (docs/campagne-backlog.md): Rainelle bodies, exercised through this exact
      // live-page scene graph for the same reason as the hybrids/house blocks above — this audit
      // is the real gate for a rendering epic, never a screenshot a model merely looks at.
      // Several cultivars, plus two individuals of the SAME cultivar side by side (to exercise
      // the shared-geometry/distinct-mark guarantee against the real scene graph, not just the
      // Node-only unit tests). Positioned far off the playable area.
      if (window.GardenGenetics && window.GardenRenderRainelles) {
        const founders = window.GardenGenetics.founders;
        founders.forEach((f, i) => {
          const rainelle = window.GardenRenderRainelles.buildRainelleGroup(
            { id: "audit-r-" + f.id },
            { id: f.id, traits: f.traits },
          );
          rainelle.position.set(200 + i * 1.2, 0, 210);
          v.scene.add(rainelle);
        });
        const twin = founders[0];
        const twinA = window.GardenRenderRainelles.buildRainelleGroup(
          { id: "audit-twin-a" },
          { id: twin.id, traits: twin.traits },
        );
        twinA.position.set(200, 0, 213);
        v.scene.add(twinA);
        const twinB = window.GardenRenderRainelles.buildRainelleGroup(
          { id: "audit-twin-b" },
          { id: twin.id, traits: twin.traits },
        );
        twinB.position.set(201.2, 0, 213);
        v.scene.add(twinB);
      }

      // Epic C5.11 (docs/campagne-backlog.md): the render.js/render-flow.js wiring itself —
      // this epic's own criterion, "un point d'appel réel dans render.js/garden-frame.js...
      // jamais reconstruit à chaque frame" — exercised through the REAL live game state
      // (window.GardenApp.game.s) and the real v.sync() call site, not an isolated
      // buildRainelleGroup() call like the C5.9 block just above (which only ever exercised the
      // rendering module in isolation, never sync()'s own new branch). A synthetic cultivar
      // (borrowing a real founder's traits — only the {id, name, parentIds, traits} shape
      // matters to buildRainelleGroup) and a Rainelle referencing it are pushed directly into the
      // live save, bypassing "sleep"/the frog encounter — the same posture the hybrids/house/C5.9
      // blocks above already use, since this audit exercises rendering, never the commands that
      // would normally lead to this state — with a real, finite, off-the-playable-area position
      // so v.sync() actually builds and positions a Group through the exact code path a real
      // session's own render loop (garden-frame.js's own `A.view.sync()`) uses every frame.
      if (window.GardenGenetics && window.GardenApp.game) {
        const s = window.GardenApp.game.s;
        const f = window.GardenGenetics.founders[0];
        s.cultivars.push({
          id: "audit-c5.11-cultivar",
          name: "Test C5.11",
          parentIds: [],
          traits: f.traits,
        });
        s.rainelles.push({
          id: "audit-c5.11-rainelle",
          cultivarId: "audit-c5.11-cultivar",
          name: "",
          geste: null,
          job: null,
          bourgeon: null,
          founder: false,
          x: 205,
          z: 216,
        });
        v.sync();
      }

      // Epic C5.13 (docs/campagne-backlog.md): the campaign stations registry (bornes/zones/
      // paniers/habitats, campaign-stations.js) rendered through this exact live-page scene
      // graph, same reason as every block above — this audit is the real gate for a rendering
      // epic, never a screenshot a model merely looks at. No command places a station in a real
      // save yet (verified, see this module's own header), so stations are pushed directly into
      // the live save's registry, same posture the C5.11 block above already uses for its own
      // synthetic cultivar/Rainelle. One of each kind, PLUS a second borne/zone with their signal
      // flag (priseFortDebit/veilleuse) turned on, to exercise the emissive-signal branch against
      // the real scene graph, not just the Node-only unit tests
      // (tests/campaign-station-render.cjs). Positioned far off the playable area.
      if (window.GardenCampaignStations && window.GardenRenderCampaignStations && window.GardenApp.game) {
        const s = window.GardenApp.game.s;
        const Stations = window.GardenCampaignStations;
        s.campaignStations ??= { bornes: [], zones: [], paniers: [], borneNextId: 1, zoneNextId: 1, panierNextId: 1, habitats: [], habitatNextId: 1 };
        Stations.registerStation(s.campaignStations, "borne", { x: 240, z: 200 });
        const activeBorne = Stations.registerStation(s.campaignStations, "borne", { x: 241, z: 200 });
        activeBorne.priseFortDebit = true;
        Stations.registerStation(s.campaignStations, "zone", { x: 240, z: 202 });
        const activeZone = Stations.registerStation(s.campaignStations, "zone", { x: 242.5, z: 202 });
        activeZone.veilleuse = true;
        const panier = Stations.registerStation(s.campaignStations, "panier", { x: 240, z: 205 });
        const habitat = Stations.registerStation(s.campaignStations, "habitat", { x: 241, z: 207, capacity: 2 });
        v.sync();
        window.__auditStationIds = { activeBorne: activeBorne.id, activeZone: activeZone.id, panier: panier.id, habitat: habitat.id };
      }

      // Epic C2.5v-b (docs/campagne-backlog.md): a "reviewing" teaching draft's real-world
      // trajectory overlay (C2.5v-a's resolveTrajectory, rendered by
      // render-campaign-teaching.js/render-flow.js's sync()), exercised through this exact
      // live-page scene graph, same reason as every block above — this audit is the real gate for
      // a rendering epic, never a screenshot a model merely looks at. Reuses the exact stations
      // the C5.13 block just above already registered (real, resolvable ids) instead of a second,
      // redundant registry. No command sets s.campaignTeaching to "reviewing" outside the real
      // four-moment flow (garden-state-cmd-k.js) yet, so it is pushed directly into the live save,
      // same posture every block above already uses for state no command places yet.
      if (window.__auditStationIds && window.GardenRenderCampaignTeaching && window.GardenApp.game) {
        const s = window.GardenApp.game.s;
        const ids = window.__auditStationIds;
        s.campaignTeaching = {
          rainelleId: "audit-c5.11-rainelle",
          step: "reviewing",
          draft: {
            verbe: "arroser",
            poste: ids.activeZone,
            source: ids.activeBorne,
            destination: ids.panier,
            condition: "",
            phrase: "Test d'audit.",
            trajectory: [ids.activeBorne, ids.activeZone, ids.panier],
          },
        };
        v.sync();
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

      // Epic C5.11: confirms sync()'s new branch actually ran through the real wiring — a Group
      // was built and cached in `v.rainelleModels` (never rebuilt: same object both times sync()
      // runs again below via the "times" loop's own frame() calls, none of which touch sync()
      // themselves) and positioned at the exact world coordinates this test set on the Rainelle.
      const rm = v.rainelleModels.get("audit-c5.11-rainelle");
      const wiring = rm
        ? {
            found: true,
            inScene: rm.group.parent === v.scene,
            position: rm.group.position.toArray(),
          }
        : { found: false };

      // Epic C5.13: same confirmation as C5.11's wiring block just above, for the stations
      // registered further up — a Group was actually built by sync() through the real
      // v.stationModels cache and added to the scene, not just constructible in isolation (that
      // part is already covered by tests/campaign-station-render.cjs).
      let stationWiring = { found: false };
      if (window.__auditStationIds) {
        const ids = window.__auditStationIds;
        const borneSm = v.stationModels.get(ids.activeBorne);
        const zoneSm = v.stationModels.get(ids.activeZone);
        const panierSm = v.stationModels.get(ids.panier);
        const habitatSm = v.stationModels.get(ids.habitat);
        stationWiring = {
          found: !!(borneSm && zoneSm && panierSm && habitatSm),
          allInScene: [borneSm, zoneSm, panierSm, habitatSm].every((sm) => sm && sm.group.parent === v.scene),
          borneActiveEmissive: borneSm && borneSm.group.userData.bead.material.emissiveIntensity,
          zoneActiveEmissive: zoneSm && zoneSm.group.userData.lamp.material.emissiveIntensity,
        };
      }

      // Epic C2.5v-b: confirms sync()'s new branch actually built and added the trajectory
      // overlay through the real wiring, same "not just constructible in isolation" confirmation
      // as C5.13's stationWiring above (isolated construction is already covered by
      // tests/campaign-teaching-render.cjs).
      const teachingWiring = v.teachingTrajectoryModel
        ? {
            found: true,
            inScene: v.teachingTrajectoryModel.parent === v.scene,
            tileCount: v.teachingTrajectoryModel.children.length,
            hex: v.teachingTrajectoryModel.children[0]?.material.color.getHexString(),
            opacity: v.teachingTrajectoryModel.children[0]?.material.opacity,
          }
        : { found: false };

      return {
        suspiciousTransparent,
        badNormals,
        nanMeshes,
        materialCount: seen.size,
        wiring,
        stationWiring,
        teachingWiring,
      };
    });

    if (consoleErrors.length)
      throw new Error("Console errors during scene render:\n" + consoleErrors.join("\n"));

    assert.equal(audit.wiring.found, true, "C5.11: sync() never built a Group for the live-state Rainelle");
    assert.equal(audit.wiring.inScene, true, "C5.11: the Rainelle's Group was never added to the real scene");
    assert.equal(audit.wiring.position[0], 205, "C5.11: the Rainelle's Group x does not match its rainelle.x");
    assert.equal(audit.wiring.position[2], 216, "C5.11: the Rainelle's Group z does not match its rainelle.z");

    assert.equal(audit.stationWiring.found, true, "C5.13: sync() never built a Group for one of the four registered stations");
    assert.equal(audit.stationWiring.allInScene, true, "C5.13: a station Group was never added to the real scene");
    assert.equal(audit.stationWiring.borneActiveEmissive, 0.35, "C5.13: an active borne's bead is not emissive at the documented signal intensity");
    assert.equal(audit.stationWiring.zoneActiveEmissive, 0.35, "C5.13: an active zone's lamp is not emissive at the documented signal intensity");

    assert.equal(audit.teachingWiring.found, true, "C2.5v-b: sync() never built the teaching trajectory overlay Group");
    assert.equal(audit.teachingWiring.inScene, true, "C2.5v-b: the trajectory overlay Group was never added to the real scene");
    assert.ok(audit.teachingWiring.tileCount >= 3, "C2.5v-b: expected at least one tile per resolved station point");
    assert.equal(audit.teachingWiring.hex, "6d9365", "C2.5v-b: the overlay must reuse the documented 'survol de portée' hex, not an invented tint");
    assert.ok(audit.teachingWiring.opacity <= 0.15, "C2.5v-b: overlay opacity exceeds the documented allowlist ceiling for color 6d9365");

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
