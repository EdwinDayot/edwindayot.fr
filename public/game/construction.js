(function (root) {
  const D =
    typeof module !== "undefined" ? require("./data.js") : root.GardenData;
  const G =
    typeof module !== "undefined"
      ? require("./geometry.js")
      : root.GardenGeometry;
  const River =
    typeof module !== "undefined" ? require("./river.js") : root.GardenRiver;
  const Passage =
    typeof module !== "undefined"
      ? require("./campaign-passage.js")
      : root.GardenCampaignPassage;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const zoneAt = (x, z) => G.zoneAt(D.zones, x, z);
  const radius = (e) => e.radius ?? D.recipes[e.type]?.radius ?? 0.5;
  // Each house is a static ring of wall circles (data.js) with a gap at the
  // door; they never move, so they are computed once for every save.
  const buildingObstacles = (D.buildings || []).flatMap((b) =>
    b.wallCircles.map((c) => ({ x: c.x, z: c.z, radius: c.r })),
  );
  const houseName = (visitorId) =>
    (D.visitors.find((v) => v.id === visitorId)?.name || visitorId).split(
      " · ",
    )[0];
  const insideHouse = (b, x, z, margin = 0) =>
    Math.abs(x - b.x) < b.w / 2 + margin &&
    Math.abs(z - b.z) < b.d / 2 + margin;
  // Old saves keep every placed object; a new landscape tree yields to that footprint.
  const trees = (s) =>
    D.trees.filter(
      (t) =>
        !s.resources.some((r) => r.treeId === t.id && r.ready > s.elapsed) &&
        s.entities.every(
          (e) => e.stored || distance(e, t) > radius(e) + t.radius + 0.25,
        ),
    );
  const resourceClear = (s, r) =>
    s.entities.every(
      (e) =>
        e.stored || distance(e, r) > radius(e) + D.mining[r.type].radius + 0.2,
    );
  // Stumps and rubble keep their footprint while depleted: regrowth can never trap a player.
  const resourceObstacles = (s) =>
    s.resources
      .filter((r) => r.type !== "clay" && resourceClear(s, r))
      .map((r) => ({ ...r, radius: D.mining[r.type].radius }));
  // Epic C6.13: strictly conditional on s.campaignPassage?.blocked — never a new parameter on
  // obstacles/walkable/path/flood's own signature, so every existing caller (free-garden saves,
  // and any campaign save before C6.12 never carrying this field at all) sees exactly the same
  // obstacle list as before. Reads campaignPassage.x/z directly rather than campaign-passage.js's
  // own PASSAGE_POSITION constant: a save's actual position is the one persisted in s (fresh()
  // wrote PASSAGE_POSITION there once; the two only ever coincide because nothing else changes it).
  const passageObstacle = (s) =>
    s.campaignPassage?.blocked
      ? [
          {
            x: s.campaignPassage.x,
            z: s.campaignPassage.z,
            radius: Passage.PASSAGE_OBSTACLE_RADIUS,
          },
        ]
      : [];
  const obstacles = (s) =>
    s.entities
      .filter((e) => !e.stored && !D.recipes[e.type].flat)
      .concat(
        D.visitors.map((v) => ({ ...v, type: "visitor" })),
        trees(s),
        resourceObstacles(s),
        buildingObstacles,
        passageObstacle(s),
      );
  function walkable(s, x, z, obs = obstacles(s)) {
    const zone = zoneAt(x, z);
    if (!zone || !s.unlocked.includes(zone.id)) return false;
    return obs.every(
      (e) => (e.x - x) ** 2 + (e.z - z) ** 2 >= (radius(e) + 0.23) ** 2,
    );
  }
  // A half-unit navigation grid shared by placement validation and player pathfinding.
  const key = (x, z) => `${x},${z}`;
  function flood(s, start, obs = obstacles(s), goal = null) {
    const sx = Math.round(start.x * 2),
      sz = Math.round(start.z * 2),
      queue = [[sx, sz]],
      parents = new Map([[key(sx, sz), null]]);
    let end = null;
    for (let n = 0; n < queue.length; n++) {
      const [x, z] = queue[n];
      if (goal && Math.hypot(x / 2 - goal.x, z / 2 - goal.z) < 0.4) {
        end = key(x, z);
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          nz = z + dz,
          k = key(nx, nz);
        if (!parents.has(k) && walkable(s, nx / 2, nz / 2, obs)) {
          parents.set(k, key(x, z));
          queue.push([nx, nz]);
        }
      }
    }
    return { parents, end };
  }
  function path(s, from, to) {
    if (!walkable(s, to.x, to.z)) return [];
    const { parents, end } = flood(s, from, undefined, to);
    if (!end) return [];
    const points = [];
    let k = end;
    while (parents.get(k)) {
      const [x, z] = k.split(",").map(Number);
      points.push({ x: x / 2, z: z / 2 });
      k = parents.get(k);
    }
    return points.reverse();
  }
  function approach(s, from, target) {
    const candidates = [];
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        const p = {
          x: Math.round(target.x * 2) / 2 + x * 0.5,
          z: Math.round(target.z * 2) / 2 + z * 0.5,
        };
        if (
          distance(p, target) <= 1.65 &&
          distance(p, target) > 0.7 &&
          walkable(s, p.x, p.z)
        )
          candidates.push(p);
      }
    candidates.sort((a, b) => distance(a, from) - distance(b, from));
    for (const p of candidates) {
      const route = path(s, from, p);
      if (route.length || distance(from, p) < 0.4) return route;
    }
    return [];
  }
  function placement(s, e, ignore = null) {
    if (
      !Number.isFinite(e.x) ||
      !Number.isFinite(e.z) ||
      (e.x * 2) % 1 ||
      (e.z * 2) % 1
    )
      return "Utilise la grille de 0,5 unité.";
    const zone = zoneAt(e.x, e.z),
      r = radius(e);
    // A true distance-to-contour test (Épic 4.1) replaces the old
    // four-corner AABB approximation: if the whole disk of radius r around
    // the center stays farther from every edge of the zone's polygon than
    // r, the object's entire footprint is provably inside that one zone —
    // it can't be straddling the boundary into an unlocked or nonexistent
    // neighbor, whatever the polygon's shape.
    if (
      !zone ||
      !s.unlocked.includes(zone.id) ||
      G.distanceToPolygonEdge(zone.polygon, e.x, e.z) < r
    )
      return "Cette parcelle est fermée ou en bordure du jardin.";
    if (e.type === "pump" && River.distanceToRiver(e.x, e.z) > 2.5)
      return "La pompe doit être au bord de la rivière.";
    for (const b of D.buildings || [])
      if (insideHouse(b, e.x, e.z, r + 0.4))
        return `Garde la maison de ${houseName(b.visitorId)} libre.`;
    const others = s.entities.filter((o) => !o.stored && o.id !== ignore);
    if (
      others.some((o) => distance(e, o) < r + radius(o) + 0.08) ||
      D.visitors.some((o) => distance(e, o) < r + 0.7) ||
      trees(s).some((o) => distance(e, o) < r + radius(o) + 0.15)
    )
      return "Un objet occupe déjà cet espace.";
    if (
      distance(e, { x: 3.5, z: 4 }) < r + 0.8 ||
      D.zones.some(
        (q) => distance(e, { x: q.gate[0], z: q.gate[1] }) < r + 0.65,
      )
    )
      return "Garde le ponton et les passages libres.";
    if (
      D.resources
        .concat(D.caches.filter((c) => !s.discovered.includes(c.species)))
        .some(
          (o) => distance(e, o) < r + (D.mining[o.type]?.radius ?? 0.3) + 0.2,
        )
    )
      return "Garde cette ressource accessible.";
    const all = others.concat(e),
      obs = all
        .filter((o) => !D.recipes[o.type].flat)
        .concat(D.visitors, trees(s), resourceObstacles(s), buildingObstacles);
    const { parents } = flood(s, { x: 0, z: 4 }, obs);
    const targets = all.concat(
      D.visitors,
      D.resources.filter((o) => s.unlocked.includes(o.zone)),
      D.caches.filter(
        (o) => s.unlocked.includes(o.zone) && !s.discovered.includes(o.species),
      ),
      D.zones
        .filter((q) => s.unlocked.includes(q.id) || q.id === 1 || q.id === 2)
        .map((q) => ({ x: q.gate[0], z: q.gate[1] })),
      { x: 3.5, z: 4 },
    );
    if (
      targets.some((o) => {
        for (let x = -3; x <= 3; x++)
          for (let z = -3; z <= 3; z++) {
            const px = Math.round(o.x * 2) + x,
              pz = Math.round(o.z * 2) + z;
            if (
              Math.hypot(px / 2 - o.x, pz / 2 - o.z) < 1.65 &&
              parents.has(key(px, pz))
            )
              return false;
          }
        return true;
      })
    )
      return "Cet emplacement bloquerait un accès.";
    return null;
  }
  const api = {
    trees,
    resourceClear,
    resourceObstacles,
    distance,
    zoneAt,
    radius,
    walkable,
    path,
    approach,
    placement,
    insideHouse,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenConstruction = api;
})(globalThis);
