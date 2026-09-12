(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    C = window.GardenConstruction,
    B = window.GardenBotany,
    G = window.GardenView;
  if (!T || !M || !B || !G) return;
  Object.assign(G.prototype, {
    updateCamera(dt, reduced) {
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
    },
    updateFlows(reduced) {
      const s = this.game.s;
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
    },
    updateCrowns() {
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
    },
    updateFx(reduced) {
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
    },
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
    },
  });
})();
