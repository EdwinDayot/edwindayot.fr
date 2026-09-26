const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Cultivars = require("../public/game/cultivars.js");
const Narrative = require("../public/game/data-narrative.js");

// Epic C6.7 (design §10, chapitre 15 "Alma n'a pas la réponse"). Reaches "la-bonne-occasion"
// (C6.1) and then a "variete-suivante-*" flag (C6.5) through the real quest/sleep chain, exactly
// like tests/campaign-chapter13.cjs's own reachChapter12Flag.
function reachChapter12Flag(g) {
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  g.command({ type: "quest", action: "accept", questId: "occasion-de-basile" });
  g.s.inventory["cutting:pilea"] = 1;
  const r = g.command({
    type: "quest",
    action: "complete",
    questId: "occasion-de-basile",
  });
  assert.equal(r.ok, true, r.error);
  g.command({ type: "sleep" });
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-1"));
}

// Same fixture already used by campaign-chapter13.cjs/campaign-chapter6.cjs/campaign-nursery.cjs.
function firstRainelle(g) {
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  return g.s.rainelles[0];
}

// Honours a second, freshly-signed contract right away — the same path already proven by
// tests/campaign-chapter12.cjs's "second Jeanne note" test — to reach "note-jeanne-serre-2"
// strictly after "note-jeanne-serre-1" already exists.
function reachSecondJeanneNote(g) {
  g.command({ type: "sowPot", a: "menthe-de-velours", b: "aster-des-vents" });
  g.command({ type: "sleep" });
  const cultivar = g.s.cultivars[g.s.cultivars.length - 1];
  g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 1,
    pricePerUnit: 10,
  });
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  const contractId = g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-2"));
}

// Refuses a multiplication on a budded Rainelle once a "variete-suivante-*" flag already exists —
// the same path already proven by tests/campaign-chapter13.cjs — to reach a "premier-non-*" flag.
function reachPremierNonFlag(g, r) {
  assert.equal(g.command({ type: "formBud", id: r.id }).ok, true);
  const attempt = g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.message, Rainelles.MULTIPLY_REFUSAL);
}

const CHAPTER15_FLAGS = ["alma-retour", "reconstitution-jeanne"];

function chapter15Flags(g) {
  return g.s.campaignFlags.filter((f) => CHAPTER15_FLAGS.includes(f));
}

test("neither chapter-15 text appears with only the premier-non gate met", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  reachPremierNonFlag(g, r);
  // "note-jeanne-serre-2" was never reached: the other upstream condition is missing.
  assert.equal(g.s.campaignFlags.includes("note-jeanne-serre-2"), false);
  g.command({ type: "sleep" });
  assert.deepEqual(chapter15Flags(g), []);
});

test("neither chapter-15 text appears with only the second-Jeanne-note gate met", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  reachSecondJeanneNote(g);
  // No "premier-non-*" flag was ever reached: the Rainelle never refused a demonstration.
  assert.equal(
    g.s.campaignFlags.some((f) => f.startsWith("premier-non-")),
    false,
  );
  g.command({ type: "sleep" });
  assert.deepEqual(chapter15Flags(g), []);
  void r;
});

test("both gates met: the next sleep reveals both chapter-15 texts together, exactly once", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  reachSecondJeanneNote(g);
  reachPremierNonFlag(g, r);
  assert.deepEqual(chapter15Flags(g), []);
  g.command({ type: "sleep" });
  assert.deepEqual(chapter15Flags(g).sort(), CHAPTER15_FLAGS.slice().sort());
  // A later night with the gate still true never reveals either a second time.
  g.command({ type: "sleep" });
  assert.deepEqual(chapter15Flags(g).sort(), CHAPTER15_FLAGS.slice().sort());
  for (const id of CHAPTER15_FLAGS)
    assert.equal(g.s.campaignFlags.filter((f) => f === id).length, 1);
});

test("restoreArchiveLabels is refused before Alma's return has been narrated", () => {
  const g = new GardenState(null, 1000);
  const before = JSON.stringify(g.s.campaignFlags);
  const attempt = g.command({ type: "restoreArchiveLabels" });
  assert.equal(attempt.ok, false);
  assert.equal(JSON.stringify(g.s.campaignFlags), before);
});

