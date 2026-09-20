/* Campaign observation mode: read-only diagnostics over the campaign layer, part of the
   campaign layer (UMD: node module / browser GardenCampaignObservation).

   Epic C2.9 (design §5, "Le mode d'observation montre chemins, transferts et cadence par
   journée. Il permet de suivre un objet du plant au présentoir et de lancer un cycle pas à
   pas."). Same posture as rainelles-status.js/campaign-scenes.js before it: this file never
   mutates `s`, it only reads `s.rainelles`/`s.campaignStations`/`s.campaignMemory` and the
   other campaign modules' own pure functions to produce a readable snapshot for a HUD panel
   (C2.9's own hud-panel-rows.js wiring) — never a second source of truth for anything already
   decided elsewhere (routing, station resolution, blockage state are all delegated to the
   modules that already own them, per this file's own dependency list below).

   Documented scope gap, on the same model as C2.8's own header comment about "passage bloqué"
   being deferred until real movement existed: the design's literal exit criterion is "suivre un
   objet du plant au présentoir" (a présentoir/point of sale). campaign-stations.js's own KINDS
   registry only knows four station kinds — borne, zone, panier, habitat (verified by direct
   reading, not by inference) — and no présentoir/commerce system exists anywhere in the campaign
   layer; campaign-memory.js reserved `unsoldStock`/`contractsFed` for one, and Epic C6.4 has
   since filled `contractsFed` for real (per-contract delivered counts, campaign-contracts.js) —
   but still no présentoir/point-of-sale UI exists for this observation view to follow, only a
   contract/delivery command pair with no world placement. Building
   a présentoir here would mean inventing a whole point-of-sale mechanic inside an epic whose own
   mandate is an observation *view*, exactly the "jamais une refonte simultanée de plusieurs
   systèmes" orchestration forbids — the same reasoning C2.8 itself already used to defer
   "passage bloqué" until C5.10/C5.11 existed. `resolveChainEnd` below therefore follows the real
   `transporter` chain (source→destination, already present on `s.rainelles[i].geste`, C2.7) to
   its last real panier — "sa dernière station réelle", not "le présentoir" — the last one that
   is not itself the source of any `transporter` geste. That is the whole scope of "suivre un
   objet" this epic can honestly deliver until a présentoir/vente epic exists; a future epic that
   adds one only has to teach this same walk one more station kind, not rebuild it.

   Dependencies, and why each is read rather than reimplemented (design's own "jamais une
   refonte" plus this file's own "jamais une deuxième logique" mandate):
     - campaign-stations.js (Stations): resolveStation/panierTotal, the only place a station id
       is resolved against the registry — never a second lookup here.
     - campaign-automation.js (Automation): CYCLE_SECONDS only, so a HUD label naming "un cycle"
       never hardcodes a second, duplicated number (this file's own CYCLE_SECONDS below is a
       direct re-export, not a copy).
     - rainelle-movement.js (RainelleMovement): routeTo, the only itinerary calculator that
       exists — a Rainelle's route is never recomputed by a second algorithm here.
     - rainelles-status.js (RainellesStatus): status, the only live "is this Rainelle actually
       working right now" readout — reused both to decide a Rainelle's route target (see
       locationOf below) and to describe what a station's workers are doing.

   `locationOf` deliberately duplicates the three-line POSTE/HABITAT decision garden-state.js's
   own tickRainelleMovement already makes (RainellesStatus.status(...).kind === "au-travail" ?
   POSTE : HABITAT) rather than importing it from there: garden-state.js exposes no standalone
   function for just this decision (it is inlined in the middle of a tick method that also
   mutates positions), and this file's own mandate is strictly read-only diagnostics that must
   never gain the ability to influence — or accidentally be influenced by refactoring — the real
   tick loop. Extracting a shared helper would mean editing garden-state.js/rainelle-movement.js
   for an epic whose mandate is additive-only; the assumed duplication is three lines, already
   covered by tests/campaign-rainelle-position.cjs on the tick-loop side and by this file's own
   tests below, and it can never drift silently into two different behaviours without a test
   failing on at least one side. Never a second target-resolution algorithm, only this one
   decision of *which* of RainelleMovement's own two locations to route toward — the geometry
   itself is entirely RainelleMovement.routeTo's job. */
