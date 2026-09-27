const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const House = require("../public/game/campaign-house.js");
const Decor = require("../public/game/campaign-decor.js");

// Epic C3.1 (design §6, "Restaurer donne des fonctions") : la maison refuge de campagne
// déclare six espaces nommés, chacun delabre/repare et verrouillé sauf la pièce d'accueil.
// repairHouseSpace transitionne un espace non verrouillé de delabre à repare en consommant son
// coût en ressources (wood/stone/clay — voir campaign-house.js pour pourquoi pas de "fibres").

test("a fresh campaign save declares all six house spaces, only the reception room unlocked", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(Object.keys(g.s.campaignHouse.spaces).sort(), [
    "accueil",
    "atelier",
    "cuisine",
    "grenier",
    "serre",
    "veranda",
  ]);
  for (const id of House.SPACE_IDS) {
    assert.equal(g.s.campaignHouse.spaces[id].status, "delabre");
    assert.equal(g.s.campaignHouse.spaces[id].locked, id !== "accueil");
  }
});

test("repairHouseSpace repairs an unlocked, delabre space and debits its exact cost", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory = { ...House.SPACES.accueil.cost, coins: 0 };
  const r = g.command({ type: "repairHouseSpace", space: "accueil" });
  assert.equal(r.ok, true);
  assert.equal(g.s.campaignHouse.spaces.accueil.status, "repare");
  for (const [id, n] of Object.entries(House.SPACES.accueil.cost))
    assert.equal(g.s.inventory[id], 0);
});

test("repairHouseSpace refuses a locked space explicitly, without touching the inventory", () => {
  const g = new GardenState(null, 1000);
  const before = { ...g.s.inventory };
  const r = g.command({ type: "repairHouseSpace", space: "cuisine" });
  assert.equal(r.ok, false);
  assert.match(r.message, /verrouillé/);
  assert.deepEqual(g.s.inventory, before);
  assert.equal(g.s.campaignHouse.spaces.cuisine.status, "delabre");
});

test("repairHouseSpace refuses an already-repaired space, without a second debit", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory = { ...House.SPACES.accueil.cost, coins: 0 };
  g.command({ type: "repairHouseSpace", space: "accueil" });
  const before = { ...g.s.inventory };
  const r = g.command({ type: "repairHouseSpace", space: "accueil" });
  assert.equal(r.ok, false);
  assert.match(r.message, /déjà réparé/);
  assert.deepEqual(g.s.inventory, before);
});

test("repairHouseSpace refuses an unknown space id explicitly", () => {
  const g = new GardenState(null, 1000);
  const r = g.command({ type: "repairHouseSpace", space: "cave" });
  assert.equal(r.ok, false);
  assert.ok(r.message.includes("cave"));
});

test("repairHouseSpace with insufficient resources fails without partially consuming the inventory", () => {
  const g = new GardenState(null, 1000);
  const cost = House.SPACES.accueil.cost;
  const short = {};
  for (const [id, n] of Object.entries(cost)) short[id] = n - 1;
  g.s.inventory = short;
  const before = { ...g.s.inventory };
  const r = g.command({ type: "repairHouseSpace", space: "accueil" });
  assert.equal(r.ok, false);
  assert.match(r.message, /Ressources insuffisantes/);
  assert.deepEqual(g.s.inventory, before);
  assert.equal(g.s.campaignHouse.spaces.accueil.status, "delabre");
});

test("an existing save without campaignHouse migrates to the fresh default without error", () => {
  const g = new GardenState(null, 1000);
  const saved = g.serialize();
  delete saved.campaignHouse;
  const migrated = validate(saved);
  assert.deepEqual(migrated.campaignHouse, House.freshHouse());
});

test("a save with a well-formed, partially repaired house validates unchanged", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory = { ...House.SPACES.accueil.cost, coins: 0 };
  g.command({ type: "repairHouseSpace", space: "accueil" });
  const saved = g.serialize();
  const validated = validate(saved);
  assert.deepEqual(validated.campaignHouse, saved.campaignHouse);
});

test("validate rejects a malformed campaignHouse: missing space, bad status, non-boolean locked", () => {
  const base = () => new GardenState(null, 1000).serialize();

  const missingSpace = base();
  delete missingSpace.campaignHouse.spaces.grenier;
  assert.throws(() => validate(missingSpace), /Maison refuge invalide/);

  const badStatus = base();
  badStatus.campaignHouse.spaces.atelier.status = "neuf";
  assert.throws(() => validate(badStatus), /Maison refuge invalide/);

  const badLocked = base();
  badLocked.campaignHouse.spaces.serre.locked = "oui";
  assert.throws(() => validate(badLocked), /Maison refuge invalide/);
});

