/* New-state factory and legacy save migration, part of garden-state (UMD). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const { clone, finite, count, plant, knownItem } =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  function fresh(now) {
    return {
      version: 3,
      landscape: 6,
      hotbar: [...D.defaultHotbar],
      updatedAt: now,
      elapsed: 0,
      remainder: 0,
      nextId: 4,
      water: 100,
      inventory: clone(D.balance.initialInventory),
      entities: [
        {
          id: "e1",
          type: "pot",
          x: -3,
          z: 0,
          rotation: 0,
          stored: false,
          plant: plant("pilea", 1),
        },
        {
          id: "e2",
          type: "pot",
          x: 0,
          z: 0,
          rotation: 0,
          stored: false,
          plant: null,
        },
        {
          id: "e3",
          type: "pot",
          x: 0,
          z: -3,
          rotation: 0,
          stored: false,
          plant: null,
        },
      ],
      links: [],
      unlocked: [0],
      discovered: ["pilea", "monstera", "calathea"],
      reputation: 0,
      trades: 0,
      plans: ["pot", "reservoir", "path", "bench", "lantern"],
      resources: clone(D.resources),
      requests: [],
      requestSerial: 0,
      irrigationCursor: 0,
      settings: { hints: true, sound: false, reduced: false },
      stats: { produced: 0, collected: 0, waterUsed: 0 },
      botanyRewards: [],
      quests: { active: [], completed: [] },
    };
  }
  function migrate(old, now = Date.now()) {
    const G =
      typeof module !== "undefined"
        ? require("./garden-state.js").GardenState
        : root.GardenStateParts.state;
    if (
      !old ||
      old.version !== 2 ||
      !Array.isArray(old.plots) ||
      old.plots.length !== 6
    )
      throw Error("Ancienne sauvegarde invalide.");
    const g = new G(null, now),
      s = g.s,
      clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
    s.water = clamp(old.water, 0, 100);
    s.inventory.coins = Math.floor(clamp(old.tokens, 0, 99999));
    s.entities = old.plots.map((p, i) => {
      p = p || {};
      const sp = D.species[Math.floor(clamp(p.species ?? i % 3, 0, 2))].id;
      const level = Math.floor(clamp(p.level, 0, 2));
      return {
        id: `e${i + 1}`,
        type: level ? "reservoir" : "pot",
        legacyLevel: level,
        x: [-3, 0, 2.5, -3, 0, 2.5][i],
        z: i < 3 ? -3 : 1,
        rotation: 0,
        stored: false,
        plant: p.planted
          ? {
              ...plant(sp),
              growth: clamp(p.growth, 0, 1),
              moisture: clamp(p.moisture, 0, 100),
            }
          : null,
      };
    });
    s.nextId = 7;
    s.legacy = { cares: clamp(old.cares, 0, 1e9), plots: clone(old.plots) };
    return s;
  }
  if (typeof module !== "undefined") module.exports = { fresh, migrate };
  else {
    const parts = (root.GardenStateParts = root.GardenStateParts || {});
    parts.fresh = fresh;
    parts.migrate = migrate;
  }
})(globalThis);
