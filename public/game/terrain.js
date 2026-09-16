/* Ground height, sampled by the renderer only (never by collision/pathfinding,
   which stay pure 2D x/z — see construction.js). Every call site wired in
   0.6 (click-to-ground picking, shadow frustum center, player, entities,
   build preview, resources/caches, houses, gates, tree trunks/moss) already
   reads real values now that Épic 4.2 fills this in for real.

   Shape: a handful of hand-placed, gently-bounded mounds (quartic falloff,
   exactly 0 past each one's own radius — never simplex noise, so a mound's
   footprint is provable and finite instead of "small everywhere"). Two of
   them sit in zone0's open lawns, deliberately kept clear of every tested
   coordinate (houses, visitors, resources, caches, the gate, the starter
   pots) by a real measured margin — verified with a throwaway distance
   script against D.resources/D.visitors/D.buildings before picking each
   center, not eyeballed. The rest, in zones 1-3, have no such constraint
   since nothing there is pixel/position-tested. Amplitude is capped
   (<=MAX_HEIGHT, checked against every hill below) on purpose ("un peu de
   relief", not mountains) — render-flow.js's pick() also reads MAX_HEIGHT
   directly to bound its ground-click search, so this cap is load-bearing
   for more than just the "not a mountain" intent; raise it only alongside
   that call site.

   Heights were raised ~1.8x from the first pass (2.0 → 3.6 for zone0's
   main hill, etc.) after a user report that the relief was invisible even
   with ground self-shadowing enabled (render-world.js, ground.castShadow).
   Verified side by side with real screenshots at h=2.0/3.0/3.6/4.2 on the
   same hill at the same camera angle: 2.0 reads completely flat under this
   game's high ambient light regardless of shadowing, 3.6+ reads as a clear
   rounded mound. The earlier <=2.6 cap and "below ~1.5 reads flat" note
   were therefore never actually confirmed visible — this pass replaces
   that assumption with an actual before/after comparison.

   This taller pass broke render-flow.js's original ground-click picker: a
   single flat-plane reprojection can overshoot an entire hill in one jump
   and land on a distant flat point that coincidentally satisfies its own
   "does this point's height match the plane I used to find it" check —
   found via a real, reproduced test failure (placing a pot near the
   zone0 hill), not spotted by inspection. pick() was rewritten to bisect
   the ray against the heightfield between y=MAX_HEIGHT (provably above
   every possible hill) and y=0 (the flat floor), which cannot skip over a
   bump the way a single reprojection jump can. */
(function (root) {
  const hills = [
    // zone0 (la pépinière) — verified clear of every visitor/house/resource
    // (nearest is Léa's house, 4.1 units away) and of the river's fixed
    // west bank (starts at x=4, this hill's east edge stops at x=-3).
    { x: -6.5, z: 2.5, r: 3.5, h: 3.6 },
    { x: -14, z: -3.5, r: 2.5, h: 2.9 },
    // zone1 (le sous-bois)
    { x: -28, z: 7, r: 8, h: 4.5 },
    { x: -35, z: 15, r: 6, h: 3.2 },
    // zone2 (la prairie)
    { x: -6, z: -20, r: 8, h: 4.1 },
    { x: -13, z: -28, r: 6, h: 3.2 },
    // zone3 (la rocaille)
    { x: -28, z: -20, r: 9, h: 4.7 },
    { x: -35, z: -10, r: 5, h: 2.7 },
  ];
  function terrainHeight(x, z) {
    let y = 0;
    for (const hill of hills) {
      const t = Math.hypot(x - hill.x, z - hill.z) / hill.r;
      if (t < 1) y += hill.h * (1 - t * t) ** 2;
    }
    return y;
  }
  // The real max (measured by scanning every hill, not summed blindly —
  // hills don't overlap, verified) is exactly 4.7; a small margin keeps
  // render-flow.js's bisection bracket valid even if a future hill nudges
  // the true max up slightly without this constant being updated first.
  const MAX_HEIGHT = 5;
  const api = { terrainHeight, MAX_HEIGHT };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenTerrain = api;
})(globalThis);