test("a real round trip through JSON keeps a partially repaired house strictly identical", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory = { ...House.SPACES.accueil.cost, coins: 0 };
  g.command({ type: "repairHouseSpace", space: "accueil" });
  const roundTripped = JSON.parse(JSON.stringify(g.s.campaignHouse));
  assert.deepEqual(roundTripped, g.s.campaignHouse);
});

// Epic C7.19 (design §6, "Aménager est un vrai mode de jeu", explicitly distinguished from C3.1's
// functional repair: "Le catalogue distingue la réparation fonctionnelle de son habillage").
// canPlaceDecor/placeDecor/canRemoveDecor/removeDecor are pure functions on campaign-house.js's
// own house shape, proven here the same way Stations' pure functions are proven in
// tests/campaign-stations.cjs — never mutating their input, always returning a fresh house.

function repairedHouse() {
  const g = new GardenState(null, 1000);
  g.s.inventory = { ...House.SPACES.accueil.cost, coins: 0 };
  g.command({ type: "repairHouseSpace", space: "accueil" });
  return g.s.campaignHouse;
}

test("a fresh house starts with an empty decor array on every space", () => {
  const house = House.freshHouse();
  for (const id of House.SPACE_IDS) assert.deepEqual(house.spaces[id].decor, []);
});

test("placeDecor adds a real item to a repaired space's decor array, input untouched", () => {
  const house = repairedHouse();
  const before = JSON.parse(JSON.stringify(house));
  const result = Decor.placeDecor(house, "accueil", "tapis");
  assert.equal(result.ok, true);
  assert.deepEqual(result.house.spaces.accueil.decor, ["tapis"]);
  assert.deepEqual(house, before, "input house must not be mutated");
});

test("placeDecor refuses an unknown item id, house unchanged", () => {
  const house = repairedHouse();
  const before = JSON.parse(JSON.stringify(house));
  const result = Decor.placeDecor(house, "accueil", "canape-en-or");
  assert.equal(result.ok, false);
  assert.match(result.error, /inconnu/);
  assert.deepEqual(house, before);
});

test("placeDecor refuses an unknown space id, house unchanged", () => {
  const house = repairedHouse();
  const before = JSON.parse(JSON.stringify(house));
  const result = Decor.placeDecor(house, "cave", "tapis");
  assert.equal(result.ok, false);
  assert.match(result.error, /Espace inconnu/);
  assert.deepEqual(house, before);
});

test("placeDecor refuses a locked space, house unchanged", () => {
  const house = repairedHouse();
  assert.equal(house.spaces.cuisine.locked, true);
  const before = JSON.parse(JSON.stringify(house));
  const result = Decor.placeDecor(house, "cuisine", "tapis");
  assert.equal(result.ok, false);
  assert.match(result.error, /verrouillé/);
  assert.deepEqual(house, before);
});

test("placeDecor refuses a delabre (unrepaired but unlocked) space, house unchanged", () => {
  // atelier is locked in a fresh house; unlock it manually without repairing it, to isolate the
  // "must be repare" check from the "must be unlocked" check exercised just above.
  const house = House.freshHouse();
  house.spaces.atelier.locked = false;
  const before = JSON.parse(JSON.stringify(house));
  const result = Decor.placeDecor(house, "atelier", "tapis");
  assert.equal(result.ok, false);
  assert.match(result.error, /réparé/);
  assert.deepEqual(house, before);
});

test("placeDecor refuses a duplicate object in the same space, house unchanged", () => {
  let house = repairedHouse();
  house = Decor.placeDecor(house, "accueil", "tapis").house;
  const before = JSON.parse(JSON.stringify(house));
  const result = Decor.placeDecor(house, "accueil", "tapis");
  assert.equal(result.ok, false);
  assert.match(result.error, /déjà présent/);
  assert.deepEqual(house, before);
});

