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
