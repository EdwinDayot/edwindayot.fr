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
    itemIcon(id) {
      this.iconCache ??= new Map();
      if (this.iconCache.has(id)) return this.iconCache.get(id);
      if (!this.iconRenderer) {
        this.iconRenderer = new T.WebGLRenderer({
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: true,
        });
        this.iconRenderer.setSize(96, 96);
        this.iconRenderer.outputColorSpace = T.SRGBColorSpace;
        this.iconRenderer.toneMapping = T.ACESFilmicToneMapping;
      }
      const scene = new T.Scene();
      scene.add(new T.HemisphereLight(0xfff7df, 0x71856b, 3));
      const light = new T.DirectionalLight(0xffefd8, 2);
      light.position.set(-3, 5, 4);
      scene.add(light);
      let item;
      if (D.recipes[id]) item = this.equipment(id);
      else if (id.includes(":")) {
        item = new T.Group();
        this.shape(
          item,
          "box",
          this.mat.cream,
          [0, 0.35, 0],
          [0.7, 0.75, 0.22],
        );
        const plant = B.create(id.split(":")[1]);
        plant.scale.setScalar(0.37);
        plant.position.set(0, 0.3, 0.2);
        item.add(plant);
      } else if (["axe", "pickaxe", "shovel"].includes(id))
        item = this.miningTool(id);
      else if (id === "water") {
        item = this.player.userData.can.clone();
        item.position.set(0, 0.6, 0);
        item.scale.setScalar(2.3);
        item.visible = true;
      } else if (id === "hose") {
        item = new T.Group();
        this.shape(
          item,
          new T.TorusGeometry(0.38, 0.085, 8, 20),
          this.mat.metal,
          [0, 0.5, 0],
        );
      } else if (id === "hand") {
        item = new T.Group();
        this.shape(
          item,
          "ball",
          this.mat.cream,
          [0, 0.45, 0],
          [0.27, 0.3, 0.12],
        );
        for (let i = 0; i < 4; i++)
          this.shape(
            item,
            "ball",
            this.mat.cream,
            [-0.21 + i * 0.14, 0.75, 0],
            [0.07, 0.2, 0.07],
          );
      } else {
        item = new T.Group();
        this.shape(
          item,
          id === "wood" ? "cylinder" : "ball",
          id === "wood"
            ? this.mat.wood
            : id === "clay"
              ? this.mat.soil
              : this.mat.stone,
          [0, 0.4, 0],
          [0.7, 0.6, 0.7],
        );
      }
      item.traverse((o) => o.layers.set(0));
      scene.add(item);
      const bounds = new T.Box3().setFromObject(item),
        center = bounds.getCenter(new T.Vector3()),
        size = bounds.getSize(new T.Vector3()),
        span = Math.max(size.x, size.y, size.z) * 0.73;
      const camera = new T.OrthographicCamera(
        -span,
        span,
        span,
        -span,
        0.1,
        30,
      );
      camera.position.copy(center).add(new T.Vector3(3, 2.2, 4));
      camera.lookAt(center);
      this.iconRenderer.render(scene, camera);
      const url = this.iconRenderer.domElement.toDataURL();
      this.iconCache.set(id, url);
      return url;
    },
    action(kind, target) {
      this.effect = {
        kind,
        start: this.time,
        x: target?.x ?? this.position.x,
        z: target?.z ?? this.position.z,
      };
      this.fx[0].material.color.setHex(
        kind === "mine"
          ? { wood: 0xc99c67, stone: 0xa9afa2, clay: 0xc98d65 }[target?.type] ||
              0xc99c67
          : 0x9acfd3,
      );
      for (const particle of this.fx)
        particle.scale.set(
          ...(kind === "mine" ? [0.045, 0.035, 0.04] : [0.025, 0.055, 0.025]),
        );
    },
    // Shared by inspect()/endInspection() and beginNightfallTransition()/endNightfallTransition()
    // below (originally two independent copies of the same capture/restore pair, found
    // duplicated by /code-review during epic C2.2v and merged here so a future fix to this
    // logic only has to happen once).
    snapshotCamera() {
      return {
        angle: this.angle,
        span: this.span,
        look: this.look.clone(),
        position: this.camera.position.clone(),
        overview: this.overview,
      };
    },
    restoreCamera(saved) {
      this.angle = saved.angle;
      this.span = saved.span;
      this.overview = saved.overview;
      this.look.copy(saved.look);
      this.camera.position.copy(saved.position);
      this.camera.lookAt(this.look);
    },
    inspect(entity) {
      if (!entity || entity.stored) return false;
      if (!this.inspection) this.previousCamera = this.snapshotCamera();
      const model = this.models.get(entity.id),
        node = model?.root || this.nodes.get(entity.id);
      if (!node) return false;
      const bounds = new T.Box3().setFromObject(node),
        size = bounds.getSize(new T.Vector3()),
        center = bounds.getCenter(new T.Vector3());
      // Reserve the lower sheet on phones and the right sheet on wide displays.
      const diagonal = Math.hypot(size.x, size.z),
        span = Math.max(
          3,
          (size.y * 0.75 + diagonal * 0.65) / (this.ratio < 1 ? 0.54 : 0.76),
          diagonal / (this.ratio * (this.ratio < 1 ? 0.78 : 0.62)),
        );
      this.inspection = { id: entity.id, center, span };
      this.routes = [];
      return true;
    },
    endInspection() {
      if (!this.inspection) return;
      const old = this.previousCamera;
      this.inspection = null;
      this.restoreCamera(old);
    },
    // Epic C2.2v: nightfall's scripted camera transition, a sibling of inspect()/
    // endInspection() above — same shape (capture the previous camera once via snapshotCamera(),
    // hand updateCamera a target+span to lerp toward, restore via restoreCamera() on close),
    // pointed at the refuge house's fixed world position instead of an entity's live bounding
    // box. Deliberately never touches this.position/game.s.player: the mandate's own instruction
    // is to build this as a sibling of the inspect() mechanism, which is camera-only, never a
    // teleport of the player entity — "brings the player character to the refuge house" is the
    // camera bringing the *view* there, exactly like inspect() frames an entity without moving it.
    beginNightfallTransition() {
      if (this.nightfall) return;
      this.previousNightfallCamera = this.snapshotCamera();
      const CampaignHouse = window.GardenRenderCampaignHouse,
        x = CampaignHouse?.CAMPAIGN_HOUSE_X ?? 0,
        z = CampaignHouse?.CAMPAIGN_HOUSE_Z ?? 0;
      this.nightfall = {
        center: new T.Vector3(x, Terrain.terrainHeight(x, z) + 0.9, z),
        span: 9,
      };
      this.routes = [];
    },
    endNightfallTransition() {
      if (!this.nightfall) return;
      const old = this.previousNightfallCamera;
      this.nightfall = null;
      this.restoreCamera(old);
    },
    // Epic C5.14 (design §14, mise en scène observable de la persistance/réparation). A third
    // sibling of inspect()/beginNightfallTransition() above, same shape again: capture the
    // previous camera once, hand updateCamera a target+span to lerp toward, restore on close.
    // Pointed at a Rainelle's own live model group (this.rainelleModels, built by render-flow.js's
    // sync() since C5.11/C5.13) rather than an entity's bounding box or a fixed world position —
    // "position/état réels de C5.5/C5.10/C5.11", never a fabricated animation. Called by
    // garden-dispatch.js's "confirm-night", right after "sleep" hands back a real result.scenes
    // entry (garden-state-cmd-f.js) — never speculatively, never for a Rainelle with no visible
    // model yet (frame() only ever creates one once a cultivar exists to draw foliage from,
    // render-flow.js's own guard). Deliberately never touches this.position/game.s.player, same
    // reasoning as nightfall: cosmetic camera-only, no teleport.
    beginGestureScene(scene) {
      if (this.gestureScene) return false; // one scene at a time — see garden-dispatch.js's own
      // comment: two reveals the same night is a rare edge case this file simply does not queue.
      const rm = this.rainelleModels.get(scene.rainelleId);
      if (!rm) return false;
      this.previousGestureCamera = this.snapshotCamera();
      const bounds = new T.Box3().setFromObject(rm.group),
        center = bounds.getCenter(new T.Vector3()),
        size = bounds.getSize(new T.Vector3());
      this.gestureScene = {
        rainelleId: scene.rainelleId,
        kind: scene.kind,
        center,
        span: Math.max(4, Math.hypot(size.x, size.z) * 3),
        start: this.time,
        // Brief and fixed (design §14 accessibility: "permettre de raccourcir une scène... tout
        // en gardant les conséquences") — garden-frame.js ends it on its own once this elapses,
        // never blocking on player input; Échap/closePanel (garden-cmd.js) still end it sooner.
        duration: 3.5,
      };
      this.routes = [];
      return true;
    },
    endGestureScene() {
      if (!this.gestureScene) return;
      const old = this.previousGestureCamera;
      this.gestureScene = null;
      this.restoreCamera(old);
    },
    // Epic C6.21 (design §10, chapitre 18, dernier paragraphe : "les dernières images utilisent
    // les vrais cultivars, pièces et individus de la partie"). A fourth sibling of inspect()/
    // beginNightfallTransition()/beginGestureScene() above, same capture/restore shape via
    // snapshotCamera()/restoreCamera() — but framing a short SEQUENCE of real shots rather than a
    // single target, per the mandate's own "au choix de l'Artisan, documenté : un court
    // enchaînement de plans" option. Chosen over one single wide shot: the house, a real specimen
    // and a real Rainelle can be tens of units apart on the map (a Rainelle only ever settles at
    // the chapter-17 passage, far from the refuge house), so one shot wide enough to include all of
    // them would no longer read as "cadrer" anything — the exact opposite of design §14's own
    // "silhouette porte l'identité... lisibilité" principle. Each shot gets the same fixed
    // duration; the current shot is derived purely from elapsed time (this.time - start, clamped
    // to the last shot once the sequence has fully played), so nothing but currentEpilogueShot()
    // below needs to track an index — no separate timer/state machine, no garden-frame.js wiring.
    // No auto-close once the sequence rests on its last shot: this is a one-time, once-per-game
    // closing beat the player reads at their own pace (same "stays open until acted on" posture as
    // the "nightfall"/"teaching" panels), ended only by Échap/closePanel (garden-cmd.js).
    beginEpilogueScene() {
      if (this.epilogueScene) return false;
      const s = this.game.s;
      const CampaignHouse = window.GardenRenderCampaignHouse,
        houseX = CampaignHouse?.CAMPAIGN_HOUSE_X ?? 0,
        houseZ = CampaignHouse?.CAMPAIGN_HOUSE_Z ?? 0;
      const shots = [];
      // Shot 1, always: the refuge house together with the gifted plant beside it — always real by
      // this point (render-flow.js's sync() builds epilogueGiftModel synchronously, since
      // A.execute calls view.sync() on every successful command, garden-cmd.js, before
      // garden-dispatch.js's "open-epilogue" case ever calls this method). Framed together, never
      // as two separate shots: both sit within a few units of each other by construction (the
      // gift's own fixed position, render-flow.js), so one shot already reads both clearly.
      const housePoints = [
        new T.Vector3(houseX, Terrain.terrainHeight(houseX, houseZ) + 0.9, houseZ),
      ];
      if (this.epilogueGiftModel) {
        const b = new T.Box3().setFromObject(this.epilogueGiftModel);
        housePoints.push(b.getCenter(new T.Vector3()));
      }
      const houseBox = new T.Box3().setFromPoints(housePoints),
        houseSize = houseBox.getSize(new T.Vector3());
      shots.push({
        center: houseBox.getCenter(new T.Vector3()),
        span: Math.max(9, Math.hypot(houseSize.x, houseSize.z) * 1.4),
      });
      // Shot 2, only if a real specimen the player actually planted exists (s.specimens, C1.6) —
      // built transiently for this shot only, reusing botany-hybrids.js's own organ library
      // (never a second rendering system): no persistent per-specimen Group exists anywhere in the
      // game yet (verified: render-flow.js's sync() never reads s.specimens), and building one
      // permanently is a separate, larger epic this mandate does not ask for. Removed again by
      // endEpilogueScene() below — this Group never outlives the scene.
      let transientSpecimen = null;
      const Hybrids = window.GardenBotanyHybrids;
      if (Hybrids && s.specimens.length) {
        const specimen = s.specimens[0],
          cultivar = s.cultivars.find((c) => c.id === specimen.cultivarId);
        if (cultivar) {
          transientSpecimen = Hybrids.buildSpecimenGroup(
            cultivar,
            specimen.stage ?? Hybrids.MATURE_STAGE,
          );
          transientSpecimen.position.set(
            specimen.x,
            Terrain.terrainHeight(specimen.x, specimen.z),
            specimen.z,
          );
          this.scene.add(transientSpecimen);
          const b = new T.Box3().setFromObject(transientSpecimen),
            size = b.getSize(new T.Vector3());
          shots.push({
            center: b.getCenter(new T.Vector3()),
            span: Math.max(4, Math.hypot(size.x, size.z) * 3),
          });
        }
      }
      // Shot 3, only if a real Rainelle already has a visible model (this.rainelleModels,
      // C5.11/C5.13) — never fabricated, never forced onto screen if none exists.
      const firstRainelle = this.rainelleModels.values().next().value;
      if (firstRainelle) {
        const b = new T.Box3().setFromObject(firstRainelle.group),
          size = b.getSize(new T.Vector3());
        shots.push({
          center: b.getCenter(new T.Vector3()),
          span: Math.max(4, Math.hypot(size.x, size.z) * 3),
        });
      }
      this.previousEpilogueCamera = this.snapshotCamera();
      this.epilogueScene = { shots, start: this.time, shotDuration: 3.5, transientSpecimen };
      this.routes = [];
      return true;
    },
    // Pure read of this.epilogueScene: which shot is "now", derived from elapsed time alone so
    // updateCamera (render-camera.js) never has to track or advance an index itself. Clamped to
    // the last shot once the whole sequence has played once — the sequence rests there rather than
    // looping or auto-closing (see beginEpilogueScene's own header comment on why).
    currentEpilogueShot() {
      if (!this.epilogueScene) return null;
      const { shots, start, shotDuration } = this.epilogueScene;
      const index = Math.min(
        shots.length - 1,
        Math.floor((this.time - start) / shotDuration),
      );
      return shots[index];
    },
    endEpilogueScene() {
      if (!this.epilogueScene) return;
      if (this.epilogueScene.transientSpecimen)
        this.scene.remove(this.epilogueScene.transientSpecimen);
      const old = this.previousEpilogueCamera;
      this.epilogueScene = null;
      this.restoreCamera(old);
    },
    // Epic C2.5v-b: explicit reset for the teaching trajectory overlay (render-flow.js's sync()
    // otherwise only rebuilds it lazily, keyed on the trajectory's id list) — called by
    // garden-cmd.js's replaceGame so a freshly imported/restored save never keeps a stale overlay
    // built from a different campaignStations registry (see replaceGame's own comment on why the
    // id-list cache key alone isn't a safe guard across two different games).
    resetTeachingTrajectory() {
      if (this.teachingTrajectoryModel) {
        this.scene.remove(this.teachingTrajectoryModel);
        this.teachingTrajectoryModel = null;
      }
      this.teachingTrajectoryKey = null;
    },
    // Epic C6.21: explicit reset for the epilogue's gifted plant model (render-flow.js's sync()
    // otherwise only ever builds it once and never again — see its own "not yet built" guard) —
    // called by garden-cmd.js's replaceGame so a freshly imported/restored save never keeps a
    // stale gift plant built from a DIFFERENT game's s.campaignEpilogue.gift (a different founder
    // species, or no gift at all yet), same "explicit reset across two different games" posture as
    // resetTeachingTrajectory above.
    resetEpilogueGift() {
      if (this.epilogueGiftModel) {
        this.scene.remove(this.epilogueGiftModel);
        this.epilogueGiftModel = null;
      }
    },
    showPreview(b) {
      this.batchDirty = true;
      if (this.preview) {
        this.scene.remove(this.preview);
        this.preview.traverse((o) => {
          if (o.isMesh && o.material.userData.preview) o.material.dispose();
        });
      }
      if (!b) {
        this.preview = null;
        this.overview = false;
        return;
      }
      this.preview = this.equipment(b.item);
      this.preview.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.userData.preview = true;
          o.material.transparent = true;
          o.material.opacity = 0.42;
          o.castShadow = false;
        }
      });
      this.scene.add(this.preview);
      this.updatePreview(b);
    },
    updatePreview(b) {
      if (!this.preview) return;
      this.preview.position.set(
        b.x,
        Terrain.terrainHeight(b.x, b.z) + 0.025,
        b.z,
      );
      this.preview.rotation.y = (b.rotation * Math.PI) / 2;
      this.preview.traverse((o) => {
        if (o.isMesh) o.material.color.setHex(b.error ? 0xb5654f : 0x628b6a);
      });
    },
    connectionPreview(from, to, valid = true) {
      if (this.linkPreview) {
        this.scene.remove(this.linkPreview);
        this.linkPreview.geometry.dispose();
        this.linkPreview.material.dispose();
        this.linkPreview = null;
      }
      if (!from || !to) return;
      this.linkPreview = new T.Line(
        new T.BufferGeometry().setFromPoints([
          new T.Vector3(from.x, 0.3, from.z),
          new T.Vector3(to.x, 0.3, to.z),
        ]),
        new T.LineDashedMaterial({
          color: valid ? 0x3f8a70 : 0xb65e48,
          dashSize: 0.2,
          gapSize: 0.12,
        }),
      );
      this.linkPreview.computeLineDistances();
      this.scene.add(this.linkPreview);
    },
  });
})();
