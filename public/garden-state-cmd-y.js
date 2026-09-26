/* GardenState.command() branch group Y (UMD: node module / browser prototype). Epic C6.26
   (design §11, third intensification lever, "extension standardisée sur un espace vivant") wires
   the third of the table's three levers — distinct from setVeilleuse/setPriseFortDebit (C5.2/C5.4,
   themselves wrongly labelled "the three levers" by C6.9's own commit, a naming mistake documented
   and left alone in campagne-backlog.md rather than reopened here — see this epic's own Cartographe
   note for the full trail).

   extendZoneOverHabitat({zoneId, habitatId}) sets a zone's `extensionCommerciale` flag
   (campaign-stations.js, off by default) from false to true and, in the same gesture, removes the
   named habitat from the registry via Stations.removeHabitat — the real cost this lever pays
   ("moins de refuges", design §11), not a free flag flip. Refused explicitly, without mutating
   anything, when zoneId doesn't resolve to a real zone, habitatId doesn't resolve to a real
   habitat, the zone is already extended (same "a repeat that changes nothing is refused" posture
   as setVeilleuse/releaseGesture), or Stations.removeHabitat itself refuses (habitat occupied —
   never second-guessed or bypassed here). Not a world entity command (neither a zone nor a habitat
   is addressed by c.id), so not added to garden-state.js's `physical` list, same posture as
   setVeilleuse/removeHabitat.

   On success, Memory.recordHabitatTransformation (campaign-memory.js) appends the first real entry
   ever written to `habitatTransformations`, reserved and empty since C5.1: `capacity` is read from
   the habitat *before* it is removed (the registry no longer has it to ask afterwards), `day` from
   s.campaignDay at the moment of the gesture — both facts this command alone can observe.

   No narrative reveal here, deliberately, same posture as C6.10's removeHabitat/releaseGesture:
   the accueil narratif of this lever (and its future reparation, C6.27) is a separate Scénariste
   epic, once both are `fait` and proven useful in play — inventing a reveal now would not be
   reading the design, only guessing ahead of it.

   Epic C6.28 adds that narrative accueil to convertZoneToLivingSpace's own success path (never to
   extendZoneOverHabitat, same posture as C6.9's three levers — none of them reveal at activation,
   only at reparation): gated on "archives-restaurees" (C6.7, same acte-VI sequencing anchor as the
   other three levier-* reveals) and on the conversion actually succeeding. No separate usage
   guard is needed beyond what this command already checks — a success here already requires
   Memory.findActiveHabitatTransformation to find a still-open entry, which by construction can
   only exist once extendZoneOverHabitat has really run (C6.26) — so "the lever really served" is
   already proven by the command's own existing refusal, never a fact to re-derive.

   Epic C6.27 adds this lever's reparation: convertZoneToLivingSpace({zoneId, x, z}) is refused,
   without mutating anything, when zoneId doesn't resolve to a real zone, that zone's
   `extensionCommerciale` is already false (nothing to convert — same "a repeat/no-op is refused"
   posture as the rest of this file), `x`/`z` aren't both finite numbers within the same [-64, 64]
   bound garden-state-validate.js already enforces on every station's position on load (checked
   here too, not just at load: rainelle-movement.js's nearestHabitat reads a habitat's x/z for real
   distance math in the same running session, before any save/reload would ever re-validate a bad
   value — a non-finite coordinate would otherwise corrupt every distance comparison against this
   habitat silently, never throwing, never refusing), or the fixed cost below can't be paid. On
   success: the cost is actually debited (GardenState.pay, never a free gesture — design §11,
   "certaines limites coûtent durablement"), `extensionCommerciale` returns to false, a brand-new
   habitat is registered at the caller-supplied `x`/`z` with **exactly** the capacity the original
   extendZoneOverHabitat took (Memory.findActiveHabitatTransformation reads it off the still-open
   entry, never a re-guessed or fixed number — the reparation restitutes what was actually taken),
   and that entry is marked returned (Memory.markHabitatTransformationReturned) rather than
   deleted, the same append-only discipline as the rest of campaign-memory.js. All of the above is
   checked, in this order, before this.pay(cost) ever runs — registerStation itself could still
   throw on a corrupted, out-of-band capacity (validate.js already forbids that shape on load, so
   this is not a reachable path through any real command), but nothing this command's own inputs
   control can trigger it once x/z are checked up front, so no try/catch is added around it.

   Documented deviation from this epic's own backlog wording: the backlog describes the command
   as taking a `cost` field directly from the caller. Every other paying command in this codebase
   (garden-state-cmd-a.js's unlock, -b.js's build, -l.js's repairHouseSpace) instead reads its cost
   from a fixed catalog entry, never trusts a bare cost object handed in by whoever issues the
   command — accepting an arbitrary `{wood,stone,clay}` from the caller would let it be called
   with `cost: {}` and convert for free, directly contradicting the same critère de sortie's own
   "matériaux réellement dépensés, jamais un geste gratuit". This command reuses
   `campaign-house.js`'s `SPACES.cuisine.cost` verbatim instead (the one SPACES entry that already
   exercises all three resources wood/stone/clay, the same schema this epic asks for) — a real,
   already-reviewed precedent, not an invented number — exactly the "par analogie avec un coût de
   réparation de maison déjà existant" the backlog itself asks for, just resolved as a fixed
   catalog lookup rather than a caller-supplied value. `x`/`z`, in contrast, are kept as real
   command parameters: nothing in the engine can derive a world position for a new habitat (the
   same limit registerStation itself has always had), so the caller genuinely has to supply them,
   unlike a cost that must never be left to the caller's discretion. */
