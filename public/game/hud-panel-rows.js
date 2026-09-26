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
          if (r.action) {
            // Epic C6.2: unlike every other action here, veilleuse/prise-à-fort-débit toggle
            // between two opposite labels depending on the station's own current state
            // (design C6.2's own criterion: "le libellé du bouton reflète l'état courant") —
            // the row itself computes that label (hud-panel.js) since this switch has no access
            // to campaignStations, the same "row supplies its own text, this file only lays it
            // out" split already used for r.title/r.detail.
            const buttonText =
              r.buttonLabel ||
              (r.action === "confirm-cutting"
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
                                      : r.action === "observation-step"
                                        ? "Avancer"
                                        : r.action === "begin-teaching"
                                          ? "Regarde-moi"
                                          : r.action === "teaching-cycle-verb"
                                            ? "Choisir un verbe"
                                            : r.action === "teaching-edit-field"
                                            ? "Modifier"
                                            : r.action === "demonstrate-teaching"
                                              ? "Démontrer"
                                              : r.action === "revise-phrase-edit"
                                                ? "Corriger"
                                                : r.action === "confirm-teaching"
                                                  ? "Confirmer"
                                                  : r.action === "cancel-teaching"
                                                    ? "Annuler"
                                                    : "Choisir");
            const btn = this.button(
              "row-" + i,
              buttonText,
              x + pw - 105,
              ry + 18,
              77,
              36,
              r.action,
              r.data || {},
              false,
              r.disabled,
            );
            // buttonText is what's actually drawn on the button (what a player/a test reads);
            // .label is overwritten right after to a richer title+detail summary, unrelated to
            // this addition (predates C6.2, kept as-is).
            btn.buttonText = buttonText;
            btn.label = r.title + ". " + r.detail;
          }
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
