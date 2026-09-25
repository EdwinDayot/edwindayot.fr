const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Epilogue = require("../public/game/campaign-epilogue.js");

// Epic C6.17 (design §10, chapitre 18 : "production toujours intensive, accommodements partiels ou
// transformation durable"). Epilogue.orientation(s) is a pure derivation over signals already real
// and filled elsewhere in the engine (Memory.nightlyActivity/waterWithdrawals, campaignContracts,
// campaignStations.zones/bornes, the three C6.9 renunciation flags) — see campaign-epilogue.js's
// own header comment for the exact branch order. Fixtures below build only the fields the function
// actually reads, in the real shape those fields have elsewhere in the save (campaign-memory.js,
// campaign-stations.js, garden-state-lifecycle.js).

function fixture(overrides = {}) {
  return {
    campaignMemory: { nightlyActivity: {}, waterWithdrawals: {}, ...overrides.campaignMemory },
    campaignContracts: overrides.campaignContracts || [],
    campaignStations: {
      zones: [],
      bornes: [],
      ...overrides.campaignStations,
    },
    campaignFlags: overrides.campaignFlags || [],
  };
}

test("branch 1 — never engaged (no lever ever used, no contract ever signed): durable", () => {
  const s = fixture();
  assert.equal(Epilogue.orientation(s), "durable");
});

test("everEngaged is proven by a signed contract alone, with no lever ever touched: not durable-by-default", () => {
  // A contract with no lever activity is still "engaged" — this must not fall through to branch 1.
  const s = fixture({ campaignContracts: [{ id: "ct1", cultivarId: "cv1", quota: 3, pricePerUnit: 10 }] });
  // No lever ever active, no reversal flag either: falls to the catch-all "partiel" branch, proving
  // everEngaged was really true (a false everEngaged would have returned "durable" here instead).
  assert.equal(Epilogue.orientation(s), "partiel");
});

test("everEngaged is proven by nightlyActivity alone, with no contract and no waterWithdrawals", () => {
  const s = fixture({ campaignMemory: { nightlyActivity: { r1: 2 }, waterWithdrawals: {} } });
  assert.notEqual(Epilogue.orientation(s), "durable", "engaged via nightlyActivity alone must not read as untouched");
});

test("everEngaged is proven by waterWithdrawals alone, with no contract and no nightlyActivity", () => {
  const s = fixture({ campaignMemory: { nightlyActivity: {}, waterWithdrawals: { b1: 5 } } });
  assert.notEqual(Epilogue.orientation(s), "durable", "engaged via waterWithdrawals alone must not read as untouched");
});

test("branch 2 — a lever has served, is still active, no renunciation ever recognized: intensive", () => {
  const s = fixture({
    campaignMemory: { nightlyActivity: { r1: 3 }, waterWithdrawals: {} },
    campaignStations: { zones: [{ id: "z1", veilleuse: true }], bornes: [] },
    campaignFlags: [],
  });
  assert.equal(Epilogue.orientation(s), "intensive");
});

test("branch 2 also fires from an active borne (priseFortDebit) rather than a zone veilleuse", () => {
  const s = fixture({
    campaignMemory: { nightlyActivity: {}, waterWithdrawals: { b1: 4 } },
    campaignStations: { zones: [], bornes: [{ id: "b1", priseFortDebit: true }] },
    campaignFlags: [],
  });
  assert.equal(Epilogue.orientation(s), "intensive");
});

test("branch 3 — no lever active any more, at least one real renunciation recognized: durable", () => {
  const s = fixture({
    campaignMemory: { nightlyActivity: { r1: 3 }, waterWithdrawals: {} },
    campaignStations: { zones: [{ id: "z1", veilleuse: false }], bornes: [] },
    campaignFlags: ["levier-veilleuse-coupee"],
  });
  assert.equal(Epilogue.orientation(s), "durable");
});

test("branch 3 fires identically for each of the three reversal flags taken alone", () => {
  for (const flag of ["levier-veilleuse-coupee", "levier-prise-restituee", "levier-contrat-reduit"]) {
    const s = fixture({
      campaignMemory: { nightlyActivity: {}, waterWithdrawals: { b1: 1 } },
      campaignStations: { zones: [], bornes: [{ id: "b1", priseFortDebit: false }] },
      campaignFlags: [flag],
    });
    assert.equal(Epilogue.orientation(s), "durable", `flag ${flag} alone must yield durable once no lever is active`);
  }
});

test("branch 4 (partiel) — a lever still active despite a renunciation recognized elsewhere", () => {
  const s = fixture({
    campaignMemory: { nightlyActivity: { r1: 2 }, waterWithdrawals: { b1: 2 } },
    campaignStations: {
      zones: [{ id: "z1", veilleuse: true }],
      bornes: [{ id: "b1", priseFortDebit: false }],
    },
    campaignFlags: ["levier-prise-restituee"],
  });
  assert.equal(Epilogue.orientation(s), "partiel");
});

test("branch 4 (partiel) — a lever served then was turned off, with no reversal ever recognized", () => {
  const s = fixture({
    campaignMemory: { nightlyActivity: { r1: 1 }, waterWithdrawals: {} },
    campaignStations: { zones: [{ id: "z1", veilleuse: false }], bornes: [] },
    campaignFlags: [],
  });
  assert.equal(Epilogue.orientation(s), "partiel");
});

test("orientation never mutates its argument", () => {
  const s = fixture({
    campaignMemory: { nightlyActivity: { r1: 2 }, waterWithdrawals: { b1: 1 } },
    campaignContracts: [{ id: "ct1", cultivarId: "cv1", quota: 3, pricePerUnit: 10 }],
    campaignStations: {
      zones: [{ id: "z1", veilleuse: true }],
      bornes: [{ id: "b1", priseFortDebit: false }],
    },
    campaignFlags: ["levier-prise-restituee"],
  });
  const before = JSON.stringify(s);
  Epilogue.orientation(s);
  assert.equal(JSON.stringify(s), before);
});

test("orientation is pure and deterministic: two consecutive calls on the same state agree", () => {
  const s = fixture({
    campaignMemory: { nightlyActivity: { r1: 3 }, waterWithdrawals: {} },
    campaignStations: { zones: [{ id: "z1", veilleuse: true }], bornes: [] },
  });
  assert.equal(Epilogue.orientation(s), Epilogue.orientation(s));
});

test("non-regression: a real fresh() save (no lever ever touched) reads as durable", () => {
  const g = new GardenState(null, 1000);
  assert.equal(Epilogue.orientation(g.s), "durable");
});
