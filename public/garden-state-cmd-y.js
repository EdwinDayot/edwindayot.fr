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
   reading the design, only guessing ahead of it. */
(function (root) {
  const Stations =
    typeof module !== "undefined"
      ? require("./game/campaign-stations.js")
      : root.GardenCampaignStations;
  const Memory =
    typeof module !== "undefined"
      ? require("./game/campaign-memory.js")
      : root.GardenCampaignMemory;
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
