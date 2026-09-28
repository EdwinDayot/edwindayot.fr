const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");

// Epic C2.6a (first tier of C2.6's reformulation, see campagne-backlog.md's journal des
// décisions, 2026-09-18) : un registre de bornes d'eau/zones de culture/paniers de campagne,
// chacun avec un id stable et une position, plus une fonction pure de résolution contre ce
// registre. Aucune commande de geste n'est câblée dessus ici (teachGesture/demonstrateGesture
// restent du texte libre, comportement inchangé) : voir campaign-stations.js pour la raison.
//
// Epic C3.3 ajoute une quatrième collection, `habitats` (design §5/§6 : « le nombre de postes de
// travail ouvrables dépend des habitats aménagés... un habitat fournit plusieurs places de vie »).
// Toutes les fixtures de registre ci-dessus incluent donc désormais `habitats`/`habitatNextId`,
// vides par défaut — voir tests/campaign-habitats.cjs pour les tests dédiés à cette collection.

test("a fresh campaign save declares an empty stations registry with all four collections", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.campaignStations, {
    bornes: [],
    zones: [],
    paniers: [],
    borneNextId: 1,
    zoneNextId: 1,
    panierNextId: 1,
    habitats: [],
    habitatNextId: 1,
  });
});

test("registerStation assigns a stable, kind-prefixed id and appends to the right collection", () => {
  const registry = {
    bornes: [],
    zones: [],
    paniers: [],
    borneNextId: 1,
    zoneNextId: 1,
    panierNextId: 1,
    habitats: [],
    habitatNextId: 1,
  };
  const borne = Stations.registerStation(registry, "borne", { x: 1, z: 2 });
  const zone = Stations.registerStation(registry, "zone", { x: 3, z: 4 });
  const panier = Stations.registerStation(registry, "panier", { x: 5, z: 6 });
  // Epic C5.4: a borne also carries its `priseFortDebit` flag at creation, off by default
  // (design §11's "prise d'eau à fort débit" — see campaign-stations.js's own comment on
  // registerStation).
  assert.deepEqual(borne, { id: "b1", x: 1, z: 2, priseFortDebit: false });
  // Epic C5.2: a zone also carries its `veilleuse` flag at creation, off by default (design §11's
  // "veilleuses de croissance" — see campaign-stations.js's own comment on registerStation).
  // Epic C6.26: and its `extensionCommerciale` flag, also off by default (design §11's third
  // lever, "extension standardisée sur un espace vivant").
  assert.deepEqual(zone, {
    id: "z1",
    x: 3,
    z: 4,
    veilleuse: false,
    extensionCommerciale: false,
  });
  // Epic C2.6c: a panier also carries an empty buffer at creation (design §5's "récolter...
  // dépose dans un panier"; see campaign-stations.js's own comment on registerStation).
  // Epic C2.8: capacity/min too (design §5's "réglage avancé... minimum et maximum").
  assert.deepEqual(panier, {
    id: "pn1",
    x: 5,
    z: 6,
    buffer: {},
    capacity: Stations.DEFAULT_PANIER_CAPACITY,
    min: Stations.DEFAULT_PANIER_MIN,
  });
  assert.deepEqual(registry.bornes, [borne]);
  assert.deepEqual(registry.zones, [zone]);
  assert.deepEqual(registry.paniers, [panier]);
});

test("registerStation increments a per-kind counter, never reusing an id even across kinds", () => {
  const registry = {
    bornes: [],
    zones: [],
    paniers: [],
    borneNextId: 1,
    zoneNextId: 1,
    panierNextId: 1,
    habitats: [],
    habitatNextId: 1,
  };
  const b1 = Stations.registerStation(registry, "borne", { x: 0, z: 0 });
  const b2 = Stations.registerStation(registry, "borne", { x: 1, z: 0 });
  assert.equal(b1.id, "b1");
  assert.equal(b2.id, "b2");
  assert.equal(registry.borneNextId, 3);
  // Different collections start their own counters at 1 — never a shared global counter.
  const z1 = Stations.registerStation(registry, "zone", { x: 0, z: 1 });
  assert.equal(z1.id, "z1");
});

test("registerStation refuses an unknown kind, never silently creating a malformed entry", () => {
  const registry = {
    bornes: [],
    zones: [],
    paniers: [],
    borneNextId: 1,
    zoneNextId: 1,
    panierNextId: 1,
    habitats: [],
    habitatNextId: 1,
  };
  assert.throws(() => Stations.registerStation(registry, "arbre", { x: 0, z: 0 }));
  assert.equal(registry.bornes.length, 0);
  assert.equal(registry.zones.length, 0);
  assert.equal(registry.paniers.length, 0);
});

