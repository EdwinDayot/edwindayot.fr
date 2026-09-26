/* Campaign passage-to-the-pond state, part of the campaign layer (UMD: node module / browser
   GardenCampaignPassage).

   Epic C6.12 (design §10, chapitre 17 : "rétablir l'accès à une mare"), the engine-only socle the
   Cartographe's eighth-lot note (campagne-backlog.md) singled out as the one literal clause of
   the chapter buildable without inventing pond geometry, a navigation-graph branch or a lucrative-
   extension threat model — none of which exist anywhere in the engine today (verified by the
   Cartographe: no "mare"/"berge"/"extension"/"conversion" concept in public/game/*.js or
   public/render*.js beyond comments already noting the gap). Same "rules before rendering" posture
   already applied to a Rainelle's derived location (C5.5) before its real position (C5.9-C5.11).

   A passage starts blocked ("bloqué par défaut" : the chapter presents restoring it as a real
   repair, never a starting given, design §10). restorePassage is the only transition, one-way by
   design (no "re-block" command exists, none is asked for by the design) — refusing a restore
   that would change nothing ("blocked" already false) is the same "an operation that changes
   nothing is a refusal, never a silent repeated effect" discipline already applied to
   releaseGesture/reduceContractQuota (C6.8/C6.10).

   Epic C6.13 adds the passage's real position on the shared navigation grid (0.5-unit, the same
   one construction.js's flood()/path() already walk) and the effective obstacle that follows from
   it. PASSAGE_POSITION/PASSAGE_OBSTACLE_RADIUS live here rather than being duplicated as literals
   in garden-state-lifecycle.js (fresh()) and construction.js (obstacles()) — one source of truth
   for both call sites, same posture as DEFAULT_PANIER_CAPACITY/MAX_WAIT_STEPS living next to the
   logic that needs them rather than being invented again at each use.

   Position choice (-6, 30), verified resolvable by GardenGeometry.zoneAt before being fixed here,
   not assumed: zone 4 ("le coin de village", bounds z 22–34, always unlocked) rather than zone 0,
   where the campaign house (C2.2v, {-13, 6}) and the pot/workbench already crowd the only clear
   pocket documented in render-campaign-house.js's own header comment. A systematic check against
   a fresh save (construction.js's walkable(), not assumed) found (-6, 30) clear of both zone-4
   houses (villageois-1 {-11, 26}, villageois-2 {-1, 26}, footprint 3.2×3.2 each: ≈6.4 units from
   either center) and every zone gate (≥6 units, well past the 0.65–0.8 margins placement() itself
   enforces) — no future placement epic has to route around a passage dropped on top of something
   else. On the 0.5-unit grid already, no rounding needed.

   PASSAGE_OBSTACLE_RADIUS (0.6) matches the largest wall-circle radius already in use for a
   building obstacle (data-buildings.js's HOUSE_W/2 corners, r up to 0.6) rather than inventing an
   unrelated number. It is chosen, not just reused, for a concrete reason: walkable()'s clearance
   test is `distance >= radius + 0.23`, so a radius of 0.6 blocks every grid point within 0.83 units
   of the passage — that covers not only the four cardinal neighbours half a unit away (0.5 < 0.83)
   but also the four diagonal-adjacent grid points one cardinal step further (0.5√2 ≈ 0.71 < 0.83).
   A smaller radius (just past 0.27) would still block the cardinal neighbours but leave those
   diagonal points open, letting a two-move detour slip immediately next to the "blocked" point —
   technically a detour, but not the real obstacle chapter 17 describes. 0.6 forces an actual
   multi-cell detour around the point instead. */
(function (root) {
  // Shared by garden-state-lifecycle.js (fresh(), the value persisted in s.campaignPassage) and
  // construction.js (obstacles(), the conditional obstacle while blocked) — see header comment.
  const PASSAGE_POSITION = { x: -6, z: 30 },
    PASSAGE_OBSTACLE_RADIUS = 0.6;
  // Pure: caller (garden-state-cmd-w.js) applies the returned `blocked` to s.campaignPassage
  // itself. Never touches anything beyond the single field this concept owns — no pond geometry,
  // no navigation graph, no threat-of-conversion state, none of which exist yet (see header).
  function restorePassage(passage) {
    if (!passage.blocked)
      return { ok: false, error: "Le passage est déjà rétabli." };
    return { ok: true, blocked: false };
  }

  const api = { restorePassage, PASSAGE_POSITION, PASSAGE_OBSTACLE_RADIUS };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignPassage = api;
})(globalThis);
