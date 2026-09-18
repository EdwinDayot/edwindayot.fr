/* Save-file validation, part of garden-state (UMD: node module / browser GardenStateParts). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const C =
    typeof module !== "undefined"
      ? require("./game/construction.js")
      : root.GardenConstruction;
  const I =
    typeof module !== "undefined"
      ? require("./game/irrigation.js")
      : root.GardenIrrigation;
  const { clone, finite, count, plant, knownItem } =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  const { migrateLandscape } =
    typeof module !== "undefined"
      ? require("./garden-state-migrate.js")
      : { migrateLandscape: root.GardenStateParts.migrateLandscape };
  const Clock =
    typeof module !== "undefined"
      ? require("./game/campaign-clock.js")
      : root.GardenCampaignClock;
  const Rainelles =
    typeof module !== "undefined"
      ? require("./game/rainelles.js")
      : root.GardenRainelles;
  const Stations =
    typeof module !== "undefined"
      ? require("./game/campaign-stations.js")
      : root.GardenCampaignStations;
  const Cultivars =
    typeof module !== "undefined"
      ? require("./game/cultivars.js")
      : root.GardenCultivars;
  // Epic C2.6c: only read here for its CYCLE_SECONDS bound on a persisted rainelle.job.remaining
  // (see campaign-automation.js's own header comment on that constant) — never for validate()'s
  // own control flow, so this stays a pure sibling of the Cultivars/Rainelles/Stations reads
  // above rather than a real dependency on tick behaviour.
  const CampaignAutomation =
    typeof module !== "undefined"
      ? require("./game/campaign-automation.js")
      : root.GardenCampaignAutomation;
  function validate(s) {
    s = migrateLandscape(s);
    if (
      !s ||
      s.version !== 3 ||
      !finite(s.updatedAt, 0, Number.MAX_SAFE_INTEGER) ||
      !count(s.nextId) ||
      !finite(s.elapsed) ||
      !finite(s.remainder, 0, 1) ||
      !finite(s.water, 0, 100)
    )
      throw Error("Format de sauvegarde invalide.");
    if (
      !s.inventory ||
      Object.entries(s.inventory).some(([id, n]) => !knownItem(id) || !count(n))
    )
      throw Error("Inventaire invalide.");
    if (
      !Array.isArray(s.entities) ||
      s.entities.length > 240 ||
      !Array.isArray(s.links) ||
      s.links.length > 1000
    )
      throw Error("Entités invalides.");
    const ids = new Set();
    for (const e of s.entities) {
      if (
        !/^e\d+$/.test(e.id) ||
        ids.has(e.id) ||
        !D.recipes[e.type] ||
        !finite(e.x, -64, 64) ||
        !finite(e.z, -64, 64) ||
        !count(e.rotation) ||
        e.rotation > 3 ||
        typeof e.stored !== "boolean"
      )
        throw Error("Objet invalide.");
      ids.add(e.id);
      if (
        e.plant &&
        (!I.isPot(e) ||
          !D.species.some((p) => p.id === e.plant.species) ||
          !finite(e.plant.growth, 0, 1) ||
          !finite(e.plant.moisture, 0, 100) ||
          !finite(e.plant.progress, 0, 300) ||
          !count(e.plant.ready) ||
          e.plant.ready > 3 ||
          (e.plant.boostUntil !== undefined &&
            !finite(e.plant.boostUntil, 0, Number.MAX_SAFE_INTEGER)))
      )
        throw Error("Plante invalide.");
      if (e.type === "tank" && !finite(e.water, 0, 160))
        throw Error("Citerne invalide.");
      if (
        (D.recipes[e.type]?.buffer ||
          D.recipes[e.type]?.sow ||
          D.recipes[e.type]?.dispense) &&
        (!e.buffer ||
          Object.entries(e.buffer).some(
            ([k, v]) => !knownItem(k) || !count(v),
          ) ||
          Object.values(e.buffer).reduce((a, b) => a + b, 0) >
            D.recipes[e.type].capacity)
      )
        throw Error("Réserve invalide.");
      if (
        e.job &&
        (!D.species.some((p) => p.id === e.job.species) ||
          !finite(e.job.remaining, 0, 180) ||
          e.type !== "nursery")
      )
        throw Error("Multiplication invalide.");
    }
    if (s.nextId <= Math.max(0, ...[...ids].map((id) => Number(id.slice(1)))))
      throw Error("Identifiants invalides.");
    if (
      s.links.some(
        (pair) =>
          !Array.isArray(pair) ||
          pair.length !== 2 ||
          !I.validLink(
            s.entities.find((e) => e.id === pair[0]),
            s.entities.find((e) => e.id === pair[1]),
          ),
      )
    )
      throw Error("Raccordement invalide.");
    if (
      I.components(s).some(
        (group) =>
          new Set(
            group
              .filter((e) => I.SOURCE.includes(e.type))
              .map((e) => D.recipes[e.type].substance),
          ).size > 1,
      )
    )
      throw Error(
        "Réseau invalide : substances incompatibles reliées ensemble.",
      );
    for (const [key, allowed] of [
      ["unlocked", [0, 1, 2, 3]],
      ["discovered", D.species.map((p) => p.id)],
      ["plans", Object.keys(D.recipes)],
      ["botanyRewards", [3, 6, 9, 12]],
    ])
      if (
        !Array.isArray(s[key]) ||
        new Set(s[key]).size !== s[key].length ||
        s[key].some((v) => !allowed.includes(v))
      )
        throw Error("Progression invalide.");
    if (
      !s.unlocked.includes(0) ||
      !count(s.reputation) ||
      !count(s.trades) ||
      !count(s.requestSerial) ||
      !count(s.irrigationCursor)
    )
      throw Error("Progression invalide.");
    if (
      !Array.isArray(s.requests) ||
      s.requests.length !== 3 ||
      new Set(s.requests.map((r) => r.id)).size !== 3 ||
      s.requests.some(
        (r) =>
          !count(r.id) ||
          !knownItem(r.item) ||
          !["seed", "cutting", "flower"].includes(r.item.split(":")[0]) ||
          !s.discovered.includes(r.item.split(":")[1]) ||
          !count(r.quantity) ||
          r.quantity < 1 ||
          r.quantity > 3,
      )
    )
      throw Error("Demande invalide.");
    if (
      !Array.isArray(s.resources) ||
      s.resources.length !== D.resources.length ||
      s.resources.some(
        (r, i) =>
          r.id !== D.resources[i].id ||
          !finite(r.ready) ||
          r.x !== D.resources[i].x ||
          r.z !== D.resources[i].z ||
          r.type !== D.resources[i].type ||
          r.zone !== D.resources[i].zone ||
          r.treeId !== D.resources[i].treeId ||
          (r.work !== undefined &&
            (!count(r.work) || r.work >= D.mining[r.type].hits)) ||
          (r.nextHit !== undefined && !finite(r.nextHit)),
      )
    )
      throw Error("Ressource invalide.");
    if (
      !s.settings ||
      ["hints", "sound", "reduced"].some(
        (k) => typeof s.settings[k] !== "boolean",
      ) ||
      !s.stats ||
      ["produced", "collected", "waterUsed"].some((k) => !finite(s.stats[k]))
    )
      throw Error("Réglages invalides.");
    if (
      s.entities.some(
        (e) =>
          !e.stored &&
          (!C.zoneAt(e.x, e.z) ||
            !s.unlocked.includes(C.zoneAt(e.x, e.z).id) ||
            (e.x * 2) % 1 ||
            (e.z * 2) % 1),
      )
    )
      throw Error("Emplacement invalide.");
    if (!C.walkable(s, 0, 4))
      throw Error("Le chemin central doit rester accessible.");
    const active = s.entities.filter((e) => !e.stored);
    for (let a = 0; a < active.length; a++)
      for (let b = a + 1; b < active.length; b++)
        if (
          C.distance(active[a], active[b]) <
          C.radius(active[a]) + C.radius(active[b]) + 0.075
        )
          throw Error("Deux objets se chevauchent.");
    if (
      s.entities.filter(I.isPot).length >
        Math.min(48, s.unlocked.length * 12) ||
      s.entities.filter((e) => !I.isPot(e)).length > 192
    )
      throw Error("Capacité dépassée.");
    if (
      s.player !== undefined &&
      (!finite(s.player.x, -64, 64) || !finite(s.player.z, -64, 64))
    )
      throw Error("Position invalide.");
    if (
      s.hotbar !== undefined &&
      (!Array.isArray(s.hotbar) ||
        s.hotbar.length !== 5 ||
        s.hotbar.some(
          (id) =>
            typeof id !== "string" ||
            !(
              D.tools[id] ||
              D.recipes[id] ||
              (/^(seed|young|cutting):/.test(id) && knownItem(id))
            ),
        ))
    )
      throw Error("Barre rapide invalide.");
    if (
      s.quests !== undefined &&
      (typeof s.quests !== "object" ||
        s.quests === null ||
        !Array.isArray(s.quests.active) ||
        !Array.isArray(s.quests.completed) ||
        s.quests.active.some(
          (q) =>
            !q ||
            typeof q.id !== "string" ||
            !D.quests[q.questId] ||
            typeof q.npcId !== "string" ||
            typeof q.progress !== "object" ||
            q.progress === null,
        ) ||
        s.quests.completed.some((id) => !D.quests[id]))
    )
      throw Error("Quêtes invalides.");
    if (
      s.cultivars !== undefined &&
      (!Array.isArray(s.cultivars) ||
        new Set(s.cultivars.map((c) => c?.id)).size !== s.cultivars.length ||
        s.cultivars.some(
          (c) =>
            !c ||
            !/^c\d+$/.test(c.id) ||
            typeof c.name !== "string" ||
            !Array.isArray(c.parentIds) ||
            c.parentIds.length > 2 ||
            c.parentIds.some((p) => typeof p !== "string") ||
            typeof c.traits !== "object" ||
            c.traits === null ||
            (c.disposition !== undefined &&
              !["kept", "stored", "given", "composted"].includes(
                c.disposition,
              )),
        ))
    )
      throw Error("Cultivar invalide.");
    if (s.cultivarNextId !== undefined && !count(s.cultivarNextId))
      throw Error("Cultivar invalide.");
    if (
      s.cultivars?.length &&
      s.cultivarNextId <=
        Math.max(...s.cultivars.map((c) => Number(c.id.slice(1))))
    )
      throw Error("Identifiants de cultivar invalides.");
    if (
      s.campaignPot !== undefined &&
      (typeof s.campaignPot !== "object" ||
        s.campaignPot === null ||
        !count(s.campaignPot.capacity) ||
        s.campaignPot.capacity < 1 ||
        !Array.isArray(s.campaignPot.pending) ||
        s.campaignPot.pending.length > s.campaignPot.capacity ||
        s.campaignPot.pending.some(
          (p) => !p || typeof p.a !== "string" || typeof p.b !== "string",
        ))
    )
      throw Error("Pot invalide.");
    if (
      s.campaignSeedBox !== undefined &&
      (typeof s.campaignSeedBox !== "object" ||
        s.campaignSeedBox === null ||
        typeof s.campaignSeedBox.seeded !== "boolean" ||
        (s.campaignSeedBox.cultivarId !== null &&
          typeof s.campaignSeedBox.cultivarId !== "string") ||
        !count(s.campaignSeedBox.retrievals))
    )
      throw Error("Boîte de semences invalide.");
    if (
      s.specimens !== undefined &&
      (!Array.isArray(s.specimens) ||
        new Set(s.specimens.map((sp) => sp?.id)).size !== s.specimens.length ||
        s.specimens.some(
          (sp) =>
            !sp ||
            !/^sp\d+$/.test(sp.id) ||
            !s.cultivars?.some((c) => c.id === sp.cultivarId) ||
            !finite(sp.x, -64, 64) ||
            !finite(sp.z, -64, 64) ||
            !count(sp.stage) ||
            (sp.moistureAt !== undefined &&
              !finite(sp.moistureAt, 0, Number.MAX_SAFE_INTEGER)) ||
            (sp.readyToProduce !== undefined &&
              typeof sp.readyToProduce !== "boolean") ||
            (sp.readyToProduce === true && !Cultivars.isMature(sp)),
        ))
    )
      throw Error("Spécimen invalide.");
    if (s.specimenNextId !== undefined && !count(s.specimenNextId))
      throw Error("Spécimen invalide.");
    if (
      s.specimens?.length &&
      s.specimenNextId <=
        Math.max(...s.specimens.map((sp) => Number(sp.id.slice(2))))
    )
      throw Error("Identifiants de spécimen invalides.");
    if (
      s.campaignDay !== undefined &&
      (!count(s.campaignDay) || s.campaignDay < 1)
    )
      throw Error("Jour de campagne invalide.");
    if (
      s.campaignClock !== undefined &&
      (typeof s.campaignClock !== "object" ||
        s.campaignClock === null ||
        !finite(s.campaignClock.activeSeconds, 1, Number.MAX_SAFE_INTEGER) ||
        !finite(s.campaignClock.gameSeconds, 0, Clock.DAY_SECONDS) ||
        typeof s.campaignClock.paused !== "boolean")
    )
      throw Error("Horloge de campagne invalide.");
    if (
      s.rainelles !== undefined &&
      (!Array.isArray(s.rainelles) ||
        new Set(s.rainelles.map((r) => r?.id)).size !== s.rainelles.length ||
        s.rainelles.some(
          (r) =>
            !r ||
            !/^r\d+$/.test(r.id) ||
            !s.cultivars?.some((c) => c.id === r.cultivarId) ||
            typeof r.name !== "string" ||
            (r.geste !== undefined &&
              r.geste !== null &&
              (typeof r.geste !== "object" ||
                !Rainelles.VERBS.includes(r.geste.verbe) ||
                typeof r.geste.poste !== "string" ||
                !r.geste.poste ||
                typeof r.geste.source !== "string" ||
                !r.geste.source ||
                typeof r.geste.destination !== "string" ||
                !r.geste.destination ||
                typeof r.geste.condition !== "string")) ||
            // Epic C2.6c: job is optional (a pre-epic save, or a Rainelle whose gesture never
            // reached a valid station, has none) but well-formed when present — the same
            // countdown shape as automation.js's own e.job.
            (r.job !== undefined &&
              r.job !== null &&
              (typeof r.job !== "object" ||
                !finite(r.job.remaining, 0, CampaignAutomation.CYCLE_SECONDS))),
        ))
    )
      throw Error("Rainelle invalide.");
    if (s.rainelleNextId !== undefined && !count(s.rainelleNextId))
      throw Error("Rainelle invalide.");
    if (
      s.rainelles?.length &&
      s.rainelleNextId <=
        Math.max(...s.rainelles.map((r) => Number(r.id.slice(1))))
    )
      throw Error("Identifiants de rainelle invalides.");
    if (
      s.campaignFrogEncounterPending !== undefined &&
      typeof s.campaignFrogEncounterPending !== "boolean"
    )
      throw Error("Rencontre de la grenouille invalide.");
    // A gesture-shaped object (verbe/poste/source/destination/condition), the same fields
    // rainelle.geste already validates above — shared here so campaignTeaching's draft and
    // campaignLastDemonstration can't silently drift from what a Rainelle is actually allowed
    // to remember.
    const validGesteFields = (g) =>
      g &&
      typeof g === "object" &&
      Rainelles.VERBS.includes(g.verbe) &&
      typeof g.poste === "string" &&
      g.poste &&
      typeof g.source === "string" &&
      g.source &&
      typeof g.destination === "string" &&
      g.destination &&
      typeof g.condition === "string";
    if (
      s.campaignTeaching !== undefined &&
      s.campaignTeaching !== null &&
      (typeof s.campaignTeaching !== "object" ||
        !s.rainelles?.some((r) => r.id === s.campaignTeaching.rainelleId) ||
        !["watching", "reviewing"].includes(s.campaignTeaching.step) ||
        (s.campaignTeaching.step === "watching" &&
          s.campaignTeaching.draft !== null) ||
        (s.campaignTeaching.step === "reviewing" &&
          (!validGesteFields(s.campaignTeaching.draft) ||
            typeof s.campaignTeaching.draft.phrase !== "string" ||
            !s.campaignTeaching.draft.phrase ||
            s.campaignTeaching.draft.phrase.length > 240 ||
            !Array.isArray(s.campaignTeaching.draft.trajectory) ||
            s.campaignTeaching.draft.trajectory.length < 1 ||
            s.campaignTeaching.draft.trajectory.length > 3 ||
            s.campaignTeaching.draft.trajectory.some(
              (step) => typeof step !== "string" || !step,
            ))))
    )
      throw Error("Leçon en cours invalide.");
    if (
      s.campaignLastDemonstration !== undefined &&
      s.campaignLastDemonstration !== null &&
      !validGesteFields(s.campaignLastDemonstration)
    )
      throw Error("Dernière démonstration invalide.");
    if (s.campaignStations !== undefined) {
      if (typeof s.campaignStations !== "object" || s.campaignStations === null)
        throw Error("Registre de stations invalide.");
      // No cross-collection uniqueness check needed: distinct prefixes (b/z/pn) already make a
      // borne/zone/panier id disjoint by construction, so per-collection uniqueness suffices.
      for (const kind of Object.keys(Stations.KINDS)) {
        const { collection, prefix, counter } = Stations.KINDS[kind];
        const list = s.campaignStations[collection];
        if (
          !Array.isArray(list) ||
          new Set(list.map((st) => st?.id)).size !== list.length ||
          list.some(
            (st) =>
              !st ||
              !new RegExp(`^${prefix}\\d+$`).test(st.id) ||
              !finite(st.x, -64, 64) ||
              !finite(st.z, -64, 64),
          )
        )
          throw Error("Registre de stations invalide.");
        // Epic C2.6c: only a panier carries a buffer (item id -> qty, same shape as
        // automation.js's own e.buffer); optional so a pre-epic panier still loads, well-formed
        // when present. cultivarId is used as the buffer's key (see campaign-automation.js's own
        // tickRecolter comment) so a valid key is any known cultivar, not knownItem() — a
        // campaign cultivar was never an inventory item to begin with.
        if (
          kind === "panier" &&
          list.some(
            (st) =>
              st.buffer !== undefined &&
              (typeof st.buffer !== "object" ||
                st.buffer === null ||
                Object.entries(st.buffer).some(
                  ([cultivarId, qty]) =>
                    !s.cultivars?.some((c) => c.id === cultivarId) || !count(qty),
                )),
          )
        )
          throw Error("Registre de stations invalide.");
        if (!count(s.campaignStations[counter]))
          throw Error("Registre de stations invalide.");
        if (
          list.length &&
          s.campaignStations[counter] <=
            Math.max(...list.map((st) => Number(st.id.slice(prefix.length))))
        )
          throw Error("Identifiants de station invalides.");
      }
    }
    const result = clone(s);
    result.hotbar ??= [...D.defaultHotbar];
    result.quests ??= { active: [], completed: [] };
    result.cultivars ??= [];
    result.cultivarNextId ??= 1;
    result.campaignPot ??= { capacity: 1, pending: [] };
    result.campaignSeedBox ??= { seeded: false, cultivarId: null, retrievals: 0 };
    // Epic C2.6b: moistureAt/readyToProduce migrate per specimen, not just the array as a whole
    // — a pre-epic specimen only lacks these two fields, defaulted here rather than left
    // undefined so specimenMoisture/setReadyToProduce always see a well-formed specimen.
    // moistureAt defaults to "fully moist as of right now" (the save's own s.elapsed) rather
    // than 0, so a specimen from before this epic doesn't retroactively look bone dry.
    result.specimens = (result.specimens ?? []).map((sp) => ({
      moistureAt: s.elapsed ?? 0,
      readyToProduce: false,
      ...sp,
    }));
    result.specimenNextId ??= 1;
    result.campaignDay ??= 1;
    result.campaignClock ??= {
      activeSeconds: Clock.DEFAULT_ACTIVE_SECONDS,
      gameSeconds: 0,
      paused: false,
    };
    // Epic C2.6c: job migrates per rainelle, same reasoning as specimens' moistureAt/
    // readyToProduce just above — a pre-epic rainelle only lacks this one field.
    result.rainelles = (result.rainelles ?? []).map((r) => ({
      job: null,
      ...r,
    }));
    result.rainelleNextId ??= 1;
    result.campaignFrogEncounterPending ??= false;
    result.campaignTeaching ??= null;
    result.campaignLastDemonstration ??= null;
    result.campaignStations ??= {
      bornes: [],
      zones: [],
      paniers: [],
      borneNextId: 1,
      zoneNextId: 1,
      panierNextId: 1,
    };
    // Epic C2.6c: buffer migrates per panier, same reasoning — a pre-epic (C2.6a) panier only
    // lacks this one field; bornes/zones never had one to begin with.
    result.campaignStations.paniers = (result.campaignStations.paniers ?? []).map(
      (p) => ({ buffer: {}, ...p }),
    );
    return result;
  }
  if (typeof module !== "undefined") module.exports = { validate };
  else
    (root.GardenStateParts = root.GardenStateParts || {}).validate = validate;
})(globalThis);
