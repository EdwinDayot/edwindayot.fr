/* Water/fertilizer simulation tick, attached to the shared irrigation scope. */
(function (root) {
  const P = root.GardenIrrigationParts;
  if (!P) return;
  const { D, isPot, telemetry, EPS, edgeKey, graph, substanceOf } = P;
  // A boosted pot keeps growing faster until boostUntil (simulation time,
  // never wall-clock — see s.elapsed); any nonzero fertilizer delivery tops
  // it back up, matching the moisture drip's "small dose each pass" feel.
  const BOOST_SECONDS = 90;
  // What each substance does once delivered: which pots want it (and how
  // much), and the effect a delivered dose has on that pot.
  const EFFECT = {
    water: {
      wants: (pot) =>
        pot.plant.moisture < 65 ? Math.min(0.5, 65 - pot.plant.moisture) : 0,
      apply: (pot, q) => {
        pot.plant.moisture += q;
      },
    },
    fertilizer: {
      wants: (pot, s) =>
        !pot.plant.boostUntil || pot.plant.boostUntil - s.elapsed < 30
          ? 0.5
          : 0,
      apply: (pot, q, s) => {
        pot.plant.boostUntil = s.elapsed + BOOST_SECONDS;
      },
    },
  };
  function tick(s) {
    const g = graph(s),
      edges = new Map(),
      delivered = new Map(),
      filled = new Map();
    const trace = (path, amount) => {
      if (amount <= EPS) return;
      for (const [a, b] of path) {
        const key = edgeKey(a, b);
        edges.set(key, (edges.get(key) || 0) + (a < b ? amount : -amount));
      }
    };
    for (const e of g.entities.values()) {
      e.flowing = false;
      e.lastFlow = 0;
      e.running = false;
    }
    // A source can fill only cisterns actually reachable through pipes; no
    // passage through a drip. A river pump also needs to sit at the bank.
    for (const source of g.sources) {
      if (source.type === "pump" && source.x < 2.5) continue;
      const recipe = D.recipes[source.type];
      let budget = recipe.flow;
      const paths = g.sourcePaths.get(source.id),
        targets = g.tanks.filter(
          (t) => paths.has(t.id) && t.water < D.recipes.tank.capacity,
        ),
        offset = targets.length ? s.irrigationCursor % targets.length : 0;
      for (let i = 0; i < targets.length && budget > EPS; i++) {
        const tank = targets[(i + offset) % targets.length],
          q = Math.min(budget, D.recipes.tank.capacity - tank.water);
        tank.water += q;
        budget -= q;
        trace(paths.get(tank.id), q);
        filled.set(tank.id, (filled.get(tank.id) || 0) + q);
      }
      source.running = budget < recipe.flow;
    }
    const budget = new Map(g.tanks.map((t) => [t.id, D.recipes.tank.flow]));
    const drain = (substance, pots) => {
      const eff = EFFECT[substance],
        offset = pots.length ? s.irrigationCursor % pots.length : 0;
      for (let i = 0; i < pots.length; i++) {
        const pot = pots[(i + offset) % pots.length];
        let wanted = eff.wants(pot, s);
        for (const tank of g.tanks) {
          if (wanted <= EPS) break;
          if (substanceOf(g, tank.id) !== substance) continue;
          const path = g.tankPaths.get(tank.id).get(pot.id);
          if (!path) continue;
          const q = Math.min(wanted, tank.water, budget.get(tank.id));
          if (q <= EPS) continue;
          tank.water -= q;
          budget.set(tank.id, budget.get(tank.id) - q);
          eff.apply(pot, q, s);
          wanted -= q;
          trace(path, q);
          delivered.set(tank.id, (delivered.get(tank.id) || 0) + q);
        }
      }
    };
    const plantedPots = [...g.entities.values()]
      .filter((e) => isPot(e) && e.plant)
      .sort((a, b) => a.id.localeCompare(b.id));
    drain(
      "water",
      plantedPots.filter((e) => e.plant.moisture < 65),
    );
    drain(
      "fertilizer",
      plantedPots.filter(
        (e) => !e.plant.boostUntil || e.plant.boostUntil - s.elapsed < 30,
      ),
    );
    // Net signed volume per edge drives both diagnostics and rendering. Opposing flows cancel.
    const incoming = new Map(),
      outgoing = new Map();
    for (const [key, amount] of edges) {
      if (Math.abs(amount) <= EPS) {
        edges.delete(key);
        continue;
      }
      const [a, b] = key.split("|"),
        from = amount > 0 ? a : b,
        to = amount > 0 ? b : a;
      outgoing.set(from, (outgoing.get(from) || 0) + Math.abs(amount));
      incoming.set(to, (incoming.get(to) || 0) + Math.abs(amount));
    }
    const active = new Map();
    for (const e of g.entities.values()) {
      const flow = Math.max(incoming.get(e.id) || 0, outgoing.get(e.id) || 0);
      active.set(e.id, flow);
      e.lastFlow = flow;
      e.flowing = flow > EPS;
      if (!P.SOURCE.includes(e.type)) e.running = e.flowing;
    }
    telemetry.set(s, {
      signature: g.signature,
      edges,
      activity: active,
      delivered,
      filled,
    });
    s.irrigationCursor = (s.irrigationCursor + 1) % 1000000;
  }
  P.tick = tick;
  // Status/reporting text is attached by irrigation-status.js.
  if (typeof module !== "undefined")
    module.exports = require("./irrigation-status.js");
})(globalThis);
