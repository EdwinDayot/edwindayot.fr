/* All times are seconds, water in game units, distances in world units. */
(function (root) {
  const species = [
    [
      "pilea",
      "Pilea",
      "Pilea peperomioides",
      0,
      180,
      120,
      "cutting",
      "ombre",
      0.075,
    ],
    [
      "monstera",
      "Monstera",
      "Monstera deliciosa",
      0,
      300,
      180,
      "cutting",
      "ombre",
      0.06,
    ],
    [
      "calathea",
      "Calathea",
      "Goeppertia makoyana",
      0,
      360,
      150,
      "seed",
      "ombre",
      0.085,
    ],
    [
      "pothos",
      "Pothos",
      "Epipremnum aureum",
      1,
      240,
      120,
      "cutting",
      "ombre",
      0.055,
    ],
    [
      "fern",
      "Fougère",
      "Nephrolepis exaltata",
      1,
      420,
      180,
      "seed",
      "ombre",
      0.09,
    ],
    [
      "maranta",
      "Maranta",
      "Maranta leuconeura",
      1,
      480,
      180,
      "cutting",
      "ombre",
      0.08,
    ],
    [
      "lavender",
      "Lavande",
      "Lavandula angustifolia",
      2,
      300,
      120,
      "flower",
      "soleil",
      0.04,
    ],
    [
      "sunflower",
      "Tournesol",
      "Helianthus annuus",
      2,
      360,
      150,
      "seed",
      "soleil",
      0.065,
    ],
    [
      "daisy",
      "Marguerite",
      "Leucanthemum vulgare",
      2,
      240,
      120,
      "flower",
      "soleil",
      0.05,
    ],
    ["aloe", "Aloe", "Aloe vera", 3, 540, 240, "cutting", "soleil", 0.025],
    [
      "echeveria",
      "Echeveria",
      "Echeveria elegans",
      3,
      600,
      240,
      "cutting",
      "soleil",
      0.025,
    ],
    [
      "cactus",
      "Cactus",
      "Mammillaria sp.",
      3,
      720,
      300,
      "seed",
      "soleil",
      0.02,
    ],
  ].map(([id, name, latin, zone, grow, produce, product, light, dry]) => ({
    id,
    name,
    latin,
    zone,
    grow,
    produce,
    product,
    light,
    dry,
  }));
  const zones = [
    {
      id: 0,
      name: "La pépinière",
      bounds: [-16, 4, -5, 19],
      light: "ombre",
      humidity: 1,
      gate: [0, 3],
      cost: {},
      rep: 0,
    },
    {
      id: 1,
      name: "Le sous-bois",
      bounds: [-40, -16, -5, 19],
      light: "ombre",
      humidity: 1.3,
      gate: [-15, 3],
      cost: { coins: 15, wood: 4, stone: 2 },
      rep: 1,
    },
    {
      id: 2,
      name: "La prairie",
      bounds: [-16, 4, -35, -5],
      light: "soleil",
      humidity: 0.9,
      gate: [-2, -4],
      cost: { coins: 30, wood: 6, stone: 5 },
      rep: 4,
    },
    {
      id: 3,
      name: "La rocaille",
      bounds: [-40, -16, -35, -5],
      light: "soleil",
      humidity: 0.7,
      gate: [-15, -12],
      cost: { coins: 45, wood: 8, stone: 8 },
      rep: 8,
    },
  ];
  const recipes = {
    pot: {
      name: "Pot en terre cuite",
      cost: { clay: 2, wood: 1 },
      radius: 0.55,
    },
    reservoir: {
      name: "Pot à réserve",
      cost: { clay: 3, coins: 4 },
      radius: 0.55,
    },
    path: {
      name: "Pas japonais",
      cost: { stone: 1 },
      radius: 0.22,
      flat: true,
    },
    bench: { name: "Banc", cost: { wood: 3 }, radius: 0.65 },
    lantern: { name: "Lanterne", cost: { stone: 1, coins: 2 }, radius: 0.3 },
    tank: {
      name: "Citerne",
      cost: { clay: 3, wood: 2, coins: 6 },
      radius: 0.55,
      plan: true,
      capacity: 160,
      flow: 1,
    },
    pipe: {
      name: "Tuyau",
      cost: { wood: 1 },
      radius: 0.18,
      flat: true,
      plan: true,
    },
    drip: {
      name: "Goutteur",
      cost: { stone: 1, wood: 1, coins: 2 },
      radius: 0.18,
      flat: true,
      plan: true,
    },
    pump: {
      name: "Pompe de rivière",
      cost: { stone: 5, wood: 4, coins: 20 },
      radius: 0.5,
      plan: true,
      flow: 2,
    },
    nursery: {
      name: "Établi de multiplication",
      cost: { wood: 5, clay: 3, coins: 12 },
      radius: 0.65,
      plan: true,
    },
    collector: {
      name: "Collecteur",
      cost: { wood: 6, stone: 4, coins: 25 },
      radius: 0.55,
      plan: true,
      capacity: 24,
      range: 4,
    },
  };
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
  const mining = {
    wood: {
      tool: "axe",
      name: "Arbre",
      verb: "Couper",
      hits: 3,
      renew: 120,
      radius: 0.4,
    },
    stone: {
      tool: "pickaxe",
      name: "Veine de pierre",
      verb: "Piocher",
      hits: 4,
      renew: 100,
      radius: 0.58,
    },
    clay: {
      tool: "shovel",
      name: "Banc d’argile",
      verb: "Creuser",
      hits: 3,
      renew: 90,
      radius: 0.35,
    },
  };
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
  const tools = {
    water: "Arrosoir",
    hand: "Mains libres",
    hose: "Raccordement",
    axe: "Hache",
    pickaxe: "Pioche",
    shovel: "Pelle",
  };
  const labels = {
    coins: "feuilles",
    wood: "bois",
    stone: "pierre",
    clay: "argile",
    seed: "graines",
    cutting: "boutures",
    flower: "fleurs",
    young: "jeunes plants",
  };
  const itemName = (id) => {
    const [kind, sp] = id.split(":");
    return sp
      ? `${labels[kind]} de ${species.find((s) => s.id === sp)?.name || sp}`
      : recipes[id]?.name || labels[id] || id;
  };
  const balance = {
    initialInventory: {
      coins: 8,
      wood: 2,
      clay: 2,
      stone: 0,
      "seed:pilea": 2,
      "seed:monstera": 2,
      "seed:calathea": 2,
    },
    potPrice: { coins: 8 },
    tradeReward: { coins: 18 },
    firstTradeBonus: { clay: 3, wood: 3, stone: 2, lantern: 1 },
    botanyReward: { coins: 8, bench: 1 },
    resourceYield: 3,
    resourceRenewal: 90,
    nurserySeconds: 180,
    wateringCost: 20,
    wateringMoisture: 45,
  };
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
