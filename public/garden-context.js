(() => {
  const A = window.GardenApp;
  if (!A || !A.view) {
    return;
  }
  const D = GardenData,
    C = GardenConstruction,
    I = GardenIrrigation,
    R = GardenRules,
    S = GardenSave,
    $ = (id) => document.getElementById(id);
  A.context = function context() {
    const e = A.selected;
    if (!e)
      return {
        label: "E · Agir",
        status: ["axe", "pickaxe", "shovel"].includes(A.held())
          ? `${A.label(A.held())} · vise une ressource, puis maintiens E`
          : "ZQSD / flèches · I pour équiper tes objets",
      };
    const far = C.distance(A.view.position, e) >= 1.85,
      near = (() => {
        const s = A.game.s,
          tool = A.held();
        if (
          tool === "hose" &&
          ["tank", "pump", "pipe", "drip", "pot", "reservoir"].includes(
            e.type,
          ) &&
          A.game.s.entities.includes(e)
        )
          return {
            label: A.wireStart ? "E · Relier" : "E · Choisir le départ",
            status: A.wireStart
              ? I.orientation(A.wireStart, e) === -1
                ? `${A.name(e)} → ${A.name(A.wireStart)}`
                : `${A.name(A.wireStart)} ${I.orientation(A.wireStart, e) === 1 ? "→" : "↔"} ${A.name(e)}`
              : `${A.name(e)} · ${I.status(s, e).message}`,
            wire: true,
          };
        if (e.id === "river")
          return {
            label: "E · Remplir",
            status: "Ponton · eau gratuite",
            command: "fill",
          };
        if (e.id.startsWith("resource-")) {
          const spec = D.mining[e.type],
            remaining = Math.max(0, Math.ceil(e.ready - s.elapsed));
          return {
            label: remaining
              ? "Renouvellement"
              : tool === spec.tool
                ? `Maintenir E · ${spec.verb}`
                : `Équiper ${D.tools[spec.tool]}`,
            status: remaining
              ? `${spec.name} · revient dans ${remaining} s`
              : `${spec.name} · ${e.work || 0}/${spec.hits} · +3 ${D.itemName(e.type)}`,
            progress: remaining
              ? 1 - remaining / spec.renew
              : (e.work || 0) / spec.hits,
            command: !remaining && tool === spec.tool ? "mine" : null,
            tool: spec.tool,
          };
        }
        if (e.id.startsWith("zone-")) {
          const z = D.zones[+e.id.split("-")[1]];
          return {
            label: "E · Ouvrir",
            status: `${z.name} · ${A.costs(z.cost)} · réputation ${z.rep}`,
            command: "unlock",
            zone: z.id,
          };
        }
        if (e.id.startsWith("cache-"))
          return {
            label: "E · Découvrir",
            status: "Cache botanique · une nouvelle espèce",
            command: "discover",
          };
        if (e.id === "lea") {
          const r = s.requests.find((r) =>
            A.game.has({ [r.item]: r.quantity }),
          );
          return r
            ? {
                label: "E · Échanger",
                status: `Léa · ${r.quantity} ${D.itemName(r.item)} → 18 feuilles + une graine`,
                command: "trade",
                request: r.id,
              }
            : {
                label: "E · Voir les demandes",
                status: "Léa · graines, boutures et fleurs",
                panel: "visitor",
              };
        }
        if (e.id === "noe")
          return {
            label: "E · Voir les plans",
            status: "Noé · pots et équipements",
            panel: "inventory",
          };
        if (e.id === "iris")
          return {
            label: "E · Partager",
            status: `Iris · ${s.discovered.length} espèces découvertes`,
            command: "botany",
          };
        if (e.type === "tank")
          return {
            label: "E · Verser l’arrosoir",
            status: `Citerne ${Math.floor(e.water)}/160 · ${I.status(s, e).message}`,
            command: "fillTank",
          };
        if (e.type === "collector")
          return {
            label: "E · Récupérer",
            status: `Collecteur · ${Object.values(e.buffer).reduce((a, b) => a + b, 0)}/24`,
            command: "withdraw",
          };
        if (e.type === "nursery") {
          const sp = e.job && D.species.find((p) => p.id === e.job.species);
          return e.job
            ? {
                label:
                  e.job.remaining === 0
                    ? "E · Récupérer"
                    : "Multiplication en cours",
                status: `${sp.name} · ${e.job.remaining === 0 ? "jeune plant prêt" : Math.ceil(e.job.remaining) + " s restantes"}`,
                progress: 1 - e.job.remaining / 180,
                command: e.job.remaining === 0 ? "collectYoung" : null,
              }
            : {
                label: "E · Multiplier",
                status: "Choisir une bouture dans le sac",
                panel: "nursery",
              };
        }
        if (!I.isPot(e))
          return {
            label: "F · Déplacer",
            status: `${A.name(e)} · ${I.status(s, e).message}`,
            move: true,
          };
        if (!e.plant)
          return {
            label: /^(seed|young):/.test(tool)
              ? "E · Planter"
              : "Équiper une graine",
            status: /^(seed|young):/.test(tool)
              ? `${A.label(tool)} · ${s.inventory[tool] || 0} en réserve`
              : "Pot vide · graines et jeunes plants dans I",
            command: /^(seed|young):/.test(tool) ? "plant" : null,
            species: tool.split(":")[1],
            source: tool.split(":")[0],
          };
        const p = e.plant,
          stage =
            p.growth < 0.12
              ? "Graine"
              : p.growth < 0.28
                ? "Germe"
                : p.growth < 1
                  ? "Jeune plante"
                  : "Adulte";
        return {
          label:
            tool === "water"
              ? "E · Arroser"
              : p.ready
                ? "E · Récolter"
                : "Observer",
          status: `${A.name(e)} · ${stage} · ${p.ready}/3 prêts`,
          command: tool === "water" ? "water" : p.ready ? "collect" : null,
        };
      })();
    return far ? { ...near, go: true } : near;
  };
})();
