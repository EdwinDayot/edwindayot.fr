const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");

// Epic C2.3: the first Rainelle's scripted encounter (design §5, chapitre 4). A frog falls in
// the pot during a real trial: the cultivar drawn that night is unaffected ("aucune graine de
// quête perdue"), and a Rainelle carrying that same cultivar's foliage is additionally created,
// with a stable id and a modifiable name. No rendering/automation yet — this is the rules layer
// only, same posture as C1.1/C1.6 before their own rendering epics.
//
// Epic C4.4 (design §10, chapitre 4, "après les apprentissages nécessaires") gates
// triggerFrogEncounter on a cultivar already existing — see tests/campaign-chapter4.cjs for that
// guard's own dedicated tests. Every fixture below that arms the encounter therefore resolves one
// unrelated warm-up cross first, exactly as a real playthrough now must (the botany chapters,
// already `fait`, come before this one) — a real, mechanical precondition, not a test-only
// shortcut, so cultivars.length is 2 (not 1) once the frog's own cultivar resolves.
function warmUpCultivar(g) {
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
}

test("A fresh save starts with no Rainelle and no pending encounter", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.rainelles, []);
  assert.equal(g.s.rainelleNextId, 1);
  assert.equal(g.s.campaignFrogEncounterPending, false);
});

test("triggerFrogEncounter arms the pending flag; a second attempt is refused explicitly", () => {
  const g = new GardenState(null, 1000);
  warmUpCultivar(g);
  const r1 = g.command({ type: "triggerFrogEncounter" });
  assert.equal(r1.ok, true);
  assert.equal(g.s.campaignFrogEncounterPending, true);
  const r2 = g.command({ type: "triggerFrogEncounter" });
  assert.equal(r2.ok, false);
  assert.equal(g.s.campaignFrogEncounterPending, true, "still armed, not reset by the refusal");
});

test("A scripted night with a real trial creates the cultivar exactly as usual, plus a Rainelle carrying its foliage", () => {
  const g = new GardenState(null, 1000);
  warmUpCultivar(g);
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  const r = g.command({ type: "sleep" });
  assert.equal(r.ok, true);
  assert.equal(g.s.cultivars.length, 2, "the pot resolution itself is unaffected (warm-up + this night's)");
  assert.equal(g.s.rainelles.length, 1);
  assert.equal(g.s.rainelles[0].id, "r1");
  assert.equal(
    g.s.rainelles[0].cultivarId,
    g.s.cultivars[1].id,
    "the Rainelle carries the foliage of the cultivar crossed that same night, not the warm-up one",
  );
  assert.equal(g.s.campaignFrogEncounterPending, false, "consumed once resolved");
});

test("An armed encounter on an empty night (nothing sown) carries over, never lost, never duplicated", () => {
  const g = new GardenState(null, 1000);
  warmUpCultivar(g);
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true, "an empty night still resolves normally");
  assert.equal(g.s.rainelles.length, 0, "no trial happened, so no Rainelle yet");
  assert.equal(g.s.campaignFrogEncounterPending, true, "still armed for the next real trial");

  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.rainelles.length, 1, "the carried-over encounter resolves on the real trial");
  assert.equal(g.s.campaignFrogEncounterPending, false);
});

test("Only ever the first Rainelle this way: triggerFrogEncounter refuses once one already exists", () => {
  const g = new GardenState(null, 1000);
  warmUpCultivar(g);
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.rainelles.length, 1);

  const r = g.command({ type: "triggerFrogEncounter" });
  assert.equal(r.ok, false);
  assert.equal(g.s.rainelles.length, 1, "no second Rainelle is armed by this mechanism");
});

test("renameRainelle persists a real name and rejects an unknown id or an empty name", () => {
  const g = new GardenState(null, 1000);
  warmUpCultivar(g);
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  const id = g.s.rainelles[0].id;

  const r = g.command({ type: "renameRainelle", id, name: "  Praline  " });
  assert.equal(r.ok, true);
  assert.equal(g.s.rainelles[0].name, "Praline", "trimmed before saving");

  assert.equal(
    g.command({ type: "renameRainelle", id: "r999", name: "Fantôme" }).ok,
    false,
  );
  assert.equal(g.command({ type: "renameRainelle", id, name: "   " }).ok, false);
  assert.equal(g.s.rainelles[0].name, "Praline", "rejected rename never mutates the entry");
});

test("A real JSON reload keeps the Rainelle's id, cultivarId and name identical", () => {
  const g = new GardenState(null, 1000);
  warmUpCultivar(g);
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "renameRainelle", id: g.s.rainelles[0].id, name: "Praline" });

  const saved = JSON.parse(JSON.stringify(g.serialize()));
  const reloaded = new GardenState(saved);
  assert.deepEqual(reloaded.s.rainelles, g.s.rainelles);
});

test("A v3 save without rainelles/rainelleNextId/campaignFrogEncounterPending migrates to defaults without altering the rest", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  delete old.rainelles;
  delete old.rainelleNextId;
  delete old.campaignFrogEncounterPending;
  const before = JSON.stringify({
    ...old,
    rainelles: undefined,
    rainelleNextId: undefined,
    campaignFrogEncounterPending: undefined,
  });
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.rainelles, []);
  assert.equal(migrated.s.rainelleNextId, 1);
  assert.equal(migrated.s.campaignFrogEncounterPending, false);
  const after = JSON.stringify({
    ...migrated.s,
    rainelles: undefined,
    rainelleNextId: undefined,
    campaignFrogEncounterPending: undefined,
  });
  assert.equal(after, before, "no other field should change during this migration");
});

test("Malformed rainelles entries are rejected", () => {
  const g = new GardenState(null, 1000);
  warmUpCultivar(g);
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  const cultivarId = g.s.rainelles[0].cultivarId;
  const bad = [
    [{ id: "notR1", cultivarId, name: "" }],
    [{ id: "r1", cultivarId: "c999", name: "" }],
    [{ id: "r1", cultivarId, name: 7 }],
    [{ id: "r1", cultivarId }, { id: "r1", cultivarId, name: "dup" }],
    "nope",
    [null],
  ];
  for (const rainelles of bad) {
    const saved = g.serialize();
    saved.rainelles = rainelles;
    assert.throws(() => validate(saved), /Rainelle invalide/);
  }
});

test("A rainelleNextId collision is rejected, a correction accepted", () => {
  const g = new GardenState(null, 1000);
  warmUpCultivar(g);
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });

  const saved = g.serialize();
  saved.rainelleNextId = 1; // r1 already exists
  assert.throws(() => validate(saved), /Identifiants de rainelle invalides/);

  saved.rainelleNextId = 2;
  assert.doesNotThrow(() => validate(saved));
});

test("A malformed campaignFrogEncounterPending is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const bad of ["yes", 1, null, {}]) {
    const saved = g.serialize();
    saved.campaignFrogEncounterPending = bad;
    assert.throws(() => validate(saved), /Rencontre de la grenouille invalide/);
  }
});