(function (root) {
  const Stations =
    typeof module !== "undefined"
      ? require("./campaign-stations.js")
      : root.GardenCampaignStations;
  const Automation =
    typeof module !== "undefined"
      ? require("./campaign-automation.js")
      : root.GardenCampaignAutomation;
  const RainelleMovement =
    typeof module !== "undefined"
      ? require("./rainelle-movement.js")
      : root.GardenRainelleMovement;
  const RainellesStatus =
    typeof module !== "undefined"
      ? require("./rainelles-status.js")
      : root.GardenRainellesStatus;

  // Never a second, duplicated cycle length — see header comment.
  const CYCLE_SECONDS = Automation.CYCLE_SECONDS;

  // See header comment: the same POSTE/HABITAT verdict garden-state.js's own tickRainelleMovement
  // computes, deliberately duplicated rather than imported.
  function locationOf(s, rainelle) {
    return RainellesStatus.status(rainelle, s).kind === "au-travail"
      ? "poste"
      : "habitat";
  }

  // "Chemins" (design §5): the real itinerary of every Rainelle that actually has a position
  // (C5.11 — a Rainelle born but never yet ticked once has x/z === null and is skipped, never
  // given a guessed route). Read-only: routeTo itself never mutates anything (rainelle-
  // movement.js's own header comment), and neither does this loop.
  function observedPaths(s) {
    const paths = [];
    for (const rainelle of s.rainelles) {
      if (!Number.isFinite(rainelle.x) || !Number.isFinite(rainelle.z)) continue;
      const status = RainellesStatus.status(rainelle, s);
      const location = status.kind === "au-travail" ? "poste" : "habitat";
      paths.push({
        rainelleId: rainelle.id,
        location,
        statusKind: status.kind,
        statusMessage: status.message,
        position: { x: rainelle.x, z: rainelle.z },
        route: RainelleMovement.routeTo(s, rainelle, location),
      });
    }
    return paths;
  }

  // Every Rainelle whose geste currently names `stationId` in any of its three station fields
  // (source/poste/destination — the only three a geste ever has, rainelles.js's own
  // validateGestureFields), with which field and its live status. A station id is never
  // ambiguous across kinds (campaign-stations.js's own distinct prefixes), so no `kind` parameter
  // is needed here to disambiguate.
  function workersOf(s, stationId) {
    const found = [];
    for (const rainelle of s.rainelles) {
      const geste = rainelle.geste;
      if (!geste) continue;
      for (const field of ["source", "poste", "destination"]) {
        if (geste[field] === stationId)
          found.push({
            rainelleId: rainelle.id,
            verbe: geste.verbe,
            role: field,
            status: RainellesStatus.status(rainelle, s).kind,
          });
      }
    }
    return found;
  }

  // "Transferts" (design §5): a readable summary of every registered borne/zone/panier — what is
  // actually flowing through it right now, not a static catalog. A panier's buffer is copied
  // (`{ ...panier.buffer }`), never the live object itself, so a caller can never mutate the real
  // station through this read-only snapshot by accident.
  function observedTransfers(s) {
    const registry = s.campaignStations;
    const transfers = [];
    for (const borne of registry.bornes)
      transfers.push({
        kind: "borne",
        id: borne.id,
        priseFortDebit: borne.priseFortDebit,
        rainelles: workersOf(s, borne.id),
      });
    for (const zone of registry.zones)
      transfers.push({
        kind: "zone",
        id: zone.id,
        veilleuse: zone.veilleuse,
        rainelles: workersOf(s, zone.id),
      });
    for (const panier of registry.paniers)
      transfers.push({
        kind: "panier",
        id: panier.id,
        buffer: { ...panier.buffer },
        total: Stations.panierTotal(panier),
        capacity: panier.capacity,
        min: panier.min,
        rainelles: workersOf(s, panier.id),
      });
    return transfers;
  }

  // "Cadence par journée" (design §5): design §11/§14 explicitly forbid a new, unbounded
  // per-tick log — this derives a rate from the bounded journal C5.1 already keeps
  // (`s.campaignMemory.nightlyActivity`), never a new persisted field. `Math.max(1, ...)` guards
  // the otherwise-undefined "day zero" case (a save always starts at campaignDay 1,
  // garden-state-lifecycle.js, but this stays defined even against a malformed/pre-migration
  // value rather than dividing by zero) — the same defensive-but-documented posture already used
  // for OVEREXERTION_THRESHOLD/MAX_WAIT_STEPS: the design names no formula, this is the most
  // direct reading of "cadence par journée" (work done, divided by days elapsed) and is
  // documented here rather than guessed silently.
  function observedCadence(s) {
    const memory = s.campaignMemory;
    const day = Math.max(1, s.campaignDay || 0);
    return s.rainelles.map((rainelle) => {
      const nights = (memory && memory.nightlyActivity[rainelle.id]) || 0;
      return {
        rainelleId: rainelle.id,
        nightlyActivity: nights,
        campaignDay: s.campaignDay,
        perDay: nights / day,
      };
    });
  }

  // "Suivre un objet... jusqu'à sa dernière station réelle" — see header comment for the
  // présentoir scope gap. `startId` may be a zone (the produce's origin: the first panier a
  // récolteuse actually feeds from that zone, if any) or a panier directly. Walks the real
  // `transporter` chain (source → destination, C2.7) one hop at a time until no Rainelle is
  // taught to transport further from the current panier — that panier is the real end of chain
  // observable today. A cycle guard (`seen`) stops this from ever looping forever even though
  // ordinary play should never produce one (a Rainelle cannot transport a panier into itself,
  // campaign-automation.js's own tickTransporter) — two Rainelles could still be taught A→B and
  // B→A, and this must terminate rather than hang a HUD panel on that misconfiguration.
  function resolveChainEnd(s, startId) {
    const resolved = Stations.resolveStation(s.campaignStations, startId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    let panierId;
    if (resolved.kind === "panier") {
      panierId = startId;
    } else if (resolved.kind === "zone") {
      const recolteuse = s.rainelles.find(
        (r) => r.geste && r.geste.verbe === "recolter" && r.geste.poste === startId,
      );
      if (!recolteuse) return { ok: true, chain: [], endId: null };
      panierId = recolteuse.geste.destination;
    } else {
      return {
        ok: false,
        error: `Une chaîne ne peut démarrer que d'une zone ou d'un panier, pas d'une "${resolved.kind}".`,
      };
    }
    const chain = [panierId];
    const seen = new Set(chain);
    let current = panierId;
    for (;;) {
      const hop = s.rainelles.find(
        (r) => r.geste && r.geste.verbe === "transporter" && r.geste.source === current,
      );
      if (!hop || seen.has(hop.geste.destination)) break;
      current = hop.geste.destination;
      chain.push(current);
      seen.add(current);
    }
    return { ok: true, chain, endId: current };
  }

  const api = {
    CYCLE_SECONDS,
    locationOf,
    observedPaths,
    observedTransfers,
    observedCadence,
    resolveChainEnd,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignObservation = api;
})(globalThis);
