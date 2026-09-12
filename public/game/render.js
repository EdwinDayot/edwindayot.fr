(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    C = window.GardenConstruction,
    B = window.GardenBotany;
  if (!T || !M || !B) return;
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
      this.renderer.toneMappingExposure = 1.12;
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
      this.ambient = new T.HemisphereLight(0xfff7df, 0x69816f, 2.1);
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
      this.plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
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
    label(text, x, y, z, width = 2) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 96;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f5f2e2";
      ctx.beginPath();
      ctx.roundRect(0, 0, 512, 96, 22);
      ctx.fill();
      ctx.fillStyle = "#3e5b47";
      ctx.font = "500 40px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(text, 256, 60);
      const map = new T.CanvasTexture(c);
      map.colorSpace = T.SRGBColorSpace;
      const o = new T.Sprite(new T.SpriteMaterial({ map, depthTest: true }));
      o.position.set(x, y, z);
      o.scale.set(width, (width * 96) / 512, 1);
      return o;
    }
    person(color) {
      const p = new T.Group(),
        shirt = M.mat(color),
        skin = M.mat(0xe1b08a),
        legs = [],
        arms = [];
      this.shape(p, "ball", shirt, [0, 0.76, 0], [0.27, 0.37, 0.2]);
      this.shape(p, "ball", skin, [0, 1.23, 0], [0.23, 0.25, 0.22]);
      this.shape(
        p,
        "cylinder",
        this.mat.cream,
        [0, 1.42, 0],
        [0.78, 0.05, 0.78],
      );
      this.shape(p, "ball", this.mat.cream, [0, 1.46, 0], [0.27, 0.17, 0.27]);
      for (const sign of [-1, 1]) {
        const l = new T.Group();
        l.position.set(sign * 0.12, 0.5, 0);
        p.add(l);
        this.shape(
          l,
          "ball",
          this.mat.metal,
          [0, -0.17, 0],
          [0.105, 0.25, 0.1],
        );
        this.shape(
          l,
          "ball",
          this.mat.bark,
          [0, -0.4, 0.045],
          [0.12, 0.09, 0.16],
        );
        legs.push(l);
        const a = new T.Group();
        a.position.set(sign * 0.28, 1, 0);
        p.add(a);
        this.shape(a, "ball", shirt, [0, -0.12, 0], [0.09, 0.21, 0.095]);
        this.shape(a, "ball", skin, [0, -0.31, 0], [0.08, 0.09, 0.08]);
        arms.push(a);
      }
      const can = new T.Group();
      can.position.set(0.4, 0.58, 0.1);
      this.shape(
        can,
        "cylinder",
        this.mat.metal,
        [0, 0, 0],
        [0.34, 0.26, 0.34],
      );
      M.tube(
        [
          [0.1, 0, 0],
          [0.25, 0.08, 0],
          [0.36, 0.18, 0],
        ],
        0.038,
        this.mat.metal,
        can,
      );
      const handle = this.shape(
        can,
        new T.TorusGeometry(0.16, 0.025, 6, 14),
        this.mat.metal,
        [-0.12, 0.09, 0],
      );
      handle.scale.x = 0.8;
      p.add(can);
      p.userData = { legs, arms, can };
      return p;
    }
    world() {
      for (const z of D.zones) {
        const [a, b, c, d] = z.bounds,
          group = new T.Group();
        this.scene.add(group);
        this.shape(
          group,
          "box",
          M.mat([0xaabd8c, 0x91ab80, 0xc4c591, 0xbec0a1][z.id]),
          [(a + b) / 2, -0.25, (c + d) / 2],
          [b - a, 0.45, d - c],
        );
        const text = this.label(z.name, (a + b) / 2, 0.2, c + 1, 2.6);
        group.add(text);
        const gate = new T.Group();
        gate.position.set(...[z.gate[0], 0, z.gate[1]]);
        for (const x of [-0.5, 0.5])
          this.shape(
            gate,
            "box",
            this.mat.wood,
            [x, 0.6, 0],
            [0.12, 1.2, 0.15],
          );
        this.shape(gate, "box", this.mat.cream, [0, 0.9, 0], [1.3, 0.5, 0.12]);
        this.scene.add(gate);
        this.zoneModels.push({ group, gate, text });
      }
      this.shape(
        this.scene,
        "box",
        this.mat.soil,
        [5.8, -0.17, -8],
        [3.6, 0.3, 58],
      );
      this.water = this.shape(
        this.scene,
        "box",
        this.mat.water,
        [5.8, -0.02, -8],
        [3.25, 0.15, 58],
      );
      this.water.castShadow = false;
      // Repeated paths, shoreline rocks and tree crowns share one instanced draw each.
      const stones = new T.InstancedMesh(this.geo.ball, this.mat.stone, 320),
        dummy = new T.Object3D();
      let n = 0;
      for (let z = -35; z < 19; z += 1.2)
        for (const x of [4.22, 7.43]) {
          dummy.position.set(x, 0.03, z);
          dummy.scale.set(0.24, 0.11, 0.3);
          dummy.updateMatrix();
          stones.setMatrixAt(n++, dummy.matrix);
        }
      for (let x = -39; x < 4; x += 0.7) {
        dummy.position.set(x, 0.025, 3.8 + Math.sin(x) * 0.12);
        dummy.scale.set(0.26, 0.065, 0.24);
        dummy.updateMatrix();
        stones.setMatrixAt(n++, dummy.matrix);
      }
      for (let z = -35; z < 18; z += 0.7) {
        dummy.position.set(1.5, 0.025, z);
        dummy.scale.set(0.25, 0.065, 0.23);
        dummy.updateMatrix();
        stones.setMatrixAt(n++, dummy.matrix);
      }
      stones.count = n;
      stones.receiveShadow = true;
      this.scene.add(stones);
      this.treeData = C.trees(this.game.s);
      const count = D.trees.length;
      this.crowns = new T.InstancedMesh(
        this.geo.ball,
        M.mat(0x6d9365),
        count * 4,
      );
      this.fadedCrowns = new T.InstancedMesh(
        this.geo.ball,
        M.mat(0x6d9365, { transparent: true, opacity: 0.1, depthWrite: false }),
        count * 4,
      );
      const trunks = new T.InstancedMesh(
        this.geo.cylinder,
        this.mat.bark,
        count,
      );
      this.trunks = trunks;
      this.treeData.forEach((tree, i) => {
        dummy.position.set(tree.x, 1.7 * tree.scale, tree.z);
        dummy.scale.set(0.55, 3.4 * tree.scale, 0.55);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
      });
      this.crowns.frustumCulled = false;
      this.fadedCrowns.frustumCulled = false;
      this.crowns.castShadow = false;
      trunks.castShadow = true;
      this.crowns.receiveShadow = true;
      this.shadowCrowns = new T.InstancedMesh(
        this.geo.ball,
        M.mat(0x6d9365, { colorWrite: false, depthWrite: false }),
        count * 4,
      );
      this.shadowCrowns.castShadow = true;
      this.shadowCrowns.frustumCulled = false;
      this.scene.add(this.crowns, this.fadedCrowns, trunks, this.shadowCrowns);
      const moss = new T.InstancedMesh(
        this.geo.ball,
        M.mat(0x739064),
        count * 2,
      );
      this.moss = moss;
      this.treeData.forEach((tree, i) => {
        for (let j = 0; j < 2; j++) {
          dummy.position.set(tree.x + (j - 0.5) * 0.6, 0.005, tree.z);
          dummy.scale.set(1.7, 0.035, 1.25);
          dummy.updateMatrix();
          moss.setMatrixAt(i * 2 + j, dummy.matrix);
        }
      });
      moss.receiveShadow = true;
      this.scene.add(moss);
      for (let i = 0; i < 8; i++)
        this.shape(
          this.scene,
          "box",
          this.mat.wood,
          [3.6 + i * 0.25, 0.12, 4],
          [0.23, 0.12, 1.25],
        );
      this.scene.add(this.label("La rivière", 4.5, 0.7, 5, 1.7));
      for (const v of D.visitors) {
        const p = this.person(
          [0xdbaea0, 0x9fafc0, 0xc5c895][D.visitors.indexOf(v)],
        );
        p.position.set(v.x, 0, v.z);
        p.rotation.y = Math.PI;
        p.userData.can.visible = false;
        p.userData.target = v.id;
        if (v.id === "iris")
          this.shape(
            p,
            "box",
            this.mat.cream,
            [0.3, 0.75, 0.15],
            [0.25, 0.3, 0.06],
          );
        this.scene.add(p);
        this.scene.add(this.label(v.name, v.x, 1.9, v.z, 1.6));
        this.nodes.set(v.id, p);
      }
      for (const r of D.resources) {
        const g = new T.Group(),
          full = new T.Group(),
          depleted = new T.Group();
        g.position.set(r.x, 0, r.z);
        g.add(full, depleted);
        g.userData = { full, depleted, target: r.id };
        if (r.type === "wood") {
          if (!r.treeId) {
            this.shape(
              full,
              "cylinder",
              this.mat.bark,
              [0, 1.15, 0],
              [0.5, 2.3, 0.5],
            );
            for (let i = 0; i < 3; i++)
              this.shape(
                full,
                "ball",
                M.mat(0x54845a),
                [Math.sin(i * 2) * 0.4, 2.4 + i * 0.45, Math.cos(i * 2) * 0.35],
                [1.03, 0.95, 1],
              );
          }
          this.shape(
            depleted,
            "cylinder",
            this.mat.wood,
            [0, 0.16, 0],
            [0.56, 0.32, 0.56],
          );
          const shoot = this.shape(
            depleted,
            "ball",
            this.mat.grass,
            [0.22, 0.38, 0],
            [0.14, 0.22, 0.1],
          );
          g.userData.shoot = shoot;
        } else if (r.type === "stone") {
          for (let i = 0; i < 4; i++) {
            const rock = this.shape(
              full,
              "ball",
              this.mat.stone,
              [Math.sin(i * 2) * 0.25, 0.22 + i * 0.12, Math.cos(i * 2) * 0.25],
              [0.44, 0.42, 0.38],
            );
            rock.rotation.z = i * 0.4;
          }
          for (let i = 0; i < 3; i++)
            this.shape(
              depleted,
              "ball",
              this.mat.stone,
              [(i - 1) * 0.25, 0.05, 0],
              [0.15, 0.07, 0.15],
            );
        } else {
          this.shape(
            full,
            "ball",
            M.mat(0xb87950),
            [0, 0.08, 0],
            [0.85, 0.2, 0.65],
          );
          for (let i = 0; i < 3; i++)
            this.shape(
              full,
              "ball",
              M.mat(0xcc9772),
              [(i - 1) * 0.3, 0.2, Math.sin(i) * 0.2],
              [0.26, 0.12, 0.2],
            );
          this.shape(
            depleted,
            "ball",
            M.mat(0x725d48),
            [0, 0.025, 0],
            [0.75, 0.03, 0.6],
          );
        }
        this.scene.add(g);
        this.nodes.set(r.id, g);
      }
      for (const c of D.caches) {
        const g = new T.Group();
        g.position.set(c.x, 0, c.z);
        this.shape(g, "box", this.mat.wood, [0, 0.2, 0], [0.65, 0.4, 0.5]);
        const leaf = B.create(c.species);
        leaf.scale.setScalar(0.25);
        leaf.position.y = 0.4;
        g.add(leaf);
        g.userData.target = c.id;
        this.scene.add(g);
        this.nodes.set(c.id, g);
      }
    }
    equipment(type) {
      const g = new T.Group();
      if (type === "pot" || type === "reservoir") {
        const p = M.pot(type === "pot" ? 0xc99476 : 0x9cb6aa);
        p.userData.seed.visible = false;
        p.userData.rim.visible = type === "reservoir";
        g.add(p);
        g.userData.pot = p;
      } else if (type === "path") {
        this.shape(
          g,
          "ball",
          this.mat.stone,
          [0, 0.025, 0],
          [0.23, 0.055, 0.23],
        );
      } else if (type === "bench" || type === "nursery") {
        for (const x of [-0.48, 0.48])
          for (const z of [-0.22, 0.22])
            this.shape(g, "box", this.mat.wood, [x, 0.35, z], [0.1, 0.7, 0.1]);
        this.shape(g, "box", this.mat.wood, [0, 0.7, 0], [1.2, 0.12, 0.6]);
        if (type === "bench")
          this.shape(g, "box", this.mat.wood, [0, 1, -0.3], [1.2, 0.38, 0.1]);
        else {
          this.shape(
            g,
            "box",
            this.mat.soil,
            [0, 0.81, 0],
            [0.65, 0.12, 0.4],
          ); /* The chosen cutting is added by sync, including saved ready jobs. */
        }
      } else if (type === "tank") {
        this.tankOuter ??= new T.CylinderGeometry(0.59, 0.55, 1.3, 24, 1, true);
        this.tankInner ??= new T.CylinderGeometry(0.5, 0.46, 1.24, 24, 1, true);
        this.shape(g, this.tankOuter, this.mat.wood, [0, 0.7, 0]);
        this.shape(
          g,
          this.tankInner,
          M.mat(0x785a3e, { side: T.BackSide }),
          [0, 0.73, 0],
        );
        this.shape(
          g,
          "cylinder",
          this.mat.bark,
          [0, 0.08, 0],
          [1.05, 0.12, 1.05],
        );
        const level = this.shape(
          g,
          "cylinder",
          this.mat.water,
          [0, 0.14, 0],
          [0.9, 0.025, 0.9],
        );
        g.userData.level = level;
        for (const y of [0.15, 0.75, 1.34]) {
          const ring = this.shape(
            g,
            (this.tankRings ??= new Map()).get(y) ||
              this.tankRings
                .set(
                  y,
                  new T.TorusGeometry(
                    y === 1.34 ? 0.545 : 0.57,
                    y === 1.34 ? 0.065 : 0.025,
                    8,
                    24,
                  ),
                )
                .get(y),
            this.mat.metal,
            [0, y, 0],
          );
          ring.rotation.x = Math.PI / 2;
        }
        this.shape(
          g,
          "box",
          this.mat.cream,
          [0, 0.7, 0.55],
          [0.22, 1.05, 0.045],
        );
        const gauge = this.shape(
          g,
          "box",
          M.mat(0x438e9b),
          [0, 0.22, 0.583],
          [0.13, 0.02, 0.024],
        );
        g.userData.gauge = gauge;
        M.tube(
          [
            [0.38, 0.2, 0],
            [0.65, 0.2, 0],
            [0.65, 0.09, 0],
          ],
          0.055,
          this.mat.metal,
          g,
        );
      } else if (type === "pump") {
        this.shape(g, "box", this.mat.stone, [0, 0.12, 0], [0.8, 0.24, 0.7]);
        this.shape(g, "cylinder", this.mat.metal, [0, 0.65, 0], [0.3, 1, 0.3]);
        M.tube(
          [
            [0, 0.9, 0],
            [0.35, 0.9, 0],
            [0.35, 0.65, 0],
          ],
          0.07,
          this.mat.metal,
          g,
        );
        const arm = this.shape(
          g,
          "box",
          this.mat.bark,
          [0, 1.2, 0],
          [0.85, 0.07, 0.1],
        );
        g.userData.arm = arm;
      } else if (type === "collector") {
        this.shape(g, "box", this.mat.wood, [0, 0.35, 0], [0.85, 0.7, 0.8]);
        this.shape(g, "box", this.mat.cream, [0, 0.73, 0], [0.95, 0.08, 0.9]);
        const orb = this.shape(
          g,
          "ball",
          this.mat.metal,
          [0, 0.85, 0],
          [0.1, 0.1, 0.1],
        );
        g.userData.orb = orb;
      } else if (type === "lantern") {
        this.shape(g, "cylinder", this.mat.bark, [0, 0.4, 0], [0.1, 0.8, 0.1]);
        this.shape(
          g,
          "box",
          (this.lanternMaterial ??= M.mat(0xf2da9b, {
            emissive: 0xffb85e,
            emissiveIntensity: 0,
          })),
          [0, 0.87, 0],
          [0.25, 0.32, 0.25],
        );
        this.shape(g, "box", this.mat.metal, [0, 1.08, 0], [0.36, 0.08, 0.36]);
      } else if (type === "drip") {
        this.shape(
          g,
          "cylinder",
          this.mat.metal,
          [0, 0.16, 0],
          [0.14, 0.32, 0.14],
        );
        this.shape(g, "ball", this.mat.water, [0, 0.33, 0], [0.13, 0.08, 0.13]);
      } else
        this.shape(
          g,
          "cylinder",
          this.mat.metal,
          [0, 0.06, 0],
          [0.27, 0.12, 0.27],
        );
      return g;
    }
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
        m.root.position.set(e.x, 0, e.z);
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
          open ? [0xaabd8c, 0x91ab80, 0xc4c591, 0xbec0a1][z.id] : 0xa4b29a,
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
    }
    screenPoint(point, y = 0) {
      const v = new T.Vector3(point.x, y, point.z).project(this.camera),
        r = this.canvas.getBoundingClientRect();
      return {
        x: ((v.x + 1) * r.width) / 2,
        y: ((1 - v.y) * r.height) / 2,
        visible:
          v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95,
      };
    }
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
    }

    pickTarget(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((clientX - r.left) / r.width) * 2 - 1,
        (-(clientY - r.top) / r.height) * 2 + 1,
      );
      this.ray.setFromCamera(this.pointer, this.camera);
      this.ray.layers.enableAll();
      const roots = [
        ...this.nodes.values(),
        ...[...this.models.values()].map((m) => m.root),
        this.trunks,
        this.crowns,
        this.fadedCrowns,
      ];
      for (const hit of this.ray.intersectObjects(roots, true)) {
        let visible = true,
          target = null;
        for (let o = hit.object; o; o = o.parent) {
          if (!o.visible) visible = false;
          if (o.userData.target) target = o.userData.target;
        }
        if (!visible) continue;
        if (hit.object === this.trunks)
          target = "resource-" + this.treeData[hit.instanceId]?.id;
        if (hit.object === this.crowns)
          target = this.solidTreeIds?.[hit.instanceId];
        if (hit.object === this.fadedCrowns) continue;
        if (target) {
          const s = this.game.s,
            e =
              s.entities.find((e) => e.id === target) ||
              s.resources.find((e) => e.id === target) ||
              D.visitors.find((e) => e.id === target) ||
              D.caches.find((e) => e.id === target);
          if (
            e &&
            (!e.id.startsWith("resource-") ||
              (s.unlocked.includes(e.zone) && C.resourceClear(s, e)))
          )
            return e;
        }
      }
      return null;
    }
    pick(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((clientX - r.left) / r.width) * 2 - 1,
        (-(clientY - r.top) / r.height) * 2 + 1,
      );
      this.ray.setFromCamera(this.pointer, this.camera);
      const target = new T.Vector3();
      if (!this.ray.ray.intersectPlane(this.plane, target)) return null;
      return { x: target.x, z: target.z };
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
    go(target) {
      this.routes = C.approach(this.game.s, this.position, target);
      this.selected = target;
      return this.routes.length > 0 || C.distance(this.position, target) < 1.85;
    }
    terrain(point) {
      const q = {
        x: Math.round(point.x * 2) / 2,
        z: Math.round(point.z * 2) / 2,
      };
      this.routes = C.path(this.game.s, this.position, q);
      return this.routes.length > 0;
    }
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
    }
    updatePreview(b) {
      if (!this.preview) return;
      this.preview.position.set(b.x, 0.025, b.z);
      this.preview.rotation.y = (b.rotation * Math.PI) / 2;
      this.preview.traverse((o) => {
        if (o.isMesh) o.material.color.setHex(b.error ? 0xb5654f : 0x628b6a);
      });
    }
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
    }
    miningTool(id) {
      const g = new T.Group();
      this.shape(
        g,
        "cylinder",
        this.mat.wood,
        [0, 0.4, 0],
        [0.075, 0.85, 0.075],
      );
      if (id === "axe")
        this.shape(
          g,
          "box",
          this.mat.metal,
          [0.12, 0.8, 0],
          [0.38, 0.28, 0.09],
        );
      else if (id === "pickaxe") {
        const head = this.shape(
          g,
          "box",
          this.mat.metal,
          [0, 0.78, 0],
          [0.65, 0.09, 0.1],
        );
        head.rotation.z = 0.12;
      } else {
        this.shape(
          g,
          "ball",
          this.mat.metal,
          [0, -0.02, 0],
          [0.17, 0.22, 0.05],
        );
        const handle = this.shape(
          g,
          new T.TorusGeometry(0.1, 0.025, 6, 12),
          this.mat.bark,
          [0, 0.86, 0],
        );
      }
      return g;
    }
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
    }
    inspect(entity) {
      if (!entity?.plant || entity.stored) return false;
      if (!this.inspection)
        this.previousCamera = {
          angle: this.angle,
          span: this.span,
          look: this.look.clone(),
          position: this.camera.position.clone(),
          overview: this.overview,
        };
      const model = this.models.get(entity.id);
      if (!model) return false;
      const bounds = new T.Box3().setFromObject(model.root),
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
    }
    endInspection() {
      if (!this.inspection) return;
      const old = this.previousCamera;
      this.inspection = null;
      this.angle = old.angle;
      this.span = old.span;
      this.overview = old.overview;
      this.look.copy(old.look);
      this.camera.position.copy(old.position);
      this.camera.lookAt(this.look);
    }
    objectHeight(entity) {
      const model = this.models.get(entity.id);
      if (model) {
        const bounds = new T.Box3().setFromObject(model.root);
        return bounds.max.y + 0.2;
      }
      return entity.type === "wood" ? 3.5 : 1.5;
    }
    setQuality(level) {
      this.quality = level;
      const size = [512, 1024, 2048][level];
      for (const light of [this.sun, this.moon, ...this.localLights]) {
        const n = light.isPointLight ? (level === 0 ? 256 : 512) : size;
        if (light.shadow.mapSize.x !== n) {
          light.shadow.map?.dispose();
          light.shadow.map = null;
          light.shadow.mapSize.set(n, n);
        }
      }
      if (level === 0) this.renderer.setPixelRatio(1);
      this.qualityClock = 0;
      this.slowTime = 0;
    }
    adaptQuality(dt) {
      if (dt <= 0 || dt > 1) return;
      this.qualityClock += dt;
      const budget = this.mobile ? 1 / 30 : 1 / 60;
      this.slowTime = Math.max(
        0,
        this.slowTime + (dt > budget * 1.22 ? dt : -dt * 0.5),
      );
      if (this.quality > 0 && this.qualityClock > 12 && this.slowTime > 4)
        this.setQuality(this.quality - 1);
    }
    updateLighting() {
      const lighting = GardenLighting.at(
        this.game.s.elapsed + this.game.s.remainder,
      );
      this.lighting = lighting;
      this.sun.intensity = lighting.sunIntensity;
      this.sun.color.setRGB(...lighting.sunColor);
      this.moon.intensity = lighting.moonIntensity;
      this.ambient.intensity = lighting.ambient;
      this.ambient.groundColor.setRGB(...lighting.ground);
      this.scene.background.setRGB(...lighting.sky);
      this.scene.fog.color.copy(this.scene.background);
      const direction = new T.Vector3(...lighting.direction),
        extent = Math.max(this.camera.top, this.camera.right) + 9;
      for (const [light, sign] of [
        [this.sun, 1],
        [this.moon, -1],
      ]) {
        const dir = direction.clone().multiplyScalar(sign),
          center = this.look.clone();
        center.y = 0;
        const right = new T.Vector3()
            .crossVectors(new T.Vector3(0, 1, 0), dir)
            .normalize(),
          up = new T.Vector3().crossVectors(dir, right).normalize(),
          texel = (extent * 2) / light.shadow.mapSize.x;
        center.addScaledVector(
          right,
          Math.round(center.dot(right) / texel) * texel - center.dot(right),
        );
        center.addScaledVector(
          up,
          Math.round(center.dot(up) / texel) * texel - center.dot(up),
        );
        light.target.position.copy(center);
        light.position.copy(center).addScaledVector(dir, 80);
        Object.assign(light.shadow.camera, {
          left: -extent,
          right: extent,
          top: extent,
          bottom: -extent,
        });
        light.shadow.camera.updateProjectionMatrix();
        light.castShadow = light.intensity > 0;
      }
      if (this.lanternMaterial)
        this.lanternMaterial.emissiveIntensity = lighting.night * 1.8;
      const candidates = this.game.s.entities.filter(
        (e) =>
          !e.stored &&
          e.type === "lantern" &&
          Math.hypot(e.x - this.look.x, e.z - this.look.z) < extent + 6,
      );
      const distance = (e) => Math.hypot(e.x - this.look.x, e.z - this.look.z);
      const oldIds = this.localLights.map((l) => l.userData.entity);
      candidates.sort(
        (a, b) =>
          distance(a) -
          (oldIds.includes(a.id) ? 1.2 : 0) -
          distance(b) +
          (oldIds.includes(b.id) ? 1.2 : 0),
      );
      const selected = candidates.slice(0, 4),
        oldShadows = this.localLights
          .filter((l) => l.castShadow)
          .map((l) => l.userData.entity);
      const shadowIds = selected
        .slice()
        .sort(
          (a, b) =>
            distance(a) -
            (oldShadows.includes(a.id) ? 0.8 : 0) -
            distance(b) +
            (oldShadows.includes(b.id) ? 0.8 : 0),
        )
        .slice(0, this.mobile ? 1 : 2)
        .map((e) => e.id);
      this.localLights.forEach((light, i) => {
        const e = selected[i];
        light.userData.entity = e?.id;
        light.intensity = e ? lighting.night * 2.5 : 0;
        light.castShadow =
          !!e && lighting.night > 0.001 && shadowIds.includes(e.id);
        if (e) light.position.set(e.x, 1.02, e.z);
      });
      // Halos are depth-tested sprites, shared across all lanterns; light pools alone are capped.
      this.halos ??= new Map();
      if (!this.haloMaterial) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext("2d"),
          gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, "#ffdfaa99");
        gradient.addColorStop(1, "#ffbe7300");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        this.haloMaterial = new T.SpriteMaterial({
          map: new T.CanvasTexture(canvas),
          transparent: true,
          depthWrite: false,
          opacity: 0,
        });
      }
      this.haloMaterial.opacity = lighting.night * 0.65;
      const ids = new Set(candidates.map((e) => e.id));
      for (const [id, halo] of this.halos)
        if (!ids.has(id)) {
          this.scene.remove(halo);
          this.halos.delete(id);
        }
      for (const e of candidates) {
        let halo = this.halos.get(e.id);
        if (!halo) {
          halo = new T.Sprite(this.haloMaterial);
          halo.scale.set(1.15, 1.15, 1);
          this.scene.add(halo);
          this.halos.set(e.id, halo);
        }
        halo.position.set(e.x, 1, e.z);
      }
    }
    resize() {
      const r = this.canvas.parentElement.getBoundingClientRect();
      this.renderer.setSize(r.width, r.height, false);
      this.ratio = r.width / r.height;
      if (this.inspection)
        this.inspect(
          this.game.s.entities.find((e) => e.id === this.inspection.id),
        );
    }
    rebuildBatches() {
      if (this.instanceRoot) {
        this.scene.remove(this.instanceRoot);
        for (const b of this.batches) b.mesh.dispose();
      }
      this.instanceRoot = new T.Group();
      this.batches = [];
      const groups = new Map();
      this.scene.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh) return;
        const mat = o.material;
        if (Array.isArray(mat)) return;
        const key = [
          o.geometry.uuid,
          mat.color?.getHex(),
          mat.roughness,
          mat.metalness,
          mat.map?.uuid,
          mat.side,
          mat.transparent,
          mat.opacity,
          mat.emissive?.getHex(),
          mat === this.lanternMaterial ? "lantern" : mat.emissiveIntensity,
          mat.type,
          o.castShadow,
          o.receiveShadow,
        ].join(":");
        if (!groups.has(key))
          groups.set(key, { geometry: o.geometry, material: mat, sources: [] });
        groups.get(key).sources.push(o);
        o.layers.set(1);
      });
      for (const b of groups.values()) {
        const mesh = new T.InstancedMesh(
          b.geometry,
          b.material,
          b.sources.length,
        );
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        mesh.castShadow = b.sources.some((o) => o.castShadow);
        mesh.receiveShadow = b.sources[0].receiveShadow;
        mesh.frustumCulled = false;
        this.instanceRoot.add(mesh);
        this.batches.push({ ...b, mesh });
      }
      this.scene.add(this.instanceRoot);
      this.batchDirty = false;
    }
    updateBatches() {
      if (this.batchDirty) this.rebuildBatches();
      this.scene.updateMatrixWorld(true);
      for (const b of this.batches) {
        let count = 0;
        for (const source of b.sources) {
          let visible = true;
          for (let p = source; p; p = p.parent) {
            if (!p.visible) {
              visible = false;
              break;
            }
          }
          if (visible) b.mesh.setMatrixAt(count++, source.matrixWorld);
        }
        b.mesh.count = count;
        b.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    frame(dt, axis = { x: 0, z: 0 }, reduced = false) {
      this.time += dt;
      this.reduced = reduced;
      const s = this.game.s;
      if (this.inspection) {
        axis = { x: 0, z: 0 };
        this.routes = [];
      }
      let dx = axis.x * Math.cos(this.angle) + axis.z * Math.sin(this.angle),
        dz = axis.z * Math.cos(this.angle) - axis.x * Math.sin(this.angle);
      if (dx || dz) this.routes = [];
      else if (this.routes.length) {
        const dest = this.routes[0];
        dx = dest.x - this.position.x;
        dz = dest.z - this.position.z;
        if (Math.hypot(dx, dz) < 0.08) {
          this.routes.shift();
          dx = dz = 0;
        }
      }
      const length = Math.hypot(dx, dz),
        moving = length > 0.01;
      if (moving) {
        const step = Math.min((axis.sprint ? 6 : this.speed) * dt, length),
          nx = this.position.x + (dx / length) * step,
          nz = this.position.z + (dz / length) * step;
        if (C.walkable(s, nx, nz)) {
          this.position.x = nx;
          this.position.z = nz;
        } else if (C.walkable(s, nx, this.position.z)) this.position.x = nx;
        else if (C.walkable(s, this.position.x, nz)) this.position.z = nz;
        else this.routes = [];
        this.player.rotation.y = Math.atan2(dx, dz);
      }
      this.player.position.set(
        this.position.x,
        moving && !reduced ? Math.abs(Math.sin(this.time * 11)) * 0.025 : 0,
        this.position.z,
      );
      this.player.userData.legs.forEach(
        (l, i) =>
          (l.rotation.x =
            moving && !reduced
              ? Math.sin(this.time * 11 + i * Math.PI) * 0.45
              : 0),
      );
      this.player.userData.arms.forEach(
        (l, i) =>
          (l.rotation.x =
            moving && !reduced
              ? Math.sin(this.time * 11 + i * Math.PI) * -0.3
              : 0),
      );
      if (this.toolType !== this.held) {
        if (this.carriedTool) this.player.remove(this.carriedTool);
        this.carriedTool = null;
        this.toolType = this.held;
        if (["axe", "pickaxe", "shovel"].includes(this.held)) {
          this.carriedTool = this.miningTool(this.held);
          this.carriedTool.position.set(0.4, 0.65, 0.2);
          this.carriedTool.rotation.z = -0.35;
          this.player.add(this.carriedTool);
        }
        this.batchDirty = true;
      }
      const strike =
        this.effect?.kind === "mine"
          ? Math.max(0, 1 - (this.time - this.effect.start) / 0.6)
          : 0;
      if (this.carriedTool)
        this.carriedTool.rotation.x = reduced
          ? 0
          : -Math.sin(strike * Math.PI) * 1.6;
      if (strike && this.effect)
        this.player.rotation.y = Math.atan2(
          this.effect.x - this.position.x,
          this.effect.z - this.position.z,
        );
      for (const r of s.resources) {
        const n = this.nodes.get(r.id);
        n.rotation.z =
          !reduced && strike && this.effect?.x === r.x && this.effect?.z === r.z
            ? Math.sin(strike * 22) * 0.035
            : 0;
      }
      this.player.userData.can.visible = this.held === "water";
      this.player.userData.can.rotation.z =
        this.effect &&
        this.time - this.effect.start < 1 &&
        ["water", "fillTank"].includes(this.effect.kind)
          ? -0.5
          : 0;
      for (const e of s.entities) {
        if (e.stored) continue;
        const m = this.models.get(e.id);
        if (!m) continue;
        // Distance and camera zoom never replace a plant or change its proportions.
        if (e.plant && m.foliage) {
          const p = e.plant;
          m.root.userData.pot.userData.seed.visible = p.growth < 0.12;
          m.sprout.visible = p.growth >= 0.1 && p.growth < 0.28;
          m.sprout.scale.setScalar(Math.min(1, p.growth * 5));
          m.foliage.visible = p.growth >= 0.26;
          m.foliage.scale.setScalar(0.2 + p.growth * 0.67);
          m.foliage.rotation.z = reduced
            ? 0
            : Math.sin(this.time * 1.2 + e.x) * 0.016;
          m.crop.visible = p.ready > 0;
          m.crop.scale.setScalar(0.085 + p.ready * 0.02);
        }
        if (e.type === "tank") {
          const l = m.root.userData.level;
          l.visible = e.water > 0;
          l.position.y = 0.16 + (e.water / 160) * 1.08;
          const gauge = m.root.userData.gauge;
          gauge.scale.y = Math.max(0.02, (e.water / 160) * 0.98);
          gauge.position.y = 0.2 + gauge.scale.y / 2;
        }
        if (e.type === "pump")
          m.root.userData.arm.rotation.z =
            e.running && !reduced ? Math.sin(this.time * 4) * 0.25 : 0;
        if (e.type === "collector")
          m.root.userData.orb.scale.setScalar(
            e.running && !reduced ? 0.8 + Math.sin(this.time * 2) * 0.2 : 1,
          );
      }
      this.ring.visible = !!this.selected && !this.preview;
      if (this.selected)
        this.ring.position.set(this.selected.x, 0.04, this.selected.z);
      const target = this.inspection
        ? this.inspection.center.clone()
        : new T.Vector3(this.position.x, 0.4, this.position.z - 1.7);
      if (this.inspection) {
        if (this.ratio < 1) target.y -= this.inspection.span * 0.16;
        else
          target.add(
            new T.Vector3(
              Math.cos(this.angle),
              0,
              -Math.sin(this.angle),
            ).multiplyScalar(this.inspection.span * this.ratio * 0.16),
          );
      }
      this.look.lerp(target, reduced ? 1 : 1 - Math.exp(-dt * 5));
      const cam = this.look
        .clone()
        .add(
          new T.Vector3(
            Math.sin(this.angle) * 16,
            14,
            Math.cos(this.angle) * 16,
          ),
        );
      this.camera.position.lerp(cam, reduced ? 1 : 1 - Math.exp(-dt * 5));
      this.camera.lookAt(this.look);
      const span = this.inspection
        ? this.inspection.span
        : this.overview
          ? Math.max(19, 22 / this.ratio)
          : this.span * (this.ratio < 1 ? 1.12 : 1);
      this.camera.top = span / 2;
      this.camera.bottom = -span / 2;
      this.camera.left = (-span * this.ratio) / 2;
      this.camera.right = -this.camera.left;
      this.camera.updateProjectionMatrix();
      this.connectionGroup.visible = true;
      const rates = window.GardenIrrigation.flowRates(s);
      for (const f of this.flows) {
        const forward = f.a.id < f.b.id,
          key = forward ? f.a.id + "|" + f.b.id : f.b.id + "|" + f.a.id;
        f.rate = (rates.get(key) || 0) * (forward ? 1 : -1);
        const running = Math.abs(f.rate) > 1e-9;
        f.bead.visible = running && !reduced;
        f.arrow.visible = running;
        const lengths = [
            f.points[0].distanceTo(f.points[1]),
            f.points[1].distanceTo(f.points[2]),
          ],
          total = lengths[0] + lengths[1];
        const sample = (distance, object) => {
          const i = distance < lengths[0] ? 0 : 1,
            t = (distance - (i ? lengths[0] : 0)) / (lengths[i] || 1);
          object.position.copy(f.points[i]).lerp(f.points[i + 1], t);
          object.position.y = 0.15;
          return i;
        };
        const phase = (this.time * 0.65) % (total || 1);
        sample(f.rate < 0 ? total - phase : phase, f.bead);
        const segment = sample(total * 0.5, f.arrow),
          direction = f.points[segment + 1]
            .clone()
            .sub(f.points[segment])
            .normalize()
            .multiplyScalar(f.rate < 0 ? -1 : 1);
        if (direction.lengthSq())
          f.arrow.quaternion.setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            direction,
          );
      }

      let solid = 0,
        faded = 0;
      this.solidTreeIds = [];
      const dummy = new T.Object3D(),
        head = new T.Vector3(this.position.x, 1, this.position.z),
        sight = this.camera.position.clone().sub(head).normalize(),
        offset = new T.Vector3();
      for (const tree of this.treeData) {
        offset.set(tree.x - head.x, 3.8 * tree.scale - head.y, tree.z - head.z);
        const along = offset.dot(sight),
          occludes =
            along > 0 &&
            offset.lengthSq() - along * along < (2.5 * tree.scale) ** 2,
          near =
            occludes ||
            Math.hypot(tree.x - this.position.x, tree.z - this.position.z) <
              3.7;
        for (let k = 0; k < 4; k++) {
          dummy.position.set(
            tree.x + Math.sin(k * 2.1) * 0.8 * tree.scale,
            (3.45 + k * 0.23) * tree.scale,
            tree.z + Math.cos(k * 2.1) * 0.7 * tree.scale,
          );
          dummy.scale.set(
            1.55 * tree.scale,
            1.3 * tree.scale,
            1.4 * tree.scale,
          );
          dummy.updateMatrix();
          this.shadowCrowns.setMatrixAt(solid + faded, dummy.matrix);
          if (!near) this.solidTreeIds.push("resource-" + tree.id);
          (near ? this.fadedCrowns : this.crowns).setMatrixAt(
            near ? faded++ : solid++,
            dummy.matrix,
          );
        }
      }
      this.shadowCrowns.count = solid + faded;
      this.shadowCrowns.instanceMatrix.needsUpdate = true;
      this.crowns.count = solid;
      this.fadedCrowns.count = faded;
      this.crowns.instanceMatrix.needsUpdate = true;
      this.fadedCrowns.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < this.fx.length; i++) {
        const o = this.fx[i],
          age = this.effect ? this.time - this.effect.start : 10;
        o.visible = age < 1.2 && !reduced;
        if (o.visible) {
          const t = (age + i / 16) % 1;
          o.position.set(
            this.effect.x + Math.sin(i * 2.4) * t * 0.35,
            0.75 + (1 - t) * 0.8,
            this.effect.z + Math.cos(i * 2.4) * t * 0.35,
          );
        }
      }
      this.updateLighting();
      this.updateBatches();
      this.renderer.render(this.scene, this.camera);
    }
  }
  window.GardenView = GardenView;
})();
