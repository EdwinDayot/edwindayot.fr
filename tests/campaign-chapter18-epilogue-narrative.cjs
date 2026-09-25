const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Narrative = require("../public/game/data-narrative.js");

// Epic C6.19 (design §10, chapitre 18 "Le lendemain", troisième temps). Covers the narrative
// reveal only — three mutually-exclusive orientation texts ("epilogue-intensive"/"-partiel"/
// "-durable", triggers epilogueOuvertIntensive/-Partiel/-Durable) plus the common closing clause
// ("epilogue-suite", trigger "epilogueOuvert") — wired at the single real site that can ever fire
// them, garden-state-cmd-x.js's openEpilogue, already exhaustively covered mechanically (gate,
// freeze, one-way) by tests/campaign-epilogue-gate.cjs (C6.18). Same fixtures as that file.

const ORIENTATION_FLAGS = {
  intensive: "epilogue-intensive",
  partiel: "epilogue-partiel",
  durable: "epilogue-durable",
};
const SUITE_FLAG = "epilogue-suite";
const ALL_EPILOGUE_FLAGS = [...Object.values(ORIENTATION_FLAGS), SUITE_FLAG];

function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function sleepUntilDay(g, day) {
  while (g.s.campaignDay < day) {
    const r = g.command({ type: "sleep" });
    assert.equal(r.ok, true, r.error);
  }
}

// Settles the only Rainelle immediately (geste already null) and sleeps to the unlock day,
// leaving the game exactly one openEpilogue call away from freezing an orientation — same
// minimal path as tests/campaign-epilogue-gate.cjs.
function readyToOpen(g) {
  bornRainelle(g);
  const settled = g.command({ type: "restorePassage" });
  assert.equal(settled.ok, true, settled.error);
  sleepUntilDay(g, g.s.campaignEpilogue.unlocksOnDay);
}

function epilogueFlags(g) {
  return g.s.campaignFlags.filter((f) => ALL_EPILOGUE_FLAGS.includes(f));
}

test("no epilogue reveal at all before openEpilogue ever succeeds", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g); // never settled, passage still blocked
  sleepUntilDay(g, 5);
  const refusal = g.command({ type: "openEpilogue" });
  assert.equal(refusal.ok, false);
  assert.deepEqual(epilogueFlags(g), []);
});

test('"durable" (never touched a lever or a contract): reveals exactly epilogue-durable + epilogue-suite, no other orientation', () => {
  const g = new GardenState(null, 1000);
  readyToOpen(g);
  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignEpilogue.orientation, "durable");
  assert.deepEqual(epilogueFlags(g).sort(), ["epilogue-durable", "epilogue-suite"]);
});

test('"intensive": reveals exactly epilogue-intensive + epilogue-suite', () => {
  const g = new GardenState(null, 1000);
  readyToOpen(g);
  g.s.campaignStations.zones.push({ id: "z1", veilleuse: true });
  g.s.campaignMemory.nightlyActivity.r1 = 2;

  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignEpilogue.orientation, "intensive");
  assert.deepEqual(epilogueFlags(g).sort(), ["epilogue-intensive", "epilogue-suite"]);
});

test('"partiel": reveals exactly epilogue-partiel + epilogue-suite', () => {
  const g = new GardenState(null, 1000);
  readyToOpen(g);
  g.s.campaignStations.zones.push({ id: "z1", veilleuse: true });
  g.s.campaignMemory.nightlyActivity.r1 = 2;
  g.s.campaignFlags.push("levier-prise-restituee");

  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignEpilogue.orientation, "partiel");
  assert.deepEqual(epilogueFlags(g).sort(), ["epilogue-partiel", "epilogue-suite"]);
});

test('"durable" via a recognized renunciation: reveals epilogue-durable, never epilogue-intensive/-partiel', () => {
  const g = new GardenState(null, 1000);
  readyToOpen(g);
  g.s.campaignMemory.nightlyActivity.r1 = 2;
  g.s.campaignFlags.push("levier-veilleuse-coupee");

  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignEpilogue.orientation, "durable");
  assert.deepEqual(epilogueFlags(g).sort(), ["epilogue-durable", "epilogue-suite"]);
});

