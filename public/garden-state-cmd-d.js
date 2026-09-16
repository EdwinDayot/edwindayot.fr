/* GardenState.command() branch group D (UMD: node module / browser prototype). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const M = {
    commandSegD(c, ctx, st) {
      const { fail } = st;
      // Generic vendor purchase: any visitor with role "vendor" carries a
      // roleData.wares list ([{item, cost}, ...]); a new vendor or a new
      // item for sale is purely a data row in data-buildings.js, never a
      // new branch here. Cost is looked up from the vendor's own data, not
      // trusted from the command, so a crafted command can't buy for free.
      if (c.type === "buy") {
        st.taken = true;
        const building = D.buildings.find((b) => b.visitorId === c.vendor),
          ware = building?.roleData?.wares?.find((w) => w.item === c.item),
          recipe = ware && D.recipes[ware.item];
        if (!ware || !recipe || !this.has(ware.cost))
          return fail("Cet article n’est pas à vendre ici.");
        this.pay(ware.cost);
        this.add(ware.item, 1);
        st.message = `${recipe.name} ajouté à la réserve. Choisis son emplacement.`;
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
