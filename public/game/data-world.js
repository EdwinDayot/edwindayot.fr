/* Zones, extraction, tools, names and balance numbers. */
(function (root) {
  const P = (root.GardenDataParts = root.GardenDataParts || {});
  const { species, recipes } = P;
  // Each zone's polygon is a strict superset of its bounds rectangle: the
  // two edges shared with a neighboring zone stay perfectly straight (so
  // neighboring polygons never overlap each other), and only the two edges
  // that face the outer edge of the whole map bulge outward, corners held
  // exact — an organic coastline instead of a sharp rectangle, Épic 4.1.
  const zones = [
    {
      id: 0,
      name: "La pépinière",
      bounds: [-16, 4, -5, 19],
      polygon: [
        [-16, 19],
        [-6, 22],
        [4, 19],
        [7, 7],
        [4, -5],
        [-16, -5],
      ],
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
      polygon: [
        [-40, -5],
        [-43, 7],
        [-40, 19],
        [-28, 22],
        [-16, 19],
        [-16, -5],
      ],
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
      polygon: [
        [-16, -5],
        [4, -5],
        [7, -20],
        [4, -35],
        [-6, -38],
        [-16, -35],
      ],
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
      polygon: [
        [-40, -5],
        [-16, -5],
        [-16, -35],
        [-28, -38],
        [-40, -35],
        [-43, -20],
      ],
      light: "soleil",
      humidity: 0.7,
      gate: [-15, -12],
      cost: { coins: 45, wood: 8, stone: 8 },
      rep: 8,
    },
  ];
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
    tradeReward: { coins: 18 },
    firstTradeBonus: { clay: 3, wood: 3, stone: 2, lantern: 1 },
    botanyReward: { coins: 8, bench: 1 },
    resourceYield: 3,
    resourceRenewal: 90,
    nurserySeconds: 180,
    wateringCost: 20,
    wateringMoisture: 45,
  };
  P.zones = zones;
  P.mining = mining;
  P.tools = tools;
  P.labels = labels;
  P.itemName = itemName;
  P.balance = balance;
  if (typeof module !== "undefined")
    module.exports = { zones, mining, tools, labels, itemName, balance };
})(globalThis);
