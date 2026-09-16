/* The river's centerline: one curve shared by rendering (render-world.js's
   ribbon) and placement legality (construction.js's pump rule) — Épic 4.3
   replaces both the straight box and the hard-coded "x >= 2.5" rule with
   this single source of truth, exactly as the plan asks.
   riverX(4) is pinned to the old straight river's x (5.8) so the dock, the
   "La rivière" label and the fill-water interaction point at (3.5, 4) stay
   exactly where they were — only the rest of the river's length curves. */
(function (root) {
  const BASE_X = 5.8,
    AMPLITUDE = 2.2,
    WAVELENGTH = 40,
    Z_REF = 4,
    WATER_HALF_WIDTH = 1.625,
    SOIL_HALF_WIDTH = 1.8;
  function riverX(z) {
    return (
      BASE_X + AMPLITUDE * Math.sin((2 * Math.PI * (z - Z_REF)) / WAVELENGTH)
    );
  }
  // Local sampled search rather than a closed-form point-to-curve distance:
  // cheap enough for placement checks (not a per-frame hot path) and exact
  // enough for a curve this gentle (amplitude 2.2 over a 40-unit wavelength).
  function distanceToRiver(x, z) {
    let min = Infinity;
    for (let dz = -3; dz <= 3; dz += 0.25) {
      const d = Math.hypot(x - riverX(z + dz), dz);
      if (d < min) min = d;
    }
    return min;
  }
  const api = { riverX, distanceToRiver, WATER_HALF_WIDTH, SOIL_HALF_WIDTH };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRiver = api;
})(globalThis);
