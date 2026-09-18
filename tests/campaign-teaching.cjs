const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");

// Epic C2.5: "enseignement en quatre moments" (design §5) as a pure state machine atop C2.4's
// single-gesture memory. Engine layer only, same "règles avant rendu" posture as C2.2 before
// C2.2v — see garden-state-cmd-k.js's own header comment for the full reasoning and what is
// deferred to C2.5v (interface).

function bornRainelle(g) {
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0].id;
}

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands today, and it
// is capped at one per game (the nurserie/bourgeon path is a later epic). Calling the same pure
// factory C2.3's own command uses (garden-state-cmd-i.js) directly is a legitimate test fixture
// for a second Rainelle — it does not exercise or bypass that one-encounter cap, which this file
// never touches.
function secondRainelle(g, name = "Seconde") {
  return Rainelles.createRainelle(g.s, {
    cultivarId: g.s.cultivars[0].id,
    name,
  }).id;
}

const FIELDS = {
  verbe: "arroser",
  poste: "zone-fraisiers",
  source: "borne-1",
  destination: "zone-fraisiers",
  condition: "humidite < 65",
};

test("beginTeaching pauses the clock and opens a watching session; refuses an unknown Rainelle", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  assert.equal(g.s.campaignClock.paused, false);
  const r = g.command({ type: "beginTeaching", id });
  assert.equal(r.ok, true);
  assert.equal(g.s.campaignClock.paused, true, "« Regarde-moi » suspend le temps");
  assert.deepEqual(g.s.campaignTeaching, {
    rainelleId: id,
    step: "watching",
    draft: null,
  });

  const bad = g.command({ type: "beginTeaching", id: "r999" });
  assert.equal(bad.ok, false);
});

test("beginTeaching refuses a second lesson while one is already in progress", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({ type: "beginTeaching", id });
  const r = g.command({ type: "beginTeaching", id });
  assert.equal(r.ok, false);
  assert.equal(g.s.campaignTeaching.step, "watching", "the first session is untouched");
});

test("demonstrateGesture requires an active watching session and validates the same fields teachGesture does", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);

  const noSession = g.command({ type: "demonstrateGesture", ...FIELDS });
  assert.equal(noSession.ok, false);

  g.command({ type: "beginTeaching", id });
  const badVerb = g.command({
    type: "demonstrateGesture",
    ...FIELDS,
    verbe: "multiplier",
  });
  assert.equal(badVerb.ok, false);
  assert.equal(g.s.campaignTeaching.step, "watching", "an invalid demonstration never advances the step");

  const emptyPoste = g.command({ type: "demonstrateGesture", ...FIELDS, poste: "  " });
  assert.equal(emptyPoste.ok, false);
});

test("demonstrateGesture captures a draft with a proposed phrase and a planned trajectory, then advances to reviewing", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({ type: "beginTeaching", id });
  const r = g.command({ type: "demonstrateGesture", ...FIELDS });
  assert.equal(r.ok, true);
  assert.equal(g.s.campaignTeaching.step, "reviewing");
  const draft = g.s.campaignTeaching.draft;
  assert.equal(draft.verbe, "arroser");
  assert.equal(draft.poste, "zone-fraisiers");
  assert.equal(draft.source, "borne-1");
  assert.equal(draft.destination, "zone-fraisiers");
  assert.equal(draft.condition, "humidite < 65");
  assert.equal(typeof draft.phrase, "string");
  assert.ok(draft.phrase.length > 0);
  assert.ok(draft.phrase.includes("borne-1") && draft.phrase.includes("zone-fraisiers"));
  assert.ok(draft.phrase.includes("(si humidite < 65)"), "the condition clause is appended");
  assert.deepEqual(
    draft.trajectory,
    ["borne-1", "zone-fraisiers"],
    "source -> poste -> destination, consecutive duplicates (poste === destination here) collapsed",
  );

  // rainelle.geste itself is untouched until confirmTeaching: a demonstration is only a preview.
  assert.equal(g.s.rainelles[0].geste, null);
});

test("A second demonstration is refused while one is already under review", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({ type: "beginTeaching", id });
  g.command({ type: "demonstrateGesture", ...FIELDS });
  const r = g.command({ type: "demonstrateGesture", ...FIELDS, verbe: "recolter" });
  assert.equal(r.ok, false);
  assert.equal(g.s.campaignTeaching.draft.verbe, "arroser", "the first draft is untouched");
});

