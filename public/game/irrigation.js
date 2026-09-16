(function (root) {
  const D =
    typeof module !== "undefined" ? require("./data.js") : root.GardenData;
  const C =
    typeof module !== "undefined"
      ? require("./construction.js")
      : root.GardenConstruction;
  // A "source" emits a substance (water for a pump, fertilizer for a
  // composter) into the same physical network of tanks/pipes/drips; which
  // substance a given tank/pipe/drip carries is derived from whichever
  // source reaches it (see substanceOf), never stored on the entity itself.
  const SOURCE = ["pump", "composter"],
    isPot = (e) => ["pot", "reservoir"].includes(e?.type),
    network = (e) =>
      [...SOURCE, "tank", "pipe", "drip"].includes(e?.type) || isPot(e);
  const topology = new WeakMap(),
    telemetry = new WeakMap(),
    EPS = 1e-9;
  // Hoses are physical connections: their click order never determines water direction.
  function validLink(a, b) {
    if (!a || !b || a.id === b.id || a.stored || b.stored) return false;
    if (isPot(a) || isPot(b))
      return (isPot(a) ? b : a).type === "drip" && C.distance(a, b) <= 1.8;
    return network(a) && network(b) && C.distance(a, b) <= 4;
  }
  const outlet = (a, b) =>
    SOURCE.includes(a.type)
      ? ["pipe", "tank"].includes(b.type)
      : a.type === "tank"
        ? ["pipe", "drip"].includes(b.type)
        : a.type === "pipe"
          ? ["pipe", "tank", "drip"].includes(b.type)
          : a.type === "drip" && (b.type === "drip" || isPot(b));
  // A component can carry only one substance: reject a link that would
  // merge two components fed by sources of different substances. A
  // component with no source yet (a freshly placed tank) is neutral and
  // can join either side.
  function substancesOf(group) {
    const set = new Set();
    for (const e of group)
      if (SOURCE.includes(e.type)) set.add(D.recipes[e.type].substance);
    return set;
  }
  function crossesSubstance(s, a, b) {
    const groups = components(s),
      ga = groups.find((g) => g.some((e) => e.id === a.id)) || [a],
      gb = groups.find((g) => g.some((e) => e.id === b.id)) || [b];
    if (ga === gb) return false;
    return new Set([...substancesOf(ga), ...substancesOf(gb)]).size > 1;
  }
  function canConnect(a, b, s) {
    if (!validLink(a, b) || !(outlet(a, b) || outlet(b, a))) return false;
    return !s || !crossesSubstance(s, a, b);
  }
  function orientation(a, b) {
    if (!canConnect(a, b)) return 0;
    return outlet(a, b) && outlet(b, a) ? 0 : outlet(a, b) ? 1 : -1;
  }
  const edgeKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  function graph(s) {
    const objects = s.entities.filter((e) => network(e) && !e.stored),
      signature = JSON.stringify([
        objects.map((e) => [e.id, e.type, e.x, e.z]),
        s.links,
      ]);
    let cached = topology.get(s);
    if (cached?.signature === signature) return cached;
    const entities = new Map(objects.map((e) => [e.id, e])),
      adj = new Map(objects.map((e) => [e.id, []]));
    for (const [a, b] of s.links) {
      if (!validLink(entities.get(a), entities.get(b))) continue;
      if (!adj.get(a).includes(b)) {
        adj.get(a).push(b);
        adj.get(b).push(a);
      }
    }
    for (const neighbors of adj.values()) neighbors.sort();
    function paths(source, filling) {
      const found = new Map([[source.id, []]]),
        queue = [source.id];
      for (let n = 0; n < queue.length; n++) {
        const id = queue[n],
          from = entities.get(id);
        if (id !== source.id && (filling ? from.type === "tank" : isPot(from)))
          continue;
        for (const toId of adj.get(id) || []) {
          if (found.has(toId)) continue;
          const to = entities.get(toId);
          // Sources stop at storage; cisterns cannot discharge through a source, other tanks or pots.
          // Drips pass their substance along the line even when their own pot is wet/fed.
          const allowed = filling
            ? [...SOURCE, "pipe"].includes(from.type) &&
              ["pipe", "tank"].includes(to.type)
            : ["tank", "pipe"].includes(from.type)
              ? ["pipe", "drip"].includes(to.type)
              : from.type === "drip" && (to.type === "drip" || isPot(to));
          if (allowed) {
            found.set(toId, found.get(id).concat([[id, toId]]));
            queue.push(toId);
          }
        }
      }
      return found;
    }
    const sources = objects
        .filter((e) => SOURCE.includes(e.type))
        .sort((a, b) => a.id.localeCompare(b.id)),
      tanks = objects
        .filter((e) => e.type === "tank")
        .sort((a, b) => a.id.localeCompare(b.id));
    cached = {
      signature,
      entities,
      adj,
      sources,
      tanks,
      sourcePaths: new Map(sources.map((e) => [e.id, paths(e, true)])),
      tankPaths: new Map(tanks.map((e) => [e.id, paths(e, false)])),
    };
    topology.set(s, cached);
    return cached;
  }
  function components(s) {
    const g = graph(s),
      seen = new Set(),
      groups = [];
    for (const e of g.entities.values()) {
      if (seen.has(e.id)) continue;
      const queue = [e.id],
        group = [];
      seen.add(e.id);
      for (let n = 0; n < queue.length; n++) {
        const id = queue[n];
        group.push(g.entities.get(id));
        for (const next of g.adj.get(id)) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      groups.push(group);
    }
    return groups;
  }
  // Which substance a tank/pipe/drip currently carries, derived from
  // whichever source reaches it. A tank no source reaches yet defaults to
  // water: the watering can (fillTank) only ever pours water, with no pump
  // required, so an unconnected or manually-filled tank must still drain
  // as a water tank.
  function substanceOf(g, id) {
    for (const [sourceId, paths] of g.sourcePaths)
      if (paths.has(id))
        return D.recipes[g.entities.get(sourceId).type].substance;
    return "water";
  }
  function invalidate(s) {
    telemetry.delete(s);
    topology.delete(s);
    for (const e of s.entities)
      if (network(e)) {
        e.flowing = false;
        e.lastFlow = 0;
        e.running = false;
      }
  }
  const noFlow = new Map();
  function flowRates(s) {
    const record = telemetry.get(s);
    return record && record.signature === graph(s).signature
      ? record.edges
      : noFlow;
  }
  function edgeFlow(s, a, b) {
    const amount = flowRates(s).get(edgeKey(a, b)) || 0;
    return a < b ? amount : -amount;
  }
  function activity(s, id) {
    const record = telemetry.get(s);
    if (!record || record.signature !== graph(s).signature) return 0;
    return record.activity.get(id) || 0;
  }
  const P = (root.GardenIrrigationParts = {
    D,
    C,
    SOURCE,
    isPot,
    network,
    topology,
    telemetry,
    EPS,
    validLink,
    outlet,
    canConnect,
    crossesSubstance,
    substanceOf,
    orientation,
    edgeKey,
    graph,
    components,
    invalidate,
    noFlow,
    flowRates,
    edgeFlow,
    activity,
  });
  // The water simulation is attached by irrigation-sim.js.
  if (typeof module !== "undefined")
    module.exports = require("./irrigation-sim.js");
})(globalThis);