test("resolveStation finds a known id in any of the three collections", () => {
  const registry = {
    bornes: [],
    zones: [],
    paniers: [],
    borneNextId: 1,
    zoneNextId: 1,
    panierNextId: 1,
    habitats: [],
    habitatNextId: 1,
  };
  const borne = Stations.registerStation(registry, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(registry, "zone", { x: 1, z: 1 });
  const panier = Stations.registerStation(registry, "panier", { x: 2, z: 2 });
  assert.deepEqual(Stations.resolveStation(registry, borne.id), {
    ok: true,
    kind: "borne",
    station: borne,
  });
  assert.deepEqual(Stations.resolveStation(registry, zone.id), {
    ok: true,
    kind: "zone",
    station: zone,
  });
  assert.deepEqual(Stations.resolveStation(registry, panier.id), {
    ok: true,
    kind: "panier",
    station: panier,
  });
});

test("resolveStation fails explicitly on an unknown id — never a silent undefined", () => {
  const registry = {
    bornes: [],
    zones: [],
    paniers: [],
    borneNextId: 1,
    zoneNextId: 1,
    panierNextId: 1,
    habitats: [],
    habitatNextId: 1,
  };
  const r = Stations.resolveStation(registry, "b999");
  assert.equal(r.ok, false);
  assert.equal(typeof r.error, "string");
  assert.ok(r.error.includes("b999"));
  assert.notEqual(r, undefined);
});

test("resolveStation fails explicitly against an empty registry (fresh save)", () => {
  const g = new GardenState(null, 1000);
  const r = Stations.resolveStation(g.s.campaignStations, "z1");
  assert.equal(r.ok, false);
});

test("a real round trip through JSON keeps a populated registry strictly identical", () => {
  const registry = {
    bornes: [],
    zones: [],
    paniers: [],
    borneNextId: 1,
    zoneNextId: 1,
    panierNextId: 1,
    habitats: [],
    habitatNextId: 1,
  };
  Stations.registerStation(registry, "borne", { x: 1.5, z: -2 });
  Stations.registerStation(registry, "zone", { x: 0, z: 0 });
  Stations.registerStation(registry, "panier", { x: 3, z: 3 });
  const roundTripped = JSON.parse(JSON.stringify(registry));
  assert.deepEqual(roundTripped, registry);
});

test("an existing save without campaignStations migrates to the empty default registry without error", () => {
  const g = new GardenState(null, 1000);
  const saved = g.serialize();
  delete saved.campaignStations;
  const migrated = validate(saved);
  assert.deepEqual(migrated.campaignStations, {
    bornes: [],
    zones: [],
    paniers: [],
    borneNextId: 1,
    zoneNextId: 1,
    panierNextId: 1,
    habitats: [],
    habitatNextId: 1,
  });
});

test("a save with a populated, well-formed registry validates unchanged", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  Stations.registerStation(g.s.campaignStations, "zone", { x: 2, z: 2 });
  Stations.registerStation(g.s.campaignStations, "panier", { x: 3, z: 3 });
  const saved = g.serialize();
  const validated = validate(saved);
  assert.deepEqual(validated.campaignStations, saved.campaignStations);
});

test("validate rejects a malformed registry: bad id prefix, duplicate id, non-finite position, stale counter", () => {
  const base = () => {
    const g = new GardenState(null, 1000);
    return g.serialize();
  };
  const badPrefix = base();
  badPrefix.campaignStations.bornes.push({ id: "z1", x: 0, z: 0 });
  assert.throws(() => validate(badPrefix));

  const duplicate = base();
  duplicate.campaignStations.bornes.push(
    { id: "b1", x: 0, z: 0 },
    { id: "b1", x: 1, z: 1 },
  );
  duplicate.campaignStations.borneNextId = 3;
  assert.throws(() => validate(duplicate));

  const nonFinite = base();
  nonFinite.campaignStations.zones.push({ id: "z1", x: NaN, z: 0 });
  assert.throws(() => validate(nonFinite));

  const staleCounter = base();
  staleCounter.campaignStations.paniers.push({ id: "pn5", x: 0, z: 0 });
  staleCounter.campaignStations.panierNextId = 5;
  assert.throws(() => validate(staleCounter));
});

