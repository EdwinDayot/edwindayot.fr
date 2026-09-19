/* Campaign automation: per-Rainelle tick behaviour, part of the campaign layer (UMD: node
   module / browser GardenCampaignAutomation).

   Epic C2.6c is the third and final tier of C2.6's reformulation (see campagne-backlog.md's
   journal des décisions, 2026-09-18): C2.6a gave every geste's `poste`/`source`/`destination` a
   registry to resolve against (bornes/zones/paniers, campaign-stations.js) and C2.6b gave a
   specimen humidity/maturity (cultivars.js) — this epic is the first to actually *read* those
   two registries together, every tick, so a taught gesture does something without the player's
   intervention (design §5, "Contrat du geste unique").

   This is deliberately a *new* file, not an extension of game/automation.js: that file's
   tickJob/tickBuffer operate on `s.entities`/`D.recipes`, the free garden's own data space —
   completely disjoint from `s.rainelles`/`s.specimens`/`s.campaignStations`, the campaign layer's
   own arrays (see rainelles.js/cultivars.js/campaign-stations.js header comments — none of them
   are folded into `s.entities`, same "rules before rendering" posture repeated at each of their
   own introductions). What's reused here is automation.js's *pattern*, not its code: a minute
   countdown living on the actor (`rainelle.job = { remaining }`, exactly tickJob's shape) and a
   fill/drain object keyed by item id (`panier.buffer`, exactly tickBuffer/tickSow/tickDispense's
   `e.buffer` shape) — the same two primitives the backlog's exit criterion names explicitly,
   reimplemented against a different data space rather than imported, since automation.js's own
   functions read `D.recipes[e.type]` and would need an unrelated recipe entry to mean anything.

   Verb scope: "arroser"/"recolter" (C2.6c) and now "transporter" (C2.7) are implemented. The
   two remaining verbs a Rainelle can be taught (replanter/preparer/trier, design §5's own
   table) are validated as teachable since C2.4 but deliberately do nothing here — later epics
   are where each gets its own tick behaviour. A taught-but-unimplemented verb is a silent
   no-op, not an error: teaching it already succeeded (C2.4/C2.5), so a Rainelle just standing
   idle is the correct, honest state until its epic lands — the readable "blocage" state a
   player would actually see is C2.8's job, not this one's.

   Failure posture: an invalid poste/source/destination (unknown id, or an id that resolves to
   the wrong kind of station — e.g. a `recolter`'s poste pointing at a panier instead of a zone)
   never throws. There is no state/blockage system yet to report *why* a Rainelle is idle (C2.8) —
   until then, the only observable difference is that no job ever starts (`rainelle.job` stays
   whatever it already was, never created or advanced), exactly like a Rainelle taught a verb this
   file doesn't implement yet.

   Epic C5.2 adds a second, separate entry point (runNightWork, near the bottom of this file):
   doArroser/doRecolter are the day-tick versions' real effect split out so "sleep"
   (garden-state-cmd-f.js) can call either once, directly, for a Rainelle whose zone has its
   veilleuse on — a genuinely different call site from the ordinary per-second tick() loop above,
   not a parameter on it, since a resolved night has no seconds to advance a job countdown
   through. See runNightWork's own comment for verb scope and the memory-recording contract it
   exists to satisfy. */
