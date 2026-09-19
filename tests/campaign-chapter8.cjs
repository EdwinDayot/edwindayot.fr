const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D } = require("./garden-rules-helpers.cjs");
const Buildings = require("../public/game/data-buildings.js");
const Narrative = require("../public/game/data-narrative.js");

// Épic C4.8 (design §10, chapitre 8, "La table longue"). Une quête réelle, npcId "lea" —
// vérifiée avant d'écrire comme visiteuse déjà existante du jardin libre (data-buildings.js,
// role "trader", cz:7, zone 0, déjà déverrouillée par défaut) — même posture que
// C4.2/C4.3/C4.5/C4.7. La récompense révèle un texte narratif via le nouveau champ additif
// générique reward.narrativeFlag (garden-state-cmd-e.js), pas via une condition codée en dur
// comme le fait C4.3 pour la serre.

test("table-longue-lea points at the existing jardin libre visitor, not a new building", () => {
  assert.equal(D.quests["table-longue-lea"].npcId, "lea");
  const lea = Buildings.buildings.find((b) => b.visitorId === "lea");
  assert.ok(lea, "the existing jardin libre 'lea' building must still exist");
  assert.equal(lea.role, "trader", "lea's existing role/shop stays untouched");
});

test("lea is already reachable from a fresh save (zone 0, unlocked by default)", () => {
  const zone0 = D.zones.find((z) => z.id === 0);
  assert.deepEqual(zone0.cost, {}, "zone 0 stays unlocked by default");
});

test("the reward schema carries a narrativeFlag naming a real data-narrative.js trigger", () => {
  const flag = D.quests["table-longue-lea"].reward.narrativeFlag;
  assert.equal(typeof flag, "string");
  const entry = Narrative.findByTrigger(flag);
  assert.ok(entry, "the trigger must resolve to a real TEXTS entry");
  assert.equal(entry.id, "table-longue-approvisionnee");
});

test("completing table-longue-lea reveals its narrative text only at completion, never at acceptance", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "table-longue-lea" }).ok,
    true,
  );
  assert.deepEqual(
    g.s.campaignFlags,
    [],
    "accepting the quest must not reveal the text yet",
  );
  g.s.inventory["cutting:pilea"] = D.quests["table-longue-lea"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "table-longue-lea" }).ok,
    true,
  );
  assert.deepEqual(g.s.campaignFlags, ["table-longue-approvisionnee"]);
});

test("completing the quest before its delivery is met is rejected and reveals nothing", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "table-longue-lea" });
  g.s.inventory["cutting:pilea"] = 0;
  const r = g.command({ type: "quest", action: "complete", questId: "table-longue-lea" });
  assert.equal(r.ok, false);
  assert.deepEqual(g.s.campaignFlags, []);
});

test("a second hypothetical completion never re-reveals or duplicates the flag (s.quests.completed already blocks a second accept)", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "table-longue-lea" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "table-longue-lea" });
  assert.deepEqual(g.s.campaignFlags, ["table-longue-approvisionnee"]);
  // A second accept of the same completed quest is refused by the existing quest engine.
  const r = g.command({ type: "quest", action: "accept", questId: "table-longue-lea" });
  assert.equal(r.ok, false);
  assert.deepEqual(
    g.s.campaignFlags,
    ["table-longue-approvisionnee"],
    "no duplicate flag entry",
  );
});

test("the generic narrativeFlag path and the pre-existing serre-unlock path coexist without interference", () => {
  const g = new GardenState(null, 1000);
  // Complete fenetre-de-noe first (the hard-coded serre reveal from C4.3).
  g.command({ type: "quest", action: "accept", questId: "fenetre-de-noe" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "fenetre-de-noe" });
  assert.deepEqual(g.s.campaignFlags, ["serre-note-pot"]);
  // Then complete table-longue-lea (the new generic reveal).
  g.command({ type: "quest", action: "accept", questId: "table-longue-lea" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "table-longue-lea" });
  assert.deepEqual(
    [...g.s.campaignFlags].sort(),
    ["serre-note-pot", "table-longue-approvisionnee"],
  );
});

test("a JSON round-trip after completion keeps the revealed flag exactly", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "table-longue-lea" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "table-longue-lea" });
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.campaignFlags, ["table-longue-approvisionnee"]);
});
