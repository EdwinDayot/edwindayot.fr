/* Pure presentation clock. No crop or irrigation rules depend on this module. */
(function (root) {
  const clamp = (x) => Math.max(0, Math.min(1, x)),
    smooth = (a, b, x) => {
      const t = clamp((x - a) / (b - a));
      return t * t * (3 - 2 * t);
    };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  function at(time) {
    const theta =
        (2 * Math.PI * (((time % 1200) + 1200) % 1200)) / 1200 + Math.PI / 4,
      x = Math.cos(theta),
      y = Math.sin(theta),
      z = 0.35 * x,
      n = Math.hypot(x, y, z),
      height = y / n;
    const day = smooth(-0.16, 0.28, height),
      sun = smooth(0, 0.28, height),
      moon = smooth(0, 0.28, -height),
      warm = 1 - smooth(0.05, 0.65, height);
    return {
      theta,
      height,
      direction: [x / n, height, z / n],
      sunIntensity: 2.6 * sun,
      moonIntensity: 0.48 * moon,
      // Kept deliberately low: a bright hemisphere washes out slope shading
      // and cast shadows, hiding the relief. The sun does the modelling.
      ambient: 0.5 + 0.3 * day,
      day,
      night: 1 - smooth(-0.08, 0.18, height),
      sunColor: mix([1, 0.94, 0.8], [1, 0.55, 0.28], warm),
      sky: mix([0.055, 0.085, 0.16], [0.72, 0.82, 0.68], day),
      ground: mix([0.12, 0.17, 0.24], [0.32, 0.43, 0.34], day),
    };
  }
  const api = { at, CYCLE: 1200 };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenLighting = api;
})(globalThis);
