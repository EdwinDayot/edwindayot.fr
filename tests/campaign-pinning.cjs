const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Genetics = require("../public/game/botany-genetics.js");
const Pot = require("../public/game/botany-pot.js");

// Same seeded PRNG as tests/campaign-pot.cjs, for the same reason: bit-for-bit reproducible
// statistical assertions without depending on the platform's real RNG.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("resolvePotDraw with a pin: the pinned axis is always the pinned parent's value, other loci still vary (200 draws)", () => {
  // Design §4, l.147: "épingler un caractère déjà observé provenant d'un parent... garanti à
  // l'essai suivant, les autres restent variables." ronce-a-rubans x fraise-timide differ on
  // port/feuilles/fleurs/palette (fonction/humidite happen to match on both, see campaign-pot.cjs)
  // so pinning "port" to fraise-timide and watching feuilles/palette still move proves both
  // halves of the claim on the same pair already used by the un-pinned statistical test.
  const fraise = Genetics.founders.find((f) => f.id === "fraise-timide");
  const ronce = Genetics.founders.find((f) => f.id === "ronce-a-rubans");
  assert.notEqual(fraise.traits.port, ronce.traits.port);
  const pin = { axis: "port", speciesId: "fraise-timide" };
  const base = mulberry32(150917);
  const N = 200;
  const seenFeuilles = new Set();
  const seenPalette = new Set();
  for (let i = 0; i < N; i++) {
    const traits = Pot.resolvePotDraw("ronce-a-rubans", "fraise-timide", base, pin);
    assert.deepEqual(traits.port, fraise.traits.port, "pinned axis must never vary");
    seenFeuilles.add(JSON.stringify(traits.feuilles));
    seenPalette.add(JSON.stringify(traits.palette));
  }
  assert.ok(seenFeuilles.size > 1, "a non-pinned locus should still vary across draws");
  assert.ok(seenPalette.size > 1, "a second non-pinned locus should also still vary");
});

test("A pinned axis stays fixed across reject-and-redraw retries, on a pair whose fonction is actually constrained", () => {
  // oreille-de-pluie x menthe-de-velours (already used together by campaign-pot.cjs's "always
  // structurally valid" test) actually rejects and redraws sometimes: oreille-de-pluie's
  // fonction (retenir_eau) requires feuilles.forme === "coupe" on the *same* set, which fails
  // whenever feuilles is drawn from menthe-de-velours instead. Pinning an unrelated axis
  // (palette) must never itself change, across every one of these redraws, while the draw as a
  // whole keeps landing on a validated combination.
  const oreille = Genetics.founders.find((f) => f.id === "oreille-de-pluie");
  const pin = { axis: "palette", speciesId: "oreille-de-pluie" };
  const base = mulberry32(4242);
  const N = 300;
  const seenFeuilles = new Set();
  for (let i = 0; i < N; i++) {
    const traits = Pot.resolvePotDraw("oreille-de-pluie", "menthe-de-velours", base, pin);
    assert.deepEqual(traits.palette, oreille.traits.palette);
    assert.ok(Genetics.traitCombinationValid(traits));
    seenFeuilles.add(JSON.stringify(traits.feuilles));
  }
  assert.ok(seenFeuilles.size > 1, "a non-pinned locus should still vary across draws");
});

test("resolvePotDraw throws explicitly on an unknown pinned axis or a pinned species outside the pair", () => {
  assert.throws(
    () =>
      Pot.resolvePotDraw("ronce-a-rubans", "fraise-timide", Math.random, {
        axis: "couleur-yeux",
        speciesId: "fraise-timide",
      }),
    /unknown pinned axis/,
  );
  assert.throws(
    () =>
      Pot.resolvePotDraw("ronce-a-rubans", "fraise-timide", Math.random, {
        axis: "port",
        speciesId: "aster-des-vents",
      }),
    /pinned species/,
  );
});

test("pinTrait refuses before Iris has shown the pinning trick", () => {
  const g = new GardenState(null, 1000);
  const r = g.command({ type: "pinTrait", axis: "port", speciesId: "fraise-timide" });
  assert.equal(r.ok, false);
  assert.ok(r.message);
  assert.equal(g.s.campaignPin, null);
});

test("pinTrait succeeds once Iris has shown the trick, and replaces any previous pin wholesale", () => {
  const g = new GardenState(null, 1000);
  const met = g.command({ type: "meetIris" });
  assert.equal(met.ok, true);
  assert.ok(g.s.campaignFlags.includes("iris-epinglage"));

  const r1 = g.command({ type: "pinTrait", axis: "port", speciesId: "fraise-timide" });
  assert.equal(r1.ok, true);
  assert.deepEqual(g.s.campaignPin, { axis: "port", speciesId: "fraise-timide" });

  const r2 = g.command({ type: "pinTrait", axis: "feuilles", speciesId: "ronce-a-rubans" });
  assert.equal(r2.ok, true);
  assert.deepEqual(
    g.s.campaignPin,
    { axis: "feuilles", speciesId: "ronce-a-rubans" },
    "a second pinTrait replaces the pin entirely, never adds a second one",
  );
});