test("validate rejects a panier with a non-positive capacity, or a min outside [0, capacity]", () => {
  const base = () => {
    const g = new GardenState(null, 1000);
    Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
    return g.serialize();
  };

  const zeroCapacity = base();
  zeroCapacity.campaignStations.paniers[0].capacity = 0;
  assert.throws(() => validate(zeroCapacity), /Registre de stations invalide/);

  const negativeCapacity = base();
  negativeCapacity.campaignStations.paniers[0].capacity = -5;
  assert.throws(() => validate(negativeCapacity), /Registre de stations invalide/);

  const negativeMin = base();
  negativeMin.campaignStations.paniers[0].min = -1;
  assert.throws(() => validate(negativeMin), /Registre de stations invalide/);

  const minAboveCapacity = base();
  minAboveCapacity.campaignStations.paniers[0].capacity = 10;
  minAboveCapacity.campaignStations.paniers[0].min = 11;
  assert.throws(() => validate(minAboveCapacity), /Registre de stations invalide/);

  // min === capacity is legal (a panier that must always stay exactly full to keep its floor).
  const minEqualsCapacity = base();
  minEqualsCapacity.campaignStations.paniers[0].capacity = 10;
  minEqualsCapacity.campaignStations.paniers[0].min = 10;
  assert.doesNotThrow(() => validate(minEqualsCapacity));
});

test("a pre-C2.8 panier without capacity/min migrates to the same defaults registerStation now sets", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  const saved = g.serialize();
  delete saved.campaignStations.paniers[0].capacity;
  delete saved.campaignStations.paniers[0].min;
  const migrated = validate(saved);
  assert.equal(
    migrated.campaignStations.paniers[0].capacity,
    Stations.DEFAULT_PANIER_CAPACITY,
  );
  assert.equal(
    migrated.campaignStations.paniers[0].min,
    Stations.DEFAULT_PANIER_MIN,
  );
});

// Epic C7.21: a panier's declared capacity must never be exceeded by its real buffer total once
// reloaded (the trou left open by C7.20's own commit — see garden-state-validate.js's own
// comment). An occupation exactly at capacity is the normal "full" state and must stay valid.
test("validate rejects a panier whose buffer total exceeds its declared capacity, accepts it exactly at capacity", () => {
  // A buffer key must resolve to a real cultivar (validated independently, see the buffer content
  // check just above this one in garden-state-validate.js) — two real cultivars stand in for two
  // resource kinds, same as tests/campaign-rainelles-chain.cjs's own fixtures.
  const base = () => {
    const g = new GardenState(null, 1000);
    const cv1 = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
    const cv2 = Cultivars.createCultivar(g.s, { name: "B", traits: {} });
    Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
    return { saved: g.serialize(), cv1, cv2 };
  };

  const overflowing = base();
  overflowing.saved.campaignStations.paniers[0].capacity = 5;
  overflowing.saved.campaignStations.paniers[0].buffer = {
    [overflowing.cv1.id]: 3,
    [overflowing.cv2.id]: 3,
  };
  assert.throws(() => validate(overflowing.saved), /Registre de stations invalide/);

  const exactlyFull = base();
  exactlyFull.saved.campaignStations.paniers[0].capacity = 5;
  exactlyFull.saved.campaignStations.paniers[0].buffer = {
    [exactlyFull.cv1.id]: 3,
    [exactlyFull.cv2.id]: 2,
  };
  assert.doesNotThrow(() => validate(exactlyFull.saved));

  // A panier with no declared capacity is never concerned by this control, however large its
  // buffer — behaviour unchanged from before this epic.
  const noCapacity = base();
  delete noCapacity.saved.campaignStations.paniers[0].capacity;
  noCapacity.saved.campaignStations.paniers[0].buffer = { [noCapacity.cv1.id]: 999 };
  assert.doesNotThrow(() => validate(noCapacity.saved));
});

test("panierTotal sums every resource key in a panier's buffer", () => {
  const panier = { buffer: { a: 3, b: 5 } };
  assert.equal(Stations.panierTotal(panier), 8);
  assert.equal(Stations.panierTotal({ buffer: {} }), 0);
});

// Epic C7.11: Stations.removeStation generalises removeHabitat's pattern to the three other
// station kinds (borne/zone/panier) — see campaign-stations.js's own header comment for the
// reasoning. Pure-function tests here, alongside removeHabitat/resolveStation's own; the command
// wiring (removeStation({id}), a Rainelle's geste falling back to poste-manquant) is tested in
// tests/campaign-remove-station.cjs instead.

test("removeStation refuses an unknown id, exactly resolveStation's own refusal", () => {
  const g = new GardenState(null, 1000);
  const before = JSON.stringify(g.s.campaignStations);
  const result = Stations.removeStation(g.s.campaignStations, "b999");
  assert.equal(result.ok, false);
  assert.match(result.error, /inconnu/);
  assert.equal(JSON.stringify(g.s.campaignStations), before, "refusal never mutates");
});

