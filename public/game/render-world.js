(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    C = window.GardenConstruction,
    B = window.GardenBotany,
    G = window.GardenView;
  if (!T || !M || !B || !G) return;
  Object.assign(G.prototype, {
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
    },
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
    },
    buildZones() {
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
    },
    buildFlora() {
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
    },
  });
})();
