(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    C = window.GardenConstruction,
    B = window.GardenBotany,
    G = window.GardenView;
  if (!T || !M || !B || !G) return;
  Object.assign(G.prototype, {
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
    },
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
    },
  });
})();
