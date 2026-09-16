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
    Gauge = GardenGauge,
    Roles = GardenRoles,
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
              : A.name(e),
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
              ? `${spec.name} · ${remaining} s`
              : `${spec.name} · ${e.work || 0}/${spec.hits}`,
            gauge: Gauge.resource(spec, e, s.elapsed),
            command: !remaining && tool === spec.tool ? "mine" : null,
            tool: spec.tool,
          };
        }
        if (e.id.startsWith("zone-")) {
          const z = D.zones[+e.id.split("-")[1]];
          return {
            label: "E · Ouvrir",
            status: `${z.name} · ${A.costs(z.cost)}`,
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
        if (Roles.roleOf(e.id)) return Roles.context(e, s);
        if (e.type === "tank")
          return {
            label: "E · Verser l’arrosoir",
            status: `Citerne · ${Math.floor(e.water)}/160`,
            gauge: Gauge.tank(e),
            command: "fillTank",
          };
        if (D.recipes[e.type]?.buffer || D.recipes[e.type]?.dispense) {
          const recipe = D.recipes[e.type],
            total = Object.values(e.buffer).reduce((a, b) => a + b, 0);
          return {
            label: "E · Récupérer",
            status: `${recipe.name} · ${total}/${recipe.capacity}`,
            gauge: Gauge.collector(e, recipe.capacity),
            command: "withdraw",
          };
        }
        if (e.type === "autoPlanter") {
          const cap = D.recipes.autoPlanter.capacity,
            used = Object.values(e.buffer).reduce((a, b) => a + b, 0);
          if (/^(seed|young):/.test(tool) && used < cap)
            return {
              label: "E · Charger une graine",
              status: `Planteur auto · ${used}/${cap}`,
              command: "load",
              species: tool.split(":")[1],
              source: tool.split(":")[0],
            };
          return {
            label: "E · Récupérer les graines",
            status: `Planteur auto · ${used}/${cap}`,
            command: used ? "withdraw" : null,
          };
        }
        if (e.type === "nursery") {
          const sp = e.job && D.species.find((p) => p.id === e.job.species);
          return e.job
            ? {
                label:
                  e.job.remaining === 0
                    ? "E · Récupérer"
                    : "Multiplication en cours",
                status: `${sp.name} · ${e.job.remaining === 0 ? "prêt" : Math.ceil(e.job.remaining) + " s"}`,
                gauge: Gauge.nursery(e.job),
                command: e.job.remaining === 0 ? "collectYoung" : null,
              }
            : {
                label: "E · Multiplier",
                status: "Choisir une bouture",
                panel: "nursery",
              };
        }
        if (!I.isPot(e))
          return {
            label: "F · Déplacer",
            status: A.name(e),
            move: true,
          };
        if (!e.plant)
          return {
            label: /^(seed|young):/.test(tool)
              ? "E · Planter"
              : "Équiper une graine",
            status: /^(seed|young):/.test(tool)
              ? `${A.label(tool)} · ${s.inventory[tool] || 0} en réserve`
              : "Pot vide",
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
          status: `Pot · ${stage} · ${p.ready}/3 prêts`,
          gauge: Gauge.plant(p),
          command: tool === "water" ? "water" : p.ready ? "collect" : null,
        };
      })();
    return far ? { ...near, go: true } : near;
  };
})();
