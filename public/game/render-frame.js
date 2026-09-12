(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    C = window.GardenConstruction,
    B = window.GardenBotany,
    G = window.GardenView;
  if (!T || !M || !B || !G) return;
  Object.assign(G.prototype, {
    movePlayer(dt, axis, reduced) {
      const s = this.game.s;
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
    },
    animEntities(reduced) {
      const s = this.game.s;
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
    },
  });
})();
