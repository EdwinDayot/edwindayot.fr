(() => {
  const D = GardenData,
    G = window.GardenHUD;
  if (!D || !G) return;
  Object.assign(G.prototype, {
    drawHeader(m, l, w, h, c) {
      const { mobile, p, left, rw, size, gap, bw, bx, by } = l;
      this.plate(left, 18, mobile ? 172 : 245, 58);
      this.text(m.zone, left + 15, 40, mobile ? 16 : 20, p.ink, "left", 700);
      this.text("LA PÉPINIÈRE D’EDWIN", left + 15, 60, 9, p.muted, "left", 700);
      this.plate(left, 85, rw, 48);
      this.icon("water", left + 4, 87, 42);
      this.text(`${Math.floor(m.s.water)}/100`, left + 44, 110, 12);
      this.text(
        `${m.s.inventory.coins} feuilles`,
        left + (mobile ? 102 : 122),
        110,
        12,
      );
      if (!mobile) this.text(`✦ ${m.s.reputation}`, left + 233, 110, 12);
      const resources = ["wood", "stone", "clay"];
      resources.forEach((id, i) => {
        const x = left + i * 67;
        this.box(x, 141, 62, 35, "#f3ecd8de", 7);
        this.icon(id, x, 139, 35);
        this.text(
          m.s.inventory[id] || 0,
          x + 40,
          159,
          12,
          p.ink,
          "center",
          700,
        );
      });
    },
    drawNav(m, l, w, h, c) {
      const { mobile, p, left, rw, size, gap, bw, bx, by } = l;
      const navY = mobile ? 83 : 83,
        navX = mobile ? w - 58 : w - 217;
      [
        ["inventory", "I"],
        ["map", "M"],
        ["notebook", "J"],
        ["settings", "⚙"],
      ].forEach(([id, label], i) =>
        this.button(
          "open-" + id,
          label,
          navX + (mobile ? 0 : i * 49),
          navY + (mobile ? i * 47 : 0),
          44,
          40,
          "panel",
          { panel: id },
        ),
      );
    },
    drawHotbar(m, l, w, h, c) {
      const { mobile, p, left, rw, size, gap, bw, bx, by } = l;
      this.plate(bx, by, bw, size + 26);
      m.s.hotbar.forEach((id, i) =>
        this.slot(
          "slot-" + i,
          id,
          bx + 9 + i * (size + gap),
          by + 7,
          size,
          i,
          m.activeSlot === i,
        ),
      );
      const held = D.tools[m.held] || D.itemName(m.held);
      this.box(
        w / 2 - Math.min(held.length * 3.6 + 16, 160),
        by - 31,
        Math.min(held.length * 7.2 + 32, 320),
        25,
        "#f3ecd8df",
        6,
      );
      this.text(held, w / 2, by - 18, 12, p.ink, "center", 600);
      if (!mobile)
        this.text(
          "1–5 équiper   ·   I inventaire   ·   E agir / maintenir   ·   Maj courir",
          w / 2,
          h - 5,
          10,
          p.ink,
          "center",
        );
    },
    drawBuildCard(m, l, w, h, c) {
      const { mobile, p, left, rw, size, gap, bw, bx, by } = l;
      if (m.build) {
        const width = Math.min(480, w - 24),
          x = (w - width) / 2,
          y = by - 185;
        this.plate(x, y, width, 143);
        this.text(
          D.recipes[m.build.item].name,
          x + 17,
          y + 23,
          16,
          p.ink,
          "left",
          700,
        );
        this.wrap(
          m.build.error || m.build.cost,
          x + 17,
          y + 48,
          width - 34,
          12,
          m.build.error ? "#9b513c" : p.muted,
        );
        const bwidth = (width - 42) / (m.build.id && !m.build.restore ? 4 : 3);
        [
          "place",
          "rotate",
          ...(m.build.id && !m.build.restore ? ["store"] : []),
          "cancel",
        ].forEach((action, i) =>
          this.button(
            "build-" + action,
            {
              place: "E · Poser",
              rotate: "R · Tourner",
              store: "En réserve",
              cancel: "Annuler",
            }[action],
            x + 12 + i * (bwidth + 6),
            y + 90,
            bwidth,
            40,
            action,
            {},
            action === "place",
            action === "place" && !!m.build.error,
          ),
        );
      }
    },
    drawCamera(m, l, w, h, c) {
      const { mobile, p, left, rw, size, gap, bw, bx, by } = l;
      const cy = mobile ? by - 246 : h - 64,
        cx = mobile ? w - 106 : w - 202;
      [
        ["zoom-in", "+"],
        ["zoom-out", "−"],
        ["orbit", "↻"],
        ["network", "Eau"],
      ].forEach(([id, label], i) =>
        this.button(
          id,
          label,
          cx + (mobile ? i % 2 : i) * 47,
          cy + (mobile ? Math.floor(i / 2) * 45 : 0),
          42,
          40,
          id,
          {},
          id === "network" && m.network,
        ),
      );
    },
    drawJoystick(m, l, w, h, c) {
      const { mobile, p, left, rw, size, gap, bw, bx, by } = l;
      if (m.touch) {
        const j = {
          id: "joystick",
          x: 18,
          y: by - (m.build ? 290 : 246),
          w: 96,
          h: 96,
          action: "joystick",
          data: {},
        };
        this.buttons.push(j);
        c.beginPath();
        c.arc(j.x + 48, j.y + 48, 46, 0, Math.PI * 2);
        c.fillStyle = "#f3ecd866";
        c.fill();
        c.strokeStyle = "#788560";
        c.stroke();
        c.beginPath();
        c.arc(
          j.x + 48 + m.stick.x * 26,
          j.y + 48 + m.stick.z * 26,
          21,
          0,
          Math.PI * 2,
        );
        c.fillStyle = "#496a4399";
        c.fill();
      }
    },
  });
})();
