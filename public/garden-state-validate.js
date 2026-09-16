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
    const result = clone(s);
    result.hotbar ??= [...D.defaultHotbar];
    result.quests ??= { active: [], completed: [] };
    return result;
  }
  if (typeof module !== "undefined") module.exports = { validate };
  else
    (root.GardenStateParts = root.GardenStateParts || {}).validate = validate;
})(globalThis);