(function (root) {
  const Stations =
    typeof module !== "undefined"
      ? require("./game/campaign-stations.js")
      : root.GardenCampaignStations;
  const Memory =
    typeof module !== "undefined"
      ? require("./game/campaign-memory.js")
      : root.GardenCampaignMemory;
  const House =
    typeof module !== "undefined"
      ? require("./game/campaign-house.js")
      : root.GardenCampaignHouse;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const util =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  const { finite } = util;
  const M = {
    commandSegY(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "extendZoneOverHabitat") {
        st.taken = true;
        const zoneResolved = Stations.resolveStation(s.campaignStations, c.zoneId);
        if (!zoneResolved.ok) return fail(zoneResolved.error);
        if (zoneResolved.kind !== "zone")
          return fail(`"${c.zoneId}" n'est pas une zone de culture.`);
        if (zoneResolved.station.extensionCommerciale)
          return fail("Cette zone est déjà étendue commercialement.");
        const habitatResolved = Stations.resolveStation(
          s.campaignStations,
          c.habitatId,
        );
        if (!habitatResolved.ok) return fail(habitatResolved.error);
        if (habitatResolved.kind !== "habitat")
          return fail(`"${c.habitatId}" n'est pas un habitat.`);
        const removedCapacity = habitatResolved.station.capacity;
        const result = Stations.removeHabitat(
          s.campaignStations,
          c.habitatId,
          s.rainelles.length + s.campaignNursery.length,
        );
        if (!result.ok) return fail(result.error);
        s.campaignStations = result.registry;
        zoneResolved.station.extensionCommerciale = true;
        Memory.recordHabitatTransformation(s.campaignMemory, {
          zoneId: c.zoneId,
          habitatId: c.habitatId,
          capacity: removedCapacity,
          day: s.campaignDay,
        });
        st.message = `Zone étendue : l'habitat "${c.habitatId}" a été cédé pour agrandir la production.`;
      }
      if (c.type === "convertZoneToLivingSpace") {
        st.taken = true;
        const zoneResolved = Stations.resolveStation(s.campaignStations, c.zoneId);
        if (!zoneResolved.ok) return fail(zoneResolved.error);
        if (zoneResolved.kind !== "zone")
          return fail(`"${c.zoneId}" n'est pas une zone de culture.`);
        if (!zoneResolved.station.extensionCommerciale)
          return fail("Cette zone n'a jamais été étendue commercialement : rien à convertir.");
        if (!finite(c.x, -64, 64) || !finite(c.z, -64, 64))
          return fail("Position invalide pour le nouvel habitat.");
        const cost = House.SPACES.cuisine.cost;
        if (!this.has(cost))
          return fail("Ressources insuffisantes pour convertir cette zone en espace de vie.");
        const entry = Memory.findActiveHabitatTransformation(s.campaignMemory, c.zoneId);
        if (!entry)
          return fail("Aucune transformation d'habitat active trouvée pour cette zone.");
        this.pay(cost);
        zoneResolved.station.extensionCommerciale = false;
        Stations.registerStation(s.campaignStations, "habitat", {
          x: c.x,
          z: c.z,
          capacity: entry.capacity,
        });
        Memory.markHabitatTransformationReturned(entry, s.campaignDay);
        st.message = "Zone reconvertie en espace de vie : un nouvel habitat a été aménagé.";
        if (s.campaignFlags.includes("archives-restaurees")) {
          const revealed = Narrative.pendingReveal(
            s.campaignFlags,
            "extensionConvertedToLivingSpace",
          );
          if (revealed) s.campaignFlags.push(revealed.id);
        }
      }
      return null;
    },
  };
  if (typeof module !== "undefined") module.exports = M;
  else {
    const S = root.GardenStateParts.state;
    Object.assign(S.prototype, M);
    S.commandSegs.push(...Object.values(M));
  }
})(globalThis);
