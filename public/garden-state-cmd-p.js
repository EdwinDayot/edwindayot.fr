/* GardenState.command() branch group P (UMD: node module / browser prototype). Epic C5.2 (design
   §11, "veilleuses de croissance"): setVeilleuse turns a zone's `veilleuse` flag on or off,
   refused explicitly on an unknown id or one that resolves to something other than a zone (never
   a silent no-op — same posture as repairHouseSpace/teachGesture). Not a world entity command (no
   c.id — a zone is addressed by its own campaignStations id, c.zoneId), so not added to
   garden-state.js's `physical` list, same posture as pinTrait/teachGesture. The actual nightly
   effect this flag gates lives in campaign-automation.js's runNightWork, called from "sleep"
   (garden-state-cmd-f.js) — this command only ever flips the flag itself.

   Epic C6.9 (design §10, chapitre 16 ; §11, tableau des trois leviers) adds the narrative reveal
   of this lever's "coût réel" : gated on "archives-restaurees" (C6.7), a real true→false
   transition (never a call that changes nothing), and Memory.nightlyActivity already non-empty
   (same guard as "nuit-attentive-reconnue", C5.6) — the veilleuse must have really served at
   least once before being switched off for this to count as a cost accepted. */
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
    commandSegP(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "setVeilleuse") {
        st.taken = true;
        const resolved = Stations.resolveStation(s.campaignStations, c.zoneId);
        if (!resolved.ok) return fail(resolved.error);
        if (resolved.kind !== "zone")
          return fail(`"${c.zoneId}" n'est pas une zone de culture.`);
        const wasActive = resolved.station.veilleuse;
        resolved.station.veilleuse = !!c.active;
        st.message = resolved.station.veilleuse
          ? "Veilleuse allumée : la zone continuera de travailler la nuit."
          : "Veilleuse éteinte : la zone se repose de nouveau la nuit.";
        if (
          s.campaignFlags.includes("archives-restaurees") &&
          wasActive &&
          !resolved.station.veilleuse &&
          Object.keys(s.campaignMemory.nightlyActivity).length > 0
        ) {
          const revealed = Narrative.pendingReveal(
            s.campaignFlags,
            "veilleuseTurnedOffAfterUse",
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
