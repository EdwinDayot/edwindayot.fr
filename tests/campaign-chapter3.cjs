const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D, validate } = require("./garden-rules-helpers.cjs");
const Narrative = require("../public/game/data-narrative.js");
const Buildings = require("../public/game/data-buildings.js");
const Cultivars = require("../public/game/cultivars.js");

// Épic C4.3 (design §10, chapitre 3, "La première chose nouvelle") : rejoue le chapitre avec des
// mécaniques déjà existantes (croisement au pot depuis la phase 1, nommer/multiplier depuis
// C1.4/C1.6), sans nouvelle mécanique botanique. Deux ajouts réels : (1) déverrouiller la serre
// (C4.2, reward.unlockHouseSpace: ["serre"]) révèle désormais la note "Deux graines. Une nuit.
// Regarder avant de décider." via le mécanisme générique de C4.1 ; (2) une nouvelle commande
// meetIris pose le flag narratif dont dépend C1.5 ("après le chapitre de botanique
// correspondant"). Iris est déjà un visiteur réel du jardin libre (data-buildings.js, role
// "botanist") — aucune seconde entrée inventée, même principe que "noe" pour C4.2.

test("data-narrative declares the greenhouse note and Iris's pinning reveal, each with its own signal", () => {
  assert.equal(Narrative.TEXTS["serre-note-pot"].trigger, "serreUnlocked");
  assert.equal(Narrative.TEXTS["iris-epinglage"].trigger, "irisPinningShown");
});

test("iris is the existing free-garden visitor (botanist role), not a second entry invented for the campaign", () => {
  const iris = Buildings.buildings.find((b) => b.visitorId === "iris");
  assert.ok(iris, "the existing jardin libre 'iris' building must still exist");
  assert.equal(iris.role, "botanist", "iris's existing role stays untouched");
});

test("completing fenetre-de-noe (unlocking the greenhouse) reveals the pot note exactly once", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "fenetre-de-noe" });
  g.s.inventory["cutting:pilea"] = D.quests["fenetre-de-noe"].objective.quantity;
  const r = g.command({ type: "quest", action: "complete", questId: "fenetre-de-noe" });
  assert.equal(r.ok, true);
  assert.match(r.message, /Nouvelle page dans le carnet/);
  assert.deepEqual(g.s.campaignFlags, ["serre-note-pot"]);
});

test("an unlock reward that never mentions the greenhouse never reveals its note", () => {
  const synthetic = {
    npcId: "noe",
    title: "Test",
    objective: { type: "reputation", threshold: 0 },
    reward: { unlockHouseSpace: ["grenier"] },
    requires: [],
  };
  D.quests["__test-unlock-other"] = synthetic;
  try {
    const g = new GardenState(null, 1000);
    g.command({ type: "quest", action: "accept", questId: "__test-unlock-other" });
    const r = g.command({ type: "quest", action: "complete", questId: "__test-unlock-other" });
    assert.equal(r.ok, true);
    assert.doesNotMatch(r.message, /Nouvelle page dans le carnet/);
    assert.deepEqual(g.s.campaignFlags, []);
  } finally {
    delete D.quests["__test-unlock-other"];
  }
});

test("meetIris reveals the pinning flag exactly once and never fails on a second meeting", () => {
  const g = new GardenState(null, 1000);
  const first = g.command({ type: "meetIris" });
  assert.equal(first.ok, true);
  assert.match(first.message, /Nouvelle page dans le carnet/);
  assert.deepEqual(g.s.campaignFlags, ["iris-epinglage"]);

  const second = g.command({ type: "meetIris" });
  assert.equal(second.ok, true, "meeting Iris again is never a refusal");
  assert.doesNotMatch(second.message, /Nouvelle page dans le carnet/);
  assert.deepEqual(g.s.campaignFlags, ["iris-epinglage"], "no duplicate flag entry");
});

test("meetIris and the greenhouse reveal accumulate independently in campaignFlags, in either order", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "meetIris" });
  g.command({ type: "quest", action: "accept", questId: "fenetre-de-noe" });
  g.s.inventory["cutting:pilea"] = D.quests["fenetre-de-noe"].objective.quantity;
  g.command({ type: "quest", action: "complete", questId: "fenetre-de-noe" });
  assert.deepEqual(
    [...g.s.campaignFlags].sort(),
    ["iris-epinglage", "serre-note-pot"],
  );
});

// "Installer un exemplaire chez soi" (design §10, chapitre 3) : plantSpecimen/createSpecimen
// acceptent déjà une position libre depuis C1.6. Aucune position canonique de la maison refuge
// n'existe encore dans le monde (render-campaign-house.js n'a aucun champ de coordonnées : son
// câblage caméra/scène est différé, même limite honnête déjà notée pour C2.2v/C3.2) — cette
// position est donc un point arbitraire documenté (proche du coin ouest de la zone 0, où la
// maison refuge se trouvera), utile seulement pour prouver la persistance exacte, pas une vraie
// proximité vérifiée avec un lieu déjà rendu.
const NEAR_HOUSE = { x: -15, z: -4 };

test("chapter 3: a real cross, naming, multiplying and installing a specimen near the house survive a real reload", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.cultivars.length, 1, "one real cultivar after the first hybridization night");
  const cultivar = g.s.cultivars[0];

  const named = g.command({ type: "renameCultivar", id: cultivar.id, name: "Premiere nouveaute" });
  assert.equal(named.ok, true);
  assert.equal(g.s.cultivars[0].name, "Premiere nouveaute");

  const installed = g.command({
    type: "plantSpecimen",
    cultivarId: cultivar.id,
    x: NEAR_HOUSE.x,
    z: NEAR_HOUSE.z,
  });
  assert.equal(installed.ok, true);
  const homeSpecimen = g.s.specimens[0];
  assert.equal(homeSpecimen.x, NEAR_HOUSE.x);
  assert.equal(homeSpecimen.z, NEAR_HOUSE.z);

  const multiplied = g.command({
    type: "multiplySpecimen",
    specimenId: homeSpecimen.id,
    x: NEAR_HOUSE.x + 1,
    z: NEAR_HOUSE.z,
  });
  assert.equal(multiplied.ok, true);
  assert.equal(g.s.specimens.length, 2);
  assert.equal(g.s.specimens[1].cultivarId, homeSpecimen.cultivarId);
  assert.deepEqual(
    Cultivars.specimenTraits(g.s, g.s.specimens[1]),
    Cultivars.specimenTraits(g.s, g.s.specimens[0]),
    "the multiplied specimen is trait-identical to the one installed at home",
  );

  g.command({ type: "meetIris" });

  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.cultivars, g.s.cultivars, "cultivar not identical after reload");
  assert.deepEqual(reloaded.s.specimens, g.s.specimens, "specimens not identical after reload");
  assert.equal(
    reloaded.s.specimens[0].x,
    NEAR_HOUSE.x,
    "the specimen installed near the house keeps its exact position after reload",
  );
  assert.deepEqual(reloaded.s.campaignFlags, ["iris-epinglage"]);
  validate(reloaded.serialize());
});
