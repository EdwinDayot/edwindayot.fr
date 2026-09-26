const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Narrative = require("../public/game/data-narrative.js");
const Memory = require("../public/game/campaign-memory.js");

// Epic C6.6 (design §10, chapitre 13 "Le premier non"). Reaches "la-bonne-occasion" (C6.1) and
// then a "variete-suivante-*" flag (C6.5) through the real quest/sleep chain, exactly like
// tests/campaign-chapter10.cjs / tests/campaign-chapter12.cjs already do, rather than pushing
// flags onto s.campaignFlags by hand.
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
  assert.ok(
    ["variete-suivante-refus", "variete-suivante-sobre", "variete-suivante-invendus"].some(
      (f) => g.s.campaignFlags.includes(f),
    ),
  );
}

// Same fixture already used by campaign-chapter4.cjs/campaign-chapter6.cjs/campaign-nursery.cjs.
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

const PREMIER_NON_FLAGS = ["premier-non-interrogation", "premier-non-signe"];

function premierNonFlag(g) {
  return g.s.campaignFlags.filter((f) => PREMIER_NON_FLAGS.includes(f));
}

test("no premier-non flag before chapter 12's own flag exists, even with a bourgeon", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
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
  assert.deepEqual(premierNonFlag(g), []);
  // The chapter 6 reveal still fires normally — this epic never regresses it.
  assert.ok(g.s.campaignFlags.includes("on-ne-se-fabrique-pas-seul"));
});

test("chapter 12's flag exists but the refused Rainelle carries no bourgeon: never reveals", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
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
  assert.equal(r.bourgeon, null);
  assert.deepEqual(premierNonFlag(g), []);
});

test("gate met, no persistent gesture ever recorded: reveals the 'interrogation' branch via teachGesture", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
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
  assert.deepEqual(premierNonFlag(g), ["premier-non-interrogation"]);
});

test("gate met, at least one Rainelle already recorded persistent: reveals the 'signe' branch instead", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  assert.equal(g.command({ type: "formBud", id: r.id }).ok, true);
  Memory.recordPersistentGesture(g.s.campaignMemory, r.id);
  const attempt = g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(attempt.ok, false);
  assert.deepEqual(premierNonFlag(g), ["premier-non-signe"]);
});

test("demonstrateGesture (the four-moment flow) fires the same reveal when the gate is met", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  assert.equal(g.command({ type: "formBud", id: r.id }).ok, true);
  g.command({ type: "beginTeaching", id: r.id });
  const attempt = g.command({
    type: "demonstrateGesture",
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.message, Rainelles.MULTIPLY_REFUSAL);
  assert.deepEqual(premierNonFlag(g), ["premier-non-interrogation"]);
});

test("a second, later refusal meeting the same condition never reveals twice", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  assert.equal(g.command({ type: "formBud", id: r.id }).ok, true);
  g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.deepEqual(premierNonFlag(g), ["premier-non-interrogation"]);
  g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.deepEqual(premierNonFlag(g), ["premier-non-interrogation"]);
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "premier-non-interrogation").length,
    1,
  );
});

test("a refused teachGesture never mutates s.rainelles/s.campaignNursery/s.specimens beyond the narrative flag", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  const before = JSON.stringify({
    rainelles: g.s.rainelles,
    campaignNursery: g.s.campaignNursery,
    specimens: g.s.specimens,
  });
  g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  const after = JSON.stringify({
    rainelles: g.s.rainelles,
    campaignNursery: g.s.campaignNursery,
    specimens: g.s.specimens,
  });
  assert.equal(before, after, "une commande refusée ne devient jamais un dommage fictif");
});

test("firstMultiplyRefusalSeen never re-reveals here, independent of chapter 13's own gate", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  // First refusal, well before chapter 12, already reveals the chapter 6 text.
  g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "on-ne-se-fabrique-pas-seul").length,
    1,
  );
  reachChapter12Flag(g);
  g.command({ type: "formBud", id: r.id });
  g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "on-ne-se-fabrique-pas-seul").length,
    1,
  );
  assert.deepEqual(premierNonFlag(g), ["premier-non-interrogation"]);
});

test("both premier-non texts contain no obligation formulation and no fabricated accusation", () => {
  for (const id of PREMIER_NON_FLAGS) {
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
});

test("a JSON round-trip after the reveal keeps the exact flag and campaignMemory facts", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  reachChapter12Flag(g);
  g.command({ type: "formBud", id: r.id });
  Memory.recordPersistentGesture(g.s.campaignMemory, r.id);
  g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.deepEqual(premierNonFlag(g), ["premier-non-signe"]);
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(premierNonFlag(reloaded), ["premier-non-signe"]);
});
