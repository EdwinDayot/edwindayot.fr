/* Shared helpers for the garden-state parts (UMD: node module / browser GardenStateParts). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const finite = (n, min = 0, max = 1e9) =>
    Number.isFinite(n) && n >= min && n <= max;
  const count = (n) => Number.isInteger(n) && finite(n);
  const plant = (species, growth = 0) => ({
    species,
    growth,
    moisture: growth ? 65 : 0,
    progress: 0,
    ready: growth ? 1 : 0,
  });
  // Applies a seed/young plant to an empty pot; shared by the manual "plant"
  // command and the auto-planter's tick so both plant identically.
  const sow = (e, species, source = "seed") => {
    e.plant = plant(species, source === "young" ? 0.3 : 0);
    e.plant.ready = 0;
    e.plant.source = source;
  };
  const knownItem = (id) =>
    ["coins", "wood", "stone", "clay"].includes(id) ||
    !!D.recipes[id] ||
    (/^(seed|cutting|flower|young):/.test(id) &&
      D.species.some((p) => p.id === id.split(":")[1]));
  const util = { clone, finite, count, plant, sow, knownItem };
  if (typeof module !== "undefined") module.exports = util;
  else (root.GardenStateParts = root.GardenStateParts || {}).util = util;
})(globalThis);
