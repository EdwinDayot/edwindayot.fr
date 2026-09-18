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
  const House =
    typeof module !== "undefined"
      ? require("./game/campaign-house.js")
      : root.GardenCampaignHouse;
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
      // Zone 4 ("Le coin de village", Épic C3.5) is always unlocked like
      // zone0: it has no cost/rep gate of its own (data-world.js), and it
      // only borders zone0, so a locked-by-default zone4 would be an
      // unreachable island whenever zone1/2/3 are still locked.
      unlocked: [0, 4],
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
      // Epic C2.3: the first Rainelle is born the night a scripted frog encounter (armed by the
      // triggerFrogEncounter command, garden-state-cmd-i.js) resolves against an actual pot
      // draw, in "sleep" (garden-state-cmd-f.js). rainelles stays its own array, not folded into
      // s.entities, same "rules before rendering" posture as specimens/cultivars above — no
      // world placement or automation exists for a Rainelle yet.
      rainelles: [],
      rainelleNextId: 1,
      campaignFrogEncounterPending: false,
      // Epic C3.4: a bourgeon prélevé (harvestBud, garden-state-cmd-m.js) waits here — a plain
      // FIFO of { id, cultivarId } — until the next "sleep" resolves each entry into a brand-new
      // Rainelle (garden-state-cmd-f.js), the same "posed, then resolved at the next sleep"
      // pattern as campaignPot.pending. A reload mid-maturation can therefore never wake it early
      // or twice: resolution only ever happens inside the sleep command itself, never on load.
      campaignNursery: [],
      campaignNurseryNextId: 1,
      // Epic C2.5: null outside a lesson. While a lesson runs, {rainelleId, step, draft} —
      // step "watching" (just after "Regarde-moi", clock paused, no draft yet) or "reviewing"
      // (a demonstration was captured; draft holds {verbe, poste, source, destination,
      // condition, phrase, trajectory} pending confirmTeaching/cancelTeaching). See
      // garden-state-cmd-k.js.
      campaignTeaching: null,
      // Epic C2.5: the last gesture a lesson actually confirmed (verbe/poste/source/destination/
      // condition only, no phrase/trajectory — those are draft-only, not part of what a Rainelle
      // remembers). null until the very first confirmTeaching. Reapplied as-is by
      // teachGestureQuick, design §5's "courte répétition... sans refaire tout le tutoriel".
      campaignLastDemonstration: null,
      // Epic C2.6a: registry of water bornes/culture zones/paniers a gesture's poste/source/
      // destination can eventually resolve against (see campaign-stations.js's own header
      // comment). Empty on a fresh save — no command places a station yet, same "posed, not
      // wired" gap as specimens/rainelles at their own introduction.
      campaignStations: {
        bornes: [],
        zones: [],
        paniers: [],
        borneNextId: 1,
        zoneNextId: 1,
        panierNextId: 1,
        // Epic C3.3: fourth collection, living places (design §6) — see campaign-stations.js's
        // own header comment for why it lives here rather than in a separate field.
        habitats: [],
        habitatNextId: 1,
      },
      // Epic C3.1: the refuge house's six named spaces (design §6), delabre/locked by default
      // except the reception room (locked: false, still delabre — see campaign-house.js's own
      // header comment for why unlocked and repaired are kept distinct).
      campaignHouse: House.freshHouse(),
      // Epic C3.6: named tools granted by quest completion (reward.tools, garden-state-cmd-e.js),
      // a plain list of string ids — no mechanical effect yet (no campaign construction gesture
      // consumes a tool as a prerequisite today), same "posed, not wired" gap already documented
      // at specimens/rainelles/campaignStations above.
      campaignTools: [],
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
