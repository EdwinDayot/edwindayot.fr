/* GardenState.command() branch group P (UMD: node module / browser prototype). Epic C5.2 (design
   §11, "veilleuses de croissance"): setVeilleuse turns a zone's `veilleuse` flag on or off,
   refused explicitly on an unknown id or one that resolves to something other than a zone (never
   a silent no-op — same posture as repairHouseSpace/teachGesture). Not a world entity command (no
   c.id — a zone is addressed by its own campaignStations id, c.zoneId), so not added to
   garden-state.js's `physical` list, same posture as pinTrait/teachGesture. The actual nightly
   effect this flag gates lives in campaign-automation.js's runNightWork, called from "sleep"
   (garden-state-cmd-f.js) — this command only ever flips the flag itself. */
(function (root) {
  const Stations =
    typeof module !== "undefined"
      ? require("./game/campaign-stations.js")
      : root.GardenCampaignStations;
  const M = {
    commandSegP(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "setVeilleuse") {
        st.taken = true;
        const resolved = Stations.resolveStation(s.campaignStations, c.zoneId);
        if (!resolved.ok) return fail(resolved.error);
        if (resolved.kind !== "zone")
          return fail(`"${c.zoneId}" n'est pas une zone de culture.`);
        resolved.station.veilleuse = !!c.active;
        st.message = resolved.station.veilleuse
          ? "Veilleuse allumée : la zone continuera de travailler la nuit."
          : "Veilleuse éteinte : la zone se repose de nouveau la nuit.";
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
