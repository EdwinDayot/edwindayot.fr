const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Epilogue = require("../public/game/campaign-epilogue.js");

// Epic C6.18 (design §10, chapitre 18, deuxième temps : "délai d'observation et gel du résultat").
// s.campaignEpilogue.unlocksOnDay is set once, additively, at whichever of the three settling
// sites (garden-state-cmd-f.js/-u.js/-w.js, C6.15) actually settles a Rainelle first — never a
// second time for the same game. openEpilogue (garden-state-cmd-x.js) is the only transition from
// "not yet open" to "open", freezing orientation(s)'s live result the moment it runs.

// Same fixture already used by tests/campaign-passage-settle.cjs — only the scripted frog
// encounter (C2.3) can create a Rainelle through commands, born with geste null (design §5).
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

// Settles the only Rainelle immediately (geste already null, restorePassage completes the
// condition alone) — the same minimal path as campaign-passage-settle.cjs's own first test.
function settle(g) {
  bornRainelle(g);
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  return g.s.campaignEpilogue.unlocksOnDay;
}

test("a fresh save starts with no epilogue state at all, canOpen false", () => {
  const g = new GardenState(null, 1000);
  assert.deepEqual(g.s.campaignEpilogue, {
    unlocksOnDay: null,
    orientation: null,
    openedOnDay: null,
    gift: null,
  });
  assert.equal(Epilogue.canOpen(g.s), false);
});

test("canOpen stays false until a Rainelle actually settles, even on an otherwise ordinary game", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g); // geste null, never taught — passage still blocked, no settling yet
  sleepUntilDay(g, 5);
  assert.equal(g.s.campaignEpilogue.unlocksOnDay, null);
  assert.equal(Epilogue.canOpen(g.s), false);
});

test("unlocksOnDay is set exactly once a Rainelle settles, three days after the day she settles", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const dayAtSettling = g.s.campaignDay;
  const result = g.command({ type: "restorePassage" });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignEpilogue.unlocksOnDay, dayAtSettling + 3);
});

test("a second settling site never overwrites unlocksOnDay — only one Rainelle ever settles anyway (C6.15)", () => {
  // releaseGesture on an already-taught Rainelle is the second site; since only one Rainelle can
  // ever settle for the whole game (C6.15's own invariant), this is really exercising "the first
  // site reached wins" through the only path that can still run afterward without error.
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const before = g.command({ type: "restorePassage" });
  assert.equal(before.ok, true, before.error);
  const unlockDay = g.s.campaignEpilogue.unlocksOnDay;

  sleepUntilDay(g, unlockDay + 2);
  const releaseResult = g.command({ type: "releaseGesture", rainelleId: rainelle.id });
  assert.equal(releaseResult.ok, false, "already has no gesture, refused — sanity check only");
  assert.equal(g.s.campaignEpilogue.unlocksOnDay, unlockDay, "untouched by the refused call");
});

test("canOpen stays false right up to the day before the unlock day, becomes true exactly at it", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);

  sleepUntilDay(g, unlockDay - 1);
  assert.equal(Epilogue.canOpen(g.s), false, "still one day short");

  sleepUntilDay(g, unlockDay);
  assert.equal(Epilogue.canOpen(g.s), true);
});

test("canOpen stays true past the unlock day too, as long as the epilogue has not been opened yet", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay + 4);
  assert.equal(Epilogue.canOpen(g.s), true);
});

test("openEpilogue refused before any Rainelle has ever settled (unlocksOnDay still null)", () => {
  const g = new GardenState(null, 1000);
  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, false);
  assert.equal(result.message, "L'épilogue n'est pas encore accessible.");
});

test("openEpilogue refused before the unlock day, with no mutation of campaignEpilogue", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay - 1);
  const before = JSON.stringify(g.s.campaignEpilogue);

  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, false);
  assert.equal(result.message, "L'épilogue n'est pas encore accessible.");
  assert.equal(JSON.stringify(g.s.campaignEpilogue), before);
});

test("openEpilogue accepted at the unlock day: freezes orientation and the day it opened", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g); // never touches a lever or a contract -> "durable"
  sleepUntilDay(g, unlockDay);

  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.message, "Épilogue ouvert.");
  assert.equal(g.s.campaignEpilogue.orientation, "durable");
  assert.equal(g.s.campaignEpilogue.openedOnDay, g.s.campaignDay);
});

