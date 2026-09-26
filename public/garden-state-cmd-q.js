/* GardenState.command() branch group Q (UMD: node module / browser prototype). Epic C5.4 (design
   §11, "prise d'eau à fort débit"): setPriseFortDebit turns a borne's `priseFortDebit` flag on or
   off, refused explicitly on an unknown id or one that resolves to something other than a borne
   (never a silent no-op — same posture as setVeilleuse/repairHouseSpace/teachGesture). Not a
   world entity command (no c.id — a borne is addressed by its own campaignStations id,
   c.borneId), so not added to garden-state.js's `physical` list, same posture as setVeilleuse.
   The actual flow-rate/withdrawal effect this flag gates lives in campaign-automation.js's
   doArroser/tickArroser and campaign-memory.js's recordWaterWithdrawal/bassinCommunLevel — this
   command only ever flips the flag itself.

   Epic C6.9 (design §10, chapitre 16 ; §11, tableau des trois leviers) adds the narrative reveal
   of this lever's "coût réel" : gated on "archives-restaurees" (C6.7), a real true→false
   transition (never a call that changes nothing), and Memory.waterWithdrawals[borneId] > 0 — this
   borne must have really withdrawn water at least once before being restituted for this to count
   as a cost accepted. */
(function (root) {
  const Stations =
    typeof module !== "undefined"
      ? require("./game/campaign-stations.js")
      : root.GardenCampaignStations;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const M = {
    commandSegQ(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "setPriseFortDebit") {
        st.taken = true;
        const resolved = Stations.resolveStation(s.campaignStations, c.borneId);
        if (!resolved.ok) return fail(resolved.error);
        if (resolved.kind !== "borne")
          return fail(`"${c.borneId}" n'est pas une borne d'eau.`);
        const wasActive = resolved.station.priseFortDebit;
        resolved.station.priseFortDebit = !!c.active;
        st.message = resolved.station.priseFortDebit
          ? "Prise à fort débit activée : le débit augmente au prix du bassin commun."
          : "Prise à fort débit coupée : la baisse du bassin commun s'arrête, sans remonter.";
        if (
          s.campaignFlags.includes("archives-restaurees") &&
          wasActive &&
          !resolved.station.priseFortDebit &&
          (s.campaignMemory.waterWithdrawals[resolved.station.id] || 0) > 0
        ) {
          const revealed = Narrative.pendingReveal(
            s.campaignFlags,
            "priseFortDebitRestoredAfterUse",
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
