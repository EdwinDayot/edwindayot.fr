/* GardenState.command() branch group T (UMD: node module / browser prototype). Epic C6.8 (design
   §10, chapitre 16 "Ce qu'on accepte de perdre") : reduceContract lowers the quota of an already
   signed contract toward `c.quota` (the new, smaller quota), via the pure
   Contracts.reduceContractQuota — see campaign-contracts.js's own comment for the two refusal
   rules (must actually reduce; never below what has already been delivered). pricePerUnit is
   left untouched by this command, same posture as signContract/deliverContract never
   renegotiating it. Not a world entity command (no c.id — a contract is addressed by
   c.contractId, same posture as signContract/deliverContract), so not added to garden-state.js's
   `physical` list. */
(function (root) {
  const Contracts =
    typeof module !== "undefined"
      ? require("./game/campaign-contracts.js")
      : root.GardenCampaignContracts;
  const { count } =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  const M = {
    commandSegT(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "reduceContract") {
        st.taken = true;
        const contract = s.campaignContracts.find((ct) => ct.id === c.contractId);
        if (!contract) return fail("Contrat inconnu.");
        if (!count(c.quota) || c.quota < 0)
          return fail("Nouveau quota invalide.");
        const result = Contracts.reduceContractQuota(
          contract,
          s.campaignMemory.contractsFed,
          c.quota,
        );
        if (!result.ok) return fail(result.error);
        contract.quota = result.quota;
        st.message = `Contrat réduit à ${result.quota} unité(s).`;
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
