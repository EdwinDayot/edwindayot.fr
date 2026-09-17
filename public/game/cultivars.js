/* Cultivar/specimen schema, part of the campaign layer (UMD: node module / browser GardenCultivars).
   A cultivar is the stable, named result of a cross: its id and traits are fixed once, at
   creation, and never recomputed. A specimen is a physical instance of a cultivar, with a
   location and a growth stage — it never stores its own copy of traits, only a `cultivarId`,
   so two specimens of the same cultivar are trait-identical by construction (see
   `specimenTraits`), not by a comparison that could drift. Epic C1.6 wires `createSpecimen`
   into persisted state (`s.specimens`); crossing/inheritance (C1.2/C1.3) and the notebook
   (C1.4) were wired by earlier epics, listed in docs/campagne-backlog.md. */
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
  // stage 0 is a freshly planted cutting/seedling; later epics (C1.7/C1.8) attach a rendered
  // form per stage. No trait ever lands on the specimen itself — see specimenTraits below.
  function createSpecimen(s, { cultivarId, x, z, stage = 0 }) {
    const specimen = {
      id: `sp${s.specimenNextId++}`,
      cultivarId,
      x,
      z,
      stage,
    };
    s.specimens.push(specimen);
    return specimen;
  }
  // The only place a specimen's traits are read from: always through its cultivar, never a
  // per-specimen copy. This is what makes "multiplier ne relance aucun tirage" trivially true.
  function specimenTraits(s, specimen) {
    const cultivar = s.cultivars.find((c) => c.id === specimen.cultivarId);
    return cultivar ? cultivar.traits : null;
  }
  const api = { createCultivar, createSpecimen, specimenTraits };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCultivars = api;
})(globalThis);
