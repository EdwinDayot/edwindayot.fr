/* Crafting and growth recipes. */
(function (root) {
  const P = (root.GardenDataParts = root.GardenDataParts || {});
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
      substance: "water",
    },
    composter: {
      name: "Composteur",
      cost: { wood: 4, clay: 4, coins: 15 },
      radius: 0.5,
      plan: true,
      flow: 1,
      substance: "fertilizer",
    },
    nursery: {
      name: "Établi de multiplication",
      cost: { wood: 5, clay: 3, coins: 12 },
      radius: 0.65,
      plan: true,
      job: true,
    },
    collector: {
      name: "Collecteur",
      cost: { wood: 6, stone: 4, coins: 25 },
      radius: 0.55,
      plan: true,
      capacity: 24,
      range: 4,
      buffer: true,
    },
    autoPlanter: {
      name: "Planteur automatique",
      cost: { wood: 4, clay: 2, coins: 20 },
      radius: 0.5,
      plan: true,
      capacity: 6,
      range: 3,
      sow: true,
    },
    // Tier 2: same tickBuffer primitive as collector, only bigger numbers —
    // proves 0.3's dispatch needs no new branch for a second buffer variant.
    collectorT2: {
      name: "Collecteur amélioré",
      cost: { wood: 10, stone: 6, coins: 45 },
      radius: 0.6,
      plan: true,
      capacity: 48,
      range: 6,
      buffer: true,
    },
    // A passive "aura of range" primitive: every plant in range gets the
    // exact same boostUntil field the composter's fertilizer already sets
    // (0.4), refreshed every tick it stays in range — no second growth-rate
    // mechanism, just a second, passive way to set the one that exists.
    greenhouse: {
      name: "Serre",
      cost: { wood: 8, clay: 3, coins: 35 },
      radius: 0.8,
      plan: true,
      aura: { range: 2.5 },
    },
    // A "self-refilling buffer" symmetric to the collector (fills itself
    // over time instead of from ready plants) that also feeds any
    // auto-planter in range — same e.buffer shape as collector/autoPlanter,
    // reused generically wherever those already are.
    seedDispenser: {
      name: "Distributeur de graines",
      cost: { wood: 6, clay: 4, coins: 30 },
      radius: 0.5,
      plan: true,
      capacity: 6,
      dispense: { species: "pilea", every: 20, range: 4 },
    },
  };
  P.recipes = recipes;
  if (typeof module !== "undefined") module.exports = { recipes };
})(globalThis);