(function (root) {
  const C =
    typeof module !== "undefined"
      ? require("./construction.js")
      : root.GardenConstruction;
  const Stations =
    typeof module !== "undefined"
      ? require("./campaign-stations.js")
      : root.GardenCampaignStations;
  const Cultivars =
    typeof module !== "undefined"
      ? require("./cultivars.js")
      : root.GardenCultivars;

  // How long one watering/harvest cycle takes, in simulated seconds (s.elapsed, never the wall
  // clock — same convention as every other campaign timer). No existing value in the codebase
  // is "the" right number for a brand-new gesture cycle: the closest precedent is the seed
  // dispenser's own recurring interval (D.recipes.seedDispenser.dispense.every = 20,
  // data-recipes.js), a comparable "do a small thing on a repeating cadence" primitive. Reused
  // here rather than invented from nothing; easy to retune once a real gesture is watched in
  // play. garden-state-validate.js hardcodes this same value as the upper bound on a persisted
  // rainelle.job.remaining — keep both in sync if this ever changes (same soft-sync posture
  // already used between this file's MATURE_STAGE-reading Cultivars calls and cultivars.js's own
  // duplicated botany-hybrids.js constant).
  const CYCLE_SECONDS = 20;

  // How far from the zone's own position a specimen still counts as "in the zone" for either
  // gesture. Design §5's table only says "petit rayon de travail" for arroser, without a number;
  // the closest existing precedent for a fixed, plant-facing work radius is the collector's own
  // range (D.recipes.collector.range = 4, data-recipes.js — the free garden's "gather from
  // plants within reach" primitive). Reused for both arroser and recolter rather than inventing
  // two different unexplained numbers; a zone is a single point in this registry (C2.6a), not
  // yet a polygon, so "in range of the zone's point" stands in for "in the zone" until a real
  // shape exists.
  const ZONE_WORK_RANGE = 4;

  // Resolves `id` against the registry and checks it is the expected kind; returns the station
  // itself on success or null otherwise — never throws, per this file's failure posture above.
  function resolveKind(s, id, kind) {
    const r = Stations.resolveStation(s.campaignStations, id);
    return r.ok && r.kind === kind ? r.station : null;
  }

  // Advances a Rainelle's job by one tick and returns true exactly once, the tick the cycle
  // completes (mirroring automation.js's tickJob: a countdown to zero, then restarted for the
  // next cycle — "sans intervention" means it must restart itself, never stall at zero).
  function advanceCycle(rainelle) {
    if (!rainelle.job) rainelle.job = { remaining: CYCLE_SECONDS };
    rainelle.job.remaining = Math.max(0, rainelle.job.remaining - 1);
    if (rainelle.job.remaining > 0) return false;
    rainelle.job.remaining = CYCLE_SECONDS;
    return true;
  }

  // "Arroser": fill the arrosoir at the borne (design §5 — the borne only has to be resolvable
  // and be a borne, C2.6a doesn't yet model an arrosoir capacity or the borne being fed), then
  // humidify every specimen within range of the poste (a zone). A cycle with nothing in range
  // still restarts cleanly — there is simply nothing to water this time.
  //
  // Split into the real effect (doArroser, returns whether it actually watered anything — Epic
  // C5.2's runNightWork below calls this directly, once, bypassing the day cycle's countdown
  // entirely: a night isn't ticked second by second, it is resolved atomically by "sleep") and
  // the day-tick wrapper (tickArroser, gated by advanceCycle as before, unchanged behaviour).
  function doArroser(rainelle, s) {
    const geste = rainelle.geste;
    const borne = resolveKind(s, geste.source, "borne");
    const zone = resolveKind(s, geste.poste, "zone");
    if (!borne || !zone) return false;
    let watered = false;
    for (const specimen of s.specimens)
      if (C.distance(zone, specimen) <= ZONE_WORK_RANGE) {
        Cultivars.waterSpecimen(specimen, s.elapsed);
        watered = true;
      }
    return watered;
  }

  function tickArroser(rainelle, s) {
    const geste = rainelle.geste;
    // Resolved *before* advancing the cycle, exactly as before this split: an unresolved source/
    // poste must never even start the countdown (rainelle.job stays null forever), not just skip
    // the watering once resolved — see the "leaves the Rainelle inactive without throwing" test.
    if (!resolveKind(s, geste.source, "borne") || !resolveKind(s, geste.poste, "zone"))
      return;
    if (!advanceCycle(rainelle)) return;
    doArroser(rainelle, s);
  }

  // "Récolter": deposit every mature, ready specimen in range of the poste (a zone) into the
  // destination panier's buffer, then clear its readyToProduce flag. The buffer is keyed by
  // cultivarId — there is no separate notion of "produit" for a campaign cultivar yet (unlike
  // the free garden's `${product}:${species}` item ids, D.species[].product), so the cultivar
  // itself is the closest stable identity a panier can tally against; a later epic that adds a
  // real product concept can re-key this without touching the buffer shape itself.
  //
  // Epic C2.8 (design §5, "un emplacement de sortie [est] réservé avant le départ" / "sortie
  // pleine"): once `panier.capacity` is reached, further specimens simply stay readyToProduce —
  // never harvested, never lost — until room frees up (a later transporter run, or the player).
  // This is the whole reservation this epic needs for récolter: `s.rainelles` is ticked
  // strictly in array order (tickRainelle's own caller, garden-state.js's tick()), so two
  // récolteuses sharing a zone/panier in the very same tick can never both count the same unit
  // of headroom — the first to run already updated `panier.buffer` before the second reads it.
  //
  // Same split as doArroser/tickArroser above (Epic C5.2): doRecolter is the real effect, called
  // directly by runNightWork once per veilleuse-lit night, and returns whether it actually
  // harvested at least one unit — never true on an empty/out-of-range/already-full pass.
  function doRecolter(rainelle, s) {
    const geste = rainelle.geste;
    const zone = resolveKind(s, geste.poste, "zone");
    const panier = resolveKind(s, geste.destination, "panier");
    if (!zone || !panier) return false;
    // Tracked incrementally rather than re-summing Stations.panierTotal(panier) on every
    // specimen: same result, without an O(buffer keys) reduce per specimen visited this cycle.
    let total = Stations.panierTotal(panier);
    let harvested = false;
    for (const specimen of s.specimens) {
      if (!Cultivars.isMature(specimen) || !specimen.readyToProduce) continue;
      if (C.distance(zone, specimen) > ZONE_WORK_RANGE) continue;
      if (total >= panier.capacity) break;
      panier.buffer[specimen.cultivarId] =
        (panier.buffer[specimen.cultivarId] || 0) + 1;
      Cultivars.setReadyToProduce(specimen, false);
      total++;
      harvested = true;
    }
    return harvested;
  }

  function tickRecolter(rainelle, s) {
    const geste = rainelle.geste;
    if (!resolveKind(s, geste.poste, "zone") || !resolveKind(s, geste.destination, "panier"))
      return;
    if (!advanceCycle(rainelle)) return;
    doRecolter(rainelle, s);
  }

  // "Transporter" (design §5, « Panier A » → « Panier B », limite « un trajet et un filtre de
  // ressource actifs »). Both limits are already true by construction, not by anything added
  // here: a geste is a single {verbe, poste, source, destination, condition} record (C2.4), so a
  // Rainelle taught "transporter" only ever has the one source/destination pair and the one
  // `condition` filter it was last taught — exactly the same way "un petit rayon de travail" for
  // arroser needed no extra code beyond reading `geste.poste`. `condition` (optional on every
  // verb since C2.4/rainelles.js's validateGestureFields) doubles as the resource filter the
  // design table calls for: a non-empty condition moves only that one cultivar id, an empty one
  // (a Rainelle taught with the field left blank) moves everything currently in the source
  // panier's buffer — still a single trajet, just an unfiltered one, never a second route.
  // Transporting into the same panier the Rainelle reads from is a degenerate, meaningless
  // configuration (moving a bucket into itself), so it is treated the same as an unresolved
  // station: no job ever starts. `geste.poste` is not read here: rainelles.js's own
  // PHRASE_BUILDERS.transporter already ignores it for the same verb (design §5's row for
  // "transporter" names only a source panier and a destination panier), so
  // validateGestureFields's blanket "poste ne peut pas être vide" is a schema-wide rule this verb
  // simply has nothing to do with, not a field this tick behaviour forgot to use.
  // Epic C2.8 (design §5, "un emplacement de sortie [est] réservé avant le départ" and "stock
  // sous le seuil" as a condition equipment can expose): a single trajet now respects two limits
  // at once, both counted against `Stations.panierTotal` (whole-panier, not per-resource — see
  // that function's own comment) —
  //   - the destination's `capacity`: never deliver past it ("sortie pleine").
  //   - the source's `min`: never drain it below its protected floor ("stock cible atteint" —
  //     design's own example is a présentoir whose seuil "évite de vider la réserve
  //     alimentaire"). DEFAULT_PANIER_MIN is 0, so this is a no-op until some future command
  //     raises a panier's min above zero.
  // `budget` is the largest amount this trajet may move in total this cycle, combining both
  // limits; each filtered key is moved up to what's left of that shared budget, then the budget
  // shrinks — so a trajet that would blow either limit moves only as much as it safely can
  // ("un blocage arrête proprement la production, sans détruire le stock", design §5) rather
  // than moving everything and overshooting, or moving nothing at all when a partial move is
  // safe. Reservation-by-construction: exactly like tickRecolter above, s.rainelles ticks in
  // array order, so two transporteuses racing for the same headroom in one tick never double-
  // count it — the first to run has already updated both paniers' buffers.
  function tickTransporter(rainelle, s) {
    const geste = rainelle.geste;
    const from = resolveKind(s, geste.source, "panier");
    const to = resolveKind(s, geste.destination, "panier");
    if (!from || !to || from === to) return;
    if (!advanceCycle(rainelle)) return;
    const keys = geste.condition ? [geste.condition] : Object.keys(from.buffer);
    const roomAtDestination = Math.max(
      0,
      to.capacity - Stations.panierTotal(to),
    );
    const takeableFromSource = Math.max(
      0,
      Stations.panierTotal(from) - from.min,
    );
    let budget = Math.min(roomAtDestination, takeableFromSource);
    for (const key of keys) {
      if (budget <= 0) break;
      const qty = Math.min(from.buffer[key] || 0, budget);
      if (qty <= 0) continue;
      to.buffer[key] = (to.buffer[key] || 0) + qty;
      from.buffer[key] -= qty;
      if (from.buffer[key] <= 0) delete from.buffer[key];
      budget -= qty;
    }
  }

  // One Rainelle, one tick. A null geste, or a verb this file doesn't implement yet (see header
  // comment), is a no-op — never an exception, never a silent mutation of `job`.
  function tickRainelle(rainelle, s) {
    const geste = rainelle.geste;
    if (!geste) return;
    if (geste.verbe === "arroser") tickArroser(rainelle, s);
    else if (geste.verbe === "recolter") tickRecolter(rainelle, s);
    else if (geste.verbe === "transporter") tickTransporter(rainelle, s);
  }

  // The smallest additive mechanism that gives "recolter" anything to ever collect: nothing else
  // in the codebase yet flips readyToProduce (cultivars.js's own header comment names this gap
  // explicitly — "Personne ne met jamais readyToProduce à true"). A mature specimen with
  // readyToProduce still false becomes ready on its very next tick — no growth timer, no
  // progress accumulator, unlike the free garden's plant.progress/p.ready (garden-state.js's own
  // tick()). Concretely this means a specimen that stays mature keeps being harvested again once
  // per completed cycle for as long as a Rainelle keeps tending it (readiness pass runs, then
  // that same tick's harvest can consume it, then the next tick's readiness pass re-arms it) —
  // an unlimited, un-throttled repeat production, not a one-shot. That is a deliberate, minimal
  // stand-in for a real regeneration cycle (cooldowns, yield limits, a growth stage that resets),
  // not an attempt at one; a fuller model is future work, not this epic's.
  function updateSpecimenReadiness(s) {
    for (const specimen of s.specimens)
      if (Cultivars.isMature(specimen) && !specimen.readyToProduce)
        Cultivars.setReadyToProduce(specimen, true);
  }

  // Epic C5.2 (design §11, "veilleuses de croissance... continuent de travailler la nuit"): called
  // once from "sleep" (garden-state-cmd-f.js), never from the ordinary day tick() loop above — a
  // night is resolved atomically, not ticked second by second, so this runs each eligible
  // Rainelle's gesture exactly once, the same real consumption rules doArroser/doRecolter already
  // enforce for a daytime cycle (capacity/min, range, maturity — nothing here is a free grant).
  //
  // Only "arroser"/"recolter" are eligible: both read `geste.poste` as a zone, the only station
  // kind veilleuse lives on (campaign-stations.js). "Transporter" has no zone in its own geste at
  // all — its own header comment above notes `geste.poste` is unused for that verb, a pair of
  // paniers has nothing a veilleuse could be attached to — so a transporteuse never works at
  // night under this mechanism, whatever it's taught; a documented scope reduction, not an
  // oversight, against the backlog entry's more casual "Arroser/Récolter/Transporter" phrasing.
  //
  // Returns the Set of Rainelle ids that did real, observable work this night (see doArroser's/
  // doRecolter's own return value) — never merely "had an active veilleuse": an empty source, an
  // already-full destination, or a Rainelle taught a different/no verb all leave their id out,
  // exactly the distinction garden-state-cmd-f.js needs to keep `rest` and `nightlyActivity`
  // mutually exclusive per Rainelle per night (design §11: a veilleuse lit but idle for want of
  // input never counts as a night of work).
  function runNightWork(s) {
    const worked = new Set();
    for (const rainelle of s.rainelles) {
      const geste = rainelle.geste;
      if (!geste || (geste.verbe !== "arroser" && geste.verbe !== "recolter")) continue;
      const zone = resolveKind(s, geste.poste, "zone");
      if (!zone || !zone.veilleuse) continue;
      const didWork =
        geste.verbe === "arroser" ? doArroser(rainelle, s) : doRecolter(rainelle, s);
      if (didWork) worked.add(rainelle.id);
    }
    return worked;
  }

  const api = {
    CYCLE_SECONDS,
    ZONE_WORK_RANGE,
    tickRainelle,
    updateSpecimenReadiness,
    runNightWork,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignAutomation = api;
})(globalThis);
