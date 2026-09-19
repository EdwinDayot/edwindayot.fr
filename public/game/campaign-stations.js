/* Campaign stations registry, part of the campaign layer (UMD: node module / browser
   GardenCampaignStations).

   Epic C2.6a is the first tier of C2.6's reformulation (see campagne-backlog.md's journal des
   décisions, 2026-09-18): C2.6's literal criterion ("une Rainelle enseignée à arroser remplit
   son arrosoir à la borne du poste... humidifie les plantes de la zone... dépose dans le panier
   adjacent") needs a place to look up what a `poste`/`source`/`destination` string actually
   names — until now those three fields (design §5, C2.4's `teachGesture`/C2.5's
   `demonstrateGesture`) have been opaque, player-typed strings with no backing entry anywhere.

   This file only declares the registry's shape and a pure resolver against it — it does not
   touch `teachGesture`/`demonstrateGesture` themselves (still free-text, unchanged behaviour),
   and it does not place anything in the 3D world (no campaign scene exists yet to place a
   borne/zone/panier into, same "rules before rendering" gap already left open by C2.2/C2.5 for
   C2.2v/C2.5v). `registerStation` exists so the schema is provably usable (same "pure factory,
   not yet wired to a command" posture as Cultivars.createCultivar/Rainelles.createRainelle at
   their own introduction) — no command calls it yet.

   Three separate collections, not one flat array: design §5's gesture table names three
   distinct kinds of equipment (bornes d'eau, zones/carrés de culture, paniers) with different
   roles in a chain (a borne is a water source, a zone holds plants, a panier holds produce).
   Keeping them apart lets a future epic (C2.6c) validate "this verb's poste must be a zone, not
   a panier" without guessing from an unprefixed id. Resolution itself (`resolveStation`) still
   searches across all three: a single geste field (`poste`/`source`/`destination`) can name any
   of them depending on the verb (see rainelles.js's PHRASE_BUILDERS — "arroser"'s source is a
   borne, its poste a zone; "recolter"'s destination is a panier). */
