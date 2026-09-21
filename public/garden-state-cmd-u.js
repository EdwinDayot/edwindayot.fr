/* GardenState.command() branch group U (UMD: node module / browser prototype). Epic C6.10
   (design §10, chapitre 17 "Rendre le passage") wires the two mechanisms the Cartographe's
   seventh-lot note (campagne-backlog.md) found already posed but never reachable from a command:
   removeHabitat and releaseGesture. Neither is a world entity command (a habitat/Rainelle is
   addressed by its own campaign id, never c.id), so neither is added to garden-state.js's
   `physical` list, same posture as setVeilleuse/teachGesture.

   removeHabitat({habitatId}) is a thin wrapper over Stations.removeHabitat (campaign-stations.js,
   posed by C3.3): that pure function already refuses an unknown id and a removal that would drop
   total habitat capacity below the living population ("un habitat occupé ne peut pas être
   supprimé sans destination de relogement") — this command resolves the population count as
   `s.rainelles.length + s.campaignNursery.length`, the exact same reservation harvestBud
   (garden-state-cmd-m.js) already uses before depositing a bourgeon: a bourgeon waiting in the
   nursery resolves into a real Rainelle at the next "sleep" unconditionally (garden-state-cmd-f.js),
   so it already occupies a living place in every sense that matters to this refusal, even though
   `s.rainelles` itself does not grow until that night resolves. On success, replaces
   `s.campaignStations` with the registry the pure function returns.

   releaseGesture({rainelleId}) is design §10's "laisser certaines Rainelles quitter le travail" :
   sets `rainelle.geste`/`rainelle.job` back to null, the same values createRainelle (rainelles.js)
   already gives a Rainelle before any teaching — refusing a Rainelle already without a gesture is
   the same "a reduction that reduces nothing is not a reduction" discipline C6.8's
   reduceContractQuota already applies. Never touches bourgeon/founder/x/z/cultivarId : this is a
   release of the taught gesture alone, not a reset of the Rainelle itself.

   No narrative reveal here, deliberately: neither habitat removal nor gesture release is one of
   the three intensification levers named by design §11's table (unlike C6.9's reduceContract/
   setVeilleuse/setPriseFortDebit) — inventing one would not be reading the design, see this
   epic's own "limite honnête" in campagne-backlog.md.

   Epic C6.15 adds one further step once releaseGesture itself has actually succeeded: freeing a
   gesture is one of the two events that can complete the settling condition (the other is
   restorePassage, garden-state-cmd-w.js) — RainelleMovement.selectRainelleToSettle(s) (pure,
   never mutates) is consulted immediately after, and its candidate (if any, here necessarily the
   very Rainelle just released, geste already null) is the one place this command applies
   `settledAt = true`, same "decide there, mutate here" split already documented in
   rainelle-movement.js's own header comment for this function. removeHabitat never reaches this
   check: it never sets a Rainelle's geste to null, so it cannot complete the condition.

   Epic C6.16 adds the narrative reveal for that same event: once settleId is really non-null
   here, Narrative.pendingReveal fires "passageRainelleSettled" (data-narrative.js), same one-shot
   pattern already used by every other campaignFlags reveal in this codebase — same signal as
   garden-state-cmd-w.js's restorePassage, since either can complete the condition and the text is
   about the settling itself, not about which command happened to complete it. */
(function (root) {
  const Stations =
    typeof module !== "undefined"
      ? require("./game/campaign-stations.js")
      : root.GardenCampaignStations;
  const RainelleMovement =
    typeof module !== "undefined"
      ? require("./game/rainelle-movement.js")
      : root.GardenRainelleMovement;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const M = {
    commandSegU(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "removeHabitat") {
        st.taken = true;
        const result = Stations.removeHabitat(
          s.campaignStations,
          c.habitatId,
          s.rainelles.length + s.campaignNursery.length,
        );
        if (!result.ok) return fail(result.error);
        s.campaignStations = result.registry;
        st.message = "Habitat retiré.";
      }
      if (c.type === "releaseGesture") {
        st.taken = true;
        const rainelle = s.rainelles.find((r) => r.id === c.rainelleId);
        if (!rainelle) return fail("Rainelle inconnue.");
        if (!rainelle.geste) return fail("Cette Rainelle n'a déjà aucun geste.");
        rainelle.geste = null;
        rainelle.job = null;
        st.message = "Geste libéré.";
        const settleId = RainelleMovement.selectRainelleToSettle(s);
        if (settleId) {
          s.rainelles.find((r) => r.id === settleId).settledAt = true;
          const revealed = Narrative.pendingReveal(
            s.campaignFlags,
            "passageRainelleSettled",
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
