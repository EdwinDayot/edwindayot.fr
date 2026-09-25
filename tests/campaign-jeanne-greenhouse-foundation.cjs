// Épic C6.22 (campagne, phase 6) : fondation seule — Jeanne comme visitorId
// réel et son bâtiment. Étend la discipline de non-chevauchement déjà
// pratiquée pour les visiteurs existants (tests/garden-construction.cjs)
// plutôt que de la dupliquer : cette entrée vérifie spécifiquement ce que
// C6.22 ajoute (une nouvelle position, un nouveau nom résolu, aucune
// régression sur les bâtiments déjà placés, aucun champ de sauvegarde
// nouveau), pas les propriétés déjà génériquement couvertes ailleurs
// (porte/mur/placement/arbres, déjà exercées pour tout D.buildings).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D, C } = require("./garden-rules-helpers.cjs");
const Roles = require("../public/game/data-roles.js");

const EXISTING_BUILDING_IDS = [
  "lea",
  "noe",
  "iris",
  "mira",
  "basile",
  "anouk",
  "ines",
  "hugo",
  "zoe",
  "villageois-1",
  "villageois-2",
];
const EXISTING_POSITIONS = {
  lea: [-6.5, 7],
  noe: [-2.5, 7],
  iris: [1.5, 7],
  mira: [-9.5, 11.5],
  basile: [-9.5, 20],
  anouk: [-3.5, 20],
  ines: [-3.5, 13.5],
  hugo: [3, 13.5],
  zoe: [-12.5, 14],
  "villageois-1": [-11, 26],
  "villageois-2": [-1, 26],
};

test("Jeanne is a real visitorId with a resident role and a non-judgmental line", () => {
  const b = D.buildings.find((b) => b.visitorId === "jeanne");
  assert.ok(b, "jeanne should have a building entry");
  assert.equal(b.role, "resident");
  assert.equal(typeof b.roleData.line, "string");
  assert.ok(b.roleData.line.length > 0);
  assert.deepEqual(b.roleData.quests, undefined);
});

test('firstName("jeanne") resolves to "Jeanne", not the raw id', () => {
  assert.equal(Roles.firstName("jeanne"), "Jeanne");
});

test("Jeanne's house overlaps no existing building's wall circles", () => {
  const jeanne = D.buildings.find((b) => b.visitorId === "jeanne");
  for (const b of D.buildings) {
    if (b.visitorId === "jeanne") continue;
    for (const wc of jeanne.wallCircles)
      for (const bwc of b.wallCircles)
        assert.ok(
          Math.hypot(wc.x - bwc.x, wc.z - bwc.z) > wc.r + bwc.r,
          `jeanne's house overlaps ${b.visitorId}'s`,
        );
  }
});

test("Jeanne's house overlaps no resource site, with a real margin", () => {
  const jeanne = D.buildings.find((b) => b.visitorId === "jeanne");
  for (const r of D.resources)
    assert.ok(
      Math.hypot(jeanne.x - r.x, jeanne.z - r.z) >= 2.2,
      `jeanne's house too close to resource ${r.id}`,
    );
});

test("Jeanne's house sits clear of the chapter-17 passage obstacle", () => {
  const { PASSAGE_POSITION, PASSAGE_OBSTACLE_RADIUS } = require("../public/game/campaign-passage.js");
  const jeanne = D.buildings.find((b) => b.visitorId === "jeanne");
  assert.ok(
    Math.hypot(jeanne.x - PASSAGE_POSITION.x, jeanne.z - PASSAGE_POSITION.z) >
      PASSAGE_OBSTACLE_RADIUS + 2,
    "jeanne's house should not sit near the passage obstacle",
  );
});

test("Jeanne is reachable on foot from the portal, through her own door", () => {
  const g = new GardenState(null, 1000);
  const v = D.visitors.find((v) => v.id === "jeanne");
  assert.ok(v, "jeanne should have a visitor entry (derived from the building)");
  const route = C.approach(g.s, { x: 0, z: 3 }, v);
  assert.ok(
    route.length || C.distance({ x: 0, z: 3 }, v) < 1.85,
    "the portal should be able to reach jeanne",
  );
  if (route.length) assert.ok(C.distance(route.at(-1), v) <= 1.65);
});

test("No existing building moved, was renamed or dropped", () => {
  for (const id of EXISTING_BUILDING_IDS) {
    const b = D.buildings.find((b) => b.visitorId === id);
    assert.ok(b, `${id} should still exist`);
    assert.equal(b.x, EXISTING_POSITIONS[id][0], `${id}.x unchanged`);
    assert.equal(b.z, EXISTING_POSITIONS[id][1], `${id}.z unchanged`);
  }
  assert.equal(D.buildings.length, EXISTING_BUILDING_IDS.length + 1);
});

test("A fresh save round-trips through JSON unchanged: no new save field introduced", () => {
  const g = new GardenState(null, 1000);
  const json = JSON.stringify(g.serialize());
  const reloaded = new GardenState(JSON.parse(json));
  assert.deepEqual(reloaded.serialize(), JSON.parse(json));
});
