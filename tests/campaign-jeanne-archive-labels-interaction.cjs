const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Roles = require("../public/game/data-roles.js");

// Epic C6.25 (design §10, chapitre 15 "Alma n'a pas la réponse"): restoreArchiveLabels
// (C6.7, garden-state-cmd-s.js) existed but no interaction ever reached it — grep confirmed
// empty before this epic. This wires Jeanne's E-context (resident role, data-roles.js) to it
// through a generic, data-driven roleData.narrativeAction field, never an id literal.
//
// Divergence from the backlog's own literal wording, verified against the real code, not
// assumed: the backlog critère de sortie names "archiveLabelsRestored" as the flag pushed to
// s.campaignFlags once the labels are restored. Reading garden-state-cmd-s.js/data-narrative.js
// shows that string is only Narrative.pendingReveal's internal *trigger* signal — the id
// actually pushed is the narrative entry's own id, "archives-restaurees". Tests below use the
// real persisted flag (see data-buildings.js's own comment on Jeanne's roleData for the same
// note).

test("Before alma-retour: Jeanne's E-context is the exact pre-existing generic resident line (strict non-regression)", () => {
  assert.deepEqual(Roles.context({ id: "jeanne" }, { campaignFlags: [] }), {
    label: "E · Saluer",
    status: "Jeanne · trie de vieux carnets, près de la serre commune",
    command: null,
  });
});

test("Once alma-retour is present and archives-restaurees is not: Jeanne offers the real restoreArchiveLabels action", () => {
  assert.deepEqual(
    Roles.context({ id: "jeanne" }, { campaignFlags: ["alma-retour"] }),
    {
      label: "E · Restaurer les étiquettes",
      status:
        "Jeanne · peut aider à restaurer les deux noms sur les étiquettes",
      command: "restoreArchiveLabels",
    },
  );
});

test("Once archives-restaurees is already present: the action is spent, command reverts to null, status changes", () => {
  const s = { campaignFlags: ["alma-retour", "archives-restaurees"] };
  const c = Roles.context({ id: "jeanne" }, s);
  assert.equal(c.command, null);
  assert.equal(c.label, "E · Saluer");
  assert.equal(
    c.status,
    "Jeanne · les étiquettes portent de nouveau les deux noms",
  );
  // Never the generic pre-alma-retour line again — the player must see that something changed.
  assert.notEqual(
    c.status,
    "Jeanne · trie de vieux carnets, près de la serre commune",
  );
});

test("Hugo (no narrativeAction in roleData) is entirely unaffected by the new field, with or without campaignFlags", () => {
  assert.deepEqual(Roles.context({ id: "hugo" }, {}), {
    label: "E · Saluer",
    status: "Hugo · lit à l'ombre du grand arbre",
    command: null,
  });
  assert.deepEqual(
    Roles.context({ id: "hugo" }, { campaignFlags: ["alma-retour"] }),
    {
      label: "E · Saluer",
      status: "Hugo · lit à l'ombre du grand arbre",
      command: null,
    },
  );
});

test("End-to-end through the real command dispatch: acting on Jeanne once alma-retour is set actually restores the labels", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignFlags.push("alma-retour");
  const before = Roles.context({ id: "jeanne" }, g.s);
  assert.equal(before.command, "restoreArchiveLabels");
  const result = g.command({ type: before.command, id: "jeanne" });
  assert.equal(result.ok, true, result.error);
  assert.ok(g.s.campaignFlags.includes("archives-restaurees"));
  const after = Roles.context({ id: "jeanne" }, g.s);
  assert.equal(after.command, null);
  assert.equal(
    after.status,
    "Jeanne · les étiquettes portent de nouveau les deux noms",
  );
});

test("A second act on Jeanne after restoreArchiveLabels never re-triggers the command (idempotent, no destructive error)", () => {
  const g = new GardenState(null, 1000);
  g.s.campaignFlags.push("alma-retour");
  g.command({ type: "restoreArchiveLabels", id: "jeanne" });
  const flagCountBefore = g.s.campaignFlags.length;
  const c = Roles.context({ id: "jeanne" }, g.s);
  assert.equal(c.command, null);
  // Nothing left to dispatch — the context itself already refuses to offer the command again.
  assert.equal(g.s.campaignFlags.length, flagCountBefore);
});
