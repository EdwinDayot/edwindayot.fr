const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Genetics = require("../public/game/botany-genetics.js");
const Pot = require("../public/game/botany-pot.js");

// Small seeded PRNG (mulberry32) so the statistical test below is bit-for-bit reproducible
// across runs and machines, without any external dependency.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("resolvePotDraw draws each of the six loci from either parent at ~50/50, seed fixed", () => {
  // ronce-a-rubans x fraise-timide: both compatible (humidite "frais" on both sides) and both
  // have fonction: null. A null fonction always satisfies traitCombinationValid regardless of
  // the other five axes (see botany-genetics.js: "if (!traits.fonction) return true"), so every
  // single draw for this pair is accepted immediately — the reject-and-redraw loop is never
  // entered. That isolates the property under test (each locus is chosen from either parent at
  // probability 1/2) from the separate question of validity filtering, which
  // campaign-genetics.cjs already covers on its own.
  //
  // Because a draw is never rejected here, resolvePotDraw consumes exactly six random() calls
  // per draw, always in the fixed axis order (port, feuilles, fleurs, palette, humidite,
  // fonction). We record the raw value of every call rather than compare the resulting trait to
  // parent B's value, because two of these six axes happen to hold the *same* value on both
  // parents (humidite: "frais"/"frais", fonction: null/null) — for those axes the output cannot
  // reveal which parent it came from, even though the underlying draw is still a fair coin flip
  // consuming one random() call. Recording the raw draws sidesteps that entirely.
  const AXIS_COUNT = 6;
  const N = 10000;
  const fromB = new Array(AXIS_COUNT).fill(0);
  const base = mulberry32(20260917);
  let calls = 0;
  const recording = () => {
    const v = base();
    if (v >= 0.5) fromB[calls % AXIS_COUNT]++;
    calls++;
    return v;
  };

  assert.ok(Genetics.crossCompatible("ronce-a-rubans", "fraise-timide"));
  const ronce = Genetics.founders.find((f) => f.id === "ronce-a-rubans");
  const fraise = Genetics.founders.find((f) => f.id === "fraise-timide");
  assert.equal(ronce.traits.fonction, null);
  assert.equal(fraise.traits.fonction, null);

  for (let i = 0; i < N; i++) Pot.resolvePotDraw("ronce-a-rubans", "fraise-timide", recording);

  assert.equal(
    calls,
    N * AXIS_COUNT,
    "no draw should ever have been rejected/redrawn for this pair",
  );
  for (let axis = 0; axis < AXIS_COUNT; axis++) {
    const proportion = fromB[axis] / N;
    assert.ok(
      proportion > 0.45 && proportion < 0.55,
      `axis ${axis} should land near 50% from parent B, got ${proportion}`,
    );
  }
});

test("resolvePotDraw always returns a structurally valid trait set", () => {
  const base = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    const traits = Pot.resolvePotDraw("oreille-de-pluie", "menthe-de-velours", base);
    assert.ok(Genetics.traitCombinationValid(traits));
  }
});

test("sowPot then sleep fixes a real cultivar in s.cultivars, and reloading never draws again", () => {
  const g = new GardenState(null, 1000);
  const sow = g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  assert.equal(sow.ok, true);
  assert.deepEqual(g.s.campaignPot.pending, [{ a: "ronce-a-rubans", b: "fraise-timide" }]);

  const sleep = g.command({ type: "sleep" });
  assert.equal(sleep.ok, true);
  assert.equal(g.s.cultivars.length, 1);
  const cultivar = g.s.cultivars[0];
  assert.deepEqual(cultivar.parentIds, ["ronce-a-rubans", "fraise-timide"]);
  assert.ok(Genetics.traitCombinationValid(cultivar.traits));
  assert.deepEqual(g.s.campaignPot.pending, []);

  const saved = JSON.parse(JSON.stringify(g.serialize()));
  const reloaded = new GardenState(saved);
  assert.deepEqual(reloaded.s.cultivars, g.s.cultivars);
  assert.equal(reloaded.s.cultivars.length, 1, "no new draw should have happened on reload");
  assert.deepEqual(reloaded.s.campaignPot.pending, []);
});

test("Only one pair per night: a second sowPot before sleep is refused explicitly", () => {
  const g = new GardenState(null, 1000);
  const first = g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  assert.equal(first.ok, true);
  const second = g.command({ type: "sowPot", a: "aster-des-vents", b: "fraise-timide" });
  assert.equal(second.ok, false);
  assert.ok(second.message);
  assert.deepEqual(g.s.campaignPot.pending, [{ a: "ronce-a-rubans", b: "fraise-timide" }]);
});

test("sleep with nothing prepared succeeds and creates no cultivar", () => {
  const g = new GardenState(null, 1000);
  const sleep = g.command({ type: "sleep" });
  assert.equal(sleep.ok, true);
  assert.deepEqual(g.s.cultivars, []);
  assert.deepEqual(g.s.campaignPot.pending, []);
});

test("An incompatible pair (humidity gap > 1) is refused by sowPot without changing pending", () => {
  const g = new GardenState(null, 1000);
  assert.equal(Genetics.crossCompatible("aster-des-vents", "oreille-de-pluie"), false);
  const r = g.command({ type: "sowPot", a: "aster-des-vents", b: "oreille-de-pluie" });
  assert.equal(r.ok, false);
  assert.ok(r.message);
  assert.deepEqual(g.s.campaignPot.pending, []);
});

test("An unknown founding species id is refused explicitly, not thrown", () => {
  const g = new GardenState(null, 1000);
  assert.doesNotThrow(() => {
    const r = g.command({ type: "sowPot", a: "nope", b: "fraise-timide" });
    assert.equal(r.ok, false);
    assert.ok(r.message);
  });
  assert.deepEqual(g.s.campaignPot.pending, []);
});

test("A v3 save without a campaignPot field migrates to the default without altering the rest of its content", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  delete old.campaignPot;
  const before = JSON.stringify({ ...old, campaignPot: undefined });
  const migrated = new GardenState(old);
  assert.deepEqual(migrated.s.campaignPot, { capacity: 1, pending: [] });
  const after = JSON.stringify({ ...migrated.s, campaignPot: undefined });
  assert.equal(after, before, "no other field should change during this migration");
});

test("A malformed campaignPot field is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const bad of [
    "nope",
    { capacity: 1.5, pending: [] },
    { capacity: 0, pending: [] },
    { capacity: 1, pending: [{ a: "x", b: "y" }, { a: "x", b: "y" }] },
    { capacity: 1, pending: [{ a: "x" }] },
    { capacity: 1, pending: [{ a: 1, b: "y" }] },
    { capacity: 1, pending: "nope" },
  ]) {
    const saved = g.serialize();
    saved.campaignPot = bad;
    assert.throws(() => validate(saved), /Pot invalide/);
  }
});
