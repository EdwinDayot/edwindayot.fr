const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");

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
  assert.deepEqual(borne, { id: "b1", x: 1, z: 2 });
  // Epic C5.2: a zone also carries its `veilleuse` flag at creation, off by default (design §11's
  // "veilleuses de croissance" — see campaign-stations.js's own comment on registerStation).
  assert.deepEqual(zone, { id: "z1", x: 3, z: 4, veilleuse: false });
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

test("panierTotal sums every resource key in a panier's buffer", () => {
  const panier = { buffer: { a: 3, b: 5 } };
  assert.equal(Stations.panierTotal(panier), 8);
  assert.equal(Stations.panierTotal({ buffer: {} }), 0);
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
