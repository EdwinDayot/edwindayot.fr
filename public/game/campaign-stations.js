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

  // Epic C7.20 (design §5, "Replanter... respecte l'étiquette de cultivar ou la famille
  // autorisée" presupposes a zone that can actually fill up): unlike a habitat, a zone's capacity
  // is optional at registration — most of the 45+ existing zone fixtures across the test suite
  // register one with no notion of capacity at all (verified by grep before writing this epic),
  // and none of them are wired to any live command (registerStation("zone", ...) still has no
  // command caller today, exactly as C2.6a's own header comment already noted — only habitat
  // gained one, at C3.3/C6.26). Making capacity a hard requirement for every zone, the way
  // MIN_HABITAT_CAPACITY does for a habitat, would therefore not be additive: it would force an
  // unrelated edit onto dozens of files that register a zone for reasons that have nothing to do
  // with this epic — exactly what orchestration.md's "epics petits et additifs" rules out. A zone
  // *can* be registered with a capacity (design: "nombre maximal de spécimens qu'elle peut porter
  // simultanément"), and when it is, the number must be real and explicit — never a default
  // invented here the way DEFAULT_PANIER_CAPACITY is for a panier, since nothing in the design
  // names a number for a zone. A zone with no capacity simply has none: canRelocateSpecimen
  // (cultivars.js) refuses it explicitly rather than treating it as unlimited or crashing.
  const MIN_ZONE_CAPACITY = 1;

  // Epic C2.6c: a panier additionally carries a `buffer` (item id -> qty), the same shape as
  // automation.js's `e.buffer` (design §5's "récolter... dépose dans un panier"). Only paniers
  // get it — a borne/zone never holds produce — set at creation here rather than defaulted
  // globally in garden-state-lifecycle.js, the same "the factory sets its own new field" posture
  // C2.6b used for a specimen's moistureAt/readyToProduce (see cultivars.js's own header comment).
  function registerStation(registry, kind, { x, z, capacity, allowedCultivarIds }) {
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
    // Epic C7.20: capacity is optional (see MIN_ZONE_CAPACITY's own comment above for why it is
    // never required the way a habitat's is) — set only when the caller actually supplies one, so
    // a zone registered without it stays exactly as bare as before this epic (no invented field).
    // When supplied it must be a real, finite number of at least MIN_ZONE_CAPACITY, same shape of
    // guard as the habitat branch below.
    if (kind === "zone" && capacity !== undefined) {
      if (!Number.isFinite(capacity) || capacity < MIN_ZONE_CAPACITY)
        throw Error(
          `Capacité de zone invalide (minimum ${MIN_ZONE_CAPACITY}) : ${capacity}.`,
        );
      station.capacity = capacity;
    }
    // Epic C7.25 (design §5, "Replanter... respecte l'étiquette de cultivar ou la famille
    // autorisée" — this epic isolates the cultivar-label half only, see cultivars.js's own
    // canRelocateSpecimen comment for why "famille" stays out of scope). Optional, like capacity
    // just above: most existing zone fixtures never pass it, and a zone without it stays exactly
    // as open to any cultivar as before this epic (no empty array invented as a default — an
    // empty array and an absent field both mean "no restriction", but only the caller's own
    // choice is ever stored, never guessed here). Posed as-is, never validated against
    // s.cultivars: a zone can legitimately be registered before any cultivar exists yet, the same
    // reasoning already applied to a specimen's zoneId not requiring the zone to exist first.
    if (kind === "zone" && allowedCultivarIds !== undefined) {
      station.allowedCultivarIds = allowedCultivarIds;
    }
    // Epic C6.26 (design §11, third intensification lever, "extension standardisée sur un espace
    // vivant") : only a zone can carry this flag — a borne/panier is never itself the thing
    // extended over a habitat. Off by default, same "no free capability" posture as veilleuse just
    // above — a zone never preempts a habitat until a command (extendZoneOverHabitat,
    // garden-state-cmd-y.js) explicitly turns it on, and only ever at the real cost of removing a
    // registered habitat (Stations.removeHabitat).
    if (kind === "zone") station.extensionCommerciale = false;
    // Epic C5.4 (design §11, "prise d'eau à fort débit"): only a borne can carry one — a zone/
    // panier is never itself the water intake, only the borne a Rainelle's "arroser" geste
    // resolves as its source (see campaign-automation.js's doArroser/tickArroser). Off by
    // default, same "no free capability" posture as veilleuse just above — a borne never draws
    // extra flow until a command (setPriseFortDebit, garden-state-cmd-q.js) explicitly turns it
    // on, and only ever at the cost of the shared bassin commun (campaign-memory.js).
    if (kind === "borne") station.priseFortDebit = false;
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

  // Epic C7.11 (generalises removeHabitat's pattern to the three other station kinds — the
  // Cartographe's eleventh-lot note in campagne-backlog.md found removeHabitat already wired to a
  // command since C6.10, but no equivalent existed for a borne/zone/panier). Resolves the id's
  // kind through resolveStation itself — never a second, duplicated lookup. A habitat is refused
  // here and pointed at the dedicated removeHabitat command instead: fusing the two would mix
  // removeHabitat's own occupancy invariant (design §6, "un habitat occupé ne peut pas être
  // supprimé sans destination de relogement") into a function that has no such invariant for the
  // other three kinds, and would duplicate that logic rather than reuse it.
  //
  // A zone/borne carries no stock and no population invariant comparable to a habitat's (only
  // flags — veilleuse/extensionCommerciale/priseFortDebit — and a position, verified by reading
  // registerStation above), so removal is unconditional. A panier can hold real produce
  // (buffer), so it refuses while panierTotal(panier) > 0 — design §16's "Saturer puis libérer un
  // bac... conserve les ressources" : removing a station must never make a stock vanish silently.
  // An empty panier removes unconditionally, same as a zone/borne.
  function removeStation(registry, id) {
    const resolved = resolveStation(registry, id);
    if (!resolved.ok) return resolved;
    const { kind, station } = resolved;
    if (kind === "habitat")
      return {
        ok: false,
        error: `"${id}" est un habitat : utiliser la commande removeHabitat, pas removeStation.`,
      };
    if (kind === "panier" && panierTotal(station) > 0)
      return {
        ok: false,
        error: "Ce panier contient encore des produits — le vider avant de le retirer.",
      };
    const collection = KINDS[kind].collection;
    return {
      ok: true,
      registry: {
        ...registry,
        [collection]: registry[collection].filter((s) => s.id !== id),
      },
    };
  }

  // Epic C7.17 (design §5, "Développer le réseau" names "étiquettes" as a comfort feature once
  // paniers/bornes/zones multiply): a player-facing name for a borne/zone/panier, the same
  // generalisation renameCultivar (C1.4) already proved for a cultivar and rainelle.name already
  // proved for a Rainelle — the only station-shaped entity regularly shown to a player that never
  // got this treatment. A habitat is refused: no display site names one today (unlike the other
  // three kinds, verified by reading hud-panel.js/campaign-observation.js), so labelling one would
  // be a feature with nothing to show it — same "refuse what this epic has no destination for"
  // posture as removeStation's own habitat refusal just above.
  //
  // Deliberately asymmetric with renameCultivar on empty input: a cultivar's name is its identity
  // (renameCultivar refuses an empty string), a station's label is a purely optional comfort
  // (design calls it "repérer", never "identité") — an empty string after trim *clears* an
  // existing label instead of being refused, so a player can always undo a label back to the bare
  // id. The field itself is removed from the station object rather than stored as `""`, so a
  // cleared label is indistinguishable from a station that was never labelled.
  function labelStation(registry, id, label) {
    const resolved = resolveStation(registry, id);
    if (!resolved.ok) return resolved;
    const { kind, station } = resolved;
    if (kind === "habitat")
      return {
        ok: false,
        error: `"${id}" est un habitat : aucun affichage ne montre encore son nom, l'étiquetage ne s'y applique pas.`,
      };
    const trimmed = typeof label === "string" ? label.trim() : "";
    if (trimmed.length > 40)
      return { ok: false, error: "Le nom est trop long (40 caractères maximum)." };
    const collection = KINDS[kind].collection;
    return {
      ok: true,
      registry: {
        ...registry,
        [collection]: registry[collection].map((st) => {
          if (st.id !== station.id) return st;
          if (!trimmed) {
            const { label: _drop, ...rest } = st;
            return rest;
          }
          return { ...st, label: trimmed };
        }),
      },
    };
  }

  // Epic C7.18 (design §16, "déplacer un poste... conserve les ressources et libère correctement
  // les réservations"): moves a borne/zone/panier to a new x/z without touching anything else it
  // carries (buffer, capacity, min, veilleuse, priseFortDebit, extensionCommerciale, label) —
  // unlike removeStation, a move never inspects panierTotal: nothing is discarded, so a non-empty
  // panier moves exactly like an empty one. A habitat is refused, same posture as removeStation/
  // labelStation (no command relocates a habitat today, out of scope for this epic).
  //
  // x/z bounds reuse garden-state-validate.js's own ~line 702 bound for a station position
  // (-64..64), already imposed at load time on every station and already enforced at write time
  // by C6.27's convertZoneToLivingSpace for a new habitat — never a bound invented for this epic.
  function relocateStation(registry, id, x, z) {
    const resolved = resolveStation(registry, id);
    if (!resolved.ok) return resolved;
    const { kind, station } = resolved;
    if (kind === "habitat")
      return {
        ok: false,
        error: `"${id}" est un habitat : aucune commande ne déplace un habitat aujourd'hui.`,
      };
    // Lazily resolved, not required at module load time: campaign-stations.js loads before
    // garden-state-util.js in public/index.html (same load-order constraint automation.js's own
    // tickSow already works around the same way, see its own comment).
    const finite =
      typeof module !== "undefined"
        ? require("../garden-state-util.js").finite
        : root.GardenStateParts.util.finite;
    if (!finite(x, -64, 64) || !finite(z, -64, 64))
      return { ok: false, error: "Position invalide (x/z doivent être des nombres entre -64 et 64)." };
    const collection = KINDS[kind].collection;
    return {
      ok: true,
      registry: {
        ...registry,
        [collection]: registry[collection].map((st) =>
          st.id !== station.id ? st : { ...st, x, z },
        ),
      },
    };
  }

  // Epic C7.23 (design §5, "Multiplier une plante -> jeunes plants dans le bac de sortie" /
  // "Replanter... jeunes plants à portée -> emplacements vides d'une zone définie"): a second
  // buffer-key shape, distinct from a bare cultivarId (harvested produce, C2.6c), so a panier can
  // hold both without either being mistaken for the other. See campagne-backlog.md's C7.23 entry
  // ("deux options pesées") for why this generalises the key shape rather than adding a second
  // field alongside buffer: panierTotal/capacity already apply unchanged to any key shape, and no
  // migration is needed (an existing save's buffer only ever has bare keys, still valid as-is).
  const YOUNG_PLANT_PREFIX = "jeune:";

  function youngPlantKey(cultivarId) {
    return `${YOUNG_PLANT_PREFIX}${cultivarId}`;
  }

  // null on anything that isn't exactly "jeune:<non-empty>" — no further shape assumed (never a
  // pattern like `c\d+`): the extracted id's actual validity against s.cultivars is checked by
  // the caller (canDepositYoungPlant/garden-state-validate.js), never guessed from a string here.
  function cultivarIdOfYoungPlantKey(key) {
    if (typeof key !== "string" || !key.startsWith(YOUNG_PLANT_PREFIX)) return null;
    const cultivarId = key.slice(YOUNG_PLANT_PREFIX.length);
    return cultivarId ? cultivarId : null;
  }

  // Shared by canDepositYoungPlant/canWithdrawYoungPlant: resolves panierId to a real panier and
  // cultivarId to a real cultivar, the two refusals both verbs share before their own, distinct,
  // qty check. Takes the full state `s` (not just the registry, unlike resolveStation) because a
  // cultivarId can only be checked for realness against s.cultivars.
  function resolvePanierForYoungPlant(s, panierId, cultivarId) {
    const resolved = resolveStation(s.campaignStations, panierId);
    if (!resolved.ok || resolved.kind !== "panier")
      return { ok: false, error: `Identifiant de panier inconnu : "${panierId}".` };
    if (!s.cultivars?.some((c) => c.id === cultivarId))
      return { ok: false, error: `Identifiant de cultivar inconnu : "${cultivarId}".` };
    return { ok: true, panier: resolved.station };
  }

  // Refuses, without mutating anything: an unknown panierId or one that isn't a panier, an
  // unknown cultivarId, a non-integer/non-positive qty, and a deposit that would push the
  // panier's total (panierTotal, already generic on key shape) past its declared capacity —
  // shared with harvested produce under a bare cultivarId key, never a second ceiling.
  function canDepositYoungPlant(s, panierId, cultivarId, qty) {
    const resolved = resolvePanierForYoungPlant(s, panierId, cultivarId);
    if (!resolved.ok) return resolved;
    if (!Number.isInteger(qty) || qty <= 0)
      return { ok: false, error: `Quantité invalide : ${qty}.` };
    const { panier } = resolved;
    if (panier.capacity !== undefined && panierTotal(panier) + qty > panier.capacity)
      return {
        ok: false,
        error: `Le panier "${panierId}" ne peut pas recevoir ${qty} jeune(s) plant(s) de plus (capacité ${panier.capacity}).`,
      };
    return { ok: true };
  }

  // Rejoue canDepositYoungPlant (jamais une seconde copie du même calcul) puis retourne un
  // campaignStations neuf où seul le panier concerné change, sa clé youngPlantKey(cultivarId)
  // incrémentée (créée si absente) — tous les autres paniers/bornes/zones/habitats et toutes les
  // autres clés du même buffer strictement inchangés, même discipline d'immutabilité que
  // relocateStation/Cultivars.relocateSpecimen.
  function depositYoungPlant(s, panierId, cultivarId, qty) {
    const check = canDepositYoungPlant(s, panierId, cultivarId, qty);
    if (!check.ok) return check;
    const key = youngPlantKey(cultivarId);
    return {
      ok: true,
      registry: {
        ...s.campaignStations,
        paniers: s.campaignStations.paniers.map((p) =>
          p.id !== panierId
            ? p
            : { ...p, buffer: { ...p.buffer, [key]: (p.buffer[key] || 0) + qty } },
        ),
      },
    };
  }

  // Symétrique de canDepositYoungPlant : mêmes refus de panier/cultivarId, plus une qty qui
  // dépasserait le stock actuellement présent sous cette clé (0 si la clé est absente — jamais un
  // accès non défini).
  function canWithdrawYoungPlant(s, panierId, cultivarId, qty) {
    const resolved = resolvePanierForYoungPlant(s, panierId, cultivarId);
    if (!resolved.ok) return resolved;
    if (!Number.isInteger(qty) || qty <= 0)
      return { ok: false, error: `Quantité invalide : ${qty}.` };
    const stock = resolved.panier.buffer[youngPlantKey(cultivarId)] || 0;
    if (qty > stock)
      return {
        ok: false,
        error: `Le panier "${panierId}" ne contient que ${stock} jeune(s) plant(s) de ce cultivar.`,
      };
    return { ok: true };
  }

  // Rejoue canWithdrawYoungPlant puis retourne un campaignStations neuf, même discipline
  // d'immutabilité que depositYoungPlant. Un retrait qui vide exactement la clé la supprime du
  // buffer plutôt que de laisser un 0 traînant — même discipline que tickTransporter's
  // `if (from.buffer[key] <= 0) delete from.buffer[key]` déjà en usage.
  function withdrawYoungPlant(s, panierId, cultivarId, qty) {
    const check = canWithdrawYoungPlant(s, panierId, cultivarId, qty);
    if (!check.ok) return check;
    const key = youngPlantKey(cultivarId);
    return {
      ok: true,
      registry: {
        ...s.campaignStations,
        paniers: s.campaignStations.paniers.map((p) => {
          if (p.id !== panierId) return p;
          const remaining = p.buffer[key] - qty;
          const buffer = { ...p.buffer };
          if (remaining <= 0) delete buffer[key];
          else buffer[key] = remaining;
          return { ...p, buffer };
        }),
      },
    };
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
    MIN_ZONE_CAPACITY,
    registerStation,
    resolveStation,
    panierTotal,
    habitatCapacityTotal,
    freeLivingPlaces,
    removeHabitat,
    removeStation,
    labelStation,
    relocateStation,
    youngPlantKey,
    cultivarIdOfYoungPlantKey,
    canDepositYoungPlant,
    depositYoungPlant,
    canWithdrawYoungPlant,
    withdrawYoungPlant,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignStations = api;
})(globalThis);