test("no second reveal: a refused second openEpilogue call reveals nothing further", () => {
  const g = new GardenState(null, 1000);
  readyToOpen(g);
  const first = g.command({ type: "openEpilogue" });
  assert.equal(first.ok, true, first.error);
  const before = epilogueFlags(g).sort();

  const second = g.command({ type: "openEpilogue" });
  assert.equal(second.ok, false);
  assert.equal(second.message, "L'épilogue est déjà ouvert.");
  assert.deepEqual(epilogueFlags(g).sort(), before);
});

test("non-régression : une sauvegarde fresh() réelle ne porte aucun de ces flags", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(epilogueFlags(g), []);
});

test("the three orientation texts do not equal one another word for word", () => {
  const texts = Object.values(ORIENTATION_FLAGS).map((id) => Narrative.TEXTS[id].text);
  assert.equal(new Set(texts).size, 3, "the three orientation texts must all differ");
});

test("epilogue-intensive names what stays degraded, but contains no accusatory monologue (design §11)", () => {
  const entry = Narrative.TEXTS["epilogue-intensive"];
  assert.ok(entry);
  assert.equal(entry.trigger, "epilogueOuvertIntensive");
  const lower = entry.text.toLowerCase();
  assert.ok(lower.includes("dégradé"), "must literally name what design §10 says stays degraded");
  for (const word of [
    "coupable",
    "faute",
    "devrais",
    "aurait dû",
    "doit ",
    "dois ",
    "obligatoire",
    "obligé",
    "il faut",
    "honte",
  ]) {
    assert.equal(lower.includes(word), false, `must not read as an accusatory monologue ("${word}")`);
  }
});

test('epilogue-durable never claims to erase a cost already paid ("pas de bouton pardonner", design §11)', () => {
  const entry = Narrative.TEXTS["epilogue-durable"];
  assert.ok(entry);
  assert.equal(entry.trigger, "epilogueOuvertDurable");
  const lower = entry.text.toLowerCase();
  for (const word of ["pardon", "efface", "annule", "oublié", "comme si de rien"]) {
    assert.equal(
      lower.includes(word) && !lower.includes("ne s’efface pas") && !lower.includes("ne s'efface pas"),
      false,
      `must not claim a cost is erased/forgiven ("${word}")`,
    );
  }
  assert.ok(
    lower.includes("ne s’efface pas") || lower.includes("ne s'efface pas"),
    "must explicitly state that a real cost is not erased",
  );
});

test("epilogue-partiel presents a mixed, assumed outcome — neither praise nor reproach", () => {
  const entry = Narrative.TEXTS["epilogue-partiel"];
  assert.ok(entry);
  assert.equal(entry.trigger, "epilogueOuvertPartiel");
  const lower = entry.text.toLowerCase();
  for (const word of ["coupable", "faute", "honte", "félicitations", "bravo"]) {
    assert.equal(lower.includes(word), false, `must not read as praise or reproach ("${word}")`);
  }
});

test("epilogue-suite states the game continues and never presents the ending as locking the save (design §10)", () => {
  const entry = Narrative.TEXTS["epilogue-suite"];
  assert.ok(entry);
  assert.equal(entry.trigger, "epilogueOuvert");
  const lower = entry.text.toLowerCase();
  assert.ok(lower.includes("continuent"), "must literally say the game continues past the credits");
  for (const word of ["fin de la partie", "terminé", "verrouill", "plus rien à faire"]) {
    assert.equal(lower.includes(word), false, `must not present this as a locking end ("${word}")`);
  }
});

test("epilogueOrientationSignal maps each of the three real orientation values to its own trigger, nothing else", () => {
  assert.equal(Narrative.epilogueOrientationSignal("intensive"), "epilogueOuvertIntensive");
  assert.equal(Narrative.epilogueOrientationSignal("partiel"), "epilogueOuvertPartiel");
  assert.equal(Narrative.epilogueOrientationSignal("durable"), "epilogueOuvertDurable");
  assert.equal(Narrative.epilogueOrientationSignal("autre-chose"), null);
});

test("a JSON round-trip after the reveal keeps the exact epilogue flags", () => {
  const g = new GardenState(null, 1000);
  readyToOpen(g);
  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, true, result.error);
  const before = epilogueFlags(g).sort();

  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(epilogueFlags(reloaded).sort(), before);
});
