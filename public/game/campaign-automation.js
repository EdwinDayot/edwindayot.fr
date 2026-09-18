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
   file doesn't implement yet. */
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
  function tickArroser(rainelle, s) {
    const geste = rainelle.geste;
    const borne = resolveKind(s, geste.source, "borne");
    const zone = resolveKind(s, geste.poste, "zone");
    if (!borne || !zone) return;
    if (!advanceCycle(rainelle)) return;
    for (const specimen of s.specimens)
      if (C.distance(zone, specimen) <= ZONE_WORK_RANGE)
        Cultivars.waterSpecimen(specimen, s.elapsed);
  }

  // "Récolter": deposit every mature, ready specimen in range of the poste (a zone) into the
  // destination panier's buffer, then clear its readyToProduce flag. The buffer is keyed by
  // cultivarId — there is no separate notion of "produit" for a campaign cultivar yet (unlike
  // the free garden's `${product}:${species}` item ids, D.species[].product), so the cultivar
  // itself is the closest stable identity a panier can tally against; a later epic that adds a
  // real product concept can re-key this without touching the buffer shape itself.
  function tickRecolter(rainelle, s) {
    const geste = rainelle.geste;
    const zone = resolveKind(s, geste.poste, "zone");
    const panier = resolveKind(s, geste.destination, "panier");
    if (!zone || !panier) return;
    if (!advanceCycle(rainelle)) return;
    for (const specimen of s.specimens) {
      if (!Cultivars.isMature(specimen) || !specimen.readyToProduce) continue;
      if (C.distance(zone, specimen) > ZONE_WORK_RANGE) continue;
      panier.buffer[specimen.cultivarId] =
        (panier.buffer[specimen.cultivarId] || 0) + 1;
      Cultivars.setReadyToProduce(specimen, false);
    }
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
  function tickTransporter(rainelle, s) {
    const geste = rainelle.geste;
    const from = resolveKind(s, geste.source, "panier");
    const to = resolveKind(s, geste.destination, "panier");
    if (!from || !to || from === to) return;
    if (!advanceCycle(rainelle)) return;
    const keys = geste.condition ? [geste.condition] : Object.keys(from.buffer);
    for (const key of keys) {
      const qty = from.buffer[key] || 0;
      if (qty <= 0) continue;
      to.buffer[key] = (to.buffer[key] || 0) + qty;
      delete from.buffer[key];
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

  const api = { CYCLE_SECONDS, ZONE_WORK_RANGE, tickRainelle, updateSpecimenReadiness };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignAutomation = api;
})(globalThis);
