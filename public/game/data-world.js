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
    // Épic C3.5: a fifth zone, directly north of la pépinière, sharing its
    // exact north edge (same three points as zone0's own polygon there) so
    // the border has neither gap nor overlap, on the same "shared edges stay
    // straight, only the outer edge bulges" convention as the four zones
    // above. Always unlocked (cost: {}), like zone0: a locked-by-default
    // zone would fail the existing "every visitor is reachable from the
    // portal on a fresh save" test (tests/garden-construction.cjs), since
    // reaching it would require crossing a still-locked zone1/2/3 first —
    // this zone borders only zone0, the one zone always open from the start.
    {
      id: 4,
      name: "Le coin de village",
      bounds: [-16, 4, 22, 34],
      polygon: [
        [-16, 19],
        [-6, 22],
        [4, 19],
        [4, 34],
        [-6, 38],
        [-16, 34],
      ],
      light: "ombre",
      humidity: 1,
      gate: [-6, 23],
      cost: {},
      rep: 0,
    },
  ];
  // One ground tint per zone, indexed by z.id. Shared between render-world.js
  // (buildZones) and render-flow.js (open/locked recoloring) so a future zone
  // only needs one new entry here, not two literals kept in lockstep.
  const zoneGroundColors = [0xaabd8c, 0x91ab80, 0xc4c591, 0xbec0a1, 0x9dbbac];
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
  P.zoneGroundColors = zoneGroundColors;
  P.mining = mining;
  P.tools = tools;
  P.labels = labels;
  P.itemName = itemName;
  P.balance = balance;
  if (typeof module !== "undefined")
    module.exports = {
      zones,
      zoneGroundColors,
      mining,
      tools,
      labels,
      itemName,
      balance,
    };
})(globalThis);