test("restoreArchiveLabels reveals the closing text exactly once; a second call has no effect and no destructive error", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  reachSecondJeanneNote(g);
  reachPremierNonFlag(g, r);
  g.command({ type: "sleep" });
  assert.ok(g.s.campaignFlags.includes("alma-retour"));

  const before = JSON.stringify({
    rainelles: g.s.rainelles,
    specimens: g.s.specimens,
    campaignStations: g.s.campaignStations,
  });
  const first = g.command({ type: "restoreArchiveLabels" });
  assert.equal(first.ok, true, first.error);
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "archives-restaurees").length,
    1,
  );
  const second = g.command({ type: "restoreArchiveLabels" });
  assert.equal(second.ok, true, second.error);
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "archives-restaurees").length,
    1,
  );
  const after = JSON.stringify({
    rainelles: g.s.rainelles,
    specimens: g.s.specimens,
    campaignStations: g.s.campaignStations,
  });
  assert.equal(
    before,
    after,
    "aucune des trois révélations du chapitre 15 ne mute autre chose que le flag narratif",
  );
});

// Epic C6.23 (design §10, chapitre 15, dernière clause littérale : "...puis voit que Jeanne
// attend encore un usage réel de la serre."). Gated purely on "archives-restaurees" (C6.7).
test("the Jeanne-greenhouse text never appears before archives-restaurees", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  reachSecondJeanneNote(g);
  reachPremierNonFlag(g, r);
  g.command({ type: "sleep" });
  assert.ok(g.s.campaignFlags.includes("alma-retour"));
  assert.equal(g.s.campaignFlags.includes("archives-restaurees"), false);
  assert.equal(g.s.campaignFlags.includes("jeanne-serre-sans-usage"), false);
  g.command({ type: "sleep" });
  assert.equal(
    g.s.campaignFlags.includes("jeanne-serre-sans-usage"),
    false,
    "still gated: archives-restaurees was never reached",
  );
});

test("the Jeanne-greenhouse text is revealed exactly once, at the first sleep once archives-restaurees already holds", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  reachSecondJeanneNote(g);
  reachPremierNonFlag(g, r);
  g.command({ type: "sleep" });
  g.command({ type: "restoreArchiveLabels" });
  assert.ok(g.s.campaignFlags.includes("archives-restaurees"));
  assert.equal(
    g.s.campaignFlags.includes("jeanne-serre-sans-usage"),
    false,
    "not revealed yet: no sleep has happened since archives-restaurees",
  );
  g.command({ type: "sleep" });
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "jeanne-serre-sans-usage").length,
    1,
  );
  g.command({ type: "sleep" });
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "jeanne-serre-sans-usage").length,
    1,
    "a later sleep with the gate still true never reveals it a second time",
  );
});

test("all four chapter-15 texts contain no obligation formulation, and the closing text quotes Alma's exact line", () => {
  for (const id of [
    ...CHAPTER15_FLAGS,
    "archives-restaurees",
    "jeanne-serre-sans-usage",
  ]) {
    const entry = Narrative.TEXTS[id];
    assert.ok(entry, `TEXTS must carry an entry for "${id}"`);
    const lower = entry.text.toLowerCase();
    for (const obligationWord of [
      "doit ",
      "dois ",
      "obligatoire",
      "obligé",
      "il faut",
    ]) {
      assert.equal(
        lower.includes(obligationWord),
        false,
        `"${id}" must not contain an obligation formulation ("${obligationWord}")`,
      );
    }
  }
  assert.ok(
    Narrative.TEXTS["archives-restaurees"].text.includes(
      "Au début, je ne savais pas. Ensuite, je savais surtout comment ne plus y penser.",
    ),
  );
});

test("non-regression: note-jeanne-serre-1/-2 and premier-non-* still fire exactly as before alongside the new reveals", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  reachSecondJeanneNote(g);
  reachPremierNonFlag(g, r);
  g.command({ type: "sleep" });
  for (const id of [
    "note-jeanne-serre-1",
    "note-jeanne-serre-2",
    "alma-retour",
    "reconstitution-jeanne",
  ]) {
    assert.equal(
      g.s.campaignFlags.filter((f) => f === id).length,
      1,
      `"${id}" should appear exactly once`,
    );
  }
  assert.equal(
    g.s.campaignFlags.filter((f) => f.startsWith("premier-non-")).length,
    1,
  );
});

test("a JSON round-trip after both reveals keeps the exact flags", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  reachSecondJeanneNote(g);
  reachPremierNonFlag(g, r);
  g.command({ type: "sleep" });
  g.command({ type: "restoreArchiveLabels" });
  g.command({ type: "sleep" });
  const before = chapter15Flags(g).sort();
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(chapter15Flags(reloaded).sort(), before);
  assert.ok(reloaded.s.campaignFlags.includes("archives-restaurees"));
  assert.ok(reloaded.s.campaignFlags.includes("jeanne-serre-sans-usage"));
});
