const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Status = require("../public/game/rainelles-status.js");
const Movement = require("../public/game/rainelle-movement.js");

// Epic C2.8 (design §5, "Conditions, réservations et lecture des blocages"): six of the seven
// named states. Every test below checks the `kind` returned (the stable, testable part) and that
// a non-empty `message` string always comes with it (the "chaque état affiche une phrase
// d'action" clause) — never the exact wording, which is free to evolve. The seventh state,
// "passage bloqué", is added by Epic C2.8v-a further below — see rainelles-status.js's own
// header comment for why it was deferred until now and how its third, optional `waitCounts`
// parameter works.

function freshRainelle(g) {
  const cultivar = Cultivars.createCultivar(g.s, { name: "Test", traits: {} });
  return {
    rainelle: Rainelles.createRainelle(g.s, {
      cultivarId: cultivar.id,
      name: "Statut",
    }),
    cultivarId: cultivar.id,
  };
}

function teach(rainelle, fields) {
  const r = Rainelles.applyGesture(rainelle, { condition: "", ...fields });
  assert.equal(r.ok, true, r.error);
}

test("no gesture taught: repos", () => {
  const g = new GardenState(null, 1000);
  const { rainelle } = freshRainelle(g);
  const status = Status.status(rainelle, g.s);
  assert.equal(status.kind, "repos");
  assert.equal(typeof status.message, "string");
  assert.ok(status.message.length > 0);
});

test("a verb without tick behaviour yet (replanter/preparer/trier): repos, not an exception", () => {
  const g = new GardenState(null, 1000);
  const { rainelle } = freshRainelle(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  teach(rainelle, {
    verbe: "replanter",
    poste: zone.id,
    source: panier.id,
    destination: panier.id,
  });
  const status = Status.status(rainelle, g.s);
  assert.equal(status.kind, "repos");
});

test("arroser: an unresolved borne or zone is poste-manquant", () => {
  const g = new GardenState(null, 1000);
  const { rainelle } = freshRainelle(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(rainelle, {
    verbe: "arroser",
    poste: zone.id,
    source: "b999",
    destination: "peu-importe",
  });
  assert.equal(Status.status(rainelle, g.s).kind, "poste-manquant");
});

test("arroser: borne and zone both resolve — au-travail", () => {
  const g = new GardenState(null, 1000);
  const { rainelle } = freshRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(rainelle, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
  });
  assert.equal(Status.status(rainelle, g.s).kind, "au-travail");
});

test("recolter: an unresolved zone or panier is poste-manquant", () => {
  const g = new GardenState(null, 1000);
  const { rainelle } = freshRainelle(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: "pn999",
  });
  assert.equal(Status.status(rainelle, g.s).kind, "poste-manquant");
});

test("recolter: nothing ready in range is source-vide", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId } = freshRainelle(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0, stage: 0 }); // immature
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  assert.equal(Status.status(rainelle, g.s).kind, "source-vide");
});

test("recolter: a ready specimen in range with room in the panier is au-travail", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId } = freshRainelle(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  Cultivars.setReadyToProduce(specimen, true);
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  assert.equal(Status.status(rainelle, g.s).kind, "au-travail");
});

test("recolter: a ready specimen but a full destination panier is sortie-pleine", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId } = freshRainelle(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.capacity = 1;
  panier.buffer[cultivarId] = 1;
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  Cultivars.setReadyToProduce(specimen, true);
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  assert.equal(Status.status(rainelle, g.s).kind, "sortie-pleine");
});

test("transporter: an unresolved panier, or the same panier as source and destination, is poste-manquant", () => {
  const g = new GardenState(null, 1000);
  const { rainelle: r1 } = freshRainelle(g);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  teach(r1, {
    verbe: "transporter",
    poste: "peu-importe",
    source: panier.id,
    destination: "pn999",
  });
  assert.equal(Status.status(r1, g.s).kind, "poste-manquant");

  const { rainelle: r2 } = freshRainelle(g);
  teach(r2, {
    verbe: "transporter",
    poste: "peu-importe",
    source: panier.id,
    destination: panier.id,
  });
  assert.equal(Status.status(r2, g.s).kind, "poste-manquant");
});

test("transporter: an empty (filtered) source is source-vide", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId } = freshRainelle(g);
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  assert.equal(Status.status(rainelle, g.s).kind, "source-vide");
});

test("transporter: a source already at its protected min is stock-cible-atteint", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId } = freshRainelle(g);
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  from.buffer[cultivarId] = 2;
  from.min = 2;
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  assert.equal(Status.status(rainelle, g.s).kind, "stock-cible-atteint");
});

test("transporter: a full destination is sortie-pleine", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId } = freshRainelle(g);
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  from.buffer[cultivarId] = 3;
  to.buffer.other = to.capacity;
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  assert.equal(Status.status(rainelle, g.s).kind, "sortie-pleine");
});

