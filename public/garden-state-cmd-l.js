/* GardenState.command() branch group L (UMD: node module / browser prototype). Epic C3.1
   (design §6): repairHouseSpace transitions a named refuge-house space from delabre to repare,
   consuming its fixed resource cost from the existing inventory via GardenState.has/pay — the
   same has-then-pay sequence garden-state-cmd-a.js's "unlock" and garden-state-cmd-b.js's build
   commands already use, so a failed repair (missing resources, locked space, already repaired)
   never partially debits the inventory. Not a world entity command (c.space names a house
   space, never an entity id), so not added to garden-state.js's `physical` list — same posture
   as teachGesture in -j.js. */
(function (root) {
  const House =
    typeof module !== "undefined"
      ? require("./game/campaign-house.js")
      : root.GardenCampaignHouse;
  const M = {
    commandSegL(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "repairHouseSpace") {
        st.taken = true;
        const check = House.canRepair(s.campaignHouse, c.space);
        if (!check.ok) return fail(check.error);
        const cost = House.SPACES[c.space].cost;
        if (!this.has(cost))
          return fail("Ressources insuffisantes pour réparer cet espace.");
        this.pay(cost);
        s.campaignHouse.spaces[c.space].status = "repare";
        st.message = `${House.SPACES[c.space].name} : réparation terminée.`;
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
