(() => {
  const D = GardenData,
    G = window.GardenHUD;
  if (!D || !G) return;
  Object.assign(G.prototype, {
    drawWorldActions(m, by) {
      if (!m.selected || !m.context) return;
      const pt = this.view.screenPoint(
        m.selected,
        this.view.objectHeight(m.selected),
      );
      if (!pt.visible) return;
      const hasGauge = !!m.context.gauge,
        width = Math.min(300, this.w - 24),
        topPad = 10,
        labelH = 14,
        gap1 = 5,
        gaugeH = 10,
        gap2 = 6,
        buttonH = 44,
        bottomPad = 8,
        buttonTop = topPad + labelH + gap1 + (hasGauge ? gaugeH + gap2 : 0),
        height = buttonTop + buttonH + bottomPad;
      const hovering = ["act", "move", "inspect"].includes(this.hover?.id),
        pressed = m.pressed || false;
      if (m.reduced) this.bob = 0;
      else if (!hovering && !pressed)
        this.bob = Math.sin(this.view.time * 2) * 3;
      const obstacles = m.s.entities
        .filter((e) => !e.stored && e !== m.selected)
        .map((e) => this.view.screenPoint(e, 0.5))
        .filter((p) => p.visible);
      const candidates = [
        pt.x - width / 2,
        pt.x + 22,
        pt.x - width - 22,
        pt.x + 70,
        pt.x - width - 70,
      ].map((xx) => ({
        x: Math.max(12, Math.min(this.w - width - 12, xx)),
        y: Math.max(
          185,
          Math.min(by - 40 - height, pt.y - height - 10 + (this.bob || 0)),
        ),
      }));
      const score = (r) =>
        obstacles.filter(
          (p) =>
            p.x > r.x - 24 &&
            p.x < r.x + width + 24 &&
            p.y > r.y - 24 &&
            p.y < r.y + height + 24,
        ).length;
      candidates.sort((a, b) => score(a) - score(b));
      let { x, y } = candidates[0];
      if ((hovering || pressed) && this.anchor?.id === m.selected.id) {
        x = this.anchor.x;
        y = this.anchor.y;
      } else this.anchor = { id: m.selected.id, x, y };
      if (y + height > by - 35) return;
      this.actionRect = { x, y, w: width, h: height };
      this.worldRects.push(this.actionRect);
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(Math.max(x + 14, Math.min(x + width - 14, pt.x)), y + height);
      ctx.lineTo(pt.x, Math.min(by - 38, pt.y));
      ctx.strokeStyle = "#f3ecd8cc";
      ctx.lineWidth = 2;
      ctx.stroke();
      this.plate(x, y, width, height);
      this.line(
        m.context.status,
        x + 12,
        y + topPad + labelH / 2,
        width - 24,
        13,
        this.palette.ink,
      );
      if (hasGauge)
        this.gauge(
          x + 12,
          y + topPad + labelH + gap1,
          width - 24,
          gaugeH,
          m.context.gauge,
        );
      const inspectable = !m.selected.id.startsWith("zone-"),
        row = y + buttonTop,
        count = 1 + Number(!!m.canMove) + Number(inspectable),
        buttonW = (width - 24 - (count - 1) * 6) / count;
      this.button(
        "act",
        m.context.label,
        x + 12,
        row,
        buttonW,
        44,
        "act",
        {},
        true,
        !m.context.command &&
          !m.context.go &&
          !m.context.panel &&
          !m.context.wire &&
          !m.context.move,
      );
      if (m.canMove)
        this.button(
          "move",
          "F · Déplacer",
          x + 18 + buttonW,
          row,
          buttonW,
          44,
          "move",
        );
      if (inspectable)
        this.button(
          "inspect",
          "V · Inspecter",
          x + 12 + (count - 1) * (buttonW + 6),
          row,
          buttonW,
          44,
          "inspect",
          { id: m.selected.id },
        );
    },
    drawMoisture(m, by) {
      this.moistureRects = [];
      const plants = m.s.entities
        .filter(
          (e) =>
            !e.stored &&
            e.plant &&
            (e === m.selected ||
              e.plant.moisture < 20 ||
              GardenConstruction.distance(e, this.view.position) < 5),
        )
        .sort((a, b) => Number(b === m.selected) - Number(a === m.selected));
      for (const e of plants) {
        const pt = this.view.screenPoint(e, 0.8);
        if (!pt.visible) continue;
        const target = e === m.selected,
          rect = { x: pt.x - 27, y: pt.y + 8, w: 54, h: target ? 28 : 9 };
        if (
          rect.x < 8 ||
          rect.x + rect.w > this.w - 8 ||
          rect.y < 180 ||
          rect.y + rect.h > by - 35 ||
          this.overlaps(rect)
        )
          continue;
        this.worldRects.push(rect);
        this.moistureRects.push({ ...rect, id: e.id });
        this.box(rect.x, rect.y, 54, 8, "#f3ecd8", 4, "#697763");
        this.box(
          rect.x + 1,
          rect.y + 1,
          (52 * e.plant.moisture) / 100,
          6,
          e.plant.moisture < 20 ? "#b67745" : "#5b9fa7",
          3,
        );
        if (target) {
          this.box(rect.x + 5, rect.y + 10, 44, 19, "#f3ecd8e8", 4);
          this.text(
            `${Math.round(e.plant.moisture)} %`,
            pt.x,
            rect.y + 20,
            11,
            this.palette.ink,
            "center",
            700,
          );
        }
      }
    },
  });
})();
