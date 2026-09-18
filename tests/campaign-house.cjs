const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const House = require("../public/game/campaign-house.js");

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
