(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    C = window.GardenConstruction,
    B = window.GardenBotany,
    Terrain = window.GardenTerrain;
  if (!T || !M || !B || !Terrain) return;
  class GardenView {
    constructor(canvas, game) {
      this.game = game;
      this.canvas = canvas;
      this.scene = new T.Scene();
      this.scene.background = new T.Color(0xdce7d4);
      this.scene.fog = new T.Fog(0xdce7d4, 35, 75);
      this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
      this.renderer.setPixelRatio(
        Math.min(
          devicePixelRatio,
          matchMedia("(pointer: coarse)").matches ? 1 : 1.5,
        ),
      );
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.camera = new T.OrthographicCamera(-10, 10, 7, -7, 0.1, 100);
      this.camera.position.set(7, 13, 16);
      this.camera.lookAt(0, 0, 0);
      this.span = 17;
      this.held = "hand";
      this.speed = 3.6;
      this.treeData = [];
      this.angle = 0.18;
      this.overview = false;
      this.selected = null;
      this.network = false;
      this.time = 0;
      this.models = new Map();
      this.zoneModels = [];
      this.nodes = new Map();
      this.routes = [];
      this.effect = null;
      this.preview = null;
      this.linkSignature = "";
      this.flows = [];
      this.batches = [];
      this.batchDirty = true;
      this.frames = 0;
      this.frameTime = 0;
      this.quality = 1;
      this.mobile =
        matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
      this.quality = this.mobile ? 1 : 2;
      this.qualityClock = 0;
      this.slowTime = 0;
      this.ambient = new T.HemisphereLight(0xfff7df, 0x69816f, 0.8);
      this.scene.add(this.ambient);
      for (const name of ["sun", "moon"]) {
        const light = new T.DirectionalLight(
          name === "sun" ? 0xffeaca : 0x9bbaff,
          0,
        );
        light.castShadow = true;
        light.shadow.normalBias = 0.025;
        light.shadow.bias = -0.00015;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 180;
        this.scene.add(light, light.target);
        this[name] = light;
      }
      this.localLights = Array.from({ length: 4 }, () => {
        const light = new T.PointLight(0xffbe73, 0, 6, 2);
        light.shadow.camera.near = 0.08;
        light.shadow.camera.far = 7;
        light.shadow.bias = -0.001;
        light.shadow.normalBias = 0.015;
        this.scene.add(light);
        return light;
      });
      this.setQuality(this.quality);
      this.geo = {
        box: new T.BoxGeometry(1, 1, 1),
        ball: new T.SphereGeometry(1, 12, 8),
        cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 16),
      };
      this.mat = {
        grass: M.mat(0xaabd8c),
        wood: M.mat(0xb99670),
        bark: M.mat(0x8a7156),
        stone: M.mat(0xc5c5b2),
        water: M.mat(0x80c3c3, { roughness: 0.25 }),
        fertilizer: M.mat(0x8a6a3e, { roughness: 0.4 }),
        cream: M.mat(0xeedeb9),
        metal: M.mat(0x8aafa4),
        soil: M.mat(0xb99875),
      };
      this.world();
      this.player = this.person(0xedc08b);
      this.player.position.set(-1, 0, 3);
      this.scene.add(this.player);
      this.position =
        game.s.player && C.walkable(game.s, game.s.player.x, game.s.player.z)
          ? { ...game.s.player }
          : C.walkable(game.s, -1, 3)
            ? { x: -1, z: 3 }
            : { x: 0, z: 4 };
      this.look = new T.Vector3(-1, 0.3, 0);
      this.ring = new T.Mesh(
        new T.RingGeometry(0.67, 0.73, 32),
        new T.MeshBasicMaterial({ color: 0xfff2bd, side: T.DoubleSide }),
      );
      this.ring.rotation.x = -Math.PI / 2;
      this.scene.add(this.ring);
      this.connectionGroup = new T.Group();
      this.scene.add(this.connectionGroup);
      this.fx = [];
      const fxmat = new T.MeshBasicMaterial({ color: 0x9acfd3 });
      for (let i = 0; i < 16; i++) {
        const o = this.shape(
          this.scene,
          "ball",
          fxmat,
          [0, 0, 0],
          [0.025, 0.055, 0.025],
        );
        o.visible = false;
        this.fx.push(o);
      }
      this.ray = new T.Raycaster();
      this.pointer = new T.Vector2();
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
      this.resize();
      this.sync();
    }
    shape(parent, geo, mat, pos, scale) {
      const o = M.mesh(
        typeof geo === "string" ? this.geo[geo] : geo,
        mat,
        parent,
        ...pos,
      );
      if (scale) o.scale.set(...scale);
      return o;
    }
    world() {
      this.buildZones();
      this.buildFlora();
      this.buildActors();
      this.buildHouses();
      this.buildCampaignHouse();
    }
    // y is an offset above the real ground height at (point.x, point.z), not
    // an absolute world Y — every caller already means "N units above where
    // this point actually sits", which only matches the render once terrain
    // has real relief (Épic 4.2) if the ground height is added here instead
    // of assumed to be 0.
    screenPoint(point, y = 0) {
      const v = new T.Vector3(
          point.x,
          Terrain.terrainHeight(point.x, point.z) + y,
          point.z,
        ).project(this.camera),
        r = this.canvas.getBoundingClientRect();
      return {
        x: ((v.x + 1) * r.width) / 2,
        y: ((1 - v.y) * r.height) / 2,
        visible:
          v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95,
      };
    }

    targetAt(point) {
      let closest = null,
        dist = 1.3;
      const s = this.game.s;
      const targets = s.entities
        .filter((e) => !e.stored)
        .concat(
          D.visitors,
          s.resources.filter(
            (r) => s.unlocked.includes(r.zone) && C.resourceClear(s, r),
          ),
          D.caches.filter(
            (c) =>
              s.unlocked.includes(c.zone) && !s.discovered.includes(c.species),
          ),
          D.zones
            .filter((z) => !s.unlocked.includes(z.id))
            .map((z) => ({ id: `zone-${z.id}`, x: z.gate[0], z: z.gate[1] })),
          { id: "river", x: 3.5, z: 4 },
        );
      for (const e of targets) {
        const d = C.distance(e, point);
        if (d < dist) {
          dist = d;
          closest = e;
        }
      }
      return closest;
    }
    objectHeight(entity) {
      const house = D.buildings?.find((b) => b.visitorId === entity.id);
      if (house) return house.roofHeight + 0.2;
      const model = this.models.get(entity.id);
      if (model) {
        const bounds = new T.Box3().setFromObject(model.root);
        return bounds.max.y + 0.2;
      }
      return entity.type === "wood" ? 3.5 : 1.5;
    }
    findEntity(id) {
      const s = this.game.s;
      return (
        s.entities.find((e) => e.id === id) ||
        s.resources.find((e) => e.id === id) ||
        D.visitors.find((e) => e.id === id) ||
        D.caches.find((e) => e.id === id) ||
        (id === "river" ? { id, x: 3.5, z: 4, stored: false } : null)
      );
    }
    resize() {
      const r = this.canvas.parentElement.getBoundingClientRect();
      this.renderer.setSize(r.width, r.height, false);
      this.ratio = r.width / r.height;
      if (this.inspection) this.inspect(this.findEntity(this.inspection.id));
    }
    frame(dt, axis = { x: 0, z: 0 }, reduced = false) {
      this.time += dt;
      this.reduced = reduced;
      if (this.inspection) {
        axis = { x: 0, z: 0 };
        this.routes = [];
      }
      this.movePlayer(dt, axis, reduced);
      this.animEntities(reduced);
      this.updateDoors(reduced);
      this.ring.visible = !!this.selected && !this.preview;
      if (this.selected)
        this.ring.position.set(this.selected.x, 0.04, this.selected.z);
      this.updateCamera(dt, reduced);
      this.updateFlows(reduced);
      this.updateCrowns();
      this.updateFx(reduced);
      this.updateLighting();
      this.updateBatches();
      this.renderer.render(this.scene, this.camera);
    }
  }
  window.GardenView = GardenView;
})();
