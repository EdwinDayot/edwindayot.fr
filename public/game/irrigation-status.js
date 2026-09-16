/* Diagnostic text for a source/tank/pipe/drip, attached to the shared
   irrigation scope; this is the file that finalizes the public GardenIrrigation
   API (chained from irrigation.js -> irrigation-sim.js -> here). */
(function (root) {
  const P = root.GardenIrrigationParts;
  if (!P) return;
  const {
    D,
    isPot,
    telemetry,
    EPS,
    graph,
    activity,
    validLink,
    canConnect,
    orientation,
    components,
    substanceOf,
    edgeFlow,
    flowRates,
    invalidate,
    tick,
  } = P;
  function status(s, entity) {
    const g = graph(s),
      record = telemetry.get(s),
      through = activity(s, entity.id),
      sourceTanks = g.tanks.filter(
        (t) => t.id === entity.id || g.tankPaths.get(t.id).has(entity.id),
      );
    const outgoing =
        record?.signature === g.signature
          ? record.delivered.get(entity.id) || 0
          : 0,
      incoming =
        record?.signature === g.signature
          ? record.filled.get(entity.id) || 0
          : 0,
      flow = entity.type === "tank" && outgoing > EPS ? outgoing : through;
    if (P.SOURCE.includes(entity.type)) {
      const substance = D.recipes[entity.type].substance,
        unit = substance === "water" ? "eau" : "engrais",
        paths = g.sourcePaths.get(entity.id),
        tanks = g.tanks.filter((t) => paths?.has(t.id)),
        water = tanks.reduce((n, t) => n + t.water, 0);
      return {
        kind: flow > EPS ? "filling" : !tanks.length ? "no-tank" : "idle",
        message:
          flow > EPS
            ? `Remplissage des citernes · ${flow.toFixed(1)} ${unit}/s`
            : !tanks.length
              ? "Relie une citerne via des tuyaux"
              : "Citernes pleines · en veille",
        water,
        capacity: tanks.length * D.recipes.tank.capacity,
        pots: 0,
        flow,
      };
    }
    const substance = substanceOf(g, entity.id),
      unit = substance === "water" ? "eau" : "engrais",
      relevant = new Map(sourceTanks.map((t) => [t.id, t]));
    for (const paths of g.sourcePaths.values())
      for (const tank of g.tanks) {
        const path = paths.get(tank.id);
        if (path?.some((l) => l.includes(entity.id)))
          relevant.set(tank.id, tank);
      }
    const tanks = [...relevant.values()],
      water = tanks.reduce((n, t) => n + t.water, 0),
      pots = new Set();
    for (const tank of sourceTanks)
      for (const [id, path] of g.tankPaths.get(tank.id)) {
        const e = g.entities.get(id);
        if (
          isPot(e) &&
          e.plant &&
          (entity.id === tank.id || path.some((l) => l.includes(entity.id)))
        )
          pots.add(id);
      }
    let kind = "idle",
      message =
        substance === "water"
          ? "Terreau humide · arrosage en veille"
          : "Plantes nourries · fertilisation en veille";
    if (!(g.adj.get(entity.id) || []).length) {
      kind = "unconnected";
      message = "Non raccordé · équipe le raccordement";
    } else if (flow > EPS) {
      const watering =
        entity.type === "tank"
          ? (record?.delivered.get(entity.id) || 0) > EPS
          : pots.size > 0;
      kind = watering ? "flowing" : "filling";
      message =
        entity.type === "tank" && outgoing > EPS && incoming > EPS
          ? `Entrée ${incoming.toFixed(1)} · sortie ${outgoing.toFixed(1)} ${unit}/s`
          : watering
            ? `${substance === "water" ? "Arrosage" : "Fertilisation"} · ${pots.size} pot${pots.size > 1 ? "s" : ""} · ${flow.toFixed(1)} ${unit}/s`
            : `Remplissage · ${flow.toFixed(1)} ${unit}/s`;
    } else if (!tanks.length) {
      kind = "no-tank";
      message =
        substance === "water"
          ? "Aucun chemin d’eau depuis une citerne"
          : "Aucun chemin d’engrais depuis une citerne";
    } else if (!water) {
      kind = "empty";
      message =
        substance === "water"
          ? "Citerne vide · apporte de l’eau du ponton"
          : "Citerne vide · relie un composteur";
    } else if (!pots.size) {
      kind = "no-pot";
      message = "Relie un goutteur à un pot planté";
    }
    return {
      kind,
      message,
      water,
      capacity: tanks.length * D.recipes.tank.capacity,
      pots: pots.size,
      flow,
      inflow: incoming,
      outflow: outgoing,
    };
  }
  // Convenience wrapper for callers outside this scope (HUD, gauges): they
  // only have the raw state, not the cached graph substanceOf() reads.
  const substance = (s, id) => substanceOf(graph(s), id);
  P.status = status;
  const api = {
    status,
    isPot,
    validLink,
    canConnect,
    crossesSubstance: P.crossesSubstance,
    substance,
    SOURCE: P.SOURCE,
    orientation,
    components,
    tick,
    edgeFlow,
    flowRates,
    activity,
    invalidate,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenIrrigation = api;
})(globalThis);
