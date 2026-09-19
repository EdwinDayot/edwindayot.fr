const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");

// Epic C2.10 (design §5, « Multiplication et vie propre ») : les Rainelles ne se bouturent pas
// elles-mêmes et n'acceptent aucun ordre visant à multiplier une autre Rainelle ; ce refus est
// "montré dès les premières tentatives", donc un événement explicite et distinct — jamais le
// "Geste inconnu." générique renvoyé pour un verbe absent de VERBS par accident de saisie. Le
// second volet ("réenseigner un geste ne coûte rien") est déjà vrai par construction depuis C2.4 ;
// ce fichier ajoute la vérification explicite plutôt que de la supposer.

function bornRainelle(g) {
  // Epic C4.4: triggerFrogEncounter now refuses until a cultivar already exists ("après les
  // apprentissages nécessaires", design §10 chapitre 4) — this unrelated warm-up cross satisfies
  // that real precondition before the scripted encounter itself.
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0].id;
}

test("teachGesture refuses 'multiplier' with the explicit budding-protection message, not the generic 'Geste inconnu.'", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const r = g.command({
    type: "teachGesture",
    id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(r.ok, false);
  assert.equal(r.message, Rainelles.MULTIPLY_REFUSAL);
  assert.equal(g.s.rainelles[0].geste, null);
});

test("a different unknown verb still gets the generic 'Geste inconnu.', distinct from the multiply refusal", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const r = g.command({
    type: "teachGesture",
    id,
    verbe: "voler",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(r.ok, false);
  assert.equal(r.message, "Geste inconnu.");
  assert.notEqual(r.message, Rainelles.MULTIPLY_REFUSAL);
});

test("attempting to teach 'multiplier' never overwrites an existing gesture", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({
    type: "teachGesture",
    id,
    verbe: "arroser",
    poste: "borne-1",
    source: "borne-1",
    destination: "zone-1",
  });
  const attempt = g.command({
    type: "teachGesture",
    id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.message, Rainelles.MULTIPLY_REFUSAL);
  assert.deepEqual(g.s.rainelles[0].geste, {
    verbe: "arroser",
    poste: "borne-1",
    source: "borne-1",
    destination: "zone-1",
    condition: "",
  });
});

test("demonstrateGesture refuses 'multiplier' the same explicit way, leaving the lesson in 'watching' without a draft", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({ type: "beginTeaching", id });
  const r = g.command({
    type: "demonstrateGesture",
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(r.ok, false);
  assert.equal(r.message, Rainelles.MULTIPLY_REFUSAL);
  assert.equal(g.s.campaignTeaching.step, "watching");
  assert.equal(g.s.campaignTeaching.draft, null);
});

test("re-teaching a gesture (direct path) never touches the inventory — free by construction", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const before = JSON.stringify(g.s.inventory);
  g.command({
    type: "teachGesture",
    id,
    verbe: "arroser",
    poste: "borne-1",
    source: "borne-1",
    destination: "zone-1",
  });
  g.command({
    type: "teachGesture",
    id,
    verbe: "recolter",
    poste: "carre-1",
    source: "carre-1",
    destination: "panier-1",
  });
  assert.equal(JSON.stringify(g.s.inventory), before);
});

test("re-teaching a gesture (four-moment path, confirmTeaching) never touches the inventory either", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({
    type: "teachGesture",
    id,
    verbe: "arroser",
    poste: "borne-1",
    source: "borne-1",
    destination: "zone-1",
  });
  const before = JSON.stringify(g.s.inventory);
  g.command({ type: "beginTeaching", id });
  g.command({
    type: "demonstrateGesture",
    verbe: "recolter",
    poste: "carre-1",
    source: "carre-1",
    destination: "panier-1",
  });
  g.command({ type: "confirmTeaching" });
  assert.equal(JSON.stringify(g.s.inventory), before);
  assert.equal(g.s.rainelles[0].geste.verbe, "recolter");
});

test("multiplySpecimen refuses a Rainelle id explicitly (never a silent no-op, never creates a specimen)", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const specimensBefore = g.s.specimens.length;
  const r = g.command({
    type: "multiplySpecimen",
    specimenId: id,
    x: 1,
    z: 1,
  });
  assert.equal(r.ok, false);
  assert.equal(r.message, "Spécimen source inconnu.");
  assert.equal(g.s.specimens.length, specimensBefore);
  // The Rainelle itself is entirely unaffected by the refused attempt.
  assert.equal(g.s.rainelles[0].id, id);
});

test("the world 'multiply' (nursery) command cannot target a Rainelle at all — different id space, different entity type", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const r = g.command({ type: "multiply", id, species: "carotte" });
  assert.equal(r.ok, false);
  assert.equal(g.s.rainelles[0].id, id, "the Rainelle itself is untouched by the refused attempt");
});
