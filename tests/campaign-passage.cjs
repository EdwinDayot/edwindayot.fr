const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");

// Epic C6.12 (design §10, chapitre 17 "Rendre le passage" : "rétablir l'accès à une mare") :
// s.campaignPassage.blocked starts true on a fresh save; restorePassage is the single, one-way
// transition to false, refused if it would not actually change anything.

test("a fresh save starts with the passage blocked", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.campaignPassage, { blocked: true });
});

test("restorePassage succeeds once and sets blocked to false", () => {
  const g = new GardenState(null, 1000);
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignPassage.blocked, false);
});

test("restorePassage refuses a second call, never mutating the state", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "restorePassage" });
  const before = JSON.stringify(g.s.campaignPassage);

  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, false, "the passage is already restored, restoring it again is a no-op");
  assert.equal(JSON.stringify(g.s.campaignPassage), before);
});

test("an older save with no campaignPassage field migrates to blocked", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  delete raw.campaignPassage;

  const migrated = validate(raw);
  assert.deepEqual(migrated.campaignPassage, { blocked: true });
});

test("a real JSON round-trip keeps the restored passage strictly identical", () => {
  const g = new GardenState(null, 1000);
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignPassage, { blocked: false });
});
