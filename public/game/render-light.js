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
    },
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
    },
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
        center.y = Terrain.terrainHeight(center.x, center.z);
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
      // Les 8 collines n'ont jamais d'ombre lisible (auto-ombre cachée derrière
      // le sommet) : on re-cuit leur shading orienté soleil tous les ~2 s — le
      // soleil avance de 0,3°/s, l'étape est imperceptible, et le coût (quelques
      // milliers de sommets, un upload de couleur) reste négligeable.
      const bakeTime = this.game.s.elapsed + this.game.s.remainder;
      if (!this._terrainBakeAt || Math.abs(bakeTime - this._terrainBakeAt) > 2) {
        this._terrainBakeAt = bakeTime;
        this.reBakeTerrain(direction, Math.min(1, lighting.sunIntensity / 2.6));
      }
      if (this.lanternMaterial)
        this.lanternMaterial.emissiveIntensity = lighting.night * 1.8;
      const candidates = this.game.s.entities
        .filter(
          (e) =>
            !e.stored &&
            e.type === "lantern" &&
            Math.hypot(e.x - this.look.x, e.z - this.look.z) < extent + 6,
        )
        .concat(
          D.buildings
            .map((b) => ({ id: b.visitorId + "-lamp", x: b.x, z: b.z }))
            .filter(
              (e) =>
                Math.hypot(e.x - this.look.x, e.z - this.look.z) < extent + 6,
            ),
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
    },
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
    },
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
    },
  });
})();
