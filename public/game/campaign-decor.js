/* Campaign house decor catalog, part of the campaign layer (UMD: node module / browser
   GardenCampaignDecor).

   Epic C7.19 (design §6, "Aménager est un vrai mode de jeu" — the same section explicitly
   distinguishes this from C3.1's functional repair: "Le catalogue distingue la réparation
   fonctionnelle de son habillage"). Verified before writing this, not assumed:
   campaign-house.js's freshHouse() only ever gave each space {status, locked} — no spatial data,
   no point of pose, no notion of position/rotation exists anywhere in the campaign code yet
   (render-campaign-house.js only models the house's exterior). Building "meubles déplaçables,
   rotation, points de pose" as literally described would mean inventing a whole interior-layout
   convention, a collision system and an interior 3D scene in one epic — exactly what
   orchestration.md forbids ("jamais une refonte simultanée de plusieurs systèmes") and what seven
   earlier Cartographe lots already checked and refused to invent without a prior design decision.

   So this epic proves only the half of the problem that needs no scene at all: which objects
   exist, which space they are registered in, and under what conditions — the same "rules before
   rendering" split already applied everywhere else in this backlog (a cultivar exists and saves
   before it has a representation, C1.1 before C1.7; a station resolves before it is rendered,
   C2.6a before C5.13). A future Artisan rendu epic can invent a real point-of-pose convention
   inside a house scene once this half is proven; that question is deliberately out of scope here.

   ITEMS is a small, static catalog of four purely cosmetic objects — none has a gameplay effect,
   none is tied to a quest. Explicitly excluded, not to be guessed: cadres/souvenirs (design §6:
   "Les objets narratifs sont facultatifs à exposer" — their real content is a Scénariste
   decision, out of a Cartographe lot's mandate) and any functional furniture already covered by
   C3.1 (bed, table, stove, sink — those stay tied to a space's repair, never duplicated here).
   Unlike SPACES in campaign-house.js, ITEMS carries no cost: nothing in the design prices a
   cosmetic object, and inventing one here would be a second, unrelated design decision bundled
   into this epic — left for whichever future epic actually builds the placement interface (the
   only place a cost would ever really be paid).

   Each repaired space gets a new `decor` field: a flat array of item ids currently present, at
   most once each — no quantity, no position, plain presence/absence, so as not to invent a
   second counting/capacity mechanic with no number given by the design. */
(function (root) {
  const ITEMS = {
    tapis: { name: "Tapis" },
    etagere: { name: "Étagère" },
    "plante-interieur": { name: "Plante d'intérieur" },
    rideaux: { name: "Rideaux" },
  };
  const ITEM_IDS = Object.keys(ITEMS);

  // Pure precondition check, no mutation — same split as campaign-house.js's canRepair and
  // campaign-stations.js's Stations functions (a can* function never touches state itself).
  function canPlaceDecor(house, spaceId, itemId) {
    if (!ITEMS[itemId])
      return { ok: false, error: `Objet décoratif inconnu : "${itemId}".` };
    const space = house && house.spaces && house.spaces[spaceId];
    if (!space) return { ok: false, error: `Espace inconnu : "${spaceId}".` };
    if (space.locked) return { ok: false, error: "Cet espace est verrouillé." };
    // Design §6 itself orders the two steps: repair comes before dressing up. An espace délabré
    // (even unlocked) is not yet aménageable — the same ordering canRepair already enforces for
    // "locked before delabre" is mirrored here for "delabre before decor".
    if (space.status !== "repare")
      return { ok: false, error: "Cet espace doit d'abord être réparé." };
    if ((space.decor || []).includes(itemId))
      return { ok: false, error: "Cet objet est déjà présent dans cet espace." };
    return { ok: true };
  }

  function placeDecor(house, spaceId, itemId) {
    const check = canPlaceDecor(house, spaceId, itemId);
    if (!check.ok) return check;
    const space = house.spaces[spaceId];
    return {
      ok: true,
      house: {
        ...house,
        spaces: {
          ...house.spaces,
          [spaceId]: { ...space, decor: [...(space.decor || []), itemId] },
        },
      },
    };
  }

  // Symmetric to canPlaceDecor, but refusing the opposite condition (absent rather than already
  // present) — no lock/repare check here: an object once legitimately placed stays removable even
  // if a future epic ever allowed a space's status to regress (no such command exists today, but
  // removal should never depend on a precondition that only ever gated the original placement).
  function canRemoveDecor(house, spaceId, itemId) {
    if (!ITEMS[itemId])
      return { ok: false, error: `Objet décoratif inconnu : "${itemId}".` };
    const space = house && house.spaces && house.spaces[spaceId];
    if (!space) return { ok: false, error: `Espace inconnu : "${spaceId}".` };
    if (!(space.decor || []).includes(itemId))
      return { ok: false, error: "Cet objet n'est pas présent dans cet espace." };
    return { ok: true };
  }

  // No refund on removal: unlike the free garden's own construction mode (design §6's "rembourse
  // intégralement les éléments démontés", which applies to s.entities, a distinct and unrelated
  // system), no cost was ever paid to place a decor item here (ITEMS carries none) — nothing to
  // give back. Extending decor with a real cost/refund pair is left to whichever future epic
  // introduces one.
  function removeDecor(house, spaceId, itemId) {
    const check = canRemoveDecor(house, spaceId, itemId);
    if (!check.ok) return check;
    const space = house.spaces[spaceId];
    return {
      ok: true,
      house: {
        ...house,
        spaces: {
          ...house.spaces,
          [spaceId]: {
            ...space,
            decor: space.decor.filter((id) => id !== itemId),
          },
        },
      },
    };
  }

  const api = {
    ITEMS,
    ITEM_IDS,
    canPlaceDecor,
    placeDecor,
    canRemoveDecor,
    removeDecor,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignDecor = api;
})(globalThis);
