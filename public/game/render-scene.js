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
      } else if (type === "composter") {
        this.shape(g, "box", this.mat.wood, [0, 0.32, 0], [0.85, 0.64, 0.8]);
        this.shape(
          g,
          "box",
          this.mat.wood,
          [0, 0.32, 0.41],
          [0.85, 0.64, 0.04],
        );
        this.shape(g, "ball", this.mat.soil, [0, 0.66, 0], [0.62, 0.22, 0.56]);
        for (let i = 0; i < 3; i++)
          this.shape(
            g,
            "ball",
            M.mat(0x6d8a52),
            [(i - 1) * 0.22, 0.78, 0.05],
            [0.11, 0.09, 0.11],
          );
      } else if (type === "collector" || type === "collectorT2") {
        // Tier 2 reuses the exact same model, only bigger — same visual
        // language as the recipe's bigger capacity/range, no new geometry.
        const s = type === "collectorT2" ? 1.25 : 1;
        this.shape(
          g,
          "box",
          this.mat.wood,
          [0, 0.35 * s, 0],
          [0.85 * s, 0.7 * s, 0.8 * s],
        );
        this.shape(
          g,
          "box",
          this.mat.cream,
          [0, 0.73 * s, 0],
          [0.95 * s, 0.08 * s, 0.9 * s],
        );
        const orb = this.shape(
          g,
          "ball",
          this.mat.metal,
          [0, 0.85 * s, 0],
          [0.1 * s, 0.1 * s, 0.1 * s],
        );
        g.userData.orb = orb;
      } else if (type === "greenhouse") {
        const glass = (this.greenhouseGlass ??= M.mat(0xcbe8e2, {
          transparent: true,
          opacity: 0.4,
          roughness: 0.15,
        }));
        for (const [x, z] of [
          [-0.7, -0.7],
          [0.7, -0.7],
          [-0.7, 0.7],
          [0.7, 0.7],
        ])
          this.shape(g, "box", this.mat.wood, [x, 0.55, z], [0.08, 1.1, 0.08]);
        this.shape(g, "box", glass, [0, 0.55, 0], [1.4, 1.1, 1.4]);
        this.shape(g, "box", this.mat.wood, [0, 1.15, 0], [1.5, 0.08, 1.5]);
      } else if (type === "autoPlanter") {
        this.shape(g, "box", this.mat.wood, [0, 0.14, 0], [0.85, 0.28, 0.7]);
        this.shape(g, "cylinder", this.mat.bark, [0, 0.55, 0], [0.3, 0.5, 0.3]);
        this.shape(g, "cylinder", this.mat.wood, [0, 0.83, 0], [0.4, 0.1, 0.4]);
        for (let i = 0; i < 3; i++)
          this.shape(
            g,
            "ball",
            this.mat.bark,
            [(i - 1) * 0.2, 0.3, 0.22],
            [0.05, 0.05, 0.05],
          );
      } else if (type === "seedDispenser") {
        this.shape(g, "cylinder", this.mat.stone, [0, 0.1, 0], [0.4, 0.2, 0.4]);
        this.shape(
          g,
          "cylinder",
          this.mat.bark,
          [0, 0.5, 0],
          [0.28, 0.6, 0.28],
        );
        this.shape(
          g,
          "cylinder",
          this.mat.wood,
          [0, 0.83, 0],
          [0.35, 0.1, 0.35],
        );
        const spout = this.shape(
          g,
          "cylinder",
          this.mat.wood,
          [0.32, 0.35, 0],
          [0.08, 0.3, 0.08],
        );
        spout.rotation.z = Math.PI / 3;
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
