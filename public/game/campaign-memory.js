/* Campaign memory: bounded journal of campaign-layer events/aggregates, part of the campaign
   layer (UMD: node module / browser GardenCampaignMemory).

   Epic C5.1 (design §11, "Mémoire factuelle bornée, sans score de vertu") : the design explicitly
   asks for des *événements et cumuls agrégés*, never a full history ("pas une trace de chaque
   frame ni un arbre... infini", design §14) — every field below is either a small map keyed by an
   id (bounded by the number of Rainelles/bornes that actually exist) or a flat list of ids already
   recorded (bounded by the number of Rainelles ever born), never a per-tick/per-night log.

   Categories already observable without any new system, recorded from this epic on (design §11's
   own list — "périodes de repos... naissances... premières affectations... interventions du
   joueur"):
     - rest: per-Rainelle count of nights it rested (true by default before any veilleuse, C5.2 —
       see garden-state-cmd-f.js's "sleep", the only call site).
     - births: flat list of Rainelle ids already recorded, never duplicated (a Rainelle id is only
       ever minted once by rainelles.js's createRainelle, so this can never legitimately record
       the same id twice — recordBirth still guards against it defensively).
     - firstGesture: per-Rainelle verb of its first-ever taught gesture — a real transition from no
       gesture to one, never overwritten by a later reteach (design §11 counts a *first*
       affectation, not every one since).
     - manualInterventions: a single counter, incremented once per direct gesture command the
       player actually issues (teachGesture/confirmTeaching/teachGestureQuick — see their own call
       sites in garden-state-cmd-j.js/-k.js), distinct from campaign-automation.js's own tick,
       which never touches this journal. Interpretation choice, not in the design's literal words
       (documented rather than guessed silently): the four-moment flow's intermediate steps
       (beginTeaching/demonstrateGesture/reviseGesturePhrase/cancelTeaching) are steps *toward* a
       gesture command, not the assignment itself, so only the three calls that actually mutate a
       Rainelle's `geste` count here.
     - nightlyActivity (Epic C5.2, "veilleuses de croissance"): per-Rainelle count of nights it did
       real, observable night work under an active veilleuse (a specimen actually watered, or at
       least one unit actually harvested) — never merely for a taught gesture whose zone happens to
       have its veilleuse on with nothing to act on (design §11: "posséder une veilleuse éteinte ne
       compte pas comme une nuit de travail", read symmetrically for one that's on but idle). See
       campaign-automation.js's runNightWork, this field's only writer, and garden-state-cmd-f.js's
       "sleep", the only call site — mutually exclusive with `rest` for the same Rainelle the same
       night.

   Reserved but unfilled fields for categories that depend on a system this epic does not build
   (design §11's own list, the rest of it): waterWithdrawals (C5.4, prise d'eau à fort débit),
   habitatTransformations, unsoldStock, contractsFed. Present with a neutral, empty default so a
   later epic only ever fills a shape already named here, never invents a new top-level field for
   something this file already reserves — never guessed or approximated by this epic, only
   reserved.

   A refused command must never move any of these counters (design §11: "une commande refusée ne
   devient jamais un dommage fictif attribué au joueur") — true by construction, since every
   recordX function below is only ever called from a command's *success* path (after a `fail()`
   return has already short-circuited), never from a validation branch; see the test suite for a
   refused-command regression check. */
(function (root) {
  function freshMemory() {
    return {
      rest: {},
      births: [],
      firstGesture: {},
      manualInterventions: 0,
      // Epic C5.2: per-Rainelle count of real night work under an active veilleuse — see header
      // comment and recordNightlyActivity below.
      nightlyActivity: {},
      // Reserved for C5.4 (prise d'eau à fort débit) — see header comment.
      waterWithdrawals: {},
      // Reserved — no epic yet transforms/removes a habitat once registered (C3.3).
      habitatTransformations: [],
      // Reserved — no unsold-stock concept exists yet (no présentoir/demande system in campaign).
      unsoldStock: {},
      // Reserved — no contract system exists yet in the campaign layer.
      contractsFed: {},
    };
  }

  // Called once per Rainelle that already existed *before* "sleep" resolves any new individual
  // this same night (garden-state-cmd-f.js) — a brand-new individual has not experienced a night
  // yet, so it is never counted the night it is born.
  function recordRest(memory, rainelleId) {
    memory.rest[rainelleId] = (memory.rest[rainelleId] || 0) + 1;
  }

  // Called once per new Rainelle, right after creation (frog encounter or nursery resolution,
  // both inside "sleep"). See header comment for why this can never legitimately fire twice for
  // the same id — guarded anyway, defensively.
  function recordBirth(memory, rainelleId) {
    if (!memory.births.includes(rainelleId)) memory.births.push(rainelleId);
  }

  // Called from a successful teachGesture/confirmTeaching/teachGestureQuick, only when the
  // gesture just applied is the very first this Rainelle has ever had (its caller already knows
  // this from rainelles.js's applyGesture returning `hadGesture: false`) — never overwritten by a
  // later reteach of the same Rainelle.
  function recordFirstGesture(memory, rainelleId, verbe) {
    if (memory.firstGesture[rainelleId] === undefined)
      memory.firstGesture[rainelleId] = verbe;
  }

  function recordManualIntervention(memory) {
    memory.manualInterventions += 1;
  }

  // Epic C5.2 (design §11, veilleuses de croissance): called once per Rainelle that actually did
  // observable night work this "sleep" (a specimen really watered, or at least one unit really
  // harvested — see campaign-automation.js's runNightWork), never merely for holding a taught
  // gesture whose zone happens to have its veilleuse on. Mutually exclusive with recordRest for
  // the same Rainelle on the same night (garden-state-cmd-f.js's own sleep branch): a Rainelle is
  // either counted as having rested, or as having worked, never both, same per-id counter shape as
  // recordRest.
  function recordNightlyActivity(memory, rainelleId) {
    memory.nightlyActivity[rainelleId] =
      (memory.nightlyActivity[rainelleId] || 0) + 1;
  }

  const api = {
    freshMemory,
    recordRest,
    recordBirth,
    recordFirstGesture,
    recordManualIntervention,
    recordNightlyActivity,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignMemory = api;
})(globalThis);
