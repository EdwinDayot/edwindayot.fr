/* GardenState.command() branch group Z (UMD: node module / browser prototype). Epic C7.11
   (generalises removeHabitat's C6.10 pattern — the Cartographe's eleventh-lot note in
   campagne-backlog.md found removeHabitat already reachable from a command since C6.10, but no
   equivalent existed for a borne/zone/panier).

   removeStation({id}) is a thin wrapper over Stations.removeStation (campaign-stations.js, this
   epic): that pure function already resolves the id's kind via resolveStation, refuses a habitat
   id (pointing at the dedicated removeHabitat command instead) and refuses a non-empty panier
   ("le vider avant de le retirer") — this command only forwards the id and, on success, replaces
   `s.campaignStations` with the registry the pure function returns. Not a world entity command
   (a station is addressed by its own campaign id, never c.id), so not added to garden-state.js's
   `physical` list, same posture as removeHabitat/teachGesture.

   Deliberately never touches a Rainelle's geste: a geste that referenced the removed station
   falls back, at the next automation tick, to the "poste-manquant" state already exposed and
   tested since C2.8 (campaign-automation.js's resolveKind returns null on an unknown id) —
   nothing here rewrites `rainelle.geste`, exactly the same "the removal itself does not touch the
   gesture" posture already documented by garden-state-cmd-u.js for removeHabitat. */
(function (root) {
  const Stations =
    typeof module !== "undefined"
      ? require("./game/campaign-stations.js")
      : root.GardenCampaignStations;
  const M = {
    commandSegZ(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "removeStation") {
        st.taken = true;
        const result = Stations.removeStation(s.campaignStations, c.id);
        if (!result.ok) return fail(result.error);
        s.campaignStations = result.registry;
        st.message = "Station retirée.";
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