test("removeStation refuses a habitat id, pointing at removeHabitat instead", () => {
  const g = new GardenState(null, 1000);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const before = JSON.stringify(g.s.campaignStations);
  const result = Stations.removeStation(g.s.campaignStations, habitat.id);
  assert.equal(result.ok, false);
  assert.match(result.error, /removeHabitat/);
  assert.equal(JSON.stringify(g.s.campaignStations), before, "refusal never mutates");
});

test("removeStation removes a zone unconditionally", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 1, z: 2 });
  const result = Stations.removeStation(g.s.campaignStations, zone.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.registry.zones, []);
  // Every other collection is untouched (same registry, only its own kind's collection changes).
  assert.deepEqual(result.registry.bornes, g.s.campaignStations.bornes);
});

test("removeStation removes a borne unconditionally", () => {
  const g = new GardenState(null, 1000);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 2 });
  const result = Stations.removeStation(g.s.campaignStations, borne.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.registry.bornes, []);
});

test("removeStation refuses a panier that still holds produce, registry unchanged", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer.fraise = 3;
  const before = JSON.stringify(g.s.campaignStations);
  const result = Stations.removeStation(g.s.campaignStations, panier.id);
  assert.equal(result.ok, false);
  assert.match(result.error, /vider/);
  assert.equal(JSON.stringify(g.s.campaignStations), before, "refusal never mutates");
});

test("removeStation removes an empty panier", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  assert.equal(Stations.panierTotal(panier), 0);
  const result = Stations.removeStation(g.s.campaignStations, panier.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.registry.paniers, []);
});

test("removeStation, once a panier's produce is fully withdrawn, then succeeds", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer.fraise = 2;
  assert.equal(Stations.removeStation(g.s.campaignStations, panier.id).ok, false);
  panier.buffer.fraise = 0;
  const result = Stations.removeStation(g.s.campaignStations, panier.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.registry.paniers, []);
});

test("teachGesture/demonstrateGesture behave identically whether campaignStations is empty or populated — unchanged by this epic", () => {
  const run = (populate) => {
    const g = new GardenState(null, 1000);
    // Epic C4.4: triggerFrogEncounter now refuses until a cultivar already exists ("après les
    // apprentissages nécessaires", design §10 chapitre 4) — this unrelated warm-up cross
    // satisfies that real precondition before the scripted encounter itself.
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
    g.command({ type: "sleep" });
    g.command({ type: "triggerFrogEncounter" });
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
    g.command({ type: "sleep" });
    if (populate)
      Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
    const id = g.s.rainelles[0].id;
    return g.command({
      type: "teachGesture",
      id,
      verbe: "arroser",
      poste: "un-nom-quelconque",
      source: "un-autre-nom",
      destination: "encore-un-autre",
    });
  };
  const empty = run(false);
  const populated = run(true);
  assert.equal(empty.ok, true);
  assert.equal(populated.ok, true);
  assert.equal(empty.message, populated.message);
});

// Epic C7.17 (design §5, "Développer le réseau" names "étiquettes" as a comfort feature once
// paniers/bornes/zones multiply). Stations.labelStation is a pure function proven here; the
// command wiring (labelStation({id, label}) via the real GardenState.command() vector) is proven
// separately in tests/campaign-remove-station.cjs, alongside removeStation.

test("labelStation labels a zone, a borne and a panier; the label is read back in the returned registry", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 2, z: 0 });
  let registry = Stations.labelStation(g.s.campaignStations, zone.id, "Le carré du matin").registry;
  assert.equal(registry.zones.find((z) => z.id === zone.id).label, "Le carré du matin");
  registry = Stations.labelStation(registry, borne.id, "La grande borne").registry;
  assert.equal(registry.bornes.find((b) => b.id === borne.id).label, "La grande borne");
  registry = Stations.labelStation(registry, panier.id, "Panier du fond").registry;
  assert.equal(registry.paniers.find((p) => p.id === panier.id).label, "Panier du fond");
  // Every other collection/station is untouched by each call.
  assert.equal(registry.zoneNextId, g.s.campaignStations.zoneNextId);
  assert.equal(registry.borneNextId, g.s.campaignStations.borneNextId);
});

test("labelStation trims surrounding whitespace before storing the label", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const result = Stations.labelStation(g.s.campaignStations, zone.id, "  Le carré du matin  ");
  assert.equal(result.ok, true);
  assert.equal(result.registry.zones.find((z) => z.id === zone.id).label, "Le carré du matin");
});

test("labelStation with an empty (or whitespace-only) string clears an existing label, field removed rather than stored empty", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  let registry = Stations.labelStation(g.s.campaignStations, zone.id, "Un nom").registry;
  assert.equal(registry.zones.find((z) => z.id === zone.id).label, "Un nom");
  const cleared = Stations.labelStation(registry, zone.id, "   ");
  assert.equal(cleared.ok, true);
  const station = cleared.registry.zones.find((z) => z.id === zone.id);
  assert.equal(station.label, undefined);
  assert.equal("label" in station, false);
});