(function (root) {
  // Distinct id prefixes (b/z/pn) guarantee a station id is never ambiguous between kinds, so
  // resolveStation never has to be told which collection to look in.
  const KINDS = {
    borne: { collection: "bornes", prefix: "b", counter: "borneNextId" },
    zone: { collection: "zones", prefix: "z", counter: "zoneNextId" },
    panier: { collection: "paniers", prefix: "pn", counter: "panierNextId" },
    // Epic C3.3 (design §6 : « le nombre de postes de travail ouvrables dépend des habitats
    // aménagés... un habitat fournit plusieurs places de vie ; son style n'influe pas sur les
    // capacités »). A fifth, disjoint id prefix ("h") keeps resolveStation unambiguous exactly
    // like the first three; a habitat is never a gesture's poste/source/destination (no verb
    // targets one), it only ever appears through the population functions below.
    habitat: { collection: "habitats", prefix: "h", counter: "habitatNextId" },
  };

  // Epic C2.8 (design §5, "Conditions, réservations et lecture des blocages" : "le réglage
  // avancé d'un panier définit un minimum et un maximum"). No command sets these yet (no UI to
  // drive one, same "posed, not wired" gap as buffer at C2.6c) — every panier starts at this
  // pair of defaults. DEFAULT_PANIER_CAPACITY reuses the free garden's own collector reserve
  // (D.recipes.collector.capacity = 24, garden-structure.md's "réserve de 24 productions") as
  // the closest existing precedent for "how much a produce-holding container can hold" rather
  // than inventing an unrelated number; DEFAULT_PANIER_MIN is 0 (no protected floor by default —
  // a panier only protects a reserve once someone deliberately raises its minimum).
  const DEFAULT_PANIER_CAPACITY = 24;
  const DEFAULT_PANIER_MIN = 0;

  // Epic C3.3: design §6 states a habitat "fournit plusieurs places de vie" but never names a
  // number — no default is invented here (unlike DEFAULT_PANIER_CAPACITY, which had a real
  // precedent to borrow from). Capacity is a required argument at registration instead, only
  // bounded below by what "plusieurs" (more than one) literally means.
  const MIN_HABITAT_CAPACITY = 2;

  // Epic C2.6c: a panier additionally carries a `buffer` (item id -> qty), the same shape as
  // automation.js's `e.buffer` (design §5's "récolter... dépose dans un panier"). Only paniers
  // get it — a borne/zone never holds produce — set at creation here rather than defaulted
  // globally in garden-state-lifecycle.js, the same "the factory sets its own new field" posture
  // C2.6b used for a specimen's moistureAt/readyToProduce (see cultivars.js's own header comment).
  function registerStation(registry, kind, { x, z, capacity }) {
    const def = KINDS[kind];
    if (!def) throw Error(`Type de station inconnu : "${kind}".`);
    const station = { id: `${def.prefix}${registry[def.counter]++}`, x, z };
    if (kind === "panier") {
      station.buffer = {};
      station.capacity = DEFAULT_PANIER_CAPACITY;
      station.min = DEFAULT_PANIER_MIN;
    }
    // Epic C5.2 (design §11, "veilleuses de croissance"): only a zone can carry one — a borne/
    // panier is never itself "on watch", only the zone a Rainelle's poste actually points at
    // (see campaign-automation.js's runNightWork). Off by default, same "no free capability"
    // posture as a panier's capacity/min above — a zone never works overnight until a command
    // (setVeilleuse, garden-state-cmd-p.js) explicitly turns it on.
    if (kind === "zone") station.veilleuse = false;
    if (kind === "habitat") {
      if (!Number.isFinite(capacity) || capacity < MIN_HABITAT_CAPACITY)
        throw Error(
          `Capacité d'habitat invalide (minimum ${MIN_HABITAT_CAPACITY}) : ${capacity}.`,
        );
      station.capacity = capacity;
    }
    registry[def.collection].push(station);
    return station;
  }

  // Total living places across every registered habitat — "plusieurs places de vie" summed,
  // never per-habitat occupancy (no command assigns a Rainelle to a specific habitat; the
  // population is only ever compared against the community-wide total, design §6's own framing:
  // "le nombre de postes de travail ouvrables dépend des habitats aménagés").
  function habitatCapacityTotal(registry) {
    return registry.habitats.reduce((n, h) => n + h.capacity, 0);
  }

  // Positive: places still open. Zero or negative: no new birth/arrival fits (a caller compares
  // against > 0, never against truthiness — 0 is a valid, meaningful "none left").
  function freeLivingPlaces(registry, aliveRainelleCount) {
    return habitatCapacityTotal(registry) - aliveRainelleCount;
  }

  // Epic C3.3 (design §6 : « un habitat occupé ne peut pas être supprimé sans destination de
  // relogement »). No per-habitat occupancy is tracked (see habitatCapacityTotal's own comment),
  // so "occupied" is read the only way the current data can support it: removing this habitat
  // would drop the community's total capacity below its actual population. Pure function, not
  // yet wired to a command (no world placement/removal UI exists for any station kind today,
  // borne/zone/panier included) — same "pure factory, not yet a command" posture registerStation
  // itself started at in C2.6a.
  function removeHabitat(registry, habitatId, aliveRainelleCount) {
    const habitat = registry.habitats.find((h) => h.id === habitatId);
    if (!habitat)
      return { ok: false, error: `Identifiant d'habitat inconnu : "${habitatId}".` };
    const remainingCapacity = habitatCapacityTotal(registry) - habitat.capacity;
    if (remainingCapacity < aliveRainelleCount)
      return {
        ok: false,
        error:
          "Cet habitat est occupé : le retirer romprait le nombre de places de vie sous la population actuelle. Prévoir une destination de relogement d'abord.",
      };
    return {
      ok: true,
      registry: {
        ...registry,
        habitats: registry.habitats.filter((h) => h.id !== habitatId),
      },
    };
  }

  // Total items currently held by a panier, across every resource key — the single number both
  // the capacity ceiling and the min floor are compared against (design §5 names both as whole-
  // panier settings, not per-resource ones).
  function panierTotal(panier) {
    return Object.values(panier.buffer).reduce((n, qty) => n + qty, 0);
  }

  // Pure lookup, never a silent `undefined`: an unknown id always comes back as an explicit
  // { ok: false, error } rather than a falsy value a caller might forward unchecked.
  function resolveStation(registry, id) {
    for (const kind of Object.keys(KINDS)) {
      const found = registry[KINDS[kind].collection].find((s) => s.id === id);
      if (found) return { ok: true, kind, station: found };
    }
    return { ok: false, error: `Identifiant de station inconnu : "${id}".` };
  }

  const api = {
    KINDS,
    DEFAULT_PANIER_CAPACITY,
    DEFAULT_PANIER_MIN,
    MIN_HABITAT_CAPACITY,
    registerStation,
    resolveStation,
    panierTotal,
    habitatCapacityTotal,
    freeLivingPlaces,
    removeHabitat,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignStations = api;
})(globalThis);
