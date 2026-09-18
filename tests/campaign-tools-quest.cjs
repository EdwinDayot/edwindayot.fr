const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D, validate } = require("./garden-rules-helpers.cjs");

// Épic C3.6 (design §15 phase 3, "première quête d'outil") : reward.tools est une extension
// additive du schéma de récompense de quête (même patron que reward.plans, garden-state-cmd-e.js)
// — un outil nommé rejoint s.campaignTools seulement à la complétion réelle, jamais à
// l'acceptation. "bois-pour-l-hiver" (data-quests.js) est la quête de départ réelle, npcId
// villageois-1 (Épic C3.5), objectif deliver déjà supporté par quests.js.
//
// Épic C4.1 a depuis fait démarrer campaignTools avec "outil-de-fortune" dès fresh() (design §10,
// chapitre 1) : les assertions ci-dessous partent donc de ce seul outil de départ plutôt que d'un
// sac vide, jamais réévalué ni retiré par une commande de quête.

test("a fresh campaign save starts with only the makeshift tool, no quest reward yet", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.campaignTools, ["outil-de-fortune"]);
});

test("a tool reward is granted only on completion, never on acceptance", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "bois-pour-l-hiver" })
      .ok,
    true,
  );
  assert.deepEqual(
    g.s.campaignTools,
    ["outil-de-fortune"],
    "accepting the quest must not grant the tool yet",
  );
  g.s.inventory.wood = D.quests["bois-pour-l-hiver"].objective.quantity;
  assert.equal(
    g.command({
      type: "quest",
      action: "complete",
      questId: "bois-pour-l-hiver",
    }).ok,
    true,
  );
  assert.deepEqual(g.s.campaignTools, ["outil-de-fortune", "hachette"]);
});

test("completing before the objective is met is rejected and grants nothing", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "bois-pour-l-hiver" });
  g.s.inventory.wood = 0;
  const r = g.command({
    type: "quest",
    action: "complete",
    questId: "bois-pour-l-hiver",
  });
  assert.equal(r.ok, false);
  assert.deepEqual(g.s.campaignTools, ["outil-de-fortune"]);
});

test("a synthetic tools reward never duplicates an already-granted tool", () => {
  const synthetic = {
    npcId: "villageois-1",
    title: "Test",
    objective: { type: "reputation", threshold: 0 },
    reward: { tools: ["hachette"] },
    requires: [],
  };
  D.quests["__test-tools-reward"] = synthetic;
  try {
    const g = new GardenState(null, 1000);
    g.s.campaignTools = ["hachette"];
    assert.equal(
      g.command({
        type: "quest",
        action: "accept",
        questId: "__test-tools-reward",
      }).ok,
      true,
    );
    assert.equal(
      g.command({
        type: "quest",
        action: "complete",
        questId: "__test-tools-reward",
      }).ok,
      true,
    );
    assert.deepEqual(g.s.campaignTools, ["hachette"]);
  } finally {
    delete D.quests["__test-tools-reward"];
  }
});

test("an existing save without campaignTools migrates to an empty list without error", () => {
  const g = new GardenState(null, 1000);
  const saved = g.serialize();
  delete saved.campaignTools;
  const migrated = validate(saved);
  assert.deepEqual(migrated.campaignTools, []);
});

test("a save with well-formed campaignTools validates unchanged", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignTools = ["hachette"];
  const saved = g.serialize();
  const validated = validate(saved);
  assert.deepEqual(validated.campaignTools, ["hachette"]);
});

test("validate rejects a malformed campaignTools: non-array, non-string entry, duplicate", () => {
  const base = () => new GardenState(null, 1000).serialize();

  const notArray = base();
  notArray.campaignTools = "hachette";
  assert.throws(() => validate(notArray), /Outils de campagne invalides/);

  const nonString = base();
  nonString.campaignTools = [42];
  assert.throws(() => validate(nonString), /Outils de campagne invalides/);

  const duplicate = base();
  duplicate.campaignTools = ["hachette", "hachette"];
  assert.throws(() => validate(duplicate), /Outils de campagne invalides/);
});

test("a real round trip through JSON keeps a granted tool strictly identical", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "bois-pour-l-hiver" });
  g.s.inventory.wood = D.quests["bois-pour-l-hiver"].objective.quantity;
  g.command({
    type: "quest",
    action: "complete",
    questId: "bois-pour-l-hiver",
  });
  const roundTripped = JSON.parse(JSON.stringify(g.serialize()));
  assert.deepEqual(roundTripped.campaignTools, g.s.campaignTools);
});