test("reviseGesturePhrase overwrites the proposed phrase; refuses when empty, too long, or out of step", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);

  const noSession = g.command({ type: "reviseGesturePhrase", phrase: "Une phrase." });
  assert.equal(noSession.ok, false);

  g.command({ type: "beginTeaching", id });
  const stillWatching = g.command({ type: "reviseGesturePhrase", phrase: "Une phrase." });
  assert.equal(stillWatching.ok, false, "nothing to correct before a demonstration exists");

  g.command({ type: "demonstrateGesture", ...FIELDS });
  const ok = g.command({ type: "reviseGesturePhrase", phrase: "  Arroser tôt le matin.  " });
  assert.equal(ok.ok, true);
  assert.equal(g.s.campaignTeaching.draft.phrase, "Arroser tôt le matin.", "trimmed");

  const empty = g.command({ type: "reviseGesturePhrase", phrase: "   " });
  assert.equal(empty.ok, false);
  assert.equal(g.s.campaignTeaching.draft.phrase, "Arroser tôt le matin.", "refusal never mutates");

  const tooLong = g.command({ type: "reviseGesturePhrase", phrase: "x".repeat(241) });
  assert.equal(tooLong.ok, false);
});

test("confirmTeaching applies the reviewed gesture, records the last demonstration, and resumes the clock", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({ type: "beginTeaching", id });
  g.command({ type: "demonstrateGesture", ...FIELDS });
  const r = g.command({ type: "confirmTeaching" });
  assert.equal(r.ok, true);
  assert.equal(r.message, "Geste appris : arroser.", "first learn, distinct from a replacement");
  assert.deepEqual(g.s.rainelles[0].geste, {
    verbe: "arroser",
    poste: "zone-fraisiers",
    source: "borne-1",
    destination: "zone-fraisiers",
    condition: "humidite < 65",
  });
  assert.deepEqual(g.s.campaignLastDemonstration, {
    verbe: "arroser",
    poste: "zone-fraisiers",
    source: "borne-1",
    destination: "zone-fraisiers",
    condition: "humidite < 65",
  });
  assert.equal(g.s.campaignClock.paused, false);
  assert.equal(g.s.campaignTeaching, null);

  // A second full lesson on the same Rainelle replaces the gesture wholesale, same rule as
  // teachGesture (C2.4) — proven here through the four-moment flow instead of the one-shot path.
  g.command({ type: "beginTeaching", id });
  g.command({
    type: "demonstrateGesture",
    verbe: "recolter",
    poste: "zone-fraisiers",
    source: "zone-fraisiers",
    destination: "panier-cuisine",
    condition: "",
  });
  const r2 = g.command({ type: "confirmTeaching" });
  assert.equal(r2.message, "Ancien geste remplacé : recolter.");
  assert.equal(g.s.rainelles[0].geste.verbe, "recolter");
});

test("confirmTeaching without an active session (or before any demonstration) is refused", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  assert.equal(g.command({ type: "confirmTeaching" }).ok, false);
  g.command({ type: "beginTeaching", id });
  assert.equal(
    g.command({ type: "confirmTeaching" }).ok,
    false,
    "still watching, no draft yet",
  );
});

test("cancelTeaching discards the draft without touching the gesture, and resumes the clock", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({ type: "beginTeaching", id });
  g.command({ type: "demonstrateGesture", ...FIELDS });
  const r = g.command({ type: "cancelTeaching" });
  assert.equal(r.ok, true);
  assert.equal(g.s.campaignClock.paused, false);
  assert.equal(g.s.campaignTeaching, null);
  assert.equal(g.s.rainelles[0].geste, null, "no gesture was ever committed");
  assert.equal(g.s.campaignLastDemonstration, null, "a cancelled lesson is never remembered");

  const noSession = g.command({ type: "cancelTeaching" });
  assert.equal(noSession.ok, false);
});

test("teachGestureQuick refuses until a lesson has actually been confirmed once", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const r = g.command({ type: "teachGestureQuick", id });
  assert.equal(r.ok, false);
});

test("teachGestureQuick reapplies the last confirmed demonstration to another Rainelle without a full lesson", () => {
  const g = new GardenState(null, 1000);
  const firstId = bornRainelle(g);
  const secondId = secondRainelle(g);
  g.command({ type: "beginTeaching", id: firstId });
  g.command({ type: "demonstrateGesture", ...FIELDS });
  g.command({ type: "confirmTeaching" });

  assert.equal(g.s.campaignClock.paused, false, "the clock was never paused for the second Rainelle");
  const r = g.command({ type: "teachGestureQuick", id: secondId });
  assert.equal(r.ok, true);
  assert.equal(r.message, "Geste transmis rapidement : arroser.");
  assert.deepEqual(g.s.rainelles.find((x) => x.id === secondId).geste, {
    verbe: "arroser",
    poste: "zone-fraisiers",
    source: "borne-1",
    destination: "zone-fraisiers",
    condition: "humidite < 65",
  });
  assert.equal(g.s.campaignTeaching, null, "no session was ever opened for the quick teach");

  // Replacing an already-taught Rainelle through the quick path uses the replacement wording.
  const r2 = g.command({ type: "teachGestureQuick", id: secondId });
  assert.equal(r2.message, "Ancien geste remplacé (répétition rapide) : arroser.");

  const unknown = g.command({ type: "teachGestureQuick", id: "r999" });
  assert.equal(unknown.ok, false);
});

