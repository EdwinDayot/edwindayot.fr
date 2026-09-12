(() => {
  const D = GardenData,
    G = window.GardenHUD;
  if (!D || !G) return;
  Object.assign(G.prototype, {
    buildPanelRows(m, w, x, y, pw, ph, p) {
      const rows = [];
      if (m.panel === "nursery") {
        for (const sp of D.species) {
          const n = m.s.inventory["cutting:" + sp.id] || 0;
          if (n)
            rows.push({
              title: sp.name + " · " + n + " boutures",
              detail:
                m.cutting === sp.id
                  ? "Une bouture sera consommée · 3 minutes"
                  : "Choisir cette espèce",
              action:
                m.cutting === sp.id ? "confirm-cutting" : "choose-cutting",
              data: { species: sp.id },
            });
        }
        if (!rows.length)
          rows.push({
            title: "Aucune bouture dans le sac",
            detail: "Récolte une plante qui produit des boutures.",
          });
      } else if (m.panel === "map") {
        rows.push({
          title: "Le ponton",
          detail: "Eau gratuite · remplir l’arrosoir",
          action: "go",
          data: { id: "river" },
        });
        for (const z of D.zones) {
          if (!m.s.unlocked.includes(z.id))
            rows.push({
              title: z.name,
              detail:
                "Passage à ouvrir · " +
                Object.entries(z.cost)
                  .map(([k, n]) => `${n} ${D.itemName(k)}`)
                  .join(", "),
              action: "go",
              data: { id: "zone-" + z.id },
            });
          else {
            for (const r of m.s.resources.filter(
              (r) =>
                r.zone === z.id && GardenConstruction.resourceClear(m.s, r),
            ))
              rows.push({
                title: D.mining[r.type].name + " · " + z.name,
                detail:
                  r.ready > m.s.elapsed
                    ? "Renouvellement · " +
                      Math.ceil(r.ready - m.s.elapsed) +
                      " s"
                    : D.tools[D.mining[r.type].tool] +
                      " · 3 " +
                      D.itemName(r.type),
                action: "go",
                data: { id: r.id },
              });
            for (const cache of D.caches.filter(
              (q) => q.zone === z.id && !m.s.discovered.includes(q.species),
            ))
              rows.push({
                title: "Cache botanique · " + z.name,
                detail: "Une nouvelle espèce",
                action: "go",
                data: { id: cache.id },
              });
          }
        }
      } else if (m.panel === "notebook")
        for (const sp of D.species) {
          const known = m.s.discovered.includes(sp.id);
          rows.push({
            title: known ? sp.name : "Espèce inconnue",
            detail: known
              ? `${sp.light} · ${D.zones[sp.zone].name} · adulte en ${Math.round(sp.grow / 60)} min`
              : "Une cache dans " + D.zones[sp.zone].name,
            action: known ? "inspect" : null,
            data: { species: sp.id },
          });
        }
      else if (m.panel === "visitor")
        for (const r of m.s.requests)
          rows.push({
            title: `${r.quantity} ${D.itemName(r.item)}`,
            detail: `En réserve : ${m.s.inventory[r.item] || 0} · 18 feuilles + une graine`,
            action: "trade",
            data: { request: r.id },
            alternate: {
              action: "replace",
              label: "Remplacer",
              data: { request: r.id },
            },
            disabled: (m.s.inventory[r.item] || 0) < r.quantity,
          });
      else if (m.panel === "reserve") {
        for (const e of m.s.entities.filter((e) => e.stored))
          rows.push({
            title: D.recipes[e.type].name,
            detail: e.job
              ? D.species.find((sp) => sp.id === e.job.species).name +
                (e.job.remaining === 0
                  ? " · prêt à récupérer"
                  : " · en pause, " + Math.ceil(e.job.remaining) + " s")
              : e.plant
                ? D.species.find((sp) => sp.id === e.plant.species).name +
                  " · conservée intacte"
                : "Prêt à replacer",
            action: "restore",
            data: { id: e.id },
          });
      } else if (m.panel === "settings") {
        for (const [key, label] of [
          ["sound", "Sons et ambiance"],
          ["hints", "Indications"],
          ["reduced", "Réduire les mouvements"],
        ])
          rows.push({
            title: label,
            detail: m.s.settings[key] ? "Activé" : "Désactivé",
            action: "setting",
            data: { key },
          });
        rows.push(
          {
            title: m.paused ? "Reprendre" : "Mettre en pause",
            detail: "Les plantes ne meurent jamais",
            action: "pause",
          },
          ...["export", "import", "backup", "rescue"].map((id) => ({
            title: {
              export: "Exporter la partie",
              import: "Importer une partie",
              backup: "Restaurer la copie précédente",
              rescue: "Paquet de secours",
            }[id],
            detail: {
              export: "Conserver un fichier JSON",
              import: m.importReady
                ? "Fichier valide · cliquer pour confirmer"
                : "Choisir un fichier JSON",
              backup: "La dernière sauvegarde valide",
              rescue: "Gratuit si aucune plante ou graine ne reste",
            }[id],
            action: id,
          })),
        );
      }
      return rows;
    },
  });
})();
