/* Generic tick behaviours for automation entities, driven by D.recipes[type]
   metadata (job/buffer) instead of a per-type branch in garden-state.js.
   Nursery uses tickJob, collector uses tickBuffer; a new automation type
   only needs a recipe entry, not a new branch here. */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./data.js") : root.GardenData;
  const C =
    typeof module !== "undefined"
      ? require("./construction.js")
      : root.GardenConstruction;
  const I =
    typeof module !== "undefined"
      ? require("./irrigation.js")
      : root.GardenIrrigation;
  // A single countdown to zero (e.job = {..., remaining}); the species/kind
  // of job is the caller's business, only the countdown mechanic is generic.
  function tickJob(e, s) {
    if (!e.job || e.job.remaining <= 0) return;
    e.running = true;
    e.job.remaining = Math.max(0, e.job.remaining - 1);
    if (e.job.remaining === 0) {
      e.running = false;
      s.stats.produced++;
    }
  }
  // Fills e.buffer (item id -> qty) from ready plants within the recipe's
  // range, up to its capacity — the collector's exact current behaviour,
  // parametrized by the entity's own recipe instead of literal constants.
  function tickBuffer(e, s) {
    const spec = D.recipes[e.type],
      used = Object.values(e.buffer).reduce((a, b) => a + b, 0);
    let room = spec.capacity - used;
    e.running = room > 0;
    for (const pot of s.entities) {
      if (!room) break;
      if (pot.stored || !pot.plant?.ready || C.distance(e, pot) > spec.range)
        continue;
      const p = pot.plant,
        sp = D.species.find((o) => o.id === p.species),
        q = Math.min(room, p.ready),
        id = `${sp.product}:${sp.id}`;
      e.buffer[id] = (e.buffer[id] || 0) + q;
      p.ready -= q;
      room -= q;
      s.stats.collected += q;
    }
  }
  // The inverse of tickBuffer: e.buffer holds seeds (loaded by the "load"
  // command) instead of accumulated produce, and each one is drained into
  // an empty pot in range instead of being collected — same buffer shape,
  // opposite direction, proving 0.3's dispatch extends without a new branch
  // anywhere else. Planting itself reuses the manual "plant" command's own
  // sow() so both apply a seed identically.
  function tickSow(e, s) {
    const spec = D.recipes[e.type],
      util =
        typeof module !== "undefined"
          ? require("../garden-state-util.js")
          : root.GardenStateParts.util,
      // An ordered list of item ids only; each id's remaining count is read
      // live from e.buffer as it drains, never captured up front.
      items = Object.keys(e.buffer).filter((id) => e.buffer[id] > 0);
    e.running = items.length > 0;
    for (const pot of s.entities) {
      if (!items.length) break;
      if (pot.stored || !I.isPot(pot) || pot.plant) continue;
      if (C.distance(e, pot) > spec.range) continue;
      const item = items[0],
        [source, species] = item.split(":");
      util.sow(pot, species, source);
      e.buffer[item] -= 1;
      if (e.buffer[item] <= 0) items.shift();
    }
  }
  // A passive range aura: every plant in range gets the exact boostUntil
  // field the composter's fertilizer already sets (0.4's growth-rate hook),
  // refreshed just past the current tick so it lapses shortly after a plant
  // leaves range instead of lingering like a one-time fertilizer delivery.
  function tickAura(e, s) {
    const spec = D.recipes[e.type];
    e.running = false;
    for (const pot of s.entities) {
      if (pot.stored || !I.isPot(pot) || !pot.plant) continue;
      if (C.distance(e, pot) > spec.aura.range) continue;
      pot.plant.boostUntil = s.elapsed + 2;
      e.running = true;
    }
  }
  // A self-refilling buffer, symmetric to tickBuffer: instead of collecting
  // from ready plants, it manufactures one seed every `every` ticks (using
  // s.elapsed directly, no extra persisted countdown field) up to its own
  // capacity, then hands seeds one at a time to any auto-planter (any
  // recipe with `sow`) in range that still has room — the same e.buffer
  // shape moving between two entities instead of within one.
  function tickDispense(e, s) {
    const spec = D.recipes[e.type],
      cap = spec.capacity,
      item = `seed:${spec.dispense.species}`,
      total = Object.values(e.buffer).reduce((a, b) => a + b, 0);
    if (total < cap && s.elapsed % spec.dispense.every === 0)
      e.buffer[item] = (e.buffer[item] || 0) + 1;
    e.running = Object.values(e.buffer).reduce((a, b) => a + b, 0) > 0;
    for (const other of s.entities) {
      if (other.stored || !D.recipes[other.type]?.sow) continue;
      if (C.distance(e, other) > spec.dispense.range) continue;
      const otherCap = D.recipes[other.type].capacity,
        otherUsed = Object.values(other.buffer).reduce((a, b) => a + b, 0);
      if (otherUsed >= otherCap) continue;
      const seed = Object.entries(e.buffer).find(([, n]) => n > 0);
      if (!seed) continue;
      const [key] = seed;
      e.buffer[key] -= 1;
      other.buffer[key] = (other.buffer[key] || 0) + 1;
    }
  }
  function tick(e, s) {
    const spec = D.recipes[e.type];
    if (!spec) return;
    if (spec.job) tickJob(e, s);
    if (spec.buffer) tickBuffer(e, s);
    if (spec.sow) tickSow(e, s);
    if (spec.aura) tickAura(e, s);
    if (spec.dispense) tickDispense(e, s);
  }
  const api = { tickJob, tickBuffer, tickSow, tickAura, tickDispense, tick };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenAutomation = api;
})(globalThis);