test("transporter: source has stock, room at destination, no floor in the way — au-travail", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId } = freshRainelle(g);
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  from.buffer[cultivarId] = 3;
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  assert.equal(Status.status(rainelle, g.s).kind, "au-travail");
});

test("status never throws for any of the six covered states across many random-ish setups", () => {
  const g = new GardenState(null, 1000);
  const { rainelle } = freshRainelle(g);
  assert.doesNotThrow(() => Status.status(rainelle, g.s));
});

// Epic C2.8v-a (design §5/§14, "passage bloqué... une Rainelle bloquée se range à un point
// d'attente sans devenir un obstacle permanent"). `waitCounts` is the exact {id: steps} shape
// rainelle-movement.js's own resolveStep produces/consumes (GardenState's `this.rainelleWaitCounts`
// in real play) — never a new, duplicated shape.

test("passage-bloque: no waitCounts argument at all — every existing two-argument call keeps working identically", () => {
  const g = new GardenState(null, 1000);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const { rainelle } = freshRainelle(g);
  teach(rainelle, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  // Same call shape every existing caller (garden-state.js's tickRainelleMovement included) uses.
  assert.equal(Status.status(rainelle, g.s).kind, "au-travail");
});

test("passage-bloque: a wait count under MAX_WAIT_STEPS is an ordinary short wait, not passage-bloque", () => {
  const g = new GardenState(null, 1000);
  const { rainelle } = freshRainelle(g);
  const waitCounts = { [rainelle.id]: Movement.MAX_WAIT_STEPS - 1 };
  assert.equal(Status.status(rainelle, g.s, waitCounts).kind, "repos");
});

test("passage-bloque: a wait count at MAX_WAIT_STEPS overrides an otherwise au-travail gesture", () => {
  const g = new GardenState(null, 1000);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const { rainelle } = freshRainelle(g);
  teach(rainelle, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  const waitCounts = { [rainelle.id]: Movement.MAX_WAIT_STEPS };
  const status = Status.status(rainelle, g.s, waitCounts);
  assert.equal(status.kind, "passage-bloque");
  assert.equal(typeof status.message, "string");
  assert.ok(status.message.length > 0);
});

test("passage-bloque: an unrelated Rainelle's wait count never blocks a different one", () => {
  const g = new GardenState(null, 1000);
  const { rainelle } = freshRainelle(g);
  const waitCounts = { "r999": Movement.MAX_WAIT_STEPS + 5 };
  assert.equal(Status.status(rainelle, g.s, waitCounts).kind, "repos");
});

test("passage-bloque: real resolveStep pipeline — reaches passage-bloque at the bound, falls back to normal once a sidestep succeeds, never a permanent state", () => {
  const g = new GardenState(null, 1000);
  const cultivar = Cultivars.createCultivar(g.s, { name: "Test", traits: {} });
  const first = Rainelles.createRainelle(g.s, { cultivarId: cultivar.id, name: "Première" });
  const second = Rainelles.createRainelle(g.s, { cultivarId: cultivar.id, name: "Deuxième" });
  first.x = 1.5;
  first.z = 2;
  second.x = 2.5;
  second.z = 2;

  let waitCounts = {};
  let step = Movement.resolveStep(
    g.s,
    [
      { rainelle: first, route: [{ x: 2, z: 2 }] },
      { rainelle: second, route: [{ x: 2, z: 2 }] },
    ],
    waitCounts,
  );
  for (const r of [first, second]) Object.assign(r, step.positions[r.id]);
  waitCounts = step.waitCounts;
  assert.equal(Status.status(second, g.s, waitCounts).kind, "repos", "one contested step is an ordinary wait, not passage-bloque yet");

  for (let n = 0; n < 2; n++) {
    step = Movement.resolveStep(
      g.s,
      [
        { rainelle: first, route: [] },
        { rainelle: second, route: [{ x: 2, z: 2 }] },
      ],
      waitCounts,
    );
    for (const r of [first, second]) Object.assign(r, step.positions[r.id]);
    waitCounts = step.waitCounts;
  }
  assert.equal(waitCounts[second.id], Movement.MAX_WAIT_STEPS);
  assert.equal(
    Status.status(second, g.s, waitCounts).kind,
    "passage-bloque",
    "réellement empêchée d'avancer, la case cible restant occupée",
  );

  // The bound is now exceeded: the next resolveStep gives second a sidestep instead of leaving
  // her waiting indefinitely — the wait counter resets, and so must the reported status.
  step = Movement.resolveStep(
    g.s,
    [
      { rainelle: first, route: [] },
      { rainelle: second, route: [{ x: 2, z: 2 }] },
    ],
    waitCounts,
  );
  for (const r of [first, second]) Object.assign(r, step.positions[r.id]);
  waitCounts = step.waitCounts;
  assert.equal(waitCounts[second.id], 0);
  assert.notEqual(
    Status.status(second, g.s, waitCounts).kind,
    "passage-bloque",
    "jamais un passage-bloque permanent une fois le rangement réussi",
  );
});
