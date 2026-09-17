/* Cultivar/specimen schema, part of the campaign layer (UMD: node module / browser GardenCultivars).
   A cultivar is the stable, named result of a cross: its id and traits are fixed once, at
   creation, and never recomputed. A specimen is a physical instance of a cultivar, with a
   location and a growth stage. This module only defines the shape and its construction —
   crossing, inheritance and the pot command land in later epics (C1.2/C1.3 of
   docs/campagne-backlog.md); nothing here is wired into the live entity/pot system yet. */
(function (root) {
  // Traits are frozen at creation: two calls with the same input never re-derive different
  // values, and nothing here recomputes them later from parentIds.
  function createCultivar(s, { name, parentIds = [], traits = {} }) {
    const cultivar = {
      id: `c${s.cultivarNextId++}`,
      name,
      parentIds: [...parentIds],
      traits: { ...traits },
    };
    s.cultivars.push(cultivar);
    return cultivar;
  }
  function createSpecimen({ cultivarId, x, z, stage = 0 }) {
    return { cultivarId, x, z, stage };
  }
  const api = { createCultivar, createSpecimen };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCultivars = api;
})(globalThis);
