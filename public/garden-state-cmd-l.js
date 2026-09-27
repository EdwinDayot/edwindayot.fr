/* GardenState.command() branch group L (UMD: node module / browser prototype). Epic C3.1
   (design §6): repairHouseSpace transitions a named refuge-house space from delabre to repare,
   consuming its fixed resource cost from the existing inventory via GardenState.has/pay — the
   same has-then-pay sequence garden-state-cmd-a.js's "unlock" and garden-state-cmd-b.js's build
   commands already use, so a failed repair (missing resources, locked space, already repaired)
   never partially debits the inventory. Not a world entity command (c.space names a house
   space, never an entity id), so not added to garden-state.js's `physical` list — same posture
   as teachGesture in -j.js.

   Epic C7.19 adds placeDecor/removeDecor, same posture: c.space/c.item never name a world
   entity, so neither is added to `physical` either. Both simply replay campaign-decor.js's own
   canPlaceDecor/canRemoveDecor through placeDecor/removeDecor and replace s.campaignHouse with
   the returned registry on success — no bespoke validation duplicated here. */
(function (root) {
  const House =
    typeof module !== "undefined"
      ? require("./game/campaign-house.js")
      : root.GardenCampaignHouse;
  // Epic C7.19: same file as repairHouseSpace above (both act on s.campaignHouse, a-z already
  // all taken — see campaign-stations.js's -z.js reuse at C7.17/C7.18 for the same reasoning).
  const Decor =
    typeof module !== "undefined"
      ? require("./game/campaign-decor.js")
      : root.GardenCampaignDecor;
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
      } else if (c.type === "placeDecor") {
        st.taken = true;
        const result = Decor.placeDecor(s.campaignHouse, c.space, c.item);
        if (!result.ok) return fail(result.error);
        s.campaignHouse = result.house;
        st.message = `${Decor.ITEMS[c.item].name} installé.`;
      } else if (c.type === "removeDecor") {
        st.taken = true;
        const result = Decor.removeDecor(s.campaignHouse, c.space, c.item);
        if (!result.ok) return fail(result.error);
        s.campaignHouse = result.house;
        st.message = `${Decor.ITEMS[c.item].name} retiré.`;
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