test("labelStation refuses a label longer than 40 characters, registry unchanged", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const before = JSON.stringify(g.s.campaignStations);
  const result = Stations.labelStation(g.s.campaignStations, zone.id, "x".repeat(41));
  assert.equal(result.ok, false);
  assert.match(result.error, /40 caractères/);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("labelStation accepts exactly 40 characters", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const result = Stations.labelStation(g.s.campaignStations, zone.id, "x".repeat(40));
  assert.equal(result.ok, true);
  assert.equal(result.registry.zones.find((z) => z.id === zone.id).label, "x".repeat(40));
});

test("labelStation refuses a habitat id, registry unchanged, error orients away from an absent display", () => {
  const g = new GardenState(null, 1000);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const before = JSON.stringify(g.s.campaignStations);
  const result = Stations.labelStation(g.s.campaignStations, habitat.id, "Un nom");
  assert.equal(result.ok, false);
  assert.match(result.error, /habitat/);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("labelStation refuses an unknown id", () => {
  const g = new GardenState(null, 1000);
  const before = JSON.stringify(g.s.campaignStations);
  const result = Stations.labelStation(g.s.campaignStations, "z999", "Un nom");
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("labelStation on a panier preserves its buffer/capacity/min untouched", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer.fraise = 5;
  panier.capacity = 24;
  panier.min = 3;
  const result = Stations.labelStation(g.s.campaignStations, panier.id, "Panier du fond");
  assert.equal(result.ok, true);
  const labelled = result.registry.paniers.find((p) => p.id === panier.id);
  assert.deepEqual(labelled.buffer, { fraise: 5 });
  assert.equal(labelled.capacity, 24);
  assert.equal(labelled.min, 3);
  assert.equal(labelled.label, "Panier du fond");
});

// Epic C7.18 (design §16, "déplacer un poste... conserve les ressources et libère correctement
// les réservations"). Stations.relocateStation is a pure function proven here; the command wiring
// (relocateStation({id, x, z}) via the real GardenState.command() vector) and the "cycle survives
// a small move, stops cleanly once out of range" scenario are proven separately in
// tests/campaign-remove-station.cjs, alongside removeStation/labelStation.

test("relocateStation moves a zone/borne/panier: only x/z change, every other field is untouched", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 2, z: 2 });
  let registry = Stations.labelStation(g.s.campaignStations, zone.id, "Le carré du matin").registry;
  registry = Stations.relocateStation(registry, zone.id, 10, 20).registry;
  assert.deepEqual(registry.zones.find((z) => z.id === zone.id), {
    id: zone.id,
    x: 10,
    z: 20,
    veilleuse: false,
    extensionCommerciale: false,
    label: "Le carré du matin",
  });

  registry = Stations.relocateStation(registry, borne.id, -5, 5).registry;
  assert.deepEqual(registry.bornes.find((b) => b.id === borne.id), {
    id: borne.id,
    x: -5,
    z: 5,
    priseFortDebit: false,
  });

  registry = Stations.relocateStation(registry, panier.id, 30, -30).registry;
  const moved = registry.paniers.find((p) => p.id === panier.id);
  assert.equal(moved.x, 30);
  assert.equal(moved.z, -30);
  assert.deepEqual(moved.buffer, {});
  assert.equal(moved.capacity, Stations.DEFAULT_PANIER_CAPACITY);
  assert.equal(moved.min, Stations.DEFAULT_PANIER_MIN);
});

test("relocateStation on a panier that already holds produce is never refused, unlike removeStation", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer.fraise = 5;
  const result = Stations.relocateStation(g.s.campaignStations, panier.id, 12, 12);
  assert.equal(result.ok, true, result.error);
  const moved = result.registry.paniers.find((p) => p.id === panier.id);
  assert.equal(moved.x, 12);
  assert.equal(moved.z, 12);
  assert.deepEqual(moved.buffer, { fraise: 5 });
});

test("relocateStation refuses non-finite or out-of-bound x/z, registry unchanged", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const before = JSON.stringify(g.s.campaignStations);
  for (const [x, z] of [
    [NaN, 0],
    [0, NaN],
    [Infinity, 0],
    [0, -Infinity],
    [65, 0],
    [-65, 0],
    [0, 65],
    [0, -65],
  ]) {
    const result = Stations.relocateStation(g.s.campaignStations, zone.id, x, z);
    assert.equal(result.ok, false, `x=${x} z=${z} should be refused`);
    assert.equal(JSON.stringify(g.s.campaignStations), before);
  }
});

