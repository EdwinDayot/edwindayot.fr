(() => {
  const D = GardenData,
    G = window.GardenHUD;
  if (!D || !G) return;
  Object.assign(G.prototype, {
    drawInventory(m, w, x, y, pw, ph, p) {
      this.button(
        "tab-bag",
        "Le sac",
        x + 18,
        y + 58,
        110,
        36,
        "tab",
        { tab: "bag" },
        m.tab === "bag",
      );
      this.button(
        "tab-craft",
        "Fabrication",
        x + 136,
        y + 58,
        125,
        36,
        "tab",
        { tab: "craft" },
        m.tab === "craft",
      );
      const items =
          m.tab === "bag"
            ? Object.keys(D.tools).concat(
                Object.keys(m.s.inventory).filter(
                  (id) => id !== "coins" && m.s.inventory[id] > 0,
                ),
              )
            : Object.keys(D.recipes),
        cols = w < 500 ? 4 : 7,
        cell = (pw - 40) / cols,
        gap = 6,
        rows = Math.max(1, Math.min(3, Math.floor((ph - 320) / 82))),
        count = cols * rows,
        maxPage = Math.max(0, Math.ceil(items.length / count) - 1);
      this.page = Math.min(this.page, maxPage);
      items
        .slice(this.page * count, (this.page + 1) * count)
        .forEach((id, i) => {
          const xx = x + 18 + (i % cols) * cell,
            yy = y + 108 + Math.floor(i / cols) * 82,
            locked = !!D.recipes[id] && !m.s.plans.includes(id);
          const b = this.button(
            "item-" + id,
            "",
            xx,
            yy,
            cell - gap,
            76,
            "item",
            { item: id },
            m.item === id,
          );
          b.item = id;
          b.inventory = true;
          this.icon(id, xx + (cell - gap - 53) / 2, yy + 2, 53);
          const itemName = D.tools[id] || D.itemName(id),
            short =
              itemName.length > 13 ? itemName.slice(0, 12) + "…" : itemName;
          this.text(
            short,
            xx + (cell - gap) / 2,
            yy + 63,
            10,
            m.item === id ? "#fff3d8" : p.muted,
            "center",
          );
          this.text(
            locked ? "×" : D.tools[id] ? "" : m.s.inventory[id] || "✦",
            xx + cell - gap - 5,
            yy + 10,
            11,
            m.item === id ? "#fff3d8" : p.muted,
            "right",
            700,
          );
          if (locked) this.box(xx, yy, cell - gap, 76, "#ece4cf55", 7);
        });
      for (
        let i = Math.min(count, items.length - this.page * count);
        i < count;
        i++
      ) {
        const xx = x + 18 + (i % cols) * cell,
          yy = y + 108 + Math.floor(i / cols) * 82;
        this.box(xx, yy, cell - gap, 76, "#e8e0ca", 7, "#c2b391");
      }
      const gy = y + 108 + rows * 82;
      if (maxPage) {
        this.button(
          "prev",
          "‹",
          x + 18,
          gy - 5,
          35,
          30,
          "page",
          { delta: -1 },
          false,
          this.page === 0,
        );
        this.text(
          `${this.page + 1}/${maxPage + 1}`,
          x + 75,
          gy + 10,
          12,
          p.muted,
          "center",
        );
        this.button(
          "next",
          "›",
          x + 100,
          gy - 5,
          35,
          30,
          "page",
          { delta: 1 },
          false,
          this.page === maxPage,
        );
      }
      const item = m.item,
        detailY = gy + (maxPage ? 34 : 0),
        name = item
          ? D.tools[item] || D.itemName(item)
          : "Choisis un objet, puis un emplacement";
      this.text(name, x + 20, detailY + 10, 16, p.ink, "left", 700);
      let detail =
        "1–5 pour affecter · glisser-déposer pour déplacer · I pour revenir";
      if (D.recipes[item])
        detail = m.s.plans.includes(item)
          ? "À la pose : " +
            Object.entries(D.recipes[item].cost)
              .map(([k, n]) => n + " " + D.itemName(k))
              .join(" · ")
          : "Plan à découvrir lors des échanges et de l’exploration.";
      else if (item && ["wood", "stone", "clay"].includes(item))
        detail =
          "Matériau de fabrication. Conservé dans le sac et consommé seulement à la pose.";
      else if (item?.startsWith("flower:"))
        detail = "Production à échanger auprès de Léa.";
      else if (["axe", "pickaxe", "shovel"].includes(item))
        detail = {
          axe: "Coupe les arbres du jardin et du sous-bois. Maintiens E ou le clic : 3 coups.",
          pickaxe:
            "Exploite les veines de pierre. Maintiens E ou le clic : 4 coups.",
          shovel:
            "Creuse les bancs d’argile. Maintiens E ou le clic : 3 coups.",
        }[item];
      this.wrap(detail, x + 20, detailY + 34, pw - 40, 12);
      const ss = Math.min(66, (pw - 68) / 5),
        barx = x + (pw - (ss * 5 + 24)) / 2,
        bary = y + ph - 116;
      m.s.hotbar.forEach((id, i) =>
        this.slot(
          "assign-" + i,
          id,
          barx + i * (ss + 6),
          bary,
          ss,
          i,
          m.activeSlot === i,
          "assign",
        ),
      );
      this.button(
        "reserve",
        "Réserve · " + m.s.entities.filter((e) => e.stored).length,
        x + 18,
        y + ph - 43,
        125,
        30,
        "reserve",
      );
      this.text("I · Fermer", x + pw - 20, y + ph - 27, 11, p.muted, "right");
    },
  });
})();
