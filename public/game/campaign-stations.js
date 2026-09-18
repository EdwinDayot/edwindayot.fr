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
  };

  // Epic C2.6c: a panier additionally carries a `buffer` (item id -> qty), the same shape as
  // automation.js's `e.buffer` (design §5's "récolter... dépose dans un panier"). Only paniers
  // get it — a borne/zone never holds produce — set at creation here rather than defaulted
  // globally in garden-state-lifecycle.js, the same "the factory sets its own new field" posture
  // C2.6b used for a specimen's moistureAt/readyToProduce (see cultivars.js's own header comment).
  function registerStation(registry, kind, { x, z }) {
    const def = KINDS[kind];
    if (!def) throw Error(`Type de station inconnu : "${kind}".`);
    const station = { id: `${def.prefix}${registry[def.counter]++}`, x, z };
    if (kind === "panier") station.buffer = {};
    registry[def.collection].push(station);
    return station;
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

  const api = { KINDS, registerStation, resolveStation };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignStations = api;
})(globalThis);
