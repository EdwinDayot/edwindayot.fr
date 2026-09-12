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
      const width = Math.min(m.selected.plant ? 350 : 320, this.w - 24),
        height = 104;
      const hovering = ["act", "move", "inspect-plant"].includes(
          this.hover?.id,
        ),
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
      this.wrap(
        m.context.status,
        x + 12,
        y + 20,
        width - 24,
        11,
        this.palette.ink,
      );
      const row = y + height - 53,
        count = 1 + Number(!!m.canMove) + Number(!!m.selected.plant),
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
      if (m.selected.plant)
        this.button(
          "inspect-plant",
          "V · Inspecter",
          x + 12 + (count - 1) * (buttonW + 6),
          row,
          buttonW,
          44,
          "inspect",
          { id: m.selected.id },
        );
      if (m.context.progress !== undefined) {
        this.box(x + 12, y + height - 5, width - 24, 3, "#b8b59c", 1);
        this.box(
          x + 12,
          y + height - 5,
          (width - 24) * m.context.progress,
          3,
          "#66864b",
          1,
        );
      }
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
    drawInspection(m) {
      this.buttons = [];
      const e = m.s.entities.find((e) => e.id === this.view.inspection?.id);
      if (!e?.plant) return;
      const sp = D.species.find((sp) => sp.id === e.plant.species),
        plant = e.plant,
        mobile = this.w < 650,
        pw = mobile ? this.w - 24 : 310,
        ph = mobile ? 232 : 364,
        x = mobile ? 12 : this.w - pw - 20,
        y = mobile ? this.h - ph - 12 : 190,
        p = this.palette;
      this.panelRect = { x, y, w: pw, h: ph };
      this.plate(x, y, pw, ph);
      this.text(sp.name, x + 16, y + 26, 23, p.ink, "left", 700);
      this.button("close", "×", x + pw - 54, y + 7, 44, 44, "close");
      const stage =
        plant.growth < 0.12
          ? "Graine"
          : plant.growth < 0.28
            ? "Germe"
            : plant.growth < 1
              ? "Jeune plante"
              : "Adulte";
      const lines = [
        sp.latin,
        `${stage} · croissance ${Math.round(plant.growth * 100)} %`,
        `Humidité ${Math.round(plant.moisture)} % · ${plant.ready}/3 productions`,
        `${D.itemName(sp.product + ":" + sp.id)}`,
        `Provenance : ${plant.source === "young" ? "jeune plant" : plant.source === "seed" ? "graine" : "jardin sauvegardé"}`,
        `Origine : ${D.zones[sp.zone].name}`,
        `Préférences ludiques : ${sp.light}, humidité 20–85 %`,
      ];
      lines.forEach((line, i) =>
        this.text(
          line,
          x + 16,
          y + 57 + i * (mobile ? 18 : 29),
          mobile ? 11 : 12,
          p.ink,
        ),
      );
      this.button(
        "inspect-left",
        "−45°",
        x + 16,
        y + ph - 52,
        54,
        44,
        "inspect-orbit",
        { delta: -1 },
      );
      this.button(
        "inspect-right",
        "+45°",
        x + 78,
        y + ph - 52,
        54,
        44,
        "inspect-orbit",
        { delta: 1 },
      );
      this.text(
        "La plante continue de grandir",
        x + pw - 14,
        y + ph - 30,
        10,
        p.muted,
        "right",
      );
    },
  });
})();
