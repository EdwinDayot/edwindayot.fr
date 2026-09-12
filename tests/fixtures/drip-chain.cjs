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
    });
  g.s.entities = [entity("e1", "tank", -3, -3, { water: 10 })];
  for (let i = 0; i < 3; i++) {
    g.s.entities.push(entity(`e${2 + i * 2}`, "drip", -3 + i * 2, -1));
    g.s.entities.push(
      entity(`e${3 + i * 2}`, "pot", -3 + i * 2, 0.5, {
        plant: {
          species: "pilea",
          growth: 1,
          moisture: 10,
          progress: 0,
          ready: 0,
        },
      }),
    );
  }
  g.s.nextId = 8;
  g.s.links = [
    ["e2", "e1"],
    ["e4", "e2"],
    ["e6", "e4"],
    ["e3", "e2"],
    ["e5", "e4"],
    ["e7", "e6"],
  ];
  return g;
};
