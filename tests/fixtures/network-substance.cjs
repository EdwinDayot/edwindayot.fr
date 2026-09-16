const { GardenState } = require("../../public/garden-state.js");
module.exports = () => {
  const g = new GardenState(null, 1000),
    entity = (id, type, x, z, extra = {}) => ({
      id,
      type,
      x,
      z,
      rotation: 0,
      stored: false,
      ...extra,
    }),
    plant = (moisture) => ({
      species: "pilea",
      growth: 0.5,
      moisture,
      progress: 0,
      ready: 0,
    });
  g.s.entities = [
    entity("e1", "composter", -9, 2),
    entity("e2", "tank", -7.5, 2, { water: 0 }),
    entity("e3", "pipe", -6, 2),
    entity("e4", "drip", -4.5, 2),
    entity("e5", "pot", -3, 2, { plant: plant(50) }),
  ];
  g.s.nextId = 6;
  g.s.links = [
    ["e1", "e2"],
    ["e2", "e3"],
    ["e3", "e4"],
    ["e4", "e5"],
  ];
  g.s.plans.push("composter");
  return g;
};
