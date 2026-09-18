/* Cultivar/specimen schema, part of the campaign layer (UMD: node module / browser GardenCultivars).
   A cultivar is the stable, named result of a cross: its id and traits are fixed once, at
   creation, and never recomputed. A specimen is a physical instance of a cultivar, with a
   location and a growth stage — it never stores its own copy of traits, only a `cultivarId`,
   so two specimens of the same cultivar are trait-identical by construction (see
   `specimenTraits`), not by a comparison that could drift. Epic C1.6 wires `createSpecimen`
   into persisted state (`s.specimens`); crossing/inheritance (C1.2/C1.3) and the notebook
   (C1.4) were wired by earlier epics, listed in docs/campagne-backlog.md.

   Epic C2.6b adds humidity and a "ready to produce" flag to a specimen, both derived from
   `s.elapsed`/`stage` rather than mutated on a tick: no tick loop touches `s.specimens` yet (no
   automation/gesture consumes moisture until C2.6c wires irrigation onto this registry), so a
   live per-tick decrement nobody advances would just silently stay wrong forever. Instead a
   specimen stores `moistureAt` — the elapsed instant its moisture was last refreshed — and
   `specimenMoisture` computes the current value on demand from `elapsed - moistureAt`, the same
   "store a timestamp, compare it to the current s.elapsed" principle already used by the free
   garden's `plant.boostUntil` (never the wall clock). Maturity is even simpler: derived straight
   from `stage`, never stored redundantly. */
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
  // Mirrors botany-hybrids.js's STAGE_COUNT/MATURE_STAGE (3 stages, last is mature) as a plain
  // number rather than importing that file: it returns without defining GardenBotanyHybrids
  // when THREE.js isn't loaded (a browser-only rendering module), and most engine-layer code and
  // tests run without THREE. Keep both in sync if either's stage count ever changes.
  const MATURE_STAGE = 2;
  // A specimen with no automation touching it yet has nothing recalibrating this number against
  // real play; it only needs to be deterministic and elapsed-driven for this epic's exit
  // criterion, not tuned. Full dry-out in 3h of simulated elapsed time is a conservative first
  // guess, easy to revisit once C2.6c's watering gesture gives it something to be calibrated
  // against.
  const MOISTURE_DECAY_PER_ELAPSED_SECOND = 100 / (3 * 3600);
  // stage 0 is a freshly planted cutting/seedling; later epics (C1.7/C1.8) attach a rendered
  // form per stage. No trait ever lands on the specimen itself — see specimenTraits below.
  // moistureAt is the elapsed instant the specimen was last "fully moist" (creation counts as a
  // watering); readyToProduce starts false and can only ever be set once mature (setReadyToProduce).
  function createSpecimen(s, { cultivarId, x, z, stage = 0 }) {
    const specimen = {
      id: `sp${s.specimenNextId++}`,
      cultivarId,
      x,
      z,
      stage,
      moistureAt: s.elapsed,
      readyToProduce: false,
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
  // Pure/lazy: never mutates `specimen`, always recomputes from `elapsed - moistureAt`, so the
  // same pair of arguments always yields the same result, before or after a save/reload.
  function specimenMoisture(specimen, elapsed) {
    const since = Math.max(0, elapsed - specimen.moistureAt);
    return Math.max(0, 100 - MOISTURE_DECAY_PER_ELAPSED_SECOND * since);
  }
  // Resets the decay clock to "fully moist as of now" — not wired to any command yet (that is
  // C2.6c's watering gesture); exposed already so that gesture never has to reach into
  // specimen internals directly.
  function waterSpecimen(specimen, elapsed) {
    specimen.moistureAt = elapsed;
  }
  function isMature(specimen) {
    return specimen.stage === MATURE_STAGE;
  }
  // The one guard this epic's exit criterion requires: an immature specimen can never be marked
  // ready to produce. Throws rather than returning a fail() shape because this is a schema-layer
  // invariant (like garden-state-validate.js's own throws), not yet reachable from any command.
  function setReadyToProduce(specimen, ready) {
    if (ready && !isMature(specimen))
      throw new Error(
        "Spécimen immature : ne peut pas être marqué prêt à produire.",
      );
    specimen.readyToProduce = !!ready;
  }
  const api = {
    createCultivar,
    createSpecimen,
    specimenTraits,
    specimenMoisture,
    waterSpecimen,
    isMature,
    setReadyToProduce,
    MATURE_STAGE,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCultivars = api;
})(globalThis);
