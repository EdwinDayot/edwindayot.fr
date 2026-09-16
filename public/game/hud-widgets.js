(() => {
  const D = GardenData,
    G = window.GardenHUD;
  if (!D || !G) return;
  Object.assign(G.prototype, {
    box(x, y, w, h, fill = this.palette.paper, r = 10, stroke = null) {
      const c = this.ctx;
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      c.fillStyle = fill;
      c.fill();
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = 1.5;
        c.stroke();
      }
    },
    leaf(x, y, size = 14) {
      const c = this.ctx;
      c.save();
      c.translate(x, y);
      c.rotate(-0.65);
      c.fillStyle = "#547b42";
      c.beginPath();
      c.ellipse(0, 0, size * 0.32, size * 0.5, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#d7e5b6";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, size * 0.4);
      c.lineTo(0, -size * 0.35);
      c.stroke();
      c.restore();
    },
    text(
      text,
      x,
      y,
      size = 13,
      color = this.palette.ink,
      align = "left",
      weight = 500,
    ) {
      const c = this.ctx;
      c.font = `${weight} ${size}px "Trebuchet MS", sans-serif`;
      c.textBaseline = "middle";
      c.fillStyle = color;
      const value = String(text).replace(/(\d+) feuilles/g, "◈ $1"),
        width = c.measureText(value).width;
      let xx =
        x - (align === "center" ? width / 2 : align === "right" ? width : 0);
      c.textAlign = "left";
      for (const part of value.split(/(◈)/)) {
        if (part === "◈") {
          this.leaf(xx + size * 0.4, y, size);
          xx += c.measureText(part).width;
        } else {
          c.fillStyle = color;
          c.fillText(part, xx, y);
          xx += c.measureText(part).width;
        }
      }
    },
    line(text, x, y, maxWidth, size = 13, color = this.palette.ink) {
      this.ctx.font = `500 ${size}px "Trebuchet MS", sans-serif`;
      let value = String(text);
      if (this.ctx.measureText(value).width > maxWidth) {
        while (
          value.length > 1 &&
          this.ctx.measureText(value + "…").width > maxWidth
        )
          value = value.slice(0, -1);
        value += "…";
      }
      this.text(value, x, y, size, color);
    },
    gauge(x, y, w, h, g) {
      const colors = {
          water: "#5b9fa7",
          amber: "#b67745",
          growth: "#66864b",
          ready: "#8a9878",
        },
        fill = colors[g.tone] || colors.water,
        barW = w - 58;
      this.box(x, y, barW, h, "#e3dcc2", h / 2, "#aa9570");
      const fw =
        g.fraction > 0 ? Math.max(h, barW * Math.min(1, g.fraction)) : 0;
      if (fw) this.box(x, y, fw, h, fill, h / 2);
      this.text(
        g.text,
        x + w,
        y + h / 2 + 1,
        11,
        this.palette.ink,
        "right",
        700,
      );
    },
    wrap(text, x, y, width, size = 13, color = this.palette.muted) {
      this.ctx.font = `500 ${size}px "Trebuchet MS", sans-serif`;
      let line = "",
        row = 0;
      for (const word of String(text).split(" ")) {
        if (this.ctx.measureText(line + word).width > width && line) {
          this.text(line.trim(), x, y + row * (size + 6), size, color);
          row++;
          line = "";
        }
        line += word + " ";
      }
      if (line) this.text(line.trim(), x, y + row * (size + 6), size, color);
      return (row + 1) * (size + 6);
    },
    icon(id, x, y, size = 52) {
      let img = this.images.get(id);
      if (!img) {
        img = new Image();
        img.src = this.view.itemIcon(id);
        this.images.set(id, img);
      }
      if (img.complete && img.naturalWidth)
        this.ctx.drawImage(img, x, y, size, size);
    },
    button(
      id,
      label,
      x,
      y,
      w = 100,
      h = 44,
      action = id,
      data = {},
      selected = false,
      disabled = false,
    ) {
      w = Math.max(44, w);
      h = Math.max(44, h);
      const b = { id, label, x, y, w, h, action, data, disabled };
      this.buttons.push(b);
      const on =
        this.hover?.id === id ||
        (this.buttons.indexOf(b) === this.focus && this.keyboard);
      this.box(x, y + 2, w, h, "#51473235", 7);
      this.box(
        x,
        y,
        w,
        h,
        disabled
          ? "#d3cdb9"
          : selected
            ? "#496a43"
            : on
              ? "#e4d5ad"
              : "#e9dfc4",
        7,
        selected ? "#d7b468" : "#aa9570",
      );
      this.text(
        label,
        x + w / 2,
        y + h / 2,
        12,
        selected ? "#fff7dc" : disabled ? "#8d8a79" : this.palette.ink,
        "center",
        600,
      );
      return b;
    },
    slot(id, item, x, y, size, index, selected, action = "slot") {
      const b = this.button(
        id,
        "",
        x,
        y,
        size,
        size + 8,
        action,
        { slot: index, item },
        selected,
      );
      b.item = item;
      b.slot = index;
      if (item === "water") {
        const water = Math.max(0, Math.min(100, this.model.s.water)),
          empty = water === 0,
          low = water <= D.balance.wateringCost;
        this.icon(item, x + 12, y + 3, size - 24);
        this.text(
          empty ? "Vide" : `${Math.floor(water)}/100`,
          x + size / 2,
          y + size - 14,
          12,
          empty
            ? selected
              ? "#ffe0b5"
              : "#8b362d"
            : selected
              ? "#fff7dc"
              : "#173e48",
          "center",
          700,
        );
        this.box(
          x + 6,
          y + size - 4,
          size - 12,
          7,
          empty ? "#59392e" : "#173e48",
          3,
          empty ? "#b25f42" : "#e5edda",
        );
        if (!empty)
          this.box(
            x + 7,
            y + size - 3,
            ((size - 14) * water) / 100,
            5,
            low ? "#efb85b" : "#80d7e5",
            2,
          );
        b.label = `Arrosoir · ${Math.floor(water)}/100${water < D.balance.wateringCost ? " · à remplir" : ""}`;
      } else {
        this.icon(item, x + 6, y + 5, size - 12);
        const n = D.tools[item]
          ? ""
          : this.model.s.inventory[item] || (D.recipes[item] ? "✦" : "0");
        this.text(
          n,
          x + size - 7,
          y + size - 6,
          12,
          selected ? "#fff0c6" : "#514e38",
          "right",
          700,
        );
      }
      this.text(
        index + 1,
        x + 8,
        y + 10,
        11,
        selected ? "#fff0c6" : "#736449",
        "left",
        700,
      );
      return b;
    },
  });
})();
