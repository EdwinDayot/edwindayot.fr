const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D } = require("./garden-rules-helpers.cjs");
const Buildings = require("../public/game/data-buildings.js");

// Épic C4.7 (design §10, chapitre 7, "Une fleur pour une fenêtre" ; §8, "Sentier des vents" /
// "Verger en terrasses"). Deux quêtes réelles, npcId "anouk" et "basile" — vérifiées avant
// d'écrire comme des visiteurs déjà existants du jardin libre (data-buildings.js, role "vendor",
// tous deux cz:20, dans le renflement du polygone de la zone 0 qui atteint [-6, 22], donc déjà
// déverrouillés par défaut) — même posture que C4.2/C4.3/C4.5. Aucune dépendance entre les deux
// (design : "ces deux étapes peuvent être préparées en parallèle").

test("anouk and basile point at the existing jardin libre visitors, not new buildings", () => {
  assert.equal(D.quests["sentier-d-anouk"].npcId, "anouk");
  assert.equal(D.quests["fibres-de-basile"].npcId, "basile");
  const anouk = Buildings.buildings.find((b) => b.visitorId === "anouk");
  const basile = Buildings.buildings.find((b) => b.visitorId === "basile");
  assert.ok(anouk, "the existing jardin libre 'anouk' building must still exist");
  assert.ok(basile, "the existing jardin libre 'basile' building must still exist");
  assert.equal(anouk.role, "vendor", "anouk's existing role/shop stays untouched");
  assert.equal(basile.role, "vendor", "basile's existing role/shop stays untouched");
});

test("both anouk and basile are already reachable from a fresh save (zone 0's bulge, cz:20 < 22)", () => {
  const zone0 = D.zones.find((z) => z.id === 0);
  assert.deepEqual(zone0.cost, {}, "zone 0 stays unlocked by default");
  const anouk = Buildings.buildings.find((b) => b.visitorId === "anouk");
  const basile = Buildings.buildings.find((b) => b.visitorId === "basile");
  assert.ok(anouk.z < 22, "anouk sits inside zone 0's bulge, not zone 4 (which starts at z:22)");
  assert.ok(basile.z < 22, "basile sits inside zone 0's bulge, not zone 4");
});

test("completing sentier-d-anouk grants the pioche only at completion, never at acceptance", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "sentier-d-anouk" }).ok,
    true,
  );
  assert.equal(
    g.s.campaignTools.includes("pioche"),
    false,
    "accepting the quest must not grant the tool yet",
  );
  g.s.inventory["cutting:pilea"] = D.quests["sentier-d-anouk"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "sentier-d-anouk" }).ok,
    true,
  );
  assert.equal(g.s.campaignTools.includes("pioche"), true);
});

test("completing fibres-de-basile grants the scie only at completion, never at acceptance", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "fibres-de-basile" }).ok,
    true,
  );
  assert.equal(
    g.s.campaignTools.includes("scie"),
    false,
    "accepting the quest must not grant the tool yet",
  );
  g.s.inventory["cutting:pilea"] = D.quests["fibres-de-basile"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "fibres-de-basile" }).ok,
    true,
  );
  assert.equal(g.s.campaignTools.includes("scie"), true);
});

test("completing either quest before its delivery is met is rejected and grants nothing", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "sentier-d-anouk" });
  g.command({ type: "quest", action: "accept", questId: "fibres-de-basile" });
  g.s.inventory["cutting:pilea"] = 0;
  const rAnouk = g.command({
    type: "quest",
    action: "complete",
    questId: "sentier-d-anouk",
  });
  const rBasile = g.command({
    type: "quest",
    action: "complete",
    questId: "fibres-de-basile",
  });
  assert.equal(rAnouk.ok, false);
  assert.equal(rBasile.ok, false);
  assert.equal(g.s.campaignTools.includes("pioche"), false);
  assert.equal(g.s.campaignTools.includes("scie"), false);
});

test("the two quests are independent: either order, or fully interleaved/parallel, ends with both tools and no interference", () => {
  // Order A: anouk first, then basile.
  const gA = new GardenState(null, 1000);
  gA.command({ type: "quest", action: "accept", questId: "sentier-d-anouk" });
  gA.s.inventory["cutting:pilea"] = 1;
  assert.equal(
    gA.command({ type: "quest", action: "complete", questId: "sentier-d-anouk" }).ok,
    true,
  );
  gA.command({ type: "quest", action: "accept", questId: "fibres-de-basile" });
  gA.s.inventory["cutting:pilea"] = 1;
  assert.equal(
    gA.command({ type: "quest", action: "complete", questId: "fibres-de-basile" }).ok,
    true,
  );
  assert.deepEqual(new Set(gA.s.campaignTools).has("pioche"), true);
  assert.deepEqual(new Set(gA.s.campaignTools).has("scie"), true);

  // Order B: basile first, then anouk.
  const gB = new GardenState(null, 1000);
  gB.command({ type: "quest", action: "accept", questId: "fibres-de-basile" });
  gB.s.inventory["cutting:pilea"] = 1;
  assert.equal(
    gB.command({ type: "quest", action: "complete", questId: "fibres-de-basile" }).ok,
    true,
  );
  gB.command({ type: "quest", action: "accept", questId: "sentier-d-anouk" });
  gB.s.inventory["cutting:pilea"] = 1;
  assert.equal(
    gB.command({ type: "quest", action: "complete", questId: "sentier-d-anouk" }).ok,
    true,
  );
  assert.deepEqual(new Set(gB.s.campaignTools).has("pioche"), true);
  assert.deepEqual(new Set(gB.s.campaignTools).has("scie"), true);

  // Parallel: both accepted before either is completed, a single delivery batch satisfies both
  // (design: "ces deux étapes peuvent être préparées en parallèle").
  const gC = new GardenState(null, 1000);
  gC.command({ type: "quest", action: "accept", questId: "sentier-d-anouk" });
  gC.command({ type: "quest", action: "accept", questId: "fibres-de-basile" });
  gC.s.inventory["cutting:pilea"] = 1;
  assert.equal(
    gC.command({ type: "quest", action: "complete", questId: "sentier-d-anouk" }).ok,
    true,
  );
  gC.s.inventory["cutting:pilea"] = 1;
  assert.equal(
    gC.command({ type: "quest", action: "complete", questId: "fibres-de-basile" }).ok,
    true,
  );
  assert.deepEqual(new Set(gC.s.campaignTools).has("pioche"), true);
  assert.deepEqual(new Set(gC.s.campaignTools).has("scie"), true);
});
