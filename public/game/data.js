/* All times are seconds, water in game units, distances in world units. */
(function (root) {
  const P =
    typeof module !== "undefined"
      ? {
          ...require("./data-species.js"),
          ...require("./data-recipes.js"),
          ...require("./data-world.js"),
        }
      : root.GardenDataParts;
  const { species, zones, recipes, mining, tools, labels, itemName, balance } =
    P;
  const visitors = [
    { id: "lea", name: "Léa · échanges", x: -5, z: 5 },
    { id: "noe", name: "Noé · équipements", x: -3, z: 5 },
    { id: "iris", name: "Iris · botaniste", x: -1, z: 5 },
  ];
  const resourcePositions = [
    [
      [-6, -3],
      [-4, -3],
      [-2, -3],
    ],
    [
      [-35, 1],
      [-29, 10],
      [-20, 13],
    ],
    [
      [-11, -12],
      [-5, -24],
      [1, -16],
    ],
    [
      [-35, -12],
      [-29, -27],
      [-22, -19],
    ],
  ];
  const resources = zones.flatMap((z) =>
    ["wood", "stone", "clay"].map((type, i) => ({
      id: `resource-${z.id}-${type}`,
      type,
      zone: z.id,
      x: resourcePositions[z.id][i][0],
      z: resourcePositions[z.id][i][1],
      ready: 0,
    })),
  );
  const caches = species
    .filter((s) => s.zone)
    .map((s, i) => ({
      id: `cache-${s.id}`,
      species: s.id,
      zone: s.zone,
      x: [-23, -35, -29, -11, -3, 0, -35, -21, -31][i],
      z: [2, 12, -2, -19, -31, -9, -31, -28, -17][i],
    }));
  const trees = [];
  const addTree = (x, z, scale = 1) => {
    if (
      resources
        .concat(
          caches,
          visitors,
          zones.map((q) => ({ x: q.gate[0], z: q.gate[1] })),
        )
        .some((p) => Math.hypot(p.x - x, p.z - z) < 2)
    )
      return;
    trees.push({
      id: `tree-${trees.length}`,
      type: "tree",
      x,
      z,
      radius: 0.34,
      scale,
    });
  };
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 6; col++) {
      const x = -38 + col * 3.6 + (row % 2) * 0.8,
        z = -3 + row * 4.6;
      if (Math.abs(z - 3.8) > 1.4)
        addTree(x, z, 0.95 + ((row + col) % 3) * 0.15);
    }
  for (const [x, z] of [
    [-13, 0],
    [-11, -3],
    [-12, 9],
    [-9, 14],
    [-3, 16],
    [1, 13],
    [-14, 16],
    [-7, 18],
    [-17, -7],
    [-38, -10],
    [-38, -23],
    [-38, -33],
    [-15, -33],
    [2, -30],
  ])
    addTree(x, z, 1.1);
  // Permanent resource sites. Extra sites avoid gates, old starter pots and botanical caches.
  const sites = {
    wood: [
      [-10, 7],
      [-7, 12],
      [-14, 12],
      [-31, 5],
      [-25, 13],
      [-37, 16],
      [-12, -9],
      [-9, -27],
      [0, -22],
      [-37, -15],
      [-24, -22],
      [-29, -33],
    ],
    stone: [
      [-9, -1],
      [-3, 10],
      [1, 17],
      [-20, -1],
      [-33, 8],
      [-22, 17],
      [-7, -10],
      [0, -28],
      [-13, -32],
      [-20, -8],
      [-34, -24],
      [-25, -31],
    ],
    clay: [
      [-5, 8],
      [2, 11],
      [-12, 17],
      [-18, 7],
      [-32, 15],
      [-37, -1],
      [-14, -16],
      [-5, -16],
      [2, -32],
      [-32, -10],
      [-19, -24],
      [-28, -14],
    ],
  };
  for (const [type, points] of Object.entries(sites))
    points.forEach(([x, z], i) => {
      const zone = zones.find(
        (q) =>
          x >= q.bounds[0] &&
          x < q.bounds[1] &&
          z >= q.bounds[2] &&
          z < q.bounds[3],
      ).id;
      resources.push({
        id: `resource-extra-${type}-${i}`,
        type,
        zone,
        x,
        z,
        ready: 0,
      });
    });
  // Avoid overlapping sites before making every landscape tree harvestable.
  for (let i = trees.length - 1; i >= 0; i--)
    if (
      resources.some(
        (r) => Math.hypot(r.x - trees[i].x, r.z - trees[i].z) < 1.5,
      )
    )
      trees.splice(i, 1);
  for (const tree of trees) {
    const zone = zones.find(
      (q) =>
        tree.x >= q.bounds[0] &&
        tree.x < q.bounds[1] &&
        tree.z >= q.bounds[2] &&
        tree.z < q.bounds[3],
    ).id;
    resources.push({
      id: `resource-${tree.id}`,
      type: "wood",
      zone,
      x: tree.x,
      z: tree.z,
      ready: 0,
      treeId: tree.id,
    });
  }
  const defaultHotbar = ["water", "hand", "axe", "pickaxe", "shovel"];
  const api = {
    mining,
    defaultHotbar,
    tools,
    trees,
    balance,
    species,
    zones,
    recipes,
    visitors,
    resources,
    caches,
    labels,
    itemName,
    STEP: 1,
    OFFLINE_CAP: 28800,
    MAX_POTS: 48,
    MAX_DECOR: 192,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenData = api;
})(globalThis);
