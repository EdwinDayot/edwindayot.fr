(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    C = window.GardenConstruction,
    B = window.GardenBotany,
    G = window.GardenView;
  if (!T || !M || !B || !G) return;
  Object.assign(G.prototype, {
    buildActors() {
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
    },
  });
})();
