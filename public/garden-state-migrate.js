/* Landscape-version bumps for v3 saves, split out of garden-state-validate.js
   (UMD: node module / browser GardenStateParts). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const C =
    typeof module !== "undefined"
      ? require("./game/construction.js")
      : root.GardenConstruction;
  const { clone } =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  // Nearest free half-unit cell for an entity trapped by a new house footprint.
  function relocate(s, e) {
    for (let ring = 1; ring <= 8; ring++)
      for (let dx = -ring; dx <= ring; dx++)
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const x = e.x + dx * 0.5,
            z = e.z + dz * 0.5;
          if (Math.hypot(dx, dz) * 0.5 > 4) continue;
          if (!C.placement(s, { ...e, x, z }, e.id)) return { x, z };
        }
    return null;
  }
  function migrateLandscape(s) {
    // Add renewable resource sites without crediting any resource or resetting an old cooldown.
    if (
      s?.version === 3 &&
      (s.landscape === undefined || s.landscape === 2 || s.landscape === 3)
    ) {
      s = clone(s);
      s.landscape = 4;
      if (Array.isArray(s.resources))
        s.resources = D.resources.map((def) => {
          const old = s.resources.find((r) => r.id === def.id);
          return {
            ...def,
            ready: old?.ready ?? 0,
            work: old?.work ?? 0,
            nextHit: old?.nextHit ?? 0,
          };
        });
    }
    // Three houses now stand in the nursery; an old object caught inside one
    // moves to the closest free half-unit cell nearby, plant included.
    if (s?.version === 3 && s.landscape === 4) {
      s = clone(s);
      s.landscape = 5;
      if (Array.isArray(s.entities))
        for (const e of s.entities) {
          if (e.stored || !Number.isFinite(e.x) || !Number.isFinite(e.z))
            continue;
          const r = C.radius(e);
          if (!D.buildings.some((b) => C.insideHouse(b, e.x, e.z, r + 0.4)))
            continue;
          const spot = relocate(s, e);
          if (spot) Object.assign(e, spot);
        }
    }
    // The artisans' quarter (wave 1) adds four more houses; an old object
    // caught inside one of them moves the same way the first three did.
    if (s?.version === 3 && s.landscape === 5) {
      s = clone(s);
      s.landscape = 6;
      if (Array.isArray(s.entities))
        for (const e of s.entities) {
          if (e.stored || !Number.isFinite(e.x) || !Number.isFinite(e.z))
            continue;
          const r = C.radius(e);
          if (!D.buildings.some((b) => C.insideHouse(b, e.x, e.z, r + 0.4)))
            continue;
          const spot = relocate(s, e);
          if (spot) Object.assign(e, spot);
        }
    }
    return s;
  }
  if (typeof module !== "undefined") module.exports = { migrateLandscape };
  else
    (root.GardenStateParts = root.GardenStateParts || {}).migrateLandscape =
      migrateLandscape;
})(globalThis);
