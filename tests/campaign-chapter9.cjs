const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D } = require("./garden-rules-helpers.cjs");
const Buildings = require("../public/game/data-buildings.js");
const Narrative = require("../public/game/data-narrative.js");

// Épic C4.9 (design §10, chapitre 9, "Le chemin d'eau"). L'entrée de backlog de cet epic listait
// deux options (quête portée par Iris, ou déclenchement purement narratif sans npcId) et demandait
// de trancher avant d'écrire du code. Vérification préalable faite : le tableau §8 ("Lieux et
// déblocages") nomme un lieu "Galerie de brume" dont la rencontre ("Inès cherche un feuillage qui
// recueille les gouttes") et la réponse botanique ("installer puis orienter des plantes en coupe
// au bon endroit") reprennent quasiment mot pour mot la phrase du chapitre 9 lui-même
// ("installation de feuillages collecteurs dans la galerie de brume") — ni l'option Iris ni
// l'option purement narrative n'était donc la meilleure lecture disponible. npcId "ines" pointe
// vers une visiteuse déjà réelle du jardin libre (role "vendor", cz:13.5, zone 0), sans quête
// existante attachée.

test("brume-d-ines points at the existing jardin libre visitor 'ines', not a new building", () => {
  assert.equal(D.quests["brume-d-ines"].npcId, "ines");
  const ines = Buildings.buildings.find((b) => b.visitorId === "ines");
  assert.ok(ines, "the existing jardin libre 'ines' building must still exist");
  assert.equal(ines.role, "vendor", "ines's existing role/shop stays untouched");
});

test("ines is already reachable from a fresh save (zone 0's bulge, cz:13.5 < 22)", () => {
  const zone0 = D.zones.find((z) => z.id === 0);
  assert.deepEqual(zone0.cost, {}, "zone 0 stays unlocked by default");
  const ines = Buildings.buildings.find((b) => b.visitorId === "ines");
  assert.ok(ines.z < 22, "ines sits inside zone 0's bulge, not zone 4 (which starts at z:22)");
});

test("the reward schema carries a narrativeFlag naming a real data-narrative.js trigger, and a potCapacity of 2", () => {
  const reward = D.quests["brume-d-ines"].reward;
  assert.equal(typeof reward.narrativeFlag, "string");
  const entry = Narrative.findByTrigger(reward.narrativeFlag);
  assert.ok(entry, "the trigger must resolve to a real TEXTS entry");
  assert.equal(entry.id, "chemin-eau-etiquette");
  assert.equal(reward.potCapacity, 2);
});

test("a fresh campaign save starts with pot capacity 1, unaffected by this quest existing", () => {
  const g = new GardenState(null, 1000);
  assert.equal(g.s.campaignPot.capacity, 1);
});

test("accepting brume-d-ines changes neither the pot capacity nor campaignFlags", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "brume-d-ines" }).ok,
    true,
  );
  assert.equal(g.s.campaignPot.capacity, 1);
  assert.deepEqual(g.s.campaignFlags, []);
});

test("completing brume-d-ines raises the pot capacity to 2 and reveals its narrative text, only at completion", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = D.quests["brume-d-ines"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "brume-d-ines" }).ok,
    true,
  );
  assert.equal(g.s.campaignPot.capacity, 2);
  assert.deepEqual(g.s.campaignFlags, ["chemin-eau-etiquette"]);
});

test("completing the quest before its delivery is met is rejected: capacity and flags stay untouched", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 0;
  const r = g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  assert.equal(r.ok, false);
  assert.equal(g.s.campaignPot.capacity, 1);
  assert.deepEqual(g.s.campaignFlags, []);
});

test("reward.potCapacity never regresses an already-higher capacity (Math.max, not an overwrite)", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignPot.capacity = 3;
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  assert.equal(
    g.s.campaignPot.capacity,
    3,
    "a quest granting potCapacity: 2 must never lower an already-higher capacity",
  );
});

test("a second hypothetical completion never re-reveals or duplicates the flag nor grows capacity past 2 (s.quests.completed already blocks a second accept)", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  assert.equal(g.s.campaignPot.capacity, 2);
  assert.deepEqual(g.s.campaignFlags, ["chemin-eau-etiquette"]);
  const r = g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  assert.equal(r.ok, false);
  assert.equal(g.s.campaignPot.capacity, 2);
  assert.deepEqual(g.s.campaignFlags, ["chemin-eau-etiquette"]);
});

test("the generic potCapacity/narrativeFlag path and the pre-existing serre-unlock path coexist without interference", () => {
  const g = new GardenState(null, 1000);
  // Complete fenetre-de-noe first (the hard-coded serre reveal from C4.3).
  g.command({ type: "quest", action: "accept", questId: "fenetre-de-noe" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "fenetre-de-noe" });
  assert.deepEqual(g.s.campaignFlags, ["serre-note-pot"]);
  assert.equal(g.s.campaignPot.capacity, 1, "unrelated quest never touches pot capacity");
  // Then complete brume-d-ines (the new capacity-raising reveal).
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  assert.equal(g.s.campaignPot.capacity, 2);
  assert.deepEqual(
    [...g.s.campaignFlags].sort(),
    ["chemin-eau-etiquette", "serre-note-pot"],
  );
});

test("a JSON round-trip after completion keeps both the raised capacity and the revealed flag exactly", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.equal(reloaded.s.campaignPot.capacity, 2);
  assert.deepEqual(reloaded.s.campaignFlags, ["chemin-eau-etiquette"]);
});
