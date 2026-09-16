(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    C = window.GardenConstruction,
    B = window.GardenBotany,
    Terrain = window.GardenTerrain,
    Geo = window.GardenGeometry,
    River = window.GardenRiver,
    G = window.GardenView;
  if (!T || !M || !B || !Terrain || !Geo || !River || !G) return;
  Object.assign(G.prototype, {
    // y is an absolute world height; callers add Terrain.terrainHeight(x, z)
    // themselves before calling this (see buildZones(), buildHouse()).
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
    // A grid clipped to the zone's real polygon (Épic 4.1's organic contour,
    // not the old rectangle) with each vertex sampling terrainHeight (Épic
    // 4.2) — a cell is drawn when its center is inside the polygon, which
    // approximates the contour at grid resolution instead of a full
    // polygon-clip triangulation (no such library here); at this game's
    // low-poly style and camera distance the step below reads as a smooth
    // organic edge, not a staircase.
    groundGeometry(polygon, step = 0.375) {
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const [x, z] of polygon) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      const cols = Math.ceil((maxX - minX) / step) + 1,
        rows = Math.ceil((maxZ - minZ) / step) + 1,
        positions = [],
        indices = [],
        vertexAt = new Map(),
        vertexIndex = (i, j) => {
          const key = i + "," + j;
          if (vertexAt.has(key)) return vertexAt.get(key);
          const x = minX + i * step,
            zPos = minZ + j * step,
            n = positions.length / 3;
          positions.push(x, Terrain.terrainHeight(x, zPos), zPos);
          vertexAt.set(key, n);
          return n;
        };
      for (let i = 0; i < cols - 1; i++)
        for (let j = 0; j < rows - 1; j++) {
          const cx = minX + (i + 0.5) * step,
            cz = minZ + (j + 0.5) * step;
          if (!Geo.pointInPolygon(polygon, cx, cz)) continue;
          const a = vertexIndex(i, j),
            b = vertexIndex(i + 1, j),
            c = vertexIndex(i + 1, j + 1),
            d = vertexIndex(i, j + 1);
          indices.push(a, b, c, a, c, d);
        }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      // Ombre du relief cuite en couleurs de sommet (indépendante du soleil) : les
      // pentes abruptes et les creux de base de colline sont assombris, les plateaux
      // restent clairs. C'est ce qui rend les 8 collines du terrain lisibles à tout
      // moment, même quand le soleil les éclaire de face — le dôme éclairé se
      // confondait avec la plaine claire (l'auto-ombre seule ne suffisait pas).
      const nrm = geo.attributes.normal,
        pos = geo.attributes.position,
        colors = new Float32Array(pos.count * 3),
        form = new Float32Array(pos.count);
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v),
          y = pos.getY(v),
          z = pos.getZ(v);
        let slope = 1 - nrm.getY(v);
        slope = slope < 0.22 ? 0 : (slope - 0.22) / 0.78;
        let cavity = 0;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          cavity += Math.max(0, Terrain.terrainHeight(x + Math.cos(ang) * 2.2, z + Math.sin(ang) * 2.2) - y);
        }
        cavity = Math.min(1, (cavity / 8) * 0.6);
        const shade = 1 - Math.min(0.45, slope * 0.28 + cavity * 0.35);
        form[v] = shade;
        colors[v * 3] = colors[v * 3 + 1] = colors[v * 3 + 2] = shade;
      }
      geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
      geo.userData.shadeForm = form;
      return geo;
    },
    // Modulation cuite de l'ombre du relief selon la direction réelle du soleil
    // (see reBakeTerrain callers). Un dôme convexe projette son auto-ombre sur
    // sa pente lointaine — cachée derrière le sommet — donc la shadow map seule
    // ne rend jamais les 8 collines lisibles. On module la couleur de sommet de
    // chaque pente par le cos²(angle avec le soleil), qui exagère le Lambert
    // physique déjà appliqué par la lumière directionnelle : les faces au vent
    // du soleil s'éclairent, les faces opposées s'assombrissent, d'où un relief
    // net de n'importe quel angle. weight = facteur jour (0 la nuit) pour
    // revenir à la seule forme cuite.
    reBakeTerrain(sunDir, weight) {
      if (!this.grounds) return;
      const sx = sunDir.x,
        sy = sunDir.y,
        sz = sunDir.z;
      for (const { geo } of this.grounds) {
        const form = geo.userData.shadeForm,
          nrm = geo.attributes.normal,
          col = geo.attributes.color,
          arr = col.array;
        for (let v = 0; v < col.count; v++) {
          const d =
            nrm.getX(v) * sx + nrm.getY(v) * sy + nrm.getZ(v) * sz;
          const f = d > 0 ? d * d : 0;
          const s = form[v] * (1 + (0.42 + 0.9 * f - 1) * weight);
          arr[v * 3] = arr[v * 3 + 1] = arr[v * 3 + 2] = s;
        }
        col.needsUpdate = true;
      }
    },
    // A flat ribbon of quads centered on River.riverX(z) — the water and
    // soil bank share this, offset by their own half-widths, so the curve
    // in game/river.js is the single source of truth for both what's drawn
    // and where a pump is legally "at the river" (construction.js).
    riverRibbon(halfWidth, y, zFrom, zTo, step = 1) {
      const positions = [],
        indices = [];
      let i = 0;
      for (let z = zFrom; z <= zTo + 1e-9; z += step) {
        const cx = River.riverX(z);
        positions.push(cx - halfWidth, y, z, cx + halfWidth, y, z);
        if (i > 0) {
          const a = (i - 1) * 2,
            b = a + 1,
            c = i * 2,
            d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
        i++;
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    },
    buildZones() {
      for (const z of D.zones) {
        const [a, b, c, d] = z.bounds,
          group = new T.Group();
        this.scene.add(group);
        const ground = new T.Mesh(
          this.groundGeometry(z.polygon),
          M.mat([0xaabd8c, 0x91ab80, 0xc4c591, 0xbec0a1][z.id], { vertexColors: true }),
        );
        // Le relief est lisible par deux couches : l'ombre cuite en couleurs de
        // sommet (voir groundGeometry) est l'indicateur permanent ; l'auto-ombre
        // ci-dessous (collines réelles projetées sur elles-mêmes) vient en accent,
        // orientée par le soleil du jour.
        ground.castShadow = true;
        ground.receiveShadow = true;
        group.add(ground);
        (this.grounds || (this.grounds = [])).push({ geo: ground.geometry });
        const text = this.label(
          z.name,
          (a + b) / 2,
          Terrain.terrainHeight((a + b) / 2, c + 1) + 0.2,
          c + 1,
          2.6,
        );
        group.add(text);
        const gate = new T.Group();
        gate.position.set(
          z.gate[0],
          Terrain.terrainHeight(z.gate[0], z.gate[1]),
          z.gate[1],
        );
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
      const soil = new T.Mesh(
        this.riverRibbon(1.8, -0.17, -35, 19),
        this.mat.soil,
      );
      soil.castShadow = true;
      soil.receiveShadow = true;
      this.scene.add(soil);
      this.water = new T.Mesh(
        this.riverRibbon(1.625, -0.02, -35, 19),
        this.mat.water,
      );
      this.water.castShadow = false;
      this.water.receiveShadow = true;
      this.scene.add(this.water);
      // Repeated paths, shoreline rocks and tree crowns share one instanced draw each.
      const stones = new T.InstancedMesh(this.geo.ball, this.mat.stone, 320),
        dummy = new T.Object3D();
      let n = 0;
      for (let z = -35; z < 19; z += 1.2)
        for (const offset of [-1.58, 1.63]) {
          dummy.position.set(River.riverX(z) + offset, 0.03, z);
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
        dummy.position.set(
          tree.x,
          Terrain.terrainHeight(tree.x, tree.z) + 1.7 * tree.scale,
          tree.z,
        );
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
          dummy.position.set(
            tree.x + (j - 0.5) * 0.6,
            Terrain.terrainHeight(tree.x, tree.z) + 0.005,
            tree.z,
          );
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
