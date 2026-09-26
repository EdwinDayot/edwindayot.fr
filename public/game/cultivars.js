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
   garden's `plant.boostUntil` (never the wall clock).

   Epic C7.2 gives growth stage the same "store a timestamp, derive on demand" treatment moisture
   already has, since nothing before this epic ever advanced a specimen's stage over time
   (campaign-automation.js's own header comment named this gap explicitly). `plantedAt` — the
   elapsed instant a specimen was planted — is stored once, at creation, and `specimenStage`
   derives the current stage from `s.elapsed - plantedAt` and a fixed duration per stage, never
   from the raw `stage` field. `stage` itself stays on the object (a specimen created with an
   explicit non-zero `stage`, the convention this file's own tests and several others use to get
   an instantly mature specimen for setup, still gets one via a backdated `plantedAt` — see
   `createSpecimen`) but is no longer the source of truth `isMature`/consumers read: a future
   rendu epic that gives specimens a persistent world model is what would actually read it.

   Epic C7.3 (design §12: "le printemps favorise les jeunes plants... sans tuer automatiquement
   les plantes hors saison") adds `plantedSeason`, derived once at creation from
   `GardenCampaignSeasons.seasonForDay(s.campaignDay)` and frozen forever — never re-read from the
   season the specimen currently sits in, so a specimen already growing never speeds up or slows
   down retroactively just because the calendar moved on. Only the stage 0 -> 1 transition (a
   "jeune plant") is shortened when `plantedSeason === "printemps"`; stage 1 -> MATURE_STAGE always
   takes the same STAGE_DURATION_ELAPSED_SECONDS regardless of season, and every other season keeps
   the ordinary duration for both transitions (a bonus, never a penalty — the design explicitly
   rules out killing or slowing plants outside their favored season). */
(function (root) {
  const Seasons =
    typeof module !== "undefined"
      ? require("./campaign-seasons.js")
      : root.GardenCampaignSeasons;
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
  // Epic C7.2: how long a specimen spends at each stage before advancing, in simulated elapsed
  // seconds — a first, easily revisable guess (no growth timer existed anywhere before this epic
  // to calibrate against), named rather than left as a magic number, on the same discipline as
  // MOISTURE_DECAY_PER_ELAPSED_SECOND just above. Two transitions (0 -> 1 -> MATURE_STAGE) at
  // this duration mean six hours of simulated elapsed time from planting to maturity.
  const STAGE_DURATION_ELAPSED_SECONDS = 3 * 3600;
  // Epic C7.3: the spring bonus for the stage 0 -> 1 transition only, expressed as an explicit
  // fraction of STAGE_DURATION_ELAPSED_SECONDS (never a separate magic number) — half the ordinary
  // duration, a first, easily revisable guess like STAGE_DURATION_ELAPSED_SECONDS itself, no real
  // play to calibrate it against yet.
  const SPRING_YOUNG_STAGE_DURATION_ELAPSED_SECONDS = STAGE_DURATION_ELAPSED_SECONDS / 2;
  // stage 0 is a freshly planted cutting/seedling; later epics (C1.7/C1.8) attach a rendered
  // form per stage. No trait ever lands on the specimen itself — see specimenTraits below.
  // moistureAt is the elapsed instant the specimen was last "fully moist" (creation counts as a
  // watering); readyToProduce starts false and can only ever be set once mature (setReadyToProduce).
  // plantedAt is the elapsed instant specimenStage derives from (Epic C7.2). A specimen created
  // with the default stage (0) simply gets plantedAt = s.elapsed, the ordinary/real case (no real
  // command ever passes `stage` — garden-state-cmd-h.js's plantSpecimen/multiplySpecimen never
  // do). `stage` itself is still stored on the object, and an explicit non-zero `stage` backdates
  // plantedAt so specimenStage(s, specimen) derives that exact same stage right away, with zero
  // drift between the two — this is what keeps every existing "createSpecimen(..., { stage:
  // Cultivars.MATURE_STAGE })" test-setup convenience working unchanged after this epic. This
  // backdating deliberately keeps using STAGE_DURATION_ELAPSED_SECONDS alone, never the spring
  // bonus below, whatever plantedSeason ends up being (Epic C7.3): it still always lands on
  // exactly the requested stage (the spring duration is strictly shorter, so the gap it leaves
  // never crosses into the next stage boundary), and the comfort parameter's whole point is an
  // immediate, season-independent stage — the bonus is for real elapsed-time progression only.
  // plantedSeason (Epic C7.3) is derived once, here, from the campaign day this specimen is
  // actually planted on — never recomputed later, so a specimen already growing never reacts to
  // the season the calendar has since moved on to.
  function createSpecimen(s, { cultivarId, x, z, stage = 0 }) {
    const specimen = {
      id: `sp${s.specimenNextId++}`,
      cultivarId,
      x,
      z,
      stage,
      plantedAt: s.elapsed - stage * STAGE_DURATION_ELAPSED_SECONDS,
      plantedSeason: Seasons.seasonForDay(s.campaignDay),
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
  // Epic C7.2: pure/lazy, mirrors specimenMoisture's own shape exactly — never mutates
  // `specimen`, always recomputes from `s.elapsed - specimen.plantedAt`, so the same pair of
  // arguments always yields the same result, before or after a save/reload, and two calls
  // without advancing s.elapsed in between agree. Floors at 0 (never a negative stage, even if
  // plantedAt were ever ahead of s.elapsed) and caps at MATURE_STAGE (never advances past the
  // last stage no matter how long a specimen is left alone).
  //
  // Epic C7.3: only the first transition (0 -> 1, the "jeune plant") uses a shorter duration when
  // plantedSeason is "printemps" — every later transition (1 -> MATURE_STAGE) always uses the
  // ordinary STAGE_DURATION_ELAPSED_SECONDS, whatever the planting season, exactly as the design's
  // "sans tuer automatiquement les plantes hors saison" requires (a bonus in favored conditions,
  // never a penalty elsewhere, and never extended past the one stage the design names).
  function specimenStage(s, specimen) {
    const since = Math.max(0, s.elapsed - specimen.plantedAt);
    const firstStageDuration =
      specimen.plantedSeason === "printemps"
        ? SPRING_YOUNG_STAGE_DURATION_ELAPSED_SECONDS
        : STAGE_DURATION_ELAPSED_SECONDS;
    if (since < firstStageDuration) return 0;
    const sinceFirstStage = since - firstStageDuration;
    return Math.min(
      MATURE_STAGE,
      1 + Math.floor(sinceFirstStage / STAGE_DURATION_ELAPSED_SECONDS),
    );
  }
  function isMature(s, specimen) {
    return specimenStage(s, specimen) === MATURE_STAGE;
  }
  // The one guard this epic's exit criterion requires: an immature specimen can never be marked
  // ready to produce. Throws rather than returning a fail() shape because this is a schema-layer
  // invariant (like garden-state-validate.js's own throws), not yet reachable from any command.
  function setReadyToProduce(s, specimen, ready) {
    if (ready && !isMature(s, specimen))
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
    specimenStage,
    isMature,
    setReadyToProduce,
    MATURE_STAGE,
    STAGE_DURATION_ELAPSED_SECONDS,
    SPRING_YOUNG_STAGE_DURATION_ELAPSED_SECONDS,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCultivars = api;
})(globalThis);
