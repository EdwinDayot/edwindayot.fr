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
