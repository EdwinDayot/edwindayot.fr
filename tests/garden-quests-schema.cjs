const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate, D } = require("./garden-rules-helpers.cjs");
const Roles = require("../public/game/data-roles.js");

test("A fresh game starts with empty quest state", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.quests, { active: [], completed: [] });
});

test("An old save without a quests field loads and is backfilled with the empty default", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  delete old.quests;
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.quests, { active: [], completed: [] });
});

test("A malformed quests field is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const bad of [
    { active: "nope", completed: [] },
    { active: [], completed: "nope" },
    {
      active: [
        { id: "q1", questId: "unknown-quest", npcId: "x", progress: {} },
      ],
      completed: [],
    },
    {
      active: [{ id: "q1", questId: "unknown-quest", npcId: "x" }],
      completed: [],
    },
    { active: [], completed: ["unknown-quest"] },
  ]) {
    const saved = g.serialize();
    saved.quests = bad;
    assert.throws(() => validate(saved), /Quêtes invalides/);
  }
});

test("The quest-giver role is registered and self-contained, even though no visitor uses it yet", () => {
  assert.ok(Roles.roles["quest-giver"]);
  assert.equal(
    D.buildings.some((b) => b.role === "quest-giver"),
    false,
    "the catalog's npcId tags are metadata only until a wave assigns the role to a visitor",
  );
  const context = Roles.context({ id: "lea" }, { requests: [], inventory: {} });
  assert.notEqual(context, null, "existing roles are unaffected");
});

test("D.quests carries the two free-garden starter entries plus C3.6's campaign tool quest, C4.2's house-unlock quest, C4.5's second tool quest, C4.7's two parallel tool quests and C4.8's narrative-flag quest, not the full 6-10 quest ladder (Épic 2.2, separate task)", () => {
  assert.deepEqual(Object.keys(D.quests).sort(), [
    "bassines-de-mira",
    "bois-pour-l-hiver",
    "fenetre-de-noe",
    "fibres-de-basile",
    "first-drip",
    "first-harvest",
    "sentier-d-anouk",
    "table-longue-lea",
  ]);
  for (const quest of Object.values(D.quests)) {
    assert.equal(typeof quest.npcId, "string");
    assert.equal(typeof quest.title, "string");
    assert.equal(typeof quest.objective.type, "string");
    assert.ok(Array.isArray(quest.requires));
  }
  assert.deepEqual(D.quests["first-drip"].requires, ["first-harvest"]);
});
