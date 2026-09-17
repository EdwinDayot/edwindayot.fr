/* New-state factory and legacy save migration, part of garden-state (UMD). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const { clone, finite, count, plant, knownItem } =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  const Clock =
    typeof module !== "undefined"
      ? require("./game/campaign-clock.js")
      : root.GardenCampaignClock;
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
      cultivars: [],
      cultivarNextId: 1,
      // Named campaignPot, not pot: "pot" is already the free-garden's single-plant entity
      // type (see D.recipes.pot), so reusing that name here would be ambiguous — same reasoning
      // as campaign-clock.js distinguishing itself from a hypothetical clock.js (see its own
      // header comment). capacity starts at 1 (design §4 "Capacité du pot": "une paire par nuit
      // au début"); pending holds seed pairs not yet resolved by a "sleep" command.
      campaignPot: { capacity: 1, pending: [] },
      // Epic C1.4: the house's seed box. `seeded` flips true only once, on the very first
      // successful keepCultivar of the game (see garden-state-cmd-g.js); `cultivarId` then never
      // changes again. `retrievals` counts free, non-consuming pickups — never branched onto
      // inventory/economy.js, so this can never carry resale value (same "not wired yet" posture
      // documented at cultivars.js's own creation, C1.1).
      campaignSeedBox: { seeded: false, cultivarId: null, retrievals: 0 },
      // Epic C1.6: specimens are physical instances of a cultivar (location + growth stage),
      // never a copy of its traits — see cultivars.js's own header comment. Kept as its own
      // array rather than folded into s.entities: nothing here is wired to the free-garden's
      // entity/render system yet (that is C1.7's job), same "rules before rendering" posture
      // already used by cultivars/campaignPot.
      specimens: [],
      specimenNextId: 1,
      // Epic C2.2: the campaign's own daily count, distinct from s.elapsed (the free-garden's
      // simulation tick count, untouched here). Incremented exactly once per "sleep" command,
      // regardless of the hour reached beforehand ("dormir plus tôt", design §3).
      campaignDay: 1,
      // Plain, JSON-serialisable mirror of a fresh game/game/campaign-clock.js CampaignClock
      // (activeSeconds/gameSeconds/paused only — never the class instance itself, nor its
      // transient `_lastWall`, which is not meaningful across a save/reload and is re-armed by
      // whatever wall-clock ticking wires this to the browser in a later epic, same "rules
      // before rendering" posture as campaignPot/specimens above). "sleep" resets gameSeconds to
      // 0 and paused to false: a new day always starts unpaused at 7h.
      campaignClock: {
        activeSeconds: Clock.DEFAULT_ACTIVE_SECONDS,
        gameSeconds: 0,
        paused: false,
      },
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
