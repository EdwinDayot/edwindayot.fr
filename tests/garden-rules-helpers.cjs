const { GardenState, validate, migrate } = require("../public/garden-state.js");
const { SaveStore, KEY, BACKUP, LEGACY } = require("../public/game/save.js");
const D = require("../public/game/data.js"),
  C = require("../public/game/construction.js");
const near = (e) => ({ position: { x: e.x, z: e.z + 1 } });
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) || null, setItem: (k, v) => m.set(k, v) };
};
function irrigation() {
  const g = new GardenState(null, 1000);
  g.s.entities = g.s.entities.slice(0, 1);
  g.s.entities[0].plant.moisture = 10;
  g.s.entities.push(
    {
      id: "e4",
      type: "tank",
      x: -5,
      z: 0,
      rotation: 0,
      stored: false,
      water: 100,
    },
    { id: "e5", type: "drip", x: -4, z: 0, rotation: 0, stored: false },
  );
  g.s.nextId = 6;
  g.s.links = [
    ["e4", "e5"],
    ["e5", "e1"],
  ];
  return g;
}
module.exports = {
  GardenState,
  validate,
  migrate,
  SaveStore,
  KEY,
  BACKUP,
  LEGACY,
  D,
  C,
  near,
  memory,
  irrigation,
};