test("the same object can be placed independently in two different repaired spaces", () => {
  // Only "accueil" ever starts unlocked (design §6) — repairHouseSpace alone can never repair a
  // second space here, so this pure-function test sets both spaces' status directly, exactly the
  // shape placeDecor itself only ever inspects (status/locked/decor), rather than exercising the
  // unrelated unlock progression (out of scope for this epic, not yet built for any space).
  let house = House.freshHouse();
  house = {
    ...house,
    spaces: {
      ...house.spaces,
      accueil: { ...house.spaces.accueil, status: "repare" },
      cuisine: { ...house.spaces.cuisine, status: "repare", locked: false },
    },
  };
  house = Decor.placeDecor(house, "accueil", "rideaux").house;
  house = Decor.placeDecor(house, "cuisine", "rideaux").house;
  assert.deepEqual(house.spaces.accueil.decor, ["rideaux"]);
  assert.deepEqual(house.spaces.cuisine.decor, ["rideaux"]);
});

test("removeDecor removes a present item from a space's decor array, input untouched", () => {
  let house = repairedHouse();
  house = Decor.placeDecor(house, "accueil", "etagere").house;
  const before = JSON.parse(JSON.stringify(house));
  const result = Decor.removeDecor(house, "accueil", "etagere");
  assert.equal(result.ok, true);
  assert.deepEqual(result.house.spaces.accueil.decor, []);
  assert.deepEqual(house, before, "input house must not be mutated");
});

test("removeDecor refuses an item absent from the space's decor array, house unchanged", () => {
  const house = repairedHouse();
  const before = JSON.parse(JSON.stringify(house));
  const result = Decor.removeDecor(house, "accueil", "tapis");
  assert.equal(result.ok, false);
  assert.match(result.error, /pas présent/);
  assert.deepEqual(house, before);
});

test("removeDecor refuses an unknown item id or an unknown space id", () => {
  const house = repairedHouse();
  assert.equal(Decor.removeDecor(house, "accueil", "canape-en-or").ok, false);
  assert.equal(Decor.removeDecor(house, "cave", "tapis").ok, false);
});

test("placeDecor/removeDecor via GardenState.command() round-trip through JSON exactly", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory = { ...House.SPACES.accueil.cost, coins: 0 };
  g.command({ type: "repairHouseSpace", space: "accueil" });

  const place = g.command({ type: "placeDecor", space: "accueil", item: "plante-interieur" });
  assert.equal(place.ok, true);
  assert.deepEqual(g.s.campaignHouse.spaces.accueil.decor, ["plante-interieur"]);

  const roundTripped = JSON.parse(JSON.stringify(g.s.campaignHouse));
  assert.deepEqual(roundTripped, g.s.campaignHouse);

  const remove = g.command({ type: "removeDecor", space: "accueil", item: "plante-interieur" });
  assert.equal(remove.ok, true);
  assert.deepEqual(g.s.campaignHouse.spaces.accueil.decor, []);

  const badPlace = g.command({ type: "placeDecor", space: "grenier", item: "tapis" });
  assert.equal(badPlace.ok, false);
  assert.match(badPlace.message, /verrouillé/);
});

test("validate rejects a malformed decor: non-array, unknown item id, duplicate entry", () => {
  const base = () => new GardenState(null, 1000).serialize();

  const nonArray = base();
  nonArray.campaignHouse.spaces.accueil.decor = "tapis";
  assert.throws(() => validate(nonArray), /Maison refuge invalide/);

  const unknownItem = base();
  unknownItem.campaignHouse.spaces.accueil.decor = ["canape-en-or"];
  assert.throws(() => validate(unknownItem), /Maison refuge invalide/);

  const duplicate = base();
  duplicate.campaignHouse.spaces.accueil.decor = ["tapis", "tapis"];
  assert.throws(() => validate(duplicate), /Maison refuge invalide/);
});

test("validate accepts a well-formed decor array and a save without decor migrates to []", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory = { ...House.SPACES.accueil.cost, coins: 0 };
  g.command({ type: "repairHouseSpace", space: "accueil" });
  g.command({ type: "placeDecor", space: "accueil", item: "rideaux" });
  const saved = g.serialize();
  const validated = validate(saved);
  assert.deepEqual(validated.campaignHouse, saved.campaignHouse);

  const preEpic = new GardenState(null, 1000).serialize();
  for (const id of House.SPACE_IDS) delete preEpic.campaignHouse.spaces[id].decor;
  const migrated = validate(preEpic);
  for (const id of House.SPACE_IDS)
    assert.deepEqual(migrated.campaignHouse.spaces[id].decor, []);
});