test("relocateStation accepts the exact -64/64 boundary", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const result = Stations.relocateStation(g.s.campaignStations, zone.id, -64, 64);
  assert.equal(result.ok, true, result.error);
  const moved = result.registry.zones.find((z) => z.id === zone.id);
  assert.equal(moved.x, -64);
  assert.equal(moved.z, 64);
});

test("relocateStation refuses a habitat id, registry unchanged", () => {
  const g = new GardenState(null, 1000);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const before = JSON.stringify(g.s.campaignStations);
  const result = Stations.relocateStation(g.s.campaignStations, habitat.id, 1, 1);
  assert.equal(result.ok, false);
  assert.match(result.error, /habitat/);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("relocateStation refuses an unknown id", () => {
  const g = new GardenState(null, 1000);
  const before = JSON.stringify(g.s.campaignStations);
  const result = Stations.relocateStation(g.s.campaignStations, "z999", 1, 1);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

// Epic C7.20 (design §5, prerequisite of the Replanter gesture — see this epic's own
// campagne-backlog.md entry for the full reasoning): a zone's capacity is optional at
// registration (unlike a habitat's), and when supplied must be a real, explicit number. See
// tests/campaign-cultivars.cjs for zoneOccupancy/canRelocateSpecimen/relocateSpecimen, which live
// in cultivars.js since they read s.specimens, not just the stations registry.

test("registerStation('zone', ...) with no capacity stays exactly as bare as before this epic", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  assert.equal(zone.capacity, undefined);
});

test("registerStation('zone', ...) accepts an explicit capacity, refuses below MIN_ZONE_CAPACITY", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  assert.equal(zone.capacity, 3);
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.throws(() =>
      Stations.registerStation(g.s.campaignStations, "zone", { x: 1, z: 1, capacity: bad }),
    );
  }
});

test("A zone's capacity below MIN_ZONE_CAPACITY, or non-finite, is rejected by validate()", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const saved = g.serialize();
  for (const bad of [0, -1, NaN, Infinity]) {
    saved.campaignStations.zones[0].capacity = bad;
    assert.throws(() => validate(saved), /Registre de stations invalide/);
  }
  saved.campaignStations.zones[0].capacity = 1;
  assert.doesNotThrow(() => validate(saved));
});

// Epic C7.23 (design §5, "Multiplier une plante -> jeunes plants dans le bac de sortie" /
// "Replanter... jeunes plants à portée") : a second buffer-key shape, distinct from a bare
// cultivarId (harvested produce, C2.6c) — see campaign-stations.js's own header comment on
// youngPlantKey for the reasoning. No gesture is wired to these functions yet (Multiplier and
// Replanter remain out of scope, see this epic's own campagne-backlog.md entry).

test("youngPlantKey/cultivarIdOfYoungPlantKey round-trip a real cultivarId", () => {
  assert.equal(Stations.youngPlantKey("c3"), "jeune:c3");
  assert.equal(Stations.cultivarIdOfYoungPlantKey(Stations.youngPlantKey("c3")), "c3");
});

test("cultivarIdOfYoungPlantKey returns null on a bare key, a suffix-less key and a prefix-less key", () => {
  assert.equal(Stations.cultivarIdOfYoungPlantKey("c3"), null);
  assert.equal(Stations.cultivarIdOfYoungPlantKey("jeune:"), null);
  assert.equal(Stations.cultivarIdOfYoungPlantKey("jeuneX"), null);
});

test("depositYoungPlant increments exactly the target panier's young-plant key, all else strictly unchanged", () => {
  const g = new GardenState(null, 1000);
  const cv1 = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  const cv2 = Cultivars.createCultivar(g.s, { name: "B", traits: {} });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const otherPanier = Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 2, z: 2 });
  panier.buffer[cv2.id] = 4; // existing harvested produce, must survive unchanged

  const before = JSON.stringify(g.s.campaignStations);
  const result = Stations.depositYoungPlant(g.s, panier.id, cv1.id, 3);
  assert.equal(result.ok, true, result.error);
  assert.equal(JSON.stringify(g.s.campaignStations), before, "the call itself never mutates");

  const updated = result.registry.paniers.find((p) => p.id === panier.id);
  assert.deepEqual(updated.buffer, { [cv2.id]: 4, [Stations.youngPlantKey(cv1.id)]: 3 });
  const untouchedOther = result.registry.paniers.find((p) => p.id === otherPanier.id);
  assert.equal(untouchedOther, otherPanier, "the other panier is the exact same reference");
  assert.equal(result.registry.zones[0], zone, "a non-panier collection is untouched");

  // Pure function: applying the first result back onto the live state before depositing again is
  // what "increments an existing key" actually means (depositYoungPlant itself never mutates g.s).
  g.s.campaignStations = result.registry;
  const again = Stations.depositYoungPlant(g.s, panier.id, cv1.id, 2);
  const updatedAgain = again.registry.paniers.find((p) => p.id === panier.id);
  assert.equal(
    updatedAgain.buffer[Stations.youngPlantKey(cv1.id)],
    5,
    "a second deposit on an existing key creates it if absent, increments otherwise",
  );
});

