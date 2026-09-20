/* GardenState.command() branch group R (UMD: node module / browser prototype). Epic C6.4 (design
   §10, chapitre 12) : signContract signs the single commercial contract a cultivar can be sold
   against (id, cultivarId, quota, pricePerUnit fixed at signature — see campaign-contracts.js's
   own header comment for why only one can ever be open at a time); deliverContract consumes real
   specimens of the contract's cultivar from s.specimens, up to its remaining quota, crediting
   Memory.contractsFed by exactly what was actually moved. Neither targets a world entity (no
   c.id — a contract is addressed by its own campaignContracts id, c.contractId), so neither is
   added to garden-state.js's `physical` list, same posture as setPriseFortDebit/setVeilleuse. No
   payment/economy.js wiring here — see campaign-contracts.js's header comment for why that is
   deliberately out of this epic's scope. Epic C6.5 further extends deliverContract with the
   second "note de Jeanne" reveal (see below, right after Memory.recordContractDelivery). */
(function (root) {
  const Contracts =
    typeof module !== "undefined"
      ? require("./game/campaign-contracts.js")
      : root.GardenCampaignContracts;
  const Memory =
    typeof module !== "undefined"
      ? require("./game/campaign-memory.js")
      : root.GardenCampaignMemory;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
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
        // Epic C6.5 (design §10, chapitre 12) : la seconde note de Jeanne (« La serre de
        // Jeanne : après la prochaine commande. », identique à la première, data-narrative.js)
        // se révèle au prochain contrat honoré strictement après que la première a déjà été vue
        // (garden-state-cmd-f.js's "sleep") — jamais avant, jamais deux fois (pendingReveal
        // refuse déjà par construction un id déjà présent dans campaignFlags). "Honoré" = cette
        // livraison amène ce contrat à son quota, quel que soit le contrat concerné : le design
        // ne restreint pas la seconde note au même contrat précis que la première nuit.
        if (
          s.campaignFlags.includes("note-jeanne-serre-1") &&
          !Contracts.isContractOpen(contract, s.campaignMemory.contractsFed)
        ) {
          const jeanneRevealed = Narrative.pendingReveal(
            s.campaignFlags,
            "jeanneGreenhouseNoteSecond",
          );
          if (jeanneRevealed) s.campaignFlags.push(jeanneRevealed.id);
        }
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