test("A real JSON round-trip keeps a mid-lesson draft and the last demonstration exactly intact", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({ type: "beginTeaching", id });
  g.command({ type: "demonstrateGesture", ...FIELDS });
  const teachingBefore = JSON.parse(JSON.stringify(g.s.campaignTeaching));

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignTeaching, teachingBefore);

  g.command({ type: "confirmTeaching" });
  const lastBefore = JSON.parse(JSON.stringify(g.s.campaignLastDemonstration));
  const reloaded2 = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded2.campaignLastDemonstration, lastBefore);
  assert.equal(reloaded2.campaignTeaching, null);
});

test("A save from before this epic (no campaignTeaching/campaignLastDemonstration fields) migrates silently", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const raw = JSON.parse(JSON.stringify(g.s));
  delete raw.campaignTeaching;
  delete raw.campaignLastDemonstration;
  const before = JSON.parse(JSON.stringify(raw));
  const migrated = validate(raw);
  assert.equal(migrated.campaignTeaching, null);
  assert.equal(migrated.campaignLastDemonstration, null);
  delete before.campaignTeaching;
  delete before.campaignLastDemonstration;
  const migratedWithoutNewFields = JSON.parse(JSON.stringify(migrated));
  delete migratedWithoutNewFields.campaignTeaching;
  delete migratedWithoutNewFields.campaignLastDemonstration;
  assert.deepEqual(migratedWithoutNewFields, before, "no other field changes during migration");
});

test("Malformed campaignTeaching shapes are rejected", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const id = g.s.rainelles[0].id;
  const base = () => JSON.parse(JSON.stringify(g.s));

  const unknownRainelle = base();
  unknownRainelle.campaignTeaching = { rainelleId: "r999", step: "watching", draft: null };
  assert.throws(() => validate(unknownRainelle));

  const badStep = base();
  badStep.campaignTeaching = { rainelleId: id, step: "dreaming", draft: null };
  assert.throws(() => validate(badStep));

  const watchingWithDraft = base();
  watchingWithDraft.campaignTeaching = {
    rainelleId: id,
    step: "watching",
    draft: { verbe: "arroser", poste: "p", source: "s", destination: "d", condition: "", phrase: "x", trajectory: ["s", "p", "d"] },
  };
  assert.throws(() => validate(watchingWithDraft));

  const reviewingWithoutDraft = base();
  reviewingWithoutDraft.campaignTeaching = { rainelleId: id, step: "reviewing", draft: null };
  assert.throws(() => validate(reviewingWithoutDraft));

  const emptyPhrase = base();
  emptyPhrase.campaignTeaching = {
    rainelleId: id,
    step: "reviewing",
    draft: { verbe: "arroser", poste: "p", source: "s", destination: "d", condition: "", phrase: "", trajectory: ["s", "p", "d"] },
  };
  assert.throws(() => validate(emptyPhrase));

  const emptyTrajectory = base();
  emptyTrajectory.campaignTeaching = {
    rainelleId: id,
    step: "reviewing",
    draft: { verbe: "arroser", poste: "p", source: "s", destination: "d", condition: "", phrase: "x", trajectory: [] },
  };
  assert.throws(() => validate(emptyTrajectory));

  const badVerb = base();
  badVerb.campaignTeaching = {
    rainelleId: id,
    step: "reviewing",
    draft: { verbe: "multiplier", poste: "p", source: "s", destination: "d", condition: "", phrase: "x", trajectory: ["s"] },
  };
  assert.throws(() => validate(badVerb));

  const valid = base();
  valid.campaignTeaching = {
    rainelleId: id,
    step: "reviewing",
    draft: { verbe: "arroser", poste: "p", source: "s", destination: "d", condition: "", phrase: "x", trajectory: ["s", "p"] },
  };
  assert.doesNotThrow(() => validate(valid));
});

