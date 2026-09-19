/* Campaign scenes: pure derivations that decide what a scene should observe, part of the
   campaign layer (UMD: node module / browser GardenCampaignScenes).

   Epic C5.5 (design §15, phase 5's own exit gate; see campagne-backlog.md's Cartographe note,
   2026-09-19 second lot of phase 5). The three reference scenes named by design §11 ("la pause
   qui ne commence pas", "les pots qui ne comptent plus", "rendre le passage") all assume a
   Rainelle is visible and mobile in the world — verified false in this codebase today (C2.3:
   "Toujours aucun rendu" ; C3.7/C2.8v/C2.9: no position/movement ever built). Building a full 3D
   representation and a shared movement graph (design §14) in the same epic as the rule that
   decides *where* a Rainelle should be seen would be exactly the "refonte simultanée de plusieurs
   systèmes" orchestration.md forbids — so this file adds no position, no `{x,z}` coordinate, no
   movement graph, and no new persisted field. `deriveLocation` is a pure read of facts that
   already exist the instant a night resolves (a Rainelle's `geste`, the station registry, and the
   Set of ids that did real work this specific night — `campaign-automation.js`'s own
   `runNightWork` return value, already computed once by "sleep", garden-state-cmd-f.js) into
   exactly one of three observable locations. This is deliberately the *only* place that decision
   is made: C5.6's scene and any future render layer must call this, never invent a second
   classification.

   Why `workedThisNight` is a parameter, not something read back from state: "comptée dans
   campaignMemory.rest pour la dernière nuit résolue" cannot mean reading the persisted
   `campaignMemory.rest` counter itself — that field is a lifetime cumulative total (never
   decreasing, same shape as `births`), so it cannot tell "did this Rainelle rest *last* night"
   on its own, only "how many nights ever". The one place that specific, single-night fact exists
   is the `workedIds` Set garden-state-cmd-f.js's own "sleep" already builds from `runNightWork`
   before folding it into that cumulative counter — passing it straight through here is reusing
   that fact, not inventing a second one, and needs no new persisted field to do it.

   Three cases, matching this epic's own exit criterion literally:
     - "poste": a gesture is assigned AND (it did real work this specific night, OR it is a kind
       of gesture that simply has no night mechanism at all but still runs fine by day — today
       only "transporter", see campaign-automation.js's own header comment: "a transporteuse
       never works at night... whatever it's taught"). Night-work detection reuses
       `workedThisNight` (itself produced by runNightWork calling doArroser/doRecolter) rather
       than re-implementing any part of that detection here.
     - "repos": a gesture assigned to arroser/recolter, resolvable to a real zone, whose veilleuse
       is simply off — the legitimate, by-design "au repos" state (design §3), never penalised,
       and with no residual: a zone's veilleuse is read fresh every call, so switching it off
       before the next night immediately reads back as "repos" again, nothing to reset.
     - "habitat": no gesture ever taught; or a gesture assigned to arroser/recolter whose zone id
       doesn't resolve at all ("station manquante"); or one whose zone resolves with an active
       veilleuse that still did no real work this night ("station... vide" — C5.2's own third
       case, "veilleuse mais source vide"); or "transporter" with an unresolvable/degenerate
       (same-panier) pair; or a taught-but-unimplemented verb (replanter/preparer/trier,
       design §5's own remaining table rows) — none of these has a station concept to check today
       (campaign-automation.js's tickRainelle simply no-ops for them), which reads as "station
       manquante" by the same clause, matching that file's own framing of such a Rainelle as
       "idle... the correct, honest state until its epic lands". */
(function (root) {
  const Stations =
    typeof module !== "undefined"
      ? require("./campaign-stations.js")
      : root.GardenCampaignStations;

  const LOCATIONS = { POSTE: "poste", REPOS: "repos", HABITAT: "habitat" };

  // Same tiny resolve-and-check-kind wrapper campaign-automation.js keeps private as its own
  // `resolveKind` — not exported from there, so redefined here rather than reached into; the
  // actual shared primitive both call is `Stations.resolveStation`, never duplicated.
  function resolveKind(s, id, kind) {
    const r = Stations.resolveStation(s.campaignStations, id);
    return r.ok && r.kind === kind ? r.station : null;
  }

  function deriveLocation(rainelle, s, workedThisNight) {
    const geste = rainelle.geste;
    if (!geste) return LOCATIONS.HABITAT;
    if (workedThisNight.has(rainelle.id)) return LOCATIONS.POSTE;

    if (geste.verbe === "arroser" || geste.verbe === "recolter") {
      const zone = resolveKind(s, geste.poste, "zone");
      if (!zone) return LOCATIONS.HABITAT; // station manquante
      // Resolved, but this Rainelle is not in workedThisNight: either the veilleuse is simply
      // off (legitimate rest, C5.2's cases 1/4) or it is on with nothing to do (C5.2's case 3,
      // "source vide").
      return zone.veilleuse ? LOCATIONS.HABITAT : LOCATIONS.REPOS;
    }

    if (geste.verbe === "transporter") {
      // No night mechanism exists for this verb at all (see header comment), so
      // workedThisNight never contains it either way — resolvability alone decides whether it
      // "fonctionne de jour".
      const from = resolveKind(s, geste.source, "panier");
      const to = resolveKind(s, geste.destination, "panier");
      return from && to && from !== to ? LOCATIONS.POSTE : LOCATIONS.HABITAT;
    }

    // A taught-but-unimplemented verb (replanter/preparer/trier): no station concept exists for
    // it yet — see header comment.
    return LOCATIONS.HABITAT;
  }

  const api = { LOCATIONS, deriveLocation };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignScenes = api;
})(globalThis);
