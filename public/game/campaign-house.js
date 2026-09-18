/* Campaign house registry, part of the campaign layer (UMD: node module / browser
   GardenCampaignHouse).

   Epic C3.1 (design §6, "Restaurer donne des fonctions"): the six named spaces of the refuge
   house (pièce d'accueil, cuisine, atelier, serre attenante, grenier, véranda), each
   delabre/repare with a locked flag. Only the reception room starts unlocked (design §6: "ce
   premier confort ne dépend d'aucune quête botanique encore inaccessible") — it still starts
   delabre like the other five: design §6 itself calls its own bed "un couchage réparable", so
   "unlocked" and "already repaired" are deliberately kept distinct fields, never conflated.

   Repair costs are a static catalog here (SPACES), the same "recipe, not per-instance state"
   split D.recipes already uses for the free garden's own buildable objects — a save only ever
   tracks {status, locked} per space, never a copy of the cost (see freshHouse). Costs use
   wood/stone/clay only: design §6/§16 also names "fibres" as an existing resource family, but
   the free garden's own economy (garden-state-util.js's knownItem, garden-state-lifecycle.js's
   initial inventory) has no such resource today — verified before writing this, not assumed;
   only wood/stone/clay exist ("vert-fibre" in botany-hybrids.js is a colour name, unrelated to
   any inventory item). Inventing a fourth resource type here would be a second, unrelated
   system change bundled into this one epic — exactly what orchestration.md forbids ("jamais une
   refonte simultanée de plusieurs systèmes", "généraliser plutôt que spécialiser"); a real
   fibres resource is left for whichever future epic actually needs one. The costs themselves
   are a judgment call, sized against garden-state-lifecycle.js's initial inventory (2 wood,
   2 clay, 0 stone) and D.balance.resourceYield (3 per gathering hit) so the reception room is
   reachable within the first few gathers — the design gives no literal numbers to derive them
   from, so this is a deliberate choice to document, not a value read off a source. */
(function (root) {
  const SPACES = {
    accueil: { name: "Pièce d'accueil", cost: { wood: 4, clay: 2 } },
    cuisine: { name: "Cuisine", cost: { wood: 3, stone: 2, clay: 3 } },
    atelier: { name: "Atelier", cost: { wood: 6, stone: 2 } },
    serre: { name: "Serre attenante", cost: { wood: 4, stone: 3, clay: 2 } },
    grenier: { name: "Grenier", cost: { wood: 5, stone: 1 } },
    veranda: { name: "Véranda", cost: { wood: 5, stone: 3 } },
  };
  const SPACE_IDS = Object.keys(SPACES);

  // Epic C4.1 (design chapitre 1, "La clé sous le pot vide"): the armoire's rediscovered
  // marques de taille get exactly one of these three treatments, ever — see
  // garden-state-cmd-n.js's chooseFurnitureTreatment for the one-shot mutation, mirrored here
  // (not redefined there) the same way SPACE_IDS is shared rather than duplicated.
  const FURNITURE_TREATMENTS = ["conserve", "encadre", "repeint"];

  function freshHouse() {
    const spaces = {};
    for (const id of SPACE_IDS)
      spaces[id] = { status: "delabre", locked: id !== "accueil" };
    // furnitureMarks: null until chooseFurnitureTreatment sets it once (never reset afterwards)
    // — a top-level campaignHouse field, not a seventh "space", since it has no repair cost/lock
    // of its own.
    return { spaces, furnitureMarks: null };
  }

  // Pure precondition check, no mutation — repairHouseSpace (garden-state-cmd-l.js) still calls
  // GardenState.has/pay itself for the actual inventory debit, the same split economy.js/
  // irrigation.js already impose elsewhere (this file never touches s.inventory directly).
  function canRepair(house, spaceId) {
    const space = house && house.spaces && house.spaces[spaceId];
    if (!space) return { ok: false, error: `Espace inconnu : "${spaceId}".` };
    if (space.locked) return { ok: false, error: "Cet espace est verrouillé." };
    if (space.status === "repare")
      return { ok: false, error: "Cet espace est déjà réparé." };
    return { ok: true };
  }

  const api = { SPACES, SPACE_IDS, FURNITURE_TREATMENTS, freshHouse, canRepair };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignHouse = api;
})(globalThis);
