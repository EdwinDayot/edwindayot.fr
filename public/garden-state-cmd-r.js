/* GardenState.command() branch group R (UMD: node module / browser prototype). Epic C6.4 (design
   §10, chapitre 12) : signContract signs the single commercial contract a cultivar can be sold
   against (id, cultivarId, quota, pricePerUnit fixed at signature — see campaign-contracts.js's
   own header comment for why only one can ever be open at a time); deliverContract consumes real
   specimens of the contract's cultivar from s.specimens, up to its remaining quota, crediting
   Memory.contractsFed by exactly what was actually moved. Neither targets a world entity (no
   c.id — a contract is addressed by its own campaignContracts id, c.contractId), so neither is
   added to garden-state.js's `physical` list, same posture as setPriseFortDebit/setVeilleuse. No
   payment/economy.js wiring here — see campaign-contracts.js's header comment for why that is
   deliberately out of this epic's scope. */
(function (root) {
  const Contracts =
    typeof module !== "undefined"
      ? require("./game/campaign-contracts.js")
      : root.GardenCampaignContracts;
  const Memory =
    typeof module !== "undefined"
      ? require("./game/campaign-memory.js")
      : root.GardenCampaignMemory;
  const { count } =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  const M = {
    commandSegR(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "signContract") {
        st.taken = true;
        const cultivar = s.cultivars.find((cv) => cv.id === c.cultivarId);
        if (!cultivar) return fail("Cultivar inconnu.");
        if (!count(c.quota) || c.quota < 1)
          return fail("Quota de contrat invalide.");
        if (!count(c.pricePerUnit) || c.pricePerUnit < 1)
          return fail("Prix de contrat invalide.");
        const result = Contracts.signContract(
          s.campaignContracts,
          s.campaignMemory.contractsFed,
          s.contractNextId,
          { cultivarId: c.cultivarId, quota: c.quota, pricePerUnit: c.pricePerUnit },
        );
        if (!result.ok) return fail(result.error);
        s.campaignContracts.push(result.contract);
        s.contractNextId += 1;
        st.message = `Contrat signé : ${c.quota} × ${cultivar.name || cultivar.id} à ${c.pricePerUnit} chacun.`;
      } else if (c.type === "deliverContract") {
        st.taken = true;
        const contract = s.campaignContracts.find((ct) => ct.id === c.contractId);
        if (!contract) return fail("Contrat inconnu.");
        if (!count(c.quantity) || c.quantity < 1)
          return fail("Quantité de livraison invalide.");
        if (!Contracts.isContractOpen(contract, s.campaignMemory.contractsFed))
          return fail("Quota déjà atteint pour ce contrat.");
        const matching = s.specimens.filter(
          (sp) => sp.cultivarId === contract.cultivarId,
        );
        const accepted = Contracts.deliverableCount(
          contract,
          s.campaignMemory.contractsFed,
          c.quantity,
          matching.length,
        );
        if (accepted <= 0)
          return fail("Aucun spécimen réel de ce cultivar à livrer.");
        const delivered = matching.slice(0, accepted);
        const deliveredIds = new Set(delivered.map((sp) => sp.id));
        s.specimens = s.specimens.filter((sp) => !deliveredIds.has(sp.id));
        Memory.recordContractDelivery(s.campaignMemory, contract.id, accepted);
        st.message =
          accepted < c.quantity
            ? `${accepted} spécimen(s) livré(s) — capé par le quota restant ou le stock réel disponible.`
            : `${accepted} spécimen(s) livré(s).`;
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