test("Malformed campaignLastDemonstration shapes are rejected, a well-formed one and null are accepted", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const base = () => JSON.parse(JSON.stringify(g.s));

  const badVerb = base();
  badVerb.campaignLastDemonstration = { ...FIELDS, verbe: "multiplier" };
  assert.throws(() => validate(badVerb));

  const emptySource = base();
  emptySource.campaignLastDemonstration = { ...FIELDS, source: "" };
  assert.throws(() => validate(emptySource));

  const missingCondition = base();
  missingCondition.campaignLastDemonstration = {
    verbe: "arroser",
    poste: "p",
    source: "s",
    destination: "d",
  };
  assert.throws(() => validate(missingCondition));

  const explicitNull = base();
  explicitNull.campaignLastDemonstration = null;
  assert.doesNotThrow(() => validate(explicitNull));

  const valid = base();
  valid.campaignLastDemonstration = { ...FIELDS };
  assert.doesNotThrow(() => validate(valid));
});

test("sleep cancels a stale in-progress lesson without cost, instead of stranding the clock paused", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({ type: "beginTeaching", id });
  assert.equal(g.s.campaignClock.paused, true);
  const r = g.command({ type: "sleep" });
  assert.equal(r.ok, true);
  assert.equal(g.s.campaignTeaching, null, "the unconfirmed lesson is discarded, not carried over");
  assert.equal(g.s.campaignClock.paused, false, "a new day always starts unpaused");
  assert.equal(g.s.rainelles[0].geste, null, "cancelled without cost: nothing was ever taught");

  // A fresh lesson is possible again right after — the stale session no longer blocks it.
  const r2 = g.command({ type: "beginTeaching", id });
  assert.equal(r2.ok, true);
});

test("teachGestureQuick is refused while a lesson is in progress, on the same or another Rainelle", () => {
  const g = new GardenState(null, 1000);
  const firstId = bornRainelle(g);
  const secondId = secondRainelle(g);
  g.command({ type: "beginTeaching", id: firstId });
  g.command({ type: "demonstrateGesture", ...FIELDS });
  g.command({ type: "confirmTeaching" });
  assert.ok(g.s.campaignLastDemonstration, "a demonstration now exists to quick-teach from");

  g.command({ type: "beginTeaching", id: secondId });
  const onSameRainelle = g.command({ type: "teachGestureQuick", id: secondId });
  assert.equal(onSameRainelle.ok, false);
  const onAnotherRainelle = g.command({ type: "teachGestureQuick", id: firstId });
  assert.equal(onAnotherRainelle.ok, false);
  assert.equal(
    g.s.rainelles.find((x) => x.id === secondId).geste,
    null,
    "the mid-lesson Rainelle was never quick-taught underneath its own session",
  );
});

test("demonstrateGesture refuses a field over 40 characters, and every verb's worst-case phrase stays under the 240-char save cap", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({ type: "beginTeaching", id });
  const tooLong = g.command({
    type: "demonstrateGesture",
    ...FIELDS,
    poste: "x".repeat(41),
  });
  assert.equal(tooLong.ok, false);
  assert.equal(g.s.campaignTeaching.step, "watching", "refusal never advances the step");

  const maxField = "x".repeat(40);
  for (const verbe of Rainelles.VERBS) {
    const phrase = Rainelles.defaultPhrase({
      verbe,
      poste: maxField,
      source: maxField,
      destination: maxField,
      condition: maxField,
    });
    assert.ok(
      phrase.length <= 240,
      `verb ${verbe} produced a ${phrase.length}-char phrase, over the save cap`,
    );
  }
});

test("defaultPhrase and plannedTrajectory are pure and cover every teachable verb", () => {
  for (const verbe of Rainelles.VERBS) {
    const phrase = Rainelles.defaultPhrase({
      verbe,
      poste: "POSTE",
      source: "SOURCE",
      destination: "DEST",
      condition: "",
    });
    assert.equal(typeof phrase, "string");
    assert.ok(phrase.length > 0, `verb ${verbe} produced an empty phrase`);
  }
  assert.throws(() => Rainelles.defaultPhrase({ verbe: "multiplier" }));

  assert.deepEqual(
    Rainelles.plannedTrajectory({ source: "A", poste: "A", destination: "B" }),
    ["A", "B"],
    "a repeated leading step collapses",
  );
  assert.deepEqual(
    Rainelles.plannedTrajectory({ source: "A", poste: "B", destination: "B" }),
    ["A", "B"],
    "a repeated trailing step collapses",
  );
  assert.deepEqual(
    Rainelles.plannedTrajectory({ source: "A", poste: "B", destination: "A" }),
    ["A", "B", "A"],
    "a non-consecutive repeat is kept",
  );
});