test("canDepositYoungPlant refuses an unknown panier, a non-panier station, an unknown cultivar and a bad qty", () => {
  const g = new GardenState(null, 1000);
  const cv1 = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 1, z: 1 });

  assert.equal(Stations.canDepositYoungPlant(g.s, "pn999", cv1.id, 1).ok, false);
  assert.equal(Stations.canDepositYoungPlant(g.s, zone.id, cv1.id, 1).ok, false);
  assert.equal(Stations.canDepositYoungPlant(g.s, panier.id, "c999", 1).ok, false);
  for (const bad of [0, -1, 1.5, NaN, Infinity]) {
    assert.equal(
      Stations.canDepositYoungPlant(g.s, panier.id, cv1.id, bad).ok,
      false,
      `qty=${bad} should be refused`,
    );
  }
});

test("canDepositYoungPlant refuses a deposit that would exceed capacity, shared with harvested produce", () => {
  const g = new GardenState(null, 1000);
  const cv1 = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  const cv2 = Cultivars.createCultivar(g.s, { name: "B", traits: {} });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.capacity = 5;
  panier.buffer[cv2.id] = 3; // harvested produce already occupies part of the shared ceiling

  const refused = Stations.canDepositYoungPlant(g.s, panier.id, cv1.id, 3);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /capacité/);

  const accepted = Stations.canDepositYoungPlant(g.s, panier.id, cv1.id, 2);
  assert.equal(accepted.ok, true, accepted.error);
});

test("withdrawYoungPlant decrements a young-plant key, removes it when it reaches zero, all else unchanged", () => {
  const g = new GardenState(null, 1000);
  const cv1 = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer[Stations.youngPlantKey(cv1.id)] = 5;

  const before = JSON.stringify(g.s.campaignStations);
  const partial = Stations.withdrawYoungPlant(g.s, panier.id, cv1.id, 2);
  assert.equal(partial.ok, true, partial.error);
  assert.equal(JSON.stringify(g.s.campaignStations), before, "the call itself never mutates");
  const afterPartial = partial.registry.paniers.find((p) => p.id === panier.id);
  assert.equal(afterPartial.buffer[Stations.youngPlantKey(cv1.id)], 3);

  panier.buffer[Stations.youngPlantKey(cv1.id)] = 3;
  const emptied = Stations.withdrawYoungPlant(g.s, panier.id, cv1.id, 3);
  const afterEmptied = emptied.registry.paniers.find((p) => p.id === panier.id);
  assert.equal(
    Object.prototype.hasOwnProperty.call(afterEmptied.buffer, Stations.youngPlantKey(cv1.id)),
    false,
    "a withdrawal that empties the key removes it rather than leaving a trailing 0",
  );
});

test("canWithdrawYoungPlant refuses an unknown panier/cultivar and a qty above the current stock, treating an absent key as 0", () => {
  const g = new GardenState(null, 1000);
  const cv1 = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });

  assert.equal(Stations.canWithdrawYoungPlant(g.s, "pn999", cv1.id, 1).ok, false);
  assert.equal(Stations.canWithdrawYoungPlant(g.s, panier.id, "c999", 1).ok, false);
  assert.equal(
    Stations.canWithdrawYoungPlant(g.s, panier.id, cv1.id, 1).ok,
    false,
    "no key present at all reads as a stock of 0",
  );
  for (const bad of [0, -1, 1.5, NaN, Infinity]) {
    assert.equal(Stations.canWithdrawYoungPlant(g.s, panier.id, cv1.id, bad).ok, false);
  }
  panier.buffer[Stations.youngPlantKey(cv1.id)] = 2;
  assert.equal(Stations.canWithdrawYoungPlant(g.s, panier.id, cv1.id, 3).ok, false);
  assert.equal(Stations.canWithdrawYoungPlant(g.s, panier.id, cv1.id, 2).ok, true);
});

