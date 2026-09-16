(() => {
  const D = GardenData,
    I = window.GardenIrrigation,
    Gauge = window.GardenGauge,
    G = window.GardenHUD;
  if (!D || !I || !Gauge || !G) return;
  Object.assign(G.prototype, {
    // Non-plant detail content: title, an optional gauge and a short row list.
    // This is where the verbose clauses removed from the compact world card live.
    objectDetail(m, e) {
      const s = m.s;
      if (e.id === "river")
        return {
          title: "Le ponton",
          rows: [["Eau", "Gratuite · remplit l’arrosoir sans limite"]],
        };
      if (e.id.startsWith("cache-"))
        return {
          title: "Cache botanique",
          rows: [["Contenu", "Une espèce inédite à découvrir"]],
        };
      if (e.id.startsWith("resource-")) {
        const spec = D.mining[e.type],
          remaining = Math.max(0, Math.ceil(e.ready - s.elapsed));
        return {
          title: spec.name,
          gauge: Gauge.resource(spec, e, s.elapsed),
          rows: [
            ["Outil", D.tools[spec.tool]],
            remaining
              ? ["Revient dans", `${remaining} s`]
              : ["Progression", `${e.work || 0}/${spec.hits} gestes`],
            ["Renouvellement", `${spec.renew} s`],
          ],
        };
      }
      if (e.id === "lea")
        return {
          title: "Léa · échanges",
          rows: s.requests.length
            ? s.requests.map((r) => [
                D.itemName(r.item),
                `${r.quantity} demandé${r.quantity > 1 ? "s" : ""} · ${s.inventory[r.item] || 0} en réserve`,
              ])
            : [["Demandes", "Aucune demande active"]],
        };
      if (e.id === "noe")
        return {
          title: "Noé · équipements",
          rows: [
            ["Atelier", "Pots, tuyaux, citernes et lanternes"],
            ["Plans connus", `${s.plans.length}`],
          ],
        };
      if (e.id === "iris")
        return {
          title: "Iris · botaniste",
          rows: [
            ["Carnet", `${s.discovered.length}/${D.species.length} espèces`],
            [
              "Prochaine récompense",
              [3, 6, 9, 12].find((n) => !s.botanyRewards.includes(n)) ===
              undefined
                ? "Toutes obtenues"
                : `${[3, 6, 9, 12].find((n) => !s.botanyRewards.includes(n))} espèces`,
            ],
          ],
        };
      if (e.type === "tank") {
        const status = I.status(s, e),
          unit = I.substance(s, e.id) === "water" ? "eau" : "engrais";
        return {
          title: D.recipes.tank.name,
          gauge: Gauge.tank(e),
          rows: [
            ["Circuit", status.message],
            ["Entrée", `${status.inflow.toFixed(1)} ${unit}/s`],
            ["Sortie", `${status.outflow.toFixed(1)} ${unit}/s`],
            ["Pots desservis", `${status.pots}`],
          ],
        };
      }
      if (I.SOURCE.includes(e.type)) {
        const status = I.status(s, e);
        return {
          title: D.recipes[e.type].name,
          gauge: Gauge.pump(e),
          rows: [
            ["État", status.message],
            ["Citernes du circuit", `${status.water}/${status.capacity}`],
          ],
        };
      }
      if (D.recipes[e.type]?.buffer || D.recipes[e.type]?.dispense) {
        const recipe = D.recipes[e.type],
          entries = Object.entries(e.buffer || {}).filter(([, n]) => n > 0),
          total = entries.reduce((n, [, v]) => n + v, 0);
        return {
          title: recipe.name,
          gauge: Gauge.collector(e, recipe.capacity),
          rows: entries
            .slice(0, 3)
            .map(([k, n]) => [D.itemName(k), `${n}`])
            .concat([["Total", `${total}/${recipe.capacity}`]]),
        };
      }
      if (e.type === "autoPlanter") {
        const cap = D.recipes.autoPlanter.capacity,
          entries = Object.entries(e.buffer || {}).filter(([, n]) => n > 0),
          total = entries.reduce((n, [, v]) => n + v, 0);
        return {
          title: D.recipes.autoPlanter.name,
          gauge: Gauge.collector(e, cap),
          rows: entries
            .slice(0, 3)
            .map(([k, n]) => [D.itemName(k), `${n}`])
            .concat([["Réserve", `${total}/${cap}`]]),
        };
      }
      if (e.type === "nursery") {
        if (!e.job)
          return {
            title: D.recipes.nursery.name,
            rows: [["État", "Aucune multiplication en cours"]],
          };
        const sp = D.species.find((p) => p.id === e.job.species);
        return {
          title: D.recipes.nursery.name,
          gauge: Gauge.nursery(e.job),
          rows: [
            ["Espèce", sp.name],
            [
              "État",
              e.job.remaining === 0
                ? "Jeune plant prêt"
                : `${Math.ceil(e.job.remaining)} s restantes`,
            ],
          ],
        };
      }
      if (I.isPot(e))
        return {
          title: "Pot",
          rows: [["Contenu", "Vide · plante une graine ou un jeune plant"]],
        };
      return {
        title: D.recipes[e.type]?.name || "Objet",
        rows: [["État", I.status(s, e).message]],
      };
    },
    drawInspection(m) {
      this.buttons = [];
      const e = m.selected;
      if (!e) return;
      if (e.plant) return this.drawPlantInspection(m, e);
      const info = this.objectDetail(m, e),
        mobile = this.w < 650,
        rowH = mobile ? 34 : 40,
        pw = mobile ? this.w - 24 : 310,
        ph =
          (mobile ? 96 : 110) + info.rows.length * rowH + (info.gauge ? 26 : 0),
        x = mobile ? 12 : this.w - pw - 20,
        y = mobile ? this.h - ph - 12 : 190,
        p = this.palette;
      this.panelRect = { x, y, w: pw, h: ph };
      this.plate(x, y, pw, ph);
      this.text(info.title, x + 16, y + 26, 23, p.ink, "left", 700);
      this.button("close", "×", x + pw - 54, y + 7, 44, 44, "close");
      let ry = y + 55;
      if (info.gauge) {
        this.gauge(x + 16, ry, pw - 32, 10, info.gauge);
        ry += 26;
      }
      for (const [label, value] of info.rows) {
        this.text(label, x + 16, ry, mobile ? 10 : 11, p.muted, "left", 700);
        this.line(value, x + 16, ry + 15, pw - 32, mobile ? 11 : 12, p.ink);
        ry += rowH;
      }
    },
    drawPlantInspection(m, e) {
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
