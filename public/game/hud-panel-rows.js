(() => {
  const D = GardenData,
    G = window.GardenHUD;
  if (!D || !G) return;
  Object.assign(G.prototype, {
    drawPanelRows(rows, m, w, x, y, pw, ph, p) {
      const perPage = Math.max(3, Math.floor((ph - 145) / 76)),
        max = Math.max(0, Math.ceil(rows.length / perPage) - 1);
      this.page = Math.min(this.page, max);
      rows
        .slice(this.page * perPage, (this.page + 1) * perPage)
        .forEach((r, i) => {
          const ry = y + 75 + i * 76;
          this.box(x + 17, ry, pw - 34, 69, "#e8dfc9", 6);
          this.text(
            r.title,
            x + 29,
            ry + 19,
            w < 500 ? 13 : 15,
            p.ink,
            "left",
            600,
          );
          this.wrap(
            r.detail,
            x + 29,
            ry + 42,
            pw - (r.alternate ? 220 : 145),
            10,
          );
          if (r.action)
            this.button(
              "row-" + i,
              r.action === "confirm-cutting"
                ? "Confirmer"
                : r.action === "trade"
                  ? "Échanger"
                  : r.action === "restore"
                    ? "Reposer"
                    : r.action === "buy"
                      ? "Acheter"
                      : r.action === "quest-accept"
                        ? "Accepter"
                        : r.action === "quest-complete"
                          ? "Terminer"
                          : r.action === "keep-cultivar"
                            ? "Garder"
                            : r.action === "store-cultivar"
                              ? "Réserver"
                              : r.action === "give-cultivar"
                                ? "Donner"
                                : r.action === "compost-cultivar"
                                  ? "Composter"
                                  : r.action === "rename-cultivar"
                                    ? "Renommer"
                                    : r.action === "confirm-night"
                                      ? "Dormir"
                                      : "Choisir",
              x + pw - 105,
              ry + 18,
              77,
              36,
              r.action,
              r.data || {},
              false,
              r.disabled,
            ).label = r.title + ". " + r.detail;
          if (r.alternate)
            this.button(
              "alternate-" + i,
              "↻",
              x + pw - 151,
              ry + 18,
              38,
              36,
              r.alternate.action,
              r.alternate.data,
            );
        });
      this.button(
        "prev",
        "‹",
        x + 18,
        y + ph - 51,
        42,
        35,
        "page",
        { delta: -1 },
        false,
        this.page === 0,
      );
      this.text(
        `${this.page + 1}/${max + 1}`,
        x + 80,
        y + ph - 33,
        12,
        p.muted,
        "center",
      );
      this.button(
        "next",
        "›",
        x + 101,
        y + ph - 51,
        42,
        35,
        "page",
        { delta: 1 },
        false,
        this.page === max,
      );
      this.text(
        "Échap · Retour au jardin",
        x + pw - 22,
        y + ph - 33,
        11,
        p.muted,
        "right",
      );
    },
  });
})();
