(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    C = window.GardenConstruction,
    B = window.GardenBotany,
    Terrain = window.GardenTerrain,
    G = window.GardenView;
  if (!T || !M || !B || !Terrain || !G) return;
  Object.assign(G.prototype, {
    sync() {
      const s = this.game.s,
        ids = new Set(s.entities.filter((e) => !e.stored).map((e) => e.id));
      for (const [id, m] of this.models) {
        if (!ids.has(id)) {
          this.scene.remove(m.root);
          this.models.delete(id);
          this.batchDirty = true;
        }
      }
      for (const e of s.entities) {
        if (e.stored) continue;
        let m = this.models.get(e.id);
        if (m && (m.type !== e.type || (!e.plant && m.foliage))) {
          this.scene.remove(m.root);
          this.models.delete(e.id);
          m = null;
        }
        if (!m) {
          const root = this.equipment(e.type);
          this.scene.add(root);
          m = {
            type: e.type,
            root,
            species: null,
            foliage: null,
            marker: this.label("", 0, 2.4, 0, 1),
          };
          this.models.set(e.id, m);
          this.batchDirty = true;
        }
        if (e.type === "nursery" && m.jobSpecies !== (e.job?.species || null)) {
          if (m.cutting) m.root.remove(m.cutting);
          m.cutting = null;
          m.jobSpecies = e.job?.species || null;
          if (e.job) {
            m.cutting = B.create(e.job.species);
            m.cutting.scale.setScalar(0.22);
            m.cutting.position.y = 0.88;
            m.root.add(m.cutting);
          }
          this.batchDirty = true;
        }
        m.root.userData.target = e.id;
        m.root.position.set(e.x, Terrain.terrainHeight(e.x, e.z), e.z);
        m.root.rotation.y = (e.rotation * Math.PI) / 2;
        if (e.plant && m.species !== e.plant.species) {
          if (m.foliage) m.root.remove(m.foliage);
          m.foliage = B.create(e.plant.species);
          m.foliage.position.y = 0.66;
          m.root.add(m.foliage);
          m.species = e.plant.species;
          this.batchDirty = true;
          m.sprout = new T.Group();
          this.shape(
            m.sprout,
            "cylinder",
            this.mat.grass,
            [0, 0.14, 0],
            [0.05, 0.28, 0.05],
          );
          for (const a of [-1, 1])
            this.shape(
              m.sprout,
              "ball",
              this.mat.grass,
              [a * 0.11, 0.25, 0],
              [0.14, 0.035, 0.07],
            );
          m.sprout.position.y = 0.65;
          m.root.add(m.sprout);
          m.crop = this.shape(
            m.root,
            "ball",
            M.mat(0xeac987),
            [0.35, 1.05, 0.35],
            [0.11, 0.11, 0.11],
          );
        }
      }
      for (const z of D.zones) {
        const open = s.unlocked.includes(z.id),
          m = this.zoneModels[z.id];
        m.gate.visible = !open && z.id !== 0;
        m.group.children[0].material.color.setHex(
          open ? D.zoneGroundColors[z.id] : 0xa4b29a,
        );
      }
      for (const r of s.resources) {
        const n = this.nodes.get(r.id);
        n.visible = s.unlocked.includes(r.zone) && C.resourceClear(s, r);
        n.userData.full.visible = r.ready <= s.elapsed;
        n.userData.depleted.visible = r.ready > s.elapsed;
        if (n.userData.shoot)
          n.userData.shoot.scale.setScalar(
            Math.max(0.15, 1 - (r.ready - s.elapsed) / D.mining[r.type].renew),
          );
      }
      for (const c of D.caches)
        this.nodes.get(c.id).visible =
          s.unlocked.includes(c.zone) && !s.discovered.includes(c.species);
      // Epic C2.2v: rebuild the refuge house only when the one field its appearance actually
      // depends on (repairHouseSpace, garden-state-cmd-l.js) has changed since the last sync —
      // never every ~0.25s tick like the rest of this method's per-frame reads above.
      if (
        s.campaignHouse?.spaces?.accueil?.status !==
        this.campaignHouseAccueilStatus
      )
        this.buildCampaignHouse();
      // Epic C6.14: rebuild the passage point only when `blocked` actually flips since the last
      // sync (restorePassage, garden-state-cmd-w.js) — same "checked here, rebuilt only on real
      // change" pattern the campaignHouse check just above already uses for its own one field.
      if (!!s.campaignPassage?.blocked !== this.campaignPassageBlocked)
        this.buildCampaignPassage();
      // Epic C5.11: a Rainelle joins the real scene the first time it has a real position
      // (garden-state.js's tickRainelleMovement/RainelleMovement.ensurePosition — never guessed
      // here). The Group itself (render-rainelles.js, C5.9) is built once per Rainelle id and
      // cached in `this.rainelleModels`, exactly the "refreshed on position change, never rebuilt
      // every frame" pattern buildCampaignHouse just above already uses for its own one field;
      // only `.position`/`.rotation` are touched on every sync call below, never the geometry.
      const RenderRainelles = window.GardenRenderRainelles;
      if (RenderRainelles)
        for (const r of s.rainelles) {
          if (!Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
          let rm = this.rainelleModels.get(r.id);
          if (!rm) {
            const cultivar = s.cultivars.find((c) => c.id === r.cultivarId);
            if (!cultivar) continue; // no cultivar to draw foliage from yet — nothing to add
            const group = RenderRainelles.buildRainelleGroup(r, cultivar);
            this.scene.add(group);
            rm = { group, x: r.x, z: r.z };
            this.rainelleModels.set(r.id, rm);
            this.batchDirty = true;
          }
          const y = Terrain.terrainHeight(r.x, r.z);
          if (r.x !== rm.x || r.z !== rm.z) {
            // Face the direction actually walked this step — a Rainelle standing still (already
            // on its target cell) keeps whatever heading it last had, never snaps to a default.
            rm.group.rotation.y = Math.atan2(r.x - rm.x, r.z - rm.z);
            rm.x = r.x;
            rm.z = r.z;
          }
          rm.group.position.set(r.x, y, r.z);
        }
      // Epic C7.4: every specimen in the real save (s.specimens, C1.6) gets a persistent Group in
      // the real scene, entirely delegated to render-specimens.js's own syncSpecimenModels (create
      // new/remove disappeared/rebuild on a real stage change) rather than duplicated inline like
      // the rainelle loop just above — that function's own registry-management logic is specific
      // enough to this one case (a rebuild, never a mutation, on stage change) to warrant its own
      // Node-tested module, see that file's header.
      const RenderSpecimens = window.GardenRenderSpecimens;
      if (RenderSpecimens) RenderSpecimens.syncSpecimenModels(this.specimenModels, this.scene, s);
      // Epic C5.13: every borne/zone/panier/habitat in the registry (campaign-stations.js) gets a
      // Group built once per station id and cached in `this.stationModels` — the exact
      // "build once, reposition/update on real change, never rebuild every frame" pattern
      // `this.rainelleModels`/`this.models` already use above. Positions in the registry never
      // change after registration (no relocation command exists for any station kind today), so
      // this only ever sets `.position` once per new id; `updateStationGroup` below still runs
      // every sync() call but is a no-op unless a borne's `priseFortDebit`/a zone's `veilleuse`
      // actually flipped since the group was last built.
      const RenderStations = window.GardenRenderCampaignStations;
      if (RenderStations && s.campaignStations) {
        const liveIds = new Set();
        for (const kind of ["borne", "zone", "panier", "habitat"]) {
          const collection = kind === "borne" ? "bornes" : kind === "zone" ? "zones" : kind === "panier" ? "paniers" : "habitats";
          for (const station of s.campaignStations[collection] || []) {
            liveIds.add(station.id);
            let sm = this.stationModels.get(station.id);
            if (!sm) {
              const group = RenderStations.buildStationGroup(kind, station);
              group.position.set(station.x, Terrain.terrainHeight(station.x, station.z), station.z);
              this.scene.add(group);
              sm = { kind, group };
              this.stationModels.set(station.id, sm);
              this.batchDirty = true;
            }
            RenderStations.updateStationGroup(kind, station, sm.group);
          }
        }
        for (const [id, sm] of this.stationModels) {
          if (!liveIds.has(id)) {
            this.scene.remove(sm.group);
            this.stationModels.delete(id);
            this.batchDirty = true;
          }
        }
      }
      // Epic C2.5v-b (design §5's "un essai montre la trajectoire prévue", deferred from C2.5 to
      // this render epic): while a lesson's draft is in "reviewing" step, its trajectory (C2.5v-a's
      // resolveTrajectory over draft.trajectory, the very same station-id list demonstrateGesture
      // captured) is shown as a ground overlay, same transparent-tile family already whitelisted
      // for "survol de portée" (tests/garden-material-audit.cjs's TRANSPARENT_ALLOWLIST, color
      // 6d9365/opacityMax 0.15 — see render-campaign-teaching.js's own header comment on why this
      // reuses that exact entry rather than adding a new one). Rebuilt only when the trajectory's
      // own id list actually changes (keyed the same "build once, refresh only on real change" way
      // as buildCampaignHouse/rainelleModels/stationModels above), never every sync() call.
      const RenderTeaching = window.GardenRenderCampaignTeaching,
        Trajectory = window.GardenCampaignTeachingTrajectory;
      if (RenderTeaching && Trajectory) {
        const teaching = s.campaignTeaching,
          key =
            teaching && teaching.step === "reviewing"
              ? JSON.stringify(teaching.draft.trajectory)
              : null;
        if (key !== this.teachingTrajectoryKey) {
          this.teachingTrajectoryKey = key;
          if (this.teachingTrajectoryModel) {
            this.scene.remove(this.teachingTrajectoryModel);
            this.teachingTrajectoryModel = null;
          }
          if (key) {
            const resolved = Trajectory.resolveTrajectory(s, teaching.draft.trajectory);
            if (resolved.ok) {
              // Both the resolved station points AND the walked cells between them: a trajectory
              // whose steps collapse to a single station (plannedTrajectory's own "same as the one
              // right before it" filter, rainelles.js) would otherwise resolve to an empty `path`
              // and show nothing at all — deduplicated by cell so an endpoint shared by a point and
              // a path cell never gets two overlapping tiles.
              const cells = new Map();
              for (const p of [...resolved.points, ...resolved.path])
                cells.set(`${p.x},${p.z}`, {
                  x: p.x,
                  y: Terrain.terrainHeight(p.x, p.z) + 0.02,
                  z: p.z,
                });
              if (cells.size)
                this.teachingTrajectoryModel = RenderTeaching.buildTrajectoryOverlayGroup([
                  ...cells.values(),
                ]);
            }
          }
          if (this.teachingTrajectoryModel) {
            this.scene.add(this.teachingTrajectoryModel);
            this.batchDirty = true;
          }
        }
      }
      // Epic C6.21 (design §10, chapitre 18, dernier paragraphe : "une jeune plante offerte par un
      // habitant peut rejoindre la maison"). Built once, the moment C6.20's own
      // s.campaignEpilogue.gift first freezes — never rebuilt afterward, since gift itself is
      // frozen exactly once (openEpilogue is one-way, C6.18) — same "build once, cache" posture as
      // rainelleModels/stationModels above, simplified to a single guard ("not yet built") instead
      // of a per-id Map, since a game only ever has exactly one gift.
      //
      // Reuses botany-hybrids.js's buildSpecimenGroup DIRECTLY on the founder's own {id, traits}
      // shape (never GardenCultivars/the pot draw: design §10 literal, "elle n'a pas été créée par
      // le héros") — the exact same call already exercised, for every founder including
      // "aster-des-vents", by tests/garden-material-audit.cjs's own founders.forEach block, so no
      // new material/mesh is introduced by this epic.
      //
      // Position {-13, 9.5}: verified, not guessed, against the real modules this epic's own
      // mandate names (geometry.js/terrain.js/construction.js), the same discipline
      // render-campaign-house.js's own header comment used for CAMPAIGN_HOUSE_X/Z. The refuge
      // house's real world footprint (measured via Box3 on buildRefugeHouseGroup, rotation
      // included) is x:[-15.0,-11.0] z:[3.7,8.3]; its door faces world +X (design's own
      // "player-facing door" convention, confirmed from the local door offset at local z=-d2
      // rotated by CAMPAIGN_HOUSE_ROTATION_Y). {-13, 9.5} sits 1.2 units north of the house's own
      // wall, away from the east-facing door and the spawn-side approach, still centered on the
      // house's own x. Confirmed flat (terrainHeight and its four cardinal neighbours all exactly
      // 0), inside zone 0 with a 3-unit polygon-edge margin, walkable() true, and clear of every
      // visitor/cache/fresh-save entity (nearest visitor ≈3.85 units away) — checked with a fresh
      // GardenState, not assumed.
      const EPILOGUE_GIFT_X = -13,
        EPILOGUE_GIFT_Z = 9.5;
      const Genetics = window.GardenGenetics,
        Hybrids = window.GardenBotanyHybrids;
      if (!this.epilogueGiftModel && s.campaignEpilogue?.gift && Genetics && Hybrids) {
        const founder = Genetics.founders.find(
          (f) => f.id === s.campaignEpilogue.gift.speciesId,
        );
        if (founder) {
          const group = Hybrids.buildSpecimenGroup({ id: founder.id, traits: founder.traits });
          group.position.set(
            EPILOGUE_GIFT_X,
            Terrain.terrainHeight(EPILOGUE_GIFT_X, EPILOGUE_GIFT_Z),
            EPILOGUE_GIFT_Z,
          );
          this.scene.add(group);
          this.epilogueGiftModel = group;
          this.batchDirty = true;
        }
      }
      const signature = JSON.stringify([
        s.links,
        s.entities.map((e) => [e.id, e.x, e.z, e.stored]),
        s.resources.filter((r) => r.treeId).map((r) => r.ready > s.elapsed),
      ]);
      if (signature !== this.linkSignature) {
        this.linkSignature = signature;
        this.treeData = C.trees(s);
        const dummy = new T.Object3D();
        this.trunks.count = this.treeData.length;
        this.moss.count = this.treeData.length * 2;
        this.treeData.forEach((tree, i) => {
          dummy.position.set(tree.x, 1.7 * tree.scale, tree.z);
          dummy.scale.set(0.55, 3.4 * tree.scale, 0.55);
          dummy.updateMatrix();
          this.trunks.setMatrixAt(i, dummy.matrix);
          for (let j = 0; j < 2; j++) {
            dummy.position.set(tree.x + (j - 0.5) * 0.6, 0.005, tree.z);
            dummy.scale.set(1.7, 0.035, 1.25);
            dummy.updateMatrix();
            this.moss.setMatrixAt(i * 2 + j, dummy.matrix);
          }
        });
        this.trunks.instanceMatrix.needsUpdate = true;
        this.moss.instanceMatrix.needsUpdate = true;
        this.trunks.computeBoundingSphere();
        this.moss.computeBoundingSphere();
        this.flows = [];
        this.batchDirty = true;
        this.connectionGroup.clear();
        for (const [a, b] of s.links) {
          const ea = s.entities.find((e) => e.id === a),
            eb = s.entities.find((e) => e.id === b);
          const points = [
            new T.Vector3(ea.x, 0.095, ea.z),
            new T.Vector3(eb.x, 0.095, ea.z),
            new T.Vector3(eb.x, 0.095, eb.z),
          ];
          for (let i = 0; i < 2; i++) {
            const delta = points[i + 1].clone().sub(points[i]),
              length = delta.length();
            if (length < 0.001) continue;
            const pipe = this.shape(
              this.connectionGroup,
              "cylinder",
              M.mat(0x426e62),
              points[i]
                .clone()
                .add(points[i + 1])
                .multiplyScalar(0.5)
                .toArray(),
              [0.11, length, 0.11],
            );
            pipe.quaternion.setFromUnitVectors(
              new T.Vector3(0, 1, 0),
              delta.normalize(),
            );
          }
          for (const point of points)
            this.shape(
              this.connectionGroup,
              "ball",
              this.mat.metal,
              point.toArray(),
              [0.083, 0.07, 0.083],
            );
          const bead = this.shape(
            this.connectionGroup,
            "ball",
            M.mat(0xb2eff0, { emissive: 0x438e9b, emissiveIntensity: 0.35 }),
            [ea.x, 0.14, ea.z],
            [0.075, 0.05, 0.075],
          );
          this.flowArrowGeometry ??= new T.ConeGeometry(0.085, 0.25, 8);
          const arrow = this.shape(
            this.connectionGroup,
            this.flowArrowGeometry,
            M.mat(0xb2eff0, { emissive: 0x438e9b, emissiveIntensity: 0.35 }),
            [0, 0.14, 0],
          );
          this.flows.push({ bead, arrow, a: ea, b: eb, points, rate: 0 });
        }
      }
    },
    go(target) {
      this.routes = C.approach(this.game.s, this.position, target);
      this.selected = target;
      return this.routes.length > 0 || C.distance(this.position, target) < 1.85;
    },
    terrain(point) {
      const q = {
        x: Math.round(point.x * 2) / 2,
        z: Math.round(point.z * 2) / 2,
      };
      this.routes = C.path(this.game.s, this.position, q);
      return this.routes.length > 0;
    },
    pick(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((clientX - r.left) / r.width) * 2 - 1,
        (-(clientY - r.top) / r.height) * 2 + 1,
      );
      this.ray.setFromCamera(this.pointer, this.camera);
      const ray = this.ray.ray,
        dirY = ray.direction.y;
      if (dirY >= 0) return null; // this game's camera never looks upward
      const at = (t) => ({
        x: ray.origin.x + ray.direction.x * t,
        z: ray.origin.z + ray.direction.z * t,
        y: ray.origin.y + dirY * t,
      });
      // Bisection against the real heightfield, bracketed by y=MAX_HEIGHT
      // (provably at or above every hill, so the ray is still above ground
      // there) and y=0 (the flat floor, so the ray has reached or passed
      // through ground by then) — replaces an earlier "reproject onto a
      // flat plane, then jump straight to whatever height that guess
      // landed on" approach. That single-jump reprojection could overshoot
      // an entire hill and land on a distant flat point that coincidentally
      // matched its own convergence check, producing a real, player-visible
      // aiming error once Épic 4.2's hills got tall enough (reproduced via
      // a pot-placement test near the zone0 hill) — bisection can't skip
      // over a bump like that since it only ever narrows the bracket.
      let lo = (Terrain.MAX_HEIGHT - ray.origin.y) / dirY,
        hi = -ray.origin.y / dirY;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2,
          p = at(mid);
        if (p.y - Terrain.terrainHeight(p.x, p.z) >= 0) lo = mid;
        else hi = mid;
      }
      const point = at((lo + hi) / 2);
      return { x: point.x, z: point.z };
    },
  });
})();
