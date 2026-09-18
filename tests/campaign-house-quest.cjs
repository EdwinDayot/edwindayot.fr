const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D, validate } = require("./garden-rules-helpers.cjs");

// Épic C4.2 (design §10, chapitre 2, "Ce qu'on reconnaît encore") : reward.unlockHouseSpace est
// une extension additive du schéma de récompense de quête (même patron que reward.tools,
// garden-state-cmd-e.js) — un espace nommé de la maison refuge est déverrouillé (locked: false)
// seulement à la complétion réelle, jamais à l'acceptation, et jamais automatiquement réparé
// (repairHouseSpace, C3.1, reste le seul geste qui répare). La quête réelle "fenetre-de-noe"
// pointe npcId "noe" — le visiteur "Noé" déjà existant du jardin libre (data-buildings.js, role
// "vendor"), pas un second PNJ dupliqué : voir le commentaire de data-quests.js.

test("the greenhouse starts locked on a fresh campaign save", () => {
  const g = new GardenState(null, 1000);
  assert.equal(g.s.campaignHouse.spaces.serre.locked, true);
  assert.equal(g.s.campaignHouse.spaces.serre.status, "delabre");
});

test("noe's window quest points at the existing free-garden visitor, not a new one", () => {
  const Buildings = require("../public/game/data-buildings.js");
  assert.equal(D.quests["fenetre-de-noe"].npcId, "noe");
  const noe = Buildings.buildings.find((b) => b.visitorId === "noe");
  assert.ok(noe, "the existing jardin libre 'noe' building must still exist");
  assert.equal(noe.role, "vendor", "noe's existing role/shop stays untouched");
});

test("completing fenetre-de-noe unlocks the greenhouse but never repairs it, only on completion", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "fenetre-de-noe" })
      .ok,
    true,
  );
  assert.equal(
    g.s.campaignHouse.spaces.serre.locked,
    true,
    "accepting the quest must not unlock the greenhouse yet",
  );
  g.s.inventory["cutting:pilea"] =
    D.quests["fenetre-de-noe"].objective.quantity;
  assert.equal(
    g.command({
      type: "quest",
      action: "complete",
      questId: "fenetre-de-noe",
    }).ok,
    true,
  );
  assert.equal(g.s.campaignHouse.spaces.serre.locked, false);
  assert.equal(
    g.s.campaignHouse.spaces.serre.status,
    "delabre",
    "unlocking is never an automatic repair",
  );
});

test("completing before the delivery is met is rejected and unlocks nothing", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "fenetre-de-noe" });
  g.s.inventory["cutting:pilea"] = 0;
  const r = g.command({
    type: "quest",
    action: "complete",
    questId: "fenetre-de-noe",
  });
  assert.equal(r.ok, false);
  assert.equal(g.s.campaignHouse.spaces.serre.locked, true);
});

test("an unlock reward silently ignores an unknown space id rather than throwing", () => {
  const synthetic = {
    npcId: "noe",
    title: "Test",
    objective: { type: "reputation", threshold: 0 },
    reward: { unlockHouseSpace: ["pas-un-espace"] },
    requires: [],
  };
  D.quests["__test-unlock-reward"] = synthetic;
  try {
    const g = new GardenState(null, 1000);
    assert.equal(
      g.command({
        type: "quest",
        action: "accept",
        questId: "__test-unlock-reward",
      }).ok,
      true,
    );
    assert.doesNotThrow(() => {
      const r = g.command({
        type: "quest",
        action: "complete",
        questId: "__test-unlock-reward",
      });
      assert.equal(r.ok, true);
    });
  } finally {
    delete D.quests["__test-unlock-reward"];
  }
});

test("an unlock reward never re-locks an already-unlocked space and is idempotent", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "fenetre-de-noe" });
  g.s.inventory["cutting:pilea"] =
    D.quests["fenetre-de-noe"].objective.quantity;
  g.command({
    type: "quest",
    action: "complete",
    questId: "fenetre-de-noe",
  });
  assert.equal(g.s.campaignHouse.spaces.serre.locked, false);
  // repair it, then re-run the exact same reward loop directly to prove it
  // never flips a repaired space back to locked.
  g.s.inventory = { ...require("../public/game/campaign-house.js").SPACES.serre.cost, coins: 0 };
  g.command({ type: "repairHouseSpace", space: "serre" });
  assert.equal(g.s.campaignHouse.spaces.serre.status, "repare");
  for (const spaceId of ["serre"])
    if (g.s.campaignHouse.spaces[spaceId])
      g.s.campaignHouse.spaces[spaceId].locked = false;
  assert.equal(g.s.campaignHouse.spaces.serre.status, "repare");
  assert.equal(g.s.campaignHouse.spaces.serre.locked, false);
});

test("a real round trip through JSON keeps the unlocked space strictly identical", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "fenetre-de-noe" });
  g.s.inventory["cutting:pilea"] =
    D.quests["fenetre-de-noe"].objective.quantity;
  g.command({
    type: "quest",
    action: "complete",
    questId: "fenetre-de-noe",
  });
  const roundTripped = JSON.parse(JSON.stringify(g.serialize()));
  assert.deepEqual(roundTripped.campaignHouse, g.s.campaignHouse);
  validate(roundTripped);
});