test("validate accepts a panier buffer with a real jeune:<cultivarId> key, refuses a malformed or unknown one", () => {
  const g = new GardenState(null, 1000);
  const cv1 = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const base = () => {
    const saved = g.serialize();
    saved.campaignStations.paniers[0].buffer = {};
    return saved;
  };

  const valid = base();
  valid.campaignStations.paniers[0].buffer[Stations.youngPlantKey(cv1.id)] = 3;
  assert.doesNotThrow(() => validate(valid));

  for (const badKey of [
    Stations.youngPlantKey("c999"), // unknown cultivarId inside a well-formed prefix
    "jeune:", // empty suffix
    "jeuneX", // missing the colon
    Stations.youngPlantKey(Stations.youngPlantKey(cv1.id)), // double prefix
  ]) {
    const saved = base();
    saved.campaignStations.paniers[0].buffer[badKey] = 1;
    assert.throws(() => validate(saved), /Registre de stations invalide/, `key "${badKey}" should be refused`);
  }
});

test("validate: a jeune:<cultivarId> key counts toward the shared panier capacity ceiling", () => {
  const g = new GardenState(null, 1000);
  const cv1 = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  const cv2 = Cultivars.createCultivar(g.s, { name: "B", traits: {} });
  Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const saved = g.serialize();
  saved.campaignStations.paniers[0].capacity = 5;
  saved.campaignStations.paniers[0].buffer = {
    [cv1.id]: 3,
    [Stations.youngPlantKey(cv2.id)]: 3,
  };
  assert.throws(() => validate(saved), /Registre de stations invalide/);
  saved.campaignStations.paniers[0].buffer[Stations.youngPlantKey(cv2.id)] = 2;
  assert.doesNotThrow(() => validate(saved));
});

test("a depositYoungPlant round-trip through GardenState.command()'s JSON save/load preserves the key and its qty", () => {
  const g = new GardenState(null, 1000);
  const cv1 = Cultivars.createCultivar(g.s, { name: "A", traits: {} });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const deposit = Stations.depositYoungPlant(g.s, panier.id, cv1.id, 4);
  assert.equal(deposit.ok, true, deposit.error);
  g.s.campaignStations = deposit.registry;

  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())), 1000);
  const reloadedPanier = reloaded.s.campaignStations.paniers.find((p) => p.id === panier.id);
  assert.equal(reloadedPanier.buffer[Stations.youngPlantKey(cv1.id)], 4);
});

// Epic C7.25 (design §5, "Replanter... respecte l'étiquette de cultivar ou la famille
// autorisée" — this epic isolates the cultivar-label half only, see cultivars.js's own
// canRelocateSpecimen for the actual refusal, tested in tests/campaign-cultivars.cjs). Here:
// registerStation poses the field as-is, and validate() accepts/rejects its shape.

test("registerStation('zone', ...) with no allowedCultivarIds does not carry the field at all", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  assert.equal("allowedCultivarIds" in zone, false);
});

test("registerStation('zone', ...) poses allowedCultivarIds exactly as given, including an empty array", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    allowedCultivarIds: ["c1", "c4"],
  });
  assert.deepEqual(zone.allowedCultivarIds, ["c1", "c4"]);

  const zoneEmpty = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 1,
    z: 1,
    allowedCultivarIds: [],
  });
  assert.deepEqual(zoneEmpty.allowedCultivarIds, []);
});

test("validate() rejects a zone's allowedCultivarIds that isn't an array, or that contains a non-string", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const notArray = g.serialize();
  notArray.campaignStations.zones[0].allowedCultivarIds = "c1";
  assert.throws(() => validate(notArray), /Registre de stations invalide/);

  const badElement = g.serialize();
  badElement.campaignStations.zones[0].allowedCultivarIds = ["c1", 4];
  assert.throws(() => validate(badElement), /Registre de stations invalide/);
});

test("validate() accepts a zone's allowedCultivarIds when absent, empty, or a real array of strings", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const absent = g.serialize();
  assert.equal("allowedCultivarIds" in absent.campaignStations.zones[0], false);
  assert.doesNotThrow(() => validate(absent));

  const empty = g.serialize();
  empty.campaignStations.zones[0].allowedCultivarIds = [];
  assert.doesNotThrow(() => validate(empty));

  const populated = g.serialize();
  populated.campaignStations.zones[0].allowedCultivarIds = ["c1", "c4"];
  assert.doesNotThrow(() => validate(populated));
});

test("a pre-C7.25 zone (no allowedCultivarIds field at all) migrates and loads without error", () => {
  const g = new GardenState(null, 1000);
  Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0, capacity: 2 });
  const saved = g.serialize();
  delete saved.campaignStations.zones[0].allowedCultivarIds;
  const reloaded = new GardenState(JSON.parse(JSON.stringify(saved)), 1000);
  assert.equal("allowedCultivarIds" in reloaded.s.campaignStations.zones[0], false);
});
