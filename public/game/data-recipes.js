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
  P.recipes = recipes;
  if (typeof module !== "undefined") module.exports = { recipes };
})(globalThis);
