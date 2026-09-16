/* Point-in-zone test, shared by data.js (tagging static content with a zone
   id) and construction.js (collision/placement). A single seam so the zone
   shape can change (Épic 4.1: rectangles -> organic polygon contours,
   z.polygon, each one a strict superset of the old z.bounds rectangle so
   already-placed content never ends up outside its zone) without touching
   call sites. z.bounds stays the plain rectangle, still used for the flat
   ground plane's size until Épic 4.2 gives it a real deformed mesh. */
(function (root) {
  // Standard ray-casting point-in-polygon test: odd number of polygon edge
  // crossings on a ray cast in +x from (x, z) means the point is inside.
  function pointInPolygon(polygon, x, z) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, zi] = polygon[i],
        [xj, zj] = polygon[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
        inside = !inside;
    }
    return inside;
  }
  function distanceToSegment(x, z, [x1, z1], [x2, z2]) {
    const dx = x2 - x1,
      dz = z2 - z1,
      len2 = dx * dx + dz * dz,
      t = len2
        ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / len2))
        : 0;
    return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
  }
  // Minimum distance from (x, z) to any edge of the polygon's contour, used
  // by construction.js's placement() so an object's whole footprint (its
  // radius) can be checked against the real boundary, not an axis-aligned
  // approximation of it.
  function distanceToPolygonEdge(polygon, x, z) {
    let min = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
      min = Math.min(min, distanceToSegment(x, z, polygon[j], polygon[i]));
    return min;
  }
  function zoneAt(zones, x, z) {
    return zones.find((q) => pointInPolygon(q.polygon, x, z));
  }
  const api = { zoneAt, pointInPolygon, distanceToPolygonEdge };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenGeometry = api;
})(globalThis);
