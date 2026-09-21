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
  const House =
    typeof module !== "undefined"
      ? require("./game/campaign-house.js")
      : root.GardenCampaignHouse;
  const Memory =
    typeof module !== "undefined"
      ? require("./game/campaign-memory.js")
      : root.GardenCampaignMemory;
  // Epic C1.5: read here to validate a pinned trait (AXES/founders), both on s.campaignPin
  // itself and on an optional pin attached to a pending campaignPot entry below.
  const Genetics =
    typeof module !== "undefined"
      ? require("./game/botany-genetics.js")
      : root.GardenGenetics;
  // Epic C2.6c: only read here for its CYCLE_SECONDS bound on a persisted rainelle.job.remaining
  // (see campaign-automation.js's own header comment on that constant) — never for validate()'s
  // own control flow, so this stays a pure sibling of the Cultivars/Rainelles/Stations reads
  // above rather than a real dependency on tick behaviour.
  const CampaignAutomation =
    typeof module !== "undefined"
      ? require("./game/campaign-automation.js")
      : root.GardenCampaignAutomation;
  // Epic C5.10: a Rainelle's x/z are optional (null until C5.11 assigns a real position,
  // rainelles.js's own createRainelle comment) — the only two valid shapes are "both absent/null"
  // (no position yet) and "both finite world coordinates" (same -64..64 bound already used for
  // s.entities/s.player/specimens/stations elsewhere in this file), never one axis set without
  // the other.
  function badRainellePosition(x, z) {
    const xEmpty = x === undefined || x === null;
    const zEmpty = z === undefined || z === null;
    if (xEmpty !== zEmpty) return true;
    return !xEmpty && (!finite(x, -64, 64) || !finite(z, -64, 64));
  }
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
      ["unlocked", [0, 1, 2, 3, 4]],
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
    // Epic C1.5: a pending pair may carry an optional pin, {axis, speciesId}, consumed from
    // s.campaignPin by sowPot (garden-state-cmd-f.js) — same validity rule as s.campaignPin
    // itself below, plus the constraint sowPot already enforces at the moment it attaches one
    // (speciesId must actually be one of that pair's own a/b).
    const validPendingPin = (p) =>
      p.pin === undefined ||
      (typeof p.pin === "object" &&
        p.pin !== null &&
        Genetics.AXES.includes(p.pin.axis) &&
        Genetics.founders.some((f) => f.id === p.pin.speciesId) &&
        (p.pin.speciesId === p.a || p.pin.speciesId === p.b));
    if (
      s.campaignPot !== undefined &&
      (typeof s.campaignPot !== "object" ||
        s.campaignPot === null ||
        !count(s.campaignPot.capacity) ||
        s.campaignPot.capacity < 1 ||
        !Array.isArray(s.campaignPot.pending) ||
        s.campaignPot.pending.length > s.campaignPot.capacity ||
        s.campaignPot.pending.some(
          (p) =>
            !p ||
            typeof p.a !== "string" ||
            typeof p.b !== "string" ||
            !validPendingPin(p),
        ))
    )
      throw Error("Pot invalide.");
    // Epic C1.5: the single trait pinned for the next sowPot, or none.
    if (
      s.campaignPin !== undefined &&
      s.campaignPin !== null &&
      (typeof s.campaignPin !== "object" ||
        !Genetics.AXES.includes(s.campaignPin.axis) ||
        !Genetics.founders.some((f) => f.id === s.campaignPin.speciesId))
    )
      throw Error("Épingle invalide.");
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
    // Epic C6.12: a single boolean field, same shape discipline as campaignSeedBox.seeded above —
    // no other field exists on this object yet (no position/navigation-graph link, see campaign-
    // passage.js's own header comment).
    if (
      s.campaignPassage !== undefined &&
      (typeof s.campaignPassage !== "object" ||
        s.campaignPassage === null ||
        typeof s.campaignPassage.blocked !== "boolean")
    )
      throw Error("Passage invalide.");
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
    // Epic C6.4: a contract's id must be unique, its cultivarId must resolve to a real cultivar
    // (same discipline as a specimen's own cultivarId just above), and quota/pricePerUnit must be
    // the same positive-integer shape garden-state-cmd-r.js's signContract already enforces at
    // creation — validate() re-checks it rather than trusting a hand-edited save.
    if (
      s.campaignContracts !== undefined &&
      (!Array.isArray(s.campaignContracts) ||
        new Set(s.campaignContracts.map((ct) => ct?.id)).size !==
          s.campaignContracts.length ||
        s.campaignContracts.some(
          (ct) =>
            !ct ||
            !/^ct\d+$/.test(ct.id) ||
            !s.cultivars?.some((c) => c.id === ct.cultivarId) ||
            !count(ct.quota) ||
            ct.quota < 1 ||
            !count(ct.pricePerUnit) ||
            ct.pricePerUnit < 1,
        ))
    )
      throw Error("Contrat commercial invalide.");
    if (s.contractNextId !== undefined && !count(s.contractNextId))
      throw Error("Contrat commercial invalide.");
    if (
      s.campaignContracts?.length &&
      s.contractNextId <=
        Math.max(...s.campaignContracts.map((ct) => Number(ct.id.slice(2))))
    )
      throw Error("Identifiants de contrat invalides.");
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
                !finite(r.job.remaining, 0, CampaignAutomation.CYCLE_SECONDS))) ||
            // Epic C3.4: a bourgeon has no shape of its own beyond "present or not" (see
            // rainelles.js's own comment) — optional so a pre-epic rainelle still loads.
            (r.bourgeon !== undefined &&
              r.bourgeon !== null &&
              r.bourgeon !== true) ||
            // Epic C4.6: founder is optional (a pre-epic save has none yet, migrated below) but
            // must be a boolean when present — see rainelles.js's createRainelle comment.
            (r.founder !== undefined && typeof r.founder !== "boolean") ||
            // Epic C5.10: x/z are optional (see badRainellePosition's own comment).
            badRainellePosition(r.x, r.z),
        ))
    )
      throw Error("Rainelle invalide.");
    // Epic C4.6 (design §10, chapitre 6: "un nom qui ne se perdent jamais dans un lot") : at most
    // one Rainelle can ever carry the founder mark — never a save with two, whether hand-edited
    // or from a future bug, since createRainelle itself only ever sets it once (s.rainelles.length
    // === 0, checked before the very first push).
    if (
      s.rainelles?.length &&
      s.rainelles.filter((r) => r.founder === true).length > 1
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
    // Epic C3.4: a nursery entry only ever carries the cultivarId inherited from the Rainelle
    // whose bourgeon produced it (see rainelles.js's harvestBud comment) — validated against
    // s.cultivars exactly like rainelle.cultivarId is, just above.
    if (
      s.campaignNursery !== undefined &&
      (!Array.isArray(s.campaignNursery) ||
        new Set(s.campaignNursery.map((n) => n?.id)).size !==
          s.campaignNursery.length ||
        s.campaignNursery.some(
          (n) =>
            !n ||
            !/^nu\d+$/.test(n.id) ||
            !s.cultivars?.some((c) => c.id === n.cultivarId),
        ))
    )
      throw Error("Nurserie invalide.");
    if (s.campaignNurseryNextId !== undefined && !count(s.campaignNurseryNextId))
      throw Error("Nurserie invalide.");
    if (
      s.campaignNursery?.length &&
      s.campaignNurseryNextId <=
        Math.max(...s.campaignNursery.map((n) => Number(n.id.slice(2))))
    )
      throw Error("Identifiants de nurserie invalides.");
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
        // Epic C3.3: unlike bornes/zones/paniers (present since C2.6a, whenever campaignStations
        // itself exists at all), a save from before this epic has campaignStations but no
        // habitats collection yet — valid as "not migrated yet", defaulted below rather than
        // rejected here. A save that HAS started a habitats collection is still validated fully.
        if (kind === "habitat" && list === undefined && s.campaignStations[counter] === undefined)
          continue;
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
        // Epic C2.8: capacity/min are optional so a pre-epic panier still loads (defaulted just
        // below, same posture as buffer at C2.6c); when present, both must be finite, capacity
        // strictly positive (a zero-capacity panier could never receive anything, a degenerate
        // state no command can express) and min within [0, capacity] (a floor above the ceiling
        // could never be satisfied).
        if (
          kind === "panier" &&
          list.some(
            (st) =>
              (st.capacity !== undefined && !finite(st.capacity, 1, Infinity)) ||
              (st.min !== undefined &&
                !finite(st.min, 0, st.capacity ?? Infinity)),
          )
        )
          throw Error("Registre de stations invalide.");
        // Epic C3.3: a habitat's capacity is required (no optional/default path — unlike a
        // panier's capacity/min, no pre-epic habitat can exist to migrate), and bounded below by
        // Stations.MIN_HABITAT_CAPACITY (design §6's "plusieurs places de vie", more than one).
        if (
          kind === "habitat" &&
          list.some((st) => !finite(st.capacity, Stations.MIN_HABITAT_CAPACITY, Infinity))
        )
          throw Error("Registre de stations invalide.");
        // Epic C5.2: veilleuse is optional so a pre-epic zone still loads (defaulted to false
        // below, same posture as a panier's buffer/capacity/min at C2.6c/C2.8); when present, it
        // must be a real boolean, never a truthy stand-in (0/1/"true"/etc.).
        if (
          kind === "zone" &&
          list.some((st) => st.veilleuse !== undefined && typeof st.veilleuse !== "boolean")
        )
          throw Error("Registre de stations invalide.");
        // Epic C5.4: priseFortDebit is optional so a pre-epic borne still loads (defaulted to
        // false below, same posture as a zone's veilleuse at C5.2); when present, it must be a
        // real boolean, never a truthy stand-in.
        if (
          kind === "borne" &&
          list.some(
            (st) =>
              st.priseFortDebit !== undefined && typeof st.priseFortDebit !== "boolean",
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
    // Epic C3.1: when present, campaignHouse must already carry all six named spaces (no
    // partial-object migration here — the whole registry is introduced by this epic, so an
    // older save simply lacks the field entirely and gets House.freshHouse() below).
    // Epic C4.1 adds furnitureMarks to the same object: unlike the six spaces, a save from
    // before this epic already has a well-formed campaignHouse but simply lacks this one field
    // (undefined is accepted here, defaulted to null below), same two-level migration already
    // used for campaignStations.habitats further down.
    if (
      s.campaignHouse !== undefined &&
      (typeof s.campaignHouse !== "object" ||
        s.campaignHouse === null ||
        typeof s.campaignHouse.spaces !== "object" ||
        s.campaignHouse.spaces === null ||
        House.SPACE_IDS.some((id) => {
          const space = s.campaignHouse.spaces[id];
          return (
            !space ||
            !["delabre", "repare"].includes(space.status) ||
            typeof space.locked !== "boolean"
          );
        }) ||
        (s.campaignHouse.furnitureMarks !== undefined &&
          s.campaignHouse.furnitureMarks !== null &&
          !House.FURNITURE_TREATMENTS.includes(s.campaignHouse.furnitureMarks)))
    )
      throw Error("Maison refuge invalide.");
    // Epic C3.6: when present, campaignTools must be a flat list of unique string ids — no shape
    // beyond that (unlike cultivars/rainelles, a tool carries no other persisted data yet).
    if (
      s.campaignTools !== undefined &&
      (!Array.isArray(s.campaignTools) ||
        s.campaignTools.some((t) => typeof t !== "string") ||
        new Set(s.campaignTools).size !== s.campaignTools.length)
    )
      throw Error("Outils de campagne invalides.");
    // Epic C4.1: campaignFlags is a flat, unique list of already-revealed narrative text ids —
    // same shape check as campaignTools just above, a distinct field/namespace (a tool id and a
    // text id are never compared against each other).
    if (
      s.campaignFlags !== undefined &&
      (!Array.isArray(s.campaignFlags) ||
        s.campaignFlags.some((f) => typeof f !== "string") ||
        new Set(s.campaignFlags).size !== s.campaignFlags.length)
    )
      throw Error("Indicateurs narratifs invalides.");
    // Epic C5.1/C5.2/C5.3: campaignMemory is a bounded journal (campaign-memory.js), never an
    // arbitrary object — rest/firstGesture/nightlyActivity/overexertion only ever key an id that
    // actually resolves to a real s.rainelles entry (never a stale/hand-edited reference), births
    // is a flat unique list of such ids, manualInterventions a bare count, and the four still-
    // reserved fields (no epic writes real values into them yet, see campaign-memory.js's own
    // header comment) are only type-checked against their fresh() shape so a future epic's first
    // real write still loads.
    if (s.campaignMemory !== undefined) {
      const M = s.campaignMemory;
      const rainelleIds = new Set((s.rainelles || []).map((r) => r?.id));
      // Epic C5.4: waterWithdrawals is keyed by borne id, not Rainelle id — same "must resolve
      // to a real registered entry" discipline as rest/nightlyActivity/overexertion above, just
      // against campaignStations.bornes instead of s.rainelles.
      const borneIds = new Set(
        (s.campaignStations?.bornes || []).map((b) => b?.id),
      );
      // Epic C6.4: contractsFed is keyed by contract id, not Rainelle/borne id — same "must
      // resolve to a real registered entry" discipline as waterWithdrawals above, plus its value
      // can never exceed the contract's own fixed quota (garden-state-cmd-r.js's deliverContract
      // never records more than that, via campaign-contracts.js's deliverableCount).
      const contractsById = new Map(
        (s.campaignContracts || []).map((ct) => [ct?.id, ct]),
      );
      if (
        typeof M !== "object" ||
        M === null ||
        typeof M.rest !== "object" ||
        M.rest === null ||
        Object.entries(M.rest).some(
          ([id, n]) => !rainelleIds.has(id) || !count(n),
        ) ||
        !Array.isArray(M.births) ||
        M.births.some((id) => typeof id !== "string" || !rainelleIds.has(id)) ||
        new Set(M.births).size !== M.births.length ||
        typeof M.firstGesture !== "object" ||
        M.firstGesture === null ||
        Object.entries(M.firstGesture).some(
          ([id, verbe]) => !rainelleIds.has(id) || !Rainelles.VERBS.includes(verbe),
        ) ||
        !count(M.manualInterventions) ||
        // Epic C5.2: nightlyActivity is now a real, written field — validated exactly like rest
        // just above (same per-Rainelle-id-to-count shape, same recordX call-site discipline).
        typeof M.nightlyActivity !== "object" ||
        M.nightlyActivity === null ||
        Object.entries(M.nightlyActivity).some(
          ([id, n]) => !rainelleIds.has(id) || !count(n),
        ) ||
        // Epic C5.3: overexertion is optional here (undefined) so a save from between C5.1 and
        // C5.3 — campaignMemory already present, this field simply never added yet — still
        // validates; the post-clone migration below fills it in. When present, same per-Rainelle-
        // id-to-count shape as rest/nightlyActivity above.
        (M.overexertion !== undefined &&
          (typeof M.overexertion !== "object" ||
            M.overexertion === null ||
            Object.entries(M.overexertion).some(
              ([id, n]) => !rainelleIds.has(id) || !count(n),
            ))) ||
        // Epic C5.4: waterWithdrawals is now a real, written field — validated exactly like
        // rest/nightlyActivity above, keyed against borneIds instead of rainelleIds.
        typeof M.waterWithdrawals !== "object" ||
        M.waterWithdrawals === null ||
        Object.entries(M.waterWithdrawals).some(
          ([id, n]) => !borneIds.has(id) || !count(n),
        ) ||
        !Array.isArray(M.habitatTransformations) ||
        typeof M.unsoldStock !== "object" ||
        M.unsoldStock === null ||
        // Epic C6.4: contractsFed is now a real, written field, but stays optional here exactly
        // like overexertion/persistentGestureIds above — reserved with an empty default since
        // C5.1, so a save can validly carry a campaignMemory that predates this epic's own
        // migration fill-in. When present: keyed against real contract ids, and additionally
        // never exceeding the id's own fixed quota (see contractsById just above), same
        // discipline as waterWithdrawals.
        (M.contractsFed !== undefined &&
          (typeof M.contractsFed !== "object" ||
            M.contractsFed === null ||
            Object.entries(M.contractsFed).some(
              ([id, n]) =>
                !contractsById.has(id) ||
                !count(n) ||
                n > contractsById.get(id).quota,
            ))) ||
        // Epic C5.7: persistentGestureIds is optional here, same reasoning as overexertion above
        // (a save from between C5.1/C5.6 and C5.7 already has campaignMemory but never this
        // field) — the post-clone migration below fills it in. When present, same "flat, unique,
        // must resolve to a real Rainelle id" shape as births.
        (M.persistentGestureIds !== undefined &&
          (!Array.isArray(M.persistentGestureIds) ||
            M.persistentGestureIds.some(
              (id) => typeof id !== "string" || !rainelleIds.has(id),
            ) ||
            new Set(M.persistentGestureIds).size !==
              M.persistentGestureIds.length))
      )
        throw Error("Mémoire de campagne invalide.");
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
    // Epic C3.4: bourgeon migrates per rainelle, same reasoning as job just above — a pre-epic
    // rainelle only lacks this one field.
    // Epic C4.6: founder defaults from array position (index 0, the oldest surviving entry —
    // s.rainelles is append-only, nothing ever removes from it, so index 0 of a pre-epic save is
    // exactly the individual that was in fact created first) only when the field is entirely
    // absent; a rainelle that already carries a real `founder` (from createRainelle, post-epic)
    // keeps it untouched by the spread below.
    // Epic C5.10: x/z migrate per rainelle to `null` (no position yet), same reasoning as job/
    // bourgeon just above — a pre-epic rainelle only lacks these two fields, never guessed from
    // a habitat/spawn coordinate here (that real assignment is C5.11's own job).
    result.rainelles = (result.rainelles ?? []).map((r, i) => ({
      job: null,
      bourgeon: null,
      founder: i === 0,
      x: null,
      z: null,
      ...r,
    }));
    result.rainelleNextId ??= 1;
    result.campaignFrogEncounterPending ??= false;
    result.campaignNursery ??= [];
    result.campaignNurseryNextId ??= 1;
    result.campaignTeaching ??= null;
    result.campaignLastDemonstration ??= null;
    result.campaignStations ??= {
      bornes: [],
      zones: [],
      paniers: [],
      borneNextId: 1,
      zoneNextId: 1,
      panierNextId: 1,
      habitats: [],
      habitatNextId: 1,
    };
    // Epic C3.3: a pre-epic save has campaignStations but no habitats collection at all (the
    // object above only fires when campaignStations itself is entirely missing) — defaulted here
    // too, same two-level migration already used for paniers' buffer/capacity/min just below.
    result.campaignStations.habitats ??= [];
    result.campaignStations.habitatNextId ??= 1;
    // Epic C2.6c/C2.8: buffer/capacity/min migrate per panier, same reasoning — a pre-epic
    // panier only lacks these fields; bornes/zones never had any of them to begin with.
    // DEFAULT_PANIER_CAPACITY/MIN mirror exactly what registerStation itself now sets on a
    // freshly created panier, so a migrated pre-epic panier and a brand-new one start identical.
    result.campaignStations.paniers = (result.campaignStations.paniers ?? []).map(
      (p) => ({
        buffer: {},
        capacity: Stations.DEFAULT_PANIER_CAPACITY,
        min: Stations.DEFAULT_PANIER_MIN,
        ...p,
      }),
    );
    // Epic C5.2: veilleuse migrates per zone, same reasoning as a panier's buffer/capacity/min
    // just above — a pre-epic zone only lacks this one field, defaulted off (no free night work).
    result.campaignStations.zones = (result.campaignStations.zones ?? []).map(
      (z) => ({ veilleuse: false, ...z }),
    );
    // Epic C5.4: priseFortDebit migrates per borne, same reasoning as a zone's veilleuse just
    // above — a pre-epic borne only lacks this one field, defaulted off (no free flow boost).
    result.campaignStations.bornes = (result.campaignStations.bornes ?? []).map(
      (b) => ({ priseFortDebit: false, ...b }),
    );
    result.campaignHouse ??= House.freshHouse();
    // Epic C4.1: a pre-epic save has campaignHouse but no furnitureMarks at all (the object
    // above only fires when campaignHouse itself is entirely missing) — defaulted here too, same
    // two-level migration already used for campaignStations.habitats above.
    result.campaignHouse.furnitureMarks ??= null;
    result.campaignTools ??= [];
    result.campaignFlags ??= [];
    // Epic C1.5: a pre-epic save simply has no pin awaiting its next sowPot.
    result.campaignPin ??= null;
    // Epic C5.1: a pre-epic save simply has no journal yet — fresh, empty, exactly what a new
    // save would already have (never reconstructed from history that was never recorded).
    result.campaignMemory ??= Memory.freshMemory();
    // Epic C5.3: a save with an existing campaignMemory but no overexertion field yet (created
    // between C5.1 and C5.3) migrates to an empty streak map — never guessed from nightlyActivity
    // history that was never recorded as a streak.
    result.campaignMemory.overexertion ??= {};
    // Epic C5.7: a save with an existing campaignMemory but no persistentGestureIds field yet
    // (created between C5.1/C5.6 and C5.7) migrates to an empty list — never guessed from
    // overexertion history that never recorded which Rainelle was actually caught persisting.
    result.campaignMemory.persistentGestureIds ??= [];
    // Epic C6.4: a save with an existing campaignMemory but no contractsFed field yet (created
    // before this epic) migrates to an empty map — never guessed from a delivery that was never
    // recorded. campaignContracts/contractNextId migrate the same "simply absent before this
    // epic" way as specimens/cultivars did at their own introduction.
    result.campaignMemory.contractsFed ??= {};
    result.campaignContracts ??= [];
    result.contractNextId ??= 1;
    // Epic C6.12: a pre-epic save simply has no passage state yet — defaults blocked, same
    // "simply absent before this epic" posture as campaignContracts/contractNextId just above.
    result.campaignPassage ??= { blocked: true };
    return result;
  }
  if (typeof module !== "undefined") module.exports = { validate };
  else
    (root.GardenStateParts = root.GardenStateParts || {}).validate = validate;
})(globalThis);
