const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Epilogue = require("../public/game/campaign-epilogue.js");
const Genetics = require("../public/game/botany-genetics.js");
const D = require("../public/game/data.js");

// Epic C6.20 (design §10, chapitre 18, quatrième temps : "jeune plante offerte par un habitant").
// Covers s.campaignEpilogue.gift only — frozen on the same single success path already
// exhaustively covered mechanically (gate, one-way, orientation freeze) by
// tests/campaign-epilogue-gate.cjs (C6.18). Same fixtures as that file, duplicated rather than
// shared across files (no existing helper module for this one), same minimal path.

function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function sleepUntilDay(g, day) {
  while (g.s.campaignDay < day) {
    const r = g.command({ type: "sleep" });
    assert.equal(r.ok, true, r.error);
  }
}

function settle(g) {
  bornRainelle(g);
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  return g.s.campaignEpilogue.unlocksOnDay;
}

test("gift stays null before any successful openEpilogue, including on a refused call", () => {
  const g = new GardenState(null, 1000);
  assert.equal(g.s.campaignEpilogue.gift, null);

  const tooEarly = g.command({ type: "openEpilogue" });
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.message, "L'épilogue n'est pas encore accessible.");
  assert.equal(g.s.campaignEpilogue.gift, null);

  const unlockDay = settle(g);
  const stillEarly = g.command({ type: "openEpilogue" });
  assert.equal(stillEarly.ok, false);
  assert.equal(g.s.campaignEpilogue.gift, null);

  sleepUntilDay(g, unlockDay);
  // still before opening, at the exact threshold
  assert.equal(g.s.campaignEpilogue.gift, null);
});

test("a successful call freezes gift with a real founding species and a real visitor", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay);

  const opened = g.command({ type: "openEpilogue" });
  assert.equal(opened.ok, true, opened.error);

  const gift = g.s.campaignEpilogue.gift;
  assert.equal(typeof gift, "object");
  assert.notEqual(gift, null);
  assert.ok(
    Genetics.founders.some((f) => f.id === gift.speciesId),
    `speciesId ${gift.speciesId} should be a real founding species`,
  );
  assert.ok(
    D.buildings.some((b) => b.visitorId === gift.giverId),
    `giverId ${gift.giverId} should be a real visitor`,
  );
});

test("gift matches Epilogue.gift() exactly, the single source this epic reads from", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay);
  g.command({ type: "openEpilogue" });

  assert.deepEqual(g.s.campaignEpilogue.gift, Epilogue.gift());
});

test("a second, refused openEpilogue call never touches gift again", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay);
  g.command({ type: "openEpilogue" });
  const frozen = { ...g.s.campaignEpilogue.gift };

  sleepUntilDay(g, unlockDay + 5);
  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, false);
  assert.equal(result.message, "L'épilogue est déjà ouvert.");
  assert.deepEqual(g.s.campaignEpilogue.gift, frozen);
});

test("déterminisme : deux parties identiques jusqu'à l'ouverture produisent le même don", () => {
  const g1 = new GardenState(null, 1000);
  const unlockDay1 = settle(g1);
  sleepUntilDay(g1, unlockDay1);
  g1.command({ type: "openEpilogue" });

  const g2 = new GardenState(null, 1000);
  const unlockDay2 = settle(g2);
  sleepUntilDay(g2, unlockDay2);
  g2.command({ type: "openEpilogue" });

  assert.deepEqual(g1.s.campaignEpilogue.gift, g2.s.campaignEpilogue.gift);
});

test("non-régression : une sauvegarde fresh() réelle a gift null", () => {
  const g = new GardenState(null, 1000);
  assert.equal(g.s.campaignEpilogue.gift, null);
});

test("migration : une sauvegarde antérieure à ce champ migre gift à null", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay);
  g.command({ type: "openEpilogue" });

  const raw = JSON.parse(JSON.stringify(g.s));
  delete raw.campaignEpilogue.gift;

  const migrated = validate(raw);
  assert.equal(migrated.campaignEpilogue.gift, null);
});

test("aller-retour JSON de campaignEpilogue.gift une fois ouvert", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay);
  g.command({ type: "openEpilogue" });

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignEpilogue.gift, g.s.campaignEpilogue.gift);
});

test("validate : refuse un gift dont l'espèce n'existe pas parmi les founders", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  raw.campaignEpilogue = {
    unlocksOnDay: 5,
    orientation: "durable",
    openedOnDay: 5,
    gift: { speciesId: "espece-inventee", giverId: "iris" },
  };
  assert.throws(() => validate(raw));
});

test("validate : refuse un gift dont le donateur n'est pas un visiteur réel", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  raw.campaignEpilogue = {
    unlocksOnDay: 5,
    orientation: "durable",
    openedOnDay: 5,
    // "jeanne" used to be this fixture's example (she wasn't yet a real
    // visitorId) until Épic C6.22 added her as one — a fixture value this
    // test's own premise depends on staying false must never be a value a
    // later epic could accidentally make true, so this uses an id that can
    // never resolve to a real building by construction.
    gift: { speciesId: "aster-des-vents", giverId: "ceci-n-est-pas-un-visiteur" },
  };
  assert.throws(() => validate(raw));
});

test("validate : refuse un gift renseigné alors qu'openedOnDay est toujours null", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  raw.campaignEpilogue = {
    unlocksOnDay: 5,
    orientation: null,
    openedOnDay: null,
    gift: { speciesId: "aster-des-vents", giverId: "iris" },
  };
  assert.throws(() => validate(raw));
});

test("validate : refuse un gift qui n'est pas un objet", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  raw.campaignEpilogue = {
    unlocksOnDay: 5,
    orientation: "durable",
    openedOnDay: 5,
    gift: "aster-des-vents",
  };
  assert.throws(() => validate(raw));
});
