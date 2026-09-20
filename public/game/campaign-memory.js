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

   Epic C5.3 (design §11, "des limites physiologiques finissent par réduire la capacité... elles
   ne doivent pas annuler immédiatement tout le gain nocturne") adds `overexertion`: a per-Rainelle
   *streak* counter, distinct from `nightlyActivity`'s cumulative, never-decreasing total — it goes
   up by one on a night of real night work (recordNightlyActivity's own call site, garden-state-
   cmd-f.js's "sleep") and down by one, floored at zero, on a night of real rest (recordRest's own
   call site, same "sleep" block) — "réduit... progressivement plutôt que de le repartir
   instantanément à zéro" read literally: a single rest night only ever removes one unit of
   accumulated overexertion, never the whole streak at once. OVEREXERTION_THRESHOLD is the value
   this streak must exceed before campaign-automation.js's doArroser/doRecolter start capping the
   volume moved per cycle (never a full stop, per the design quote above) — chosen and documented
   here rather than left for that file to invent silently: 3 consecutive nights of real, unaided
   night work under a veilleuse, the same order of magnitude as a short in-game week, giving a
   player running a single veilleuse for a night or two no penalty at all before the mechanic ever
   engages.

   A refused command must never move any of these counters (design §11: "une commande refusée ne
   devient jamais un dommage fictif attribué au joueur") — true by construction, since every
   recordX function below is only ever called from a command's *success* path (after a `fail()`
   return has already short-circuited), never from a validation branch; see the test suite for a
   refused-command regression check.

   Epic C5.4 (design §11, "prise d'eau à fort débit... niveau du bassin commun réduit... restituer
   une partie du débit [est] une réparation avec un coût réel, jamais une annulation gratuite")
   fills in `waterWithdrawals`, reserved since C5.1: a per-borne cumulative count of specimens
   actually watered through that borne while its `priseFortDebit` flag (campaign-stations.js) was
   on (campaign-automation.js's doArroser, the only writer, via recordWaterWithdrawal below) —
   same per-id, never-decreasing shape as `births`/`nightlyActivity`, keyed by borne id instead of
   Rainelle id. A borne without `priseFortDebit` never touches this map (doArroser only calls
   recordWaterWithdrawal when the borne it resolved is flagged), matching this epic's own exit
   criterion.

   Epic C6.4 (design §10, chapitre 12 : « Les commandes déjà signées gardent leur prix... il doit
   traverser ses vrais invendus, encore vivants ») fills in `contractsFed` for real: a per-contract-
   id cumulative count of units actually delivered against it, same never-decreasing, per-id-
   counter shape as `waterWithdrawals` above (see recordContractDelivery below, called from
   garden-state-cmd-r.js's deliverContract, the only writer). `unsoldStock`, in contrast, is left
   reserved and always empty by this epic, never filled: unlike contractsFed it is not a fact a
   delivery adds to, it is fully derivable from s.specimens itself once delivery is understood to
   remove the delivered specimen (see campaign-contracts.js's own header comment for why) — the
   real, derived answer lives there (`unsoldStock(specimens, cultivarId)`), not here, so this file
   is not left with two different things both named `unsoldStock`.

   `bassinCommunLevel` derives the shared level from that cumulative total rather than storing a
   second, independently-mutated number: level = BASSIN_COMMUN_CAPACITY − Σ(waterWithdrawals),
   floored at zero. This is deliberate, not a simplification of a "real" stored level — since
   withdrawals only ever go up (a borne is never un-recorded), the derived level can only ever go
   down or stay flat, which is exactly "couper la prise arrête la baisse sans la faire remonter
   instantanément" for free, by construction, rather than a rule `setPriseFortDebit` (garden-
   state-cmd-q.js) has to enforce separately. BASSIN_COMMUN_CAPACITY reuses the free garden's own
   citerne capacity (D.recipes.tank.capacity = 160, data-recipes.js) as the closest existing
   precedent for "how much a shared water reserve holds" — same borrowing already used for
   DEFAULT_PANIER_CAPACITY at C2.6a — rather than inventing an unrelated number; not imported
   directly (this file stays dependency-free, same posture already used for ZONE_WORK_RANGE's own
   borrowed-but-uncoupled precedent in campaign-automation.js).

   Epic C5.7 (design §11, "réparation... coût réel" ; design ch. 14, "elle interrompt une première
   fois le geste, sans redevenir instantanément disponible") adds `persistentGestureIds`: a flat,
   never-duplicated list of every Rainelle id ever detected in persistance de geste (C5.6) on any
   past night — same "bounded, id-list" shape as `births`, keyed by nothing but presence. This is
   the one fact campaign-scenes.js's own reparation check cannot derive from anything already
   here: `overexertion` reaching zero again does not by itself mean a Rainelle was ever seen
   persisting (a Rainelle whose station always has work never goes idle, so it can accrue
   overexertion and later rest back down to zero without ever once being caught in persistance —
   that is an ordinary rest night, not a réparation, and design §11's "pas de bouton pardon" means
   this distinction has to be a recorded fact, not inferred after the fact from a number that
   could have reached zero for an unrelated reason). Written once per id, from
   garden-state-cmd-f.js's own "sleep", the same and only call site that already computes
   `persistentIds` for C5.6's own narrative reveal — never a second detection. */
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
      // Epic C5.3: per-Rainelle consecutive-night streak of real night work, distinct from
      // nightlyActivity's cumulative total — see header comment and increase/decreaseOverexertion
      // below.
      overexertion: {},
      // Epic C5.4: per-borne cumulative count of specimens watered through a `priseFortDebit`
      // borne — see header comment and recordWaterWithdrawal/bassinCommunLevel below.
      waterWithdrawals: {},
      // Epic C5.7: flat, never-duplicated list of every Rainelle id ever detected in persistance
      // de geste (C5.6) — see header comment and recordPersistentGesture below.
      persistentGestureIds: [],
      // Reserved — no epic yet transforms/removes a habitat once registered (C3.3).
      habitatTransformations: [],
      // Reserved — no unsold-stock concept exists yet (no présentoir/demande system in campaign).
      unsoldStock: {},
      // Reserved — no contract system exists yet in the campaign layer.
      contractsFed: {},
    };
  }

  // Epic C5.3 (design §11): the streak threshold campaign-automation.js's doArroser/doRecolter
  // compare a Rainelle's current overexertion level against — see the header comment above for
  // why 3 was chosen. Exported so that file never hardcodes its own copy of this number.
  const OVEREXERTION_THRESHOLD = 3;

  // Epic C5.4: the shared bassin commun's total capacity, in the same units as a specimen-
  // watering count (waterWithdrawals) — see header comment for why 160 was chosen and why it is
  // not imported from data.js.
  const BASSIN_COMMUN_CAPACITY = 160;

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

  // Epic C5.3: called alongside recordNightlyActivity, from the same "sleep" block
  // (garden-state-cmd-f.js), once per Rainelle that did real night work this night — the streak
  // has no ceiling of its own (campaign-automation.js only ever checks it against
  // OVEREXERTION_THRESHOLD, a fixed comparison, so an unbounded streak is harmless and never
  // makes the penalty itself grow past the fixed cap it applies).
  function increaseOverexertion(memory, rainelleId) {
    memory.overexertion[rainelleId] = (memory.overexertion[rainelleId] || 0) + 1;
  }

  // Epic C5.3: called alongside recordRest, from the same "sleep" block, once per Rainelle that
  // rested this night (whether it never had a veilleuse, or its veilleuse was on but idle for
  // want of input — "sleep" already treats both as rest, see recordRest's own call site). Floored
  // at zero, and removes only one unit per rest night ("réduit... progressivement", design §11) —
  // never reset to zero by a single night off, matching a Rainelle not becoming immediately
  // "disponible" after one rest (design ch. 14, cited by this epic's own backlog entry).
  function decreaseOverexertion(memory, rainelleId) {
    const current = memory.overexertion[rainelleId] || 0;
    if (current > 0) memory.overexertion[rainelleId] = current - 1;
  }

  // Epic C5.4: called from campaign-automation.js's doArroser, once per real watering pass
  // through a `priseFortDebit` borne, with `amount` the number of specimens actually watered
  // that pass (day or night alike — doArroser is shared, same posture as C5.3's capacityLimit).
  // Never called for a borne without the flag, and never for a pass that watered nothing (see
  // that file's own call site) — a borne "sans prise à fort débit n'y touche jamais", this
  // epic's own exit criterion.
  function recordWaterWithdrawal(memory, borneId, amount) {
    memory.waterWithdrawals[borneId] =
      (memory.waterWithdrawals[borneId] || 0) + amount;
  }

  // Epic C5.4: pure derivation, not a stored field — see header comment for why. Floored at
  // zero: withdrawals can exceed the nominal capacity (nothing here stops a borne from drawing
  // past it), but the level itself never reads as negative.
  function bassinCommunLevel(memory) {
    const total = Object.values(memory.waterWithdrawals).reduce(
      (n, v) => n + v,
      0,
    );
    return Math.max(0, BASSIN_COMMUN_CAPACITY - total);
  }

  // Epic C5.7: called once per Rainelle id campaign-scenes.js's detectPersistentGestures just
  // returned for this same night (garden-state-cmd-f.js's "sleep", the only call site) — same
  // "record once, never duplicated" guard as recordBirth, for the same reason (a Rainelle can be
  // detected persistent again on a later night, but that must never grow this list past one entry
  // per id, since the reparation check only cares whether it was *ever* seen, not how many times).
  function recordPersistentGesture(memory, rainelleId) {
    if (!memory.persistentGestureIds.includes(rainelleId))
      memory.persistentGestureIds.push(rainelleId);
  }

  // Epic C6.4: called from garden-state-cmd-r.js's deliverContract, once per successful delivery,
  // with `amount` the number of specimens that delivery actually moved (already capped by
  // campaign-contracts.js's deliverableCount — never called with an amount that would push the
  // total past the contract's own quota, so this never has to re-check that bound itself, same
  // "the command already decided, this just records" posture as recordWaterWithdrawal above).
  function recordContractDelivery(memory, contractId, amount) {
    memory.contractsFed[contractId] =
      (memory.contractsFed[contractId] || 0) + amount;
  }

  const api = {
    freshMemory,
    OVEREXERTION_THRESHOLD,
    BASSIN_COMMUN_CAPACITY,
    recordRest,
    recordBirth,
    recordFirstGesture,
    recordManualIntervention,
    recordNightlyActivity,
    increaseOverexertion,
    decreaseOverexertion,
    recordWaterWithdrawal,
    bassinCommunLevel,
    recordPersistentGesture,
    recordContractDelivery,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignMemory = api;
})(globalThis);