test("openEpilogue freezes each of the three possible orientations correctly, per C6.17's own branches", () => {
  const cases = [
    {
      name: "intensive",
      setup: (s) => {
        s.campaignStations.zones.push({ id: "z1", veilleuse: true });
        s.campaignMemory.nightlyActivity.r1 = 2;
      },
      expected: "intensive",
    },
    {
      name: "durable via a recognized renunciation",
      setup: (s) => {
        s.campaignMemory.nightlyActivity.r1 = 2;
        s.campaignFlags.push("levier-veilleuse-coupee");
      },
      expected: "durable",
    },
    {
      name: "partiel",
      setup: (s) => {
        s.campaignStations.zones.push({ id: "z1", veilleuse: true });
        s.campaignMemory.nightlyActivity.r1 = 2;
        s.campaignFlags.push("levier-prise-restituee");
      },
      expected: "partiel",
    },
  ];
  for (const { name, setup, expected } of cases) {
    const g = new GardenState(null, 1000);
    const unlockDay = settle(g);
    setup(g.s);
    sleepUntilDay(g, unlockDay);

    const result = g.command({ type: "openEpilogue" });
    assert.equal(result.ok, true, `${name}: ${result.error}`);
    assert.equal(g.s.campaignEpilogue.orientation, expected, name);
  }
});

test("orientation stays frozen after opening even if the lever state changes afterward", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  g.s.campaignMemory.nightlyActivity.r1 = 2; // everEngaged true, no lever active/reversed -> "partiel"
  sleepUntilDay(g, unlockDay);

  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignEpilogue.orientation, "partiel");

  g.s.campaignStations.zones.push({ id: "z9", veilleuse: true });
  assert.equal(Epilogue.orientation(g.s), "intensive", "sanity: the live derivation really would change now");
  assert.equal(g.s.campaignEpilogue.orientation, "partiel", "but the frozen value never recomputes once opened");
});

test("openEpilogue refused a second time — already open — with no mutation", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay);
  const first = g.command({ type: "openEpilogue" });
  assert.equal(first.ok, true, first.error);
  const before = JSON.stringify(g.s.campaignEpilogue);

  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, false);
  assert.equal(result.message, "L'épilogue est déjà ouvert.");
  assert.equal(JSON.stringify(g.s.campaignEpilogue), before);
});

test("openEpilogue still refused as already-open even many days after it was opened", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay);
  g.command({ type: "openEpilogue" });
  sleepUntilDay(g, unlockDay + 5);

  const result = g.command({ type: "openEpilogue" });
  assert.equal(result.ok, false);
  assert.equal(result.message, "L'épilogue est déjà ouvert.");
});

test("aller-retour JSON de campaignEpilogue une fois ouvert", () => {
  const g = new GardenState(null, 1000);
  const unlockDay = settle(g);
  sleepUntilDay(g, unlockDay);
  const opened = g.command({ type: "openEpilogue" });
  assert.equal(opened.ok, true, opened.error);

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignEpilogue, g.s.campaignEpilogue);
});

test("migration : une sauvegarde antérieure sans campaignEpilogue migre à l'état par défaut", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  delete raw.campaignEpilogue;

  const migrated = validate(raw);
  assert.deepEqual(migrated.campaignEpilogue, {
    unlocksOnDay: null,
    orientation: null,
    openedOnDay: null,
    gift: null,
  });
});

test("validate : refuse une orientation qui n'est pas l'une des trois valeurs connues", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  raw.campaignEpilogue = { unlocksOnDay: 5, orientation: "au-hasard", openedOnDay: 5 };
  assert.throws(() => validate(raw));
});

test("validate : refuse orientation renseignée sans openedOnDay, et l'inverse", () => {
  const g = new GardenState(null, 1000);

  const raw1 = JSON.parse(JSON.stringify(g.s));
  raw1.campaignEpilogue = { unlocksOnDay: 5, orientation: "durable", openedOnDay: null };
  assert.throws(() => validate(raw1));

  const raw2 = JSON.parse(JSON.stringify(g.s));
  raw2.campaignEpilogue = { unlocksOnDay: 5, orientation: null, openedOnDay: 5 };
  assert.throws(() => validate(raw2));
});

test("validate : refuse openedOnDay renseigné alors qu'unlocksOnDay est toujours null", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  raw.campaignEpilogue = { unlocksOnDay: null, orientation: "durable", openedOnDay: 5 };
  assert.throws(() => validate(raw));
});

test("validate : refuse un campaignEpilogue qui n'est pas un objet", () => {
  const g = new GardenState(null, 1000);
  const raw = JSON.parse(JSON.stringify(g.s));
  raw.campaignEpilogue = "durable";
  assert.throws(() => validate(raw));
});

test("non-régression : une sauvegarde fresh() réelle a canOpen faux et campaignEpilogue vide", () => {
  const g = new GardenState(null, 1000);
  assert.equal(Epilogue.canOpen(g.s), false);
  assert.deepEqual(g.s.campaignEpilogue, {
    unlocksOnDay: null,
    orientation: null,
    openedOnDay: null,
    gift: null,
  });
});
