const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D, irrigation } = require("./garden-rules-helpers.cjs");
const Quests = require("../public/game/quests.js");

test("deliver: progress and completion track a single inventory count", () => {
  const s = { inventory: { coins: 3 } };
  assert.deepEqual(
    Quests.evaluateObjective(
      { type: "deliver", item: "coins", quantity: 5 },
      s,
    ),
    {
      progress: 0.6,
      complete: false,
    },
  );
  s.inventory.coins = 5;
  assert.equal(
    Quests.evaluateObjective({ type: "deliver", item: "coins", quantity: 5 }, s)
      .complete,
    true,
  );
});

test("networkState: counts entities of a type currently carrying flow", () => {
  const g = irrigation();
  assert.equal(
    Quests.evaluateObjective(
      { type: "networkState", check: "drip", count: 1 },
      g.s,
    ).complete,
    false,
    "nothing has flowed yet before the first tick",
  );
  g.step(1);
  assert.equal(
    Quests.evaluateObjective(
      { type: "networkState", check: "drip", count: 1 },
      g.s,
    ).complete,
    true,
  );
  assert.equal(
    Quests.evaluateObjective(
      { type: "networkState", check: "drip", count: 2 },
      g.s,
    ).progress,
    0.5,
  );
});

test("networkSustained: the timer accumulates only while the condition holds, based on s.elapsed", () => {
  const g = irrigation(),
    objective = {
      type: "networkSustained",
      check: "drip",
      count: 1,
      seconds: 2,
    },
    entry = { progress: {} };
  for (let i = 0; i < 2; i++) {
    g.step(1);
    assert.equal(
      Quests.evaluateObjective(objective, g.s, entry).complete,
      false,
    );
  }
  g.step(1);
  assert.equal(Quests.evaluateObjective(objective, g.s, entry).complete, true);
});

test("networkSustained: breaking the condition resets the timer instead of pausing it", () => {
  const g = irrigation(),
    objective = {
      type: "networkSustained",
      check: "drip",
      count: 1,
      seconds: 3,
    },
    entry = { progress: {} };
  g.step(1);
  Quests.evaluateObjective(objective, g.s, entry);
  const startedAt = entry.progress.sustainedSince;
  assert.equal(startedAt, 1);
  g.s.links = []; // disconnect the drip: condition no longer holds
  g.step(1);
  assert.deepEqual(Quests.evaluateObjective(objective, g.s, entry), {
    progress: 0,
    complete: false,
  });
  assert.equal(entry.progress.sustainedSince, undefined);
});

test("discoverSpecies and reputation reuse existing counters directly", () => {
  assert.deepEqual(
    Quests.evaluateObjective(
      { type: "discoverSpecies", count: 2 },
      { discovered: ["pilea"] },
    ),
    { progress: 0.5, complete: false },
  );
  assert.equal(
    Quests.evaluateObjective(
      { type: "discoverSpecies", count: 2 },
      { discovered: ["pilea", "monstera"] },
    ).complete,
    true,
  );
  assert.deepEqual(
    Quests.evaluateObjective(
      { type: "reputation", threshold: 4 },
      { reputation: 2 },
    ),
    { progress: 0.5, complete: false },
  );
  assert.equal(
    Quests.evaluateObjective(
      { type: "reputation", threshold: 4 },
      { reputation: 4 },
    ).complete,
    true,
  );
});

test("Accepting a quest before its requirements are completed is rejected", () => {
  const g = new GardenState(null, 1000),
    before = g.serialize();
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "first-drip" }).ok,
    false,
  );
  assert.deepEqual(g.serialize(), before);
});

test("Completing a quest before its objective is met is rejected, and pays nothing", () => {
  const g = new GardenState(null, 1000);
  g.s.inventory["cutting:pilea"] = 1;
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "first-harvest" }).ok,
    true,
  );
  g.s.inventory["cutting:pilea"] = 0;
  const before = g.serialize();
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "first-harvest" })
      .ok,
    false,
  );
  assert.deepEqual(g.serialize(), before);
});

test("A completed quest pays its reward exactly once and unlocks the next in the chain", () => {
  const g = new GardenState(null, 1000),
    coinsBefore = g.s.inventory.coins;
  g.s.inventory["cutting:pilea"] = 1;
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "first-harvest" }).ok,
    true,
  );
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "first-harvest" })
      .ok,
    true,
  );
  assert.equal(
    g.s.inventory.coins,
    coinsBefore + D.quests["first-harvest"].reward.coins,
  );
  assert.deepEqual(g.s.quests.completed, ["first-harvest"]);
  assert.equal(g.s.quests.active.length, 0);
  // Now unlocked: accepting and completing the second, chained quest.
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "first-drip" }).ok,
    true,
  );
  const g2 = g; // same state, keep stepping the fixtureless world (no drip here)
  assert.equal(
    g2.command({ type: "quest", action: "complete", questId: "first-drip" }).ok,
    false,
    "no drip network exists yet in this state, objective can't be met",
  );
});

test("Full lifecycle: accept, progress, save/reload mid-timer, offline catch-up, then complete", () => {
  const g = irrigation();
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "accept", questId: "first-harvest" });
  g.command({ type: "quest", action: "complete", questId: "first-harvest" });
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "first-drip" }).ok,
    true,
  );
  g.step(5);
  const entry = g.s.quests.active.find((q) => q.questId === "first-drip");
  assert.ok(entry.progress.sustainedSince !== undefined);
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "first-drip" }).ok,
    false,
    "5 seconds held is short of the 30-second requirement",
  );
  const reloaded = new GardenState(g.serialize());
  const entry2 = reloaded.s.quests.active.find(
    (q) => q.questId === "first-drip",
  );
  assert.equal(
    entry2.progress.sustainedSince,
    entry.progress.sustainedSince,
    "the timer's baseline survives a save/reload cycle",
  );
  reloaded.catchUp(reloaded.s.updatedAt + 30000);
  assert.equal(
    reloaded.command({
      type: "quest",
      action: "complete",
      questId: "first-drip",
    }).ok,
    true,
  );
  assert.ok(reloaded.s.quests.completed.includes("first-drip"));
});

test("Épic 2.3: a plans reward is granted like Léa's first-trade bonus, and reputation like any other milestone", () => {
  // No starter quest rewards a plan yet (2.2 content is a separate task);
  // this exercises that reward path directly, generically, the same way
  // garden-shop.cjs exercises "buy" without needing new catalog balance.
  const synthetic = {
    npcId: "lea",
    title: "Test",
    objective: { type: "reputation", threshold: 0 },
    reward: { plans: ["composter"], reputation: 2 },
    requires: [],
  };
  D.quests["__test-plans-reward"] = synthetic;
  try {
    const g = new GardenState(null, 1000),
      reputationBefore = g.s.reputation;
    assert.equal(
      g.s.plans.includes("composter"),
      false,
      "not granted from the start",
    );
    assert.equal(
      g.command({
        type: "quest",
        action: "accept",
        questId: "__test-plans-reward",
      }).ok,
      true,
    );
    assert.equal(
      g.command({
        type: "quest",
        action: "complete",
        questId: "__test-plans-reward",
      }).ok,
      true,
    );
    assert.ok(g.s.plans.includes("composter"));
    assert.equal(g.s.reputation, reputationBefore + 2);
  } finally {
    delete D.quests["__test-plans-reward"];
  }
});
