/* Campaign commercial contracts, part of the campaign layer (UMD: node module / browser
   GardenCampaignContracts).

   Epic C6.4 (design §10, chapitre 12 : « Les commandes déjà signées gardent leur prix... il doit
   traverser ses vrais invendus, encore vivants »), building the minimum the chapter needs on top
   of the commercial series already proposed by C6.1 (flag "la-bonne-occasion") — a single active
   contract at a time (backlog's own scope note: "le chapitre visé n'en demande pas plus"), never
   a full présentoir/catalogue system.

   A contract fixes `cultivarId`/`quota`/`pricePerUnit` at signature, never recomputed afterwards
   — signContract refuses outright while another contract is still open, so "le prix reste figé
   après la signature d'un second contrat différent" is true by construction (there is only ever
   one open contract to compare against). No payment is wired into economy.js/inventory by this
   epic: the literal exit criterion never mentions crediting coins, only that the price itself is
   fixed and readable — an actual sale/credit flow is left for a later epic (narration, C6.5, or a
   future économie epic) rather than invented here, same "généraliser plutôt que spécialiser"
   posture already applied throughout this campaign.

   Delivery *consumes* real specimens (design: "jamais fabriqués pour l'occasion, prélevés dans
   s.specimens") — a delivered specimen is removed from s.specimens by the caller (garden-state-
   cmd-r.js), never merely flagged. This is why `unsoldStock` below needs no subtraction against
   Memory.contractsFed: once a specimen is delivered it is gone from s.specimens, so counting what
   remains of a cultivar *already* excludes every delivered unit — "encore présents... au-delà de
   ce qui a été livré" is true by construction, exactly like bassinCommunLevel (C5.4) never stores
   a second, independently-mutated level next to its real cumulative input (waterWithdrawals).
   Deliberate deviation from campaign-memory.js's original C5.1 reservation of a stored
   `unsoldStock` map: that field stays present and always empty (never written), and this pure
   function is the real, derived answer — documented here and in campaign-memory.js's own header
   rather than silently leaving a same-named field half-used. Memory.contractsFed, in contrast,
   *is* filled for real by this epic (see campaign-memory.js's recordContractDelivery): it is the
   one fact that cannot be derived from s.specimens alone (specimens carry no memory of which
   contract they were delivered against, once gone). */
(function (root) {
  // A contract is "open" (deliverable against) exactly while its cumulative delivered quantity
  // (Memory.contractsFed[contract.id], defaulting to 0 for a contract never yet delivered
  // against) is still below its fixed quota. Once a delivery brings it to quota, it closes itself
  // — "s'arrête d'elle-même" — with no separate `active`/`closed` flag to drift out of sync.
  function isContractOpen(contract, contractsFed) {
    return (contractsFed[contract.id] || 0) < contract.quota;
  }

  // Pure lookup: the single contract still open, or null. At most one contract can ever satisfy
  // this at a time, by construction of signContract below (which refuses a second signature while
  // one is still open) — never a search that could ambiguously return more than one candidate.
  function activeContract(contracts, contractsFed) {
    return contracts.find((c) => isContractOpen(c, contractsFed)) || null;
  }

  // Pure factory: caller (garden-state-cmd-r.js) has already validated cultivarId/quota/
  // pricePerUnit themselves (same split as campaign-stations.js's registerStation, which never
  // checks a cultivar/rainelle either) — this only enforces the one rule that belongs to the
  // contract concept itself, "une seule commande active à la fois".
  function signContract(contracts, contractsFed, nextId, { cultivarId, quota, pricePerUnit }) {
    if (activeContract(contracts, contractsFed))
      return {
        ok: false,
        error:
          "Un contrat commercial est déjà actif ; attendre qu'il atteigne son quota avant d'en signer un autre.",
      };
    return {
      ok: true,
      contract: { id: `ct${nextId}`, cultivarId, quota, pricePerUnit },
    };
  }

  // Pure computation of how many units a delivery attempt should actually move, never a command
  // mutation itself (garden-state-cmd-r.js applies the result: removing `accepted` specimens from
  // s.specimens and crediting Memory.contractsFed by the same amount). Caps silently at both the
  // contract's remaining quota and the number of matching specimens really available — "jusqu'au
  // quota puis s'arrête d'elle-même, sans livraison possible au-delà" read literally: a request
  // for more than what is left is not refused outright, it is filled up to what is actually owed
  // and deliverable, exactly like a panier's capacity/min already caps tickRecolter/tickTransporter
  // (C2.8) rather than failing the whole cycle.
  function deliverableCount(contract, contractsFed, requested, available) {
    const remaining = contract.quota - (contractsFed[contract.id] || 0);
    return Math.max(0, Math.min(remaining, requested, available));
  }

  // Derived, not stored — see header comment. `specimens` is the caller's real s.specimens
  // (already filtered to the cultivar in question by the caller, or filtered here directly).
  function unsoldStock(specimens, cultivarId) {
    return specimens.filter((sp) => sp.cultivarId === cultivarId).length;
  }

  const api = {
    isContractOpen,
    activeContract,
    signContract,
    deliverableCount,
    unsoldStock,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignContracts = api;
})(globalThis);
