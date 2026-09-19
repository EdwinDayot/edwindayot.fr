const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const House = require("../public/game/campaign-house.js");
const Narrative = require("../public/game/data-narrative.js");

// Epic C4.1 (design §10, chapitre 1 "La clé sous le pot vide") : un choix explicite et
// mutuellement exclusif entre conserver/encadrer/repeindre les marques de meuble retrouvées,
// persisté et jamais réinitialisé après confirmation ; déclenche la première lettre d'Alma via
// le mécanisme narratif générique (data-narrative.js/s.campaignFlags), listée ensuite dans le
// carnet. Un outil de fortune est déjà en possession du joueur dès une partie neuve.

test("a fresh campaign save starts with the makeshift tool already in the sack", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.campaignTools, ["outil-de-fortune"]);
});

test("a fresh campaign save starts with no furniture marks decision and no revealed text", () => {
  const g = new GardenState(null, 1000);
  assert.equal(g.s.campaignHouse.furnitureMarks, null);
  assert.deepEqual(g.s.campaignFlags, []);
});

test("chooseFurnitureTreatment records the choice and reveals Alma's letter exactly once", () => {
  const g = new GardenState(null, 1000);
  const r = g.command({ type: "chooseFurnitureTreatment", choice: "conserve" });
  assert.equal(r.ok, true);
  assert.equal(g.s.campaignHouse.furnitureMarks, "conserve");
  assert.deepEqual(g.s.campaignFlags, ["alma-marques-meuble"]);
  assert.match(r.message, /Nouvelle page dans le carnet/);
});

test("a second chooseFurnitureTreatment call is refused: only one choice can ever be active", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "chooseFurnitureTreatment", choice: "encadre" }).ok,
    true,
  );
  const r = g.command({ type: "chooseFurnitureTreatment", choice: "repeint" });
  assert.equal(r.ok, false);
  assert.match(r.message, /déjà été fait/);
  // The first decision is untouched by the refused second attempt.
  assert.equal(g.s.campaignHouse.furnitureMarks, "encadre");
  assert.deepEqual(g.s.campaignFlags, ["alma-marques-meuble"]);
});

test("an unknown treatment choice is refused explicitly, without touching the state", () => {
  const g = new GardenState(null, 1000);
  const r = g.command({ type: "chooseFurnitureTreatment", choice: "brûler" });
  assert.equal(r.ok, false);
  assert.ok(r.message.includes("brûler"));
  assert.equal(g.s.campaignHouse.furnitureMarks, null);
  assert.deepEqual(g.s.campaignFlags, []);
});

for (const choice of House.FURNITURE_TREATMENTS)
  test(`chooseFurnitureTreatment accepts "${choice}" as a valid treatment`, () => {
    const g = new GardenState(null, 1000);
    const r = g.command({ type: "chooseFurnitureTreatment", choice });
    assert.equal(r.ok, true);
    assert.equal(g.s.campaignHouse.furnitureMarks, choice);
  });

test("the furniture treatment choice and the revealed letter survive a real JSON round trip", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "chooseFurnitureTreatment", choice: "repeint" });
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.equal(reloaded.s.campaignHouse.furnitureMarks, "repeint");
  assert.deepEqual(reloaded.s.campaignFlags, ["alma-marques-meuble"]);
  // Confirms the reload doesn't re-trigger the reveal: attempting the (already refused) choice
  // again leaves campaignFlags exactly as it was, never duplicated.
  const r = reloaded.command({ type: "chooseFurnitureTreatment", choice: "conserve" });
  assert.equal(r.ok, false);
  assert.deepEqual(reloaded.s.campaignFlags, ["alma-marques-meuble"]);
});

test("Narrative.pendingReveal never re-offers a text already recorded in campaignFlags", () => {
  const already = ["alma-marques-meuble"];
  assert.equal(Narrative.pendingReveal(already, "furnitureMarksChosen"), null);
  assert.equal(Narrative.pendingReveal([], "furnitureMarksChosen").id, "alma-marques-meuble");
  assert.equal(Narrative.pendingReveal([], "no-such-signal"), null);
});

test("a v3 save without campaignHouse.furnitureMarks/campaignFlags migrates to defaults without error", () => {
  const g = new GardenState(null, 1000);
  const saved = g.serialize();
  delete saved.campaignHouse.furnitureMarks;
  delete saved.campaignFlags;
  const migrated = validate(saved);
  assert.equal(migrated.campaignHouse.furnitureMarks, null);
  assert.deepEqual(migrated.campaignFlags, []);
  // Nothing else in campaignHouse changes during this migration.
  assert.deepEqual(migrated.campaignHouse.spaces, saved.campaignHouse.spaces);
});

test("a save with a well-formed furniture choice validates unchanged", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "chooseFurnitureTreatment", choice: "conserve" });
  const saved = g.serialize();
  const validated = validate(saved);
  assert.equal(validated.campaignHouse.furnitureMarks, "conserve");
  assert.deepEqual(validated.campaignFlags, ["alma-marques-meuble"]);
});

test("validate rejects a malformed campaignHouse.furnitureMarks value", () => {
  const g = new GardenState(null, 1000);
  const saved = g.serialize();
  saved.campaignHouse.furnitureMarks = "brûler";
  assert.throws(() => validate(saved), /Maison refuge invalide/);
});

test("validate rejects a malformed campaignFlags field", () => {
  const g = new GardenState(null, 1000);
  for (const bad of [1, "nope", { a: 1 }, [1, 2], ["a", "a"]]) {
    const saved = g.serialize();
    saved.campaignFlags = bad;
    assert.throws(() => validate(saved), /Indicateurs narratifs invalides/);
  }
});

test("repairing the reception room remains the only mechanical gesture required, unchanged by this epic", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory = { ...House.SPACES.accueil.cost, coins: 0 };
  const r = g.command({ type: "repairHouseSpace", space: "accueil" });
  assert.equal(r.ok, true);
  assert.equal(g.s.campaignHouse.spaces.accueil.status, "repare");
});
