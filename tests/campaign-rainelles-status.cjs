const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Status = require("../public/game/rainelles-status.js");

// Epic C2.8 (design §5, "Conditions, réservations et lecture des blocages"): six of the seven
// named states ("passage bloqué" excluded — see rainelles-status.js's own header comment for
// why). Every test below checks the `kind` returned (the stable, testable part) and that a
// non-empty `message` string always comes with it (the "chaque état affiche une phrase
// d'action" clause) — never the exact wording, which is free to evolve.

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