test("pinTrait rejects an unknown axis or an unknown founding species explicitly, without throwing", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "meetIris" });
  const r1 = g.command({ type: "pinTrait", axis: "couleur-yeux", speciesId: "fraise-timide" });
  assert.equal(r1.ok, false);
  assert.ok(r1.message);
  const r2 = g.command({ type: "pinTrait", axis: "port", speciesId: "nope" });
  assert.equal(r2.ok, false);
  assert.ok(r2.message);
  assert.equal(g.s.campaignPin, null);
});

test("sowPot attaches a matching pending pin and clears campaignPin", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "meetIris" });
  g.command({ type: "pinTrait", axis: "port", speciesId: "fraise-timide" });
  const sow = g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  assert.equal(sow.ok, true);
  assert.deepEqual(g.s.campaignPot.pending, [
    {
      a: "ronce-a-rubans",
      b: "fraise-timide",
      pin: { axis: "port", speciesId: "fraise-timide" },
    },
  ]);
  assert.equal(g.s.campaignPin, null);
});

test("sowPot without an active pin keeps the exact pre-existing pending shape (no pin key at all)", () => {
  const g = new GardenState(null, 1000);
  const sow = g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  assert.equal(sow.ok, true);
  assert.deepEqual(g.s.campaignPot.pending, [{ a: "ronce-a-rubans", b: "fraise-timide" }]);
});

test("sowPot refuses explicitly when the pinned species isn't one of the chosen pair, leaving the pin and pending untouched", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "meetIris" });
  g.command({ type: "pinTrait", axis: "port", speciesId: "aster-des-vents" });
  const sow = g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  assert.equal(sow.ok, false);
  assert.ok(sow.message);
  assert.deepEqual(g.s.campaignPot.pending, []);
  assert.deepEqual(g.s.campaignPin, { axis: "port", speciesId: "aster-des-vents" });
});

test("sleep resolves a real cultivar honouring the pinned axis end to end, through the real command vector", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "meetIris" });
  g.command({ type: "pinTrait", axis: "port", speciesId: "fraise-timide" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  const sleep = g.command({ type: "sleep" });
  assert.equal(sleep.ok, true);
  assert.equal(g.s.cultivars.length, 1);
  const fraise = Genetics.founders.find((f) => f.id === "fraise-timide");
  assert.equal(g.s.cultivars[0].traits.port, fraise.traits.port);
});

test("campaignPin and a pending pin both survive a JSON round-trip", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "meetIris" });
  g.command({ type: "pinTrait", axis: "port", speciesId: "fraise-timide" });
  const savedPin = JSON.parse(JSON.stringify(g.serialize()));
  const reloadedPin = new GardenState(savedPin);
  assert.deepEqual(reloadedPin.s.campaignPin, { axis: "port", speciesId: "fraise-timide" });

  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  const savedPending = JSON.parse(JSON.stringify(g.serialize()));
  const reloadedPending = new GardenState(savedPending);
  assert.deepEqual(reloadedPending.s.campaignPot.pending, g.s.campaignPot.pending);
  assert.equal(reloadedPending.s.campaignPin, null);
});

test("A save without campaignPin migrates to null without altering the rest of its content", () => {
  const g = new GardenState(null, 1000),
    old = g.serialize();
  delete old.campaignPin;
  const before = JSON.stringify({ ...old, campaignPin: undefined });
  const migrated = new GardenState(old);
  assert.equal(migrated.s.campaignPin, null);
  const after = JSON.stringify({ ...migrated.s, campaignPin: undefined });
  assert.equal(after, before, "no other field should change during this migration");
});

test("A malformed campaignPin is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const bad of [
    "nope",
    { axis: "port" },
    { axis: "nope", speciesId: "fraise-timide" },
    { axis: "port", speciesId: "nope" },
  ]) {
    const saved = g.serialize();
    saved.campaignPin = bad;
    assert.throws(() => validate(saved), /Épingle invalide/);
  }
});

test("A malformed or mismatched pin attached to a pending pot entry is rejected", () => {
  const g = new GardenState(null, 1000);
  for (const pin of [
    "nope",
    { axis: "nope", speciesId: "fraise-timide" },
    { axis: "port", speciesId: "nope" },
    { axis: "port", speciesId: "aster-des-vents" }, // neither ronce-a-rubans nor fraise-timide
  ]) {
    const saved = g.serialize();
    saved.campaignPot = {
      capacity: 1,
      pending: [{ a: "ronce-a-rubans", b: "fraise-timide", pin }],
    };
    assert.throws(() => validate(saved), /Pot invalide/);
  }
});
