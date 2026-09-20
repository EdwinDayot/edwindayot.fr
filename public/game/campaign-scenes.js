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

  // Epic C5.6 (design §11, scène de référence "la pause qui ne commence pas" / design ch. 14,
  // "elle continue son geste devant un poste vide"). A Rainelle is in **persistance de geste**
  // strictly for C5.2's own case 3 — a *resolved* zone, veilleuse on, no real work this specific
  // night — never for "aucun geste jamais enseigné" nor "station manquante" (an unresolvable
  // poste id), which also read as HABITAT under deriveLocation but describe a Rainelle with no
  // real poste to be seen persisting *at*. deriveLocation's own enum return value cannot
  // distinguish these three by itself (they collapse to the same HABITAT constant), so this
  // function first asks deriveLocation for the same verdict it would give (never a second,
  // independent three-way classification — the check below only ever narrows that HABITAT
  // answer, never overrides it), then resolves the zone through the exact same `resolveKind`
  // primitive deriveLocation itself calls, purely to tell "resolved but empty" apart from "never
  // resolved at all" — not a second lookup mechanism, the identical one, reused. Once a zone
  // actually resolves and deriveLocation still said HABITAT, its veilleuse being on is already
  // implied (an off veilleuse would have read REPOS instead), so it needs no separate re-check
  // here.
  //
  // Reading `campaignMemory.overexertion` here, deliberately, is what tells "elle continue le
  // geste" (design ch. 14's persistence) apart from a Rainelle who simply has never once been
  // sursollicitée and happens to be idle tonight for want of input (backlog's own dedicated
  // test case) — the design is explicit that an idle-but-never-fatiguée veilleuse "ne compte pas
  // comme une nuit de travail" worth narrating as guilt. Read *before* garden-state-cmd-f.js's
  // own increase/decreaseOverexertion loop runs for this same night (same "as it stood before
  // tonight's own update" policy already documented by campaign-automation.js's capacityLimit) —
  // a Rainelle entering the night already fatigued by prior nights of real work is the one this
  // scene is about, not whatever the automatic, unconditional one-point recovery this same
  // night's rest branch is about to subtract.
  function isPersistentGesture(rainelle, s, workedThisNight) {
    const geste = rainelle.geste;
    if (!geste) return false;
    if (deriveLocation(rainelle, s, workedThisNight) !== LOCATIONS.HABITAT) return false;
    if (geste.verbe !== "arroser" && geste.verbe !== "recolter") return false;
    if (!resolveKind(s, geste.poste, "zone")) return false; // station manquante: nothing to persist at
    const overexertion =
      (s.campaignMemory && s.campaignMemory.overexertion[rainelle.id]) || 0;
    return overexertion > 0;
  }

  // Pure: the list of Rainelle ids in persistance de geste this same instant, for
  // garden-state-cmd-f.js's "sleep" to hand to data-narrative.js's pendingReveal — never mutates
  // anything, same posture as deriveLocation itself.
  function detectPersistentGestures(s, workedThisNight) {
    return s.rainelles
      .filter((r) => isPersistentGesture(r, s, workedThisNight))
      .map((r) => r.id);
  }

  // Epic C5.7 (design §11, "réparation... coût réel, jamais un bouton pardon" ; design ch. 14,
  // "elle interrompt une première fois le geste, sans redevenir instantanément disponible"). A
  // Rainelle counts as réparée this exact night only when *all three* facts hold at once — never
  // a fourth, independent classification, only a narrower read of facts C5.1/C5.3/C5.5/C5.6
  // already expose:
  //   - it was already detected in persistance de geste on some *earlier* night — the one fact
  //     this module cannot derive on its own, so it is handed in as `previouslyPersistentIds`
  //     (campaign-memory.js's own `persistentGestureIds`, C5.7's new bounded field — see its
  //     header comment for why this can't be inferred from overexertion alone);
  //   - its overexertion streak (C5.3) has come back down to exactly zero, read *after* tonight's
  //     own decreaseOverexertion has already run (garden-state-cmd-f.js) — "après avoir cessé
  //     d'être sursollicitée" read literally, not merely "lower than before";
  //   - its location this same night, per deriveLocation (C5.5), is exactly REPOS — a real rest
  //     night (veilleuse off), never merely "did not work", which also covers HABITAT (no gesture,
  //     or a gesture whose zone never resolves) — never something that was never a real poste to
  //     begin with.
  // A Rainelle can never satisfy both this function and isPersistentGesture the same night:
  // persistance requires deriveLocation to read HABITAT, réparation requires REPOS — mutually
  // exclusive return values of the exact same single classification.
  function isRepairedGesture(rainelle, s, workedThisNight, previouslyPersistentIds) {
    if (!previouslyPersistentIds.has(rainelle.id)) return false;
    const overexertion =
      (s.campaignMemory && s.campaignMemory.overexertion[rainelle.id]) || 0;
    if (overexertion > 0) return false;
    return deriveLocation(rainelle, s, workedThisNight) === LOCATIONS.REPOS;
  }

  // Pure: the list of Rainelle ids réparées this same instant, for garden-state-cmd-f.js's
  // "sleep" to hand to data-narrative.js's pendingReveal — never mutates anything, same posture
  // as detectPersistentGestures itself.
  function detectRepairedGestures(s, workedThisNight, previouslyPersistentIds) {
    return s.rainelles
      .filter((r) => isRepairedGesture(r, s, workedThisNight, previouslyPersistentIds))
      .map((r) => r.id);
  }

  // Epic C5.14 (design §14, mise en scène observable). Which Rainelle gets staged when several
  // are concerned by the same detection the same night: the first by array order, exactly the
  // "s.rainelles dans l'ordre du tableau" stable priority C2.8 already documents for
  // simultaneous claims — never a new sort, never random, never re-decided per call.
  function selectSceneRainelle(ids) {
    return ids.length ? ids[0] : null;
  }

  const api = {
    LOCATIONS,
    deriveLocation,
    detectPersistentGestures,
    detectRepairedGestures,
    selectSceneRainelle,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignScenes = api;
})(globalThis);
