const { test } = require("node:test");
const assert = require("node:assert/strict");
const Genetics = require("../public/game/botany-genetics.js");

test("Every founding species' own trait set is internally valid", () => {
  for (const f of Genetics.founders) {
    assert.ok(
      Genetics.traitCombinationValid(f.traits),
      `${f.id} should satisfy its own fonction's requirement`,
    );
  }
});

test("traitCombinationValid accepts a trait set with no fonction", () => {
  assert.ok(
    Genetics.traitCombinationValid({
      port: "touffe",
      feuilles: { forme: "ronde", taille: "petite" },
      fleurs: null,
      palette: { dominante1: "vert", dominante2: "vert", accent: null },
      humidite: "frais",
      fonction: null,
    }),
  );
});

test("traitCombinationValid rejects retenir_eau without a cup-shaped leaf", () => {
  assert.equal(
    Genetics.traitCombinationValid({
      feuilles: { forme: "ronde", taille: "grande" },
      fleurs: null,
      humidite: "frais",
      fonction: { type: "retenir_eau", intensite: "forte" },
    }),
    false,
  );
});

test("traitCombinationValid rejects eclairer without any flower", () => {
  assert.equal(
    Genetics.traitCombinationValid({
      feuilles: { forme: "fine", taille: "petite" },
      fleurs: null,
      humidite: "frais",
      fonction: { type: "eclairer", intensite: "moyenne" },
    }),
    false,
  );
});

test("traitCombinationValid rejects filtrer outside humid soil", () => {
  assert.equal(
    Genetics.traitCombinationValid({
      feuilles: { forme: "fine", taille: "petite" },
      fleurs: null,
      humidite: "sec",
      fonction: { type: "filtrer", intensite: "moyenne" },
    }),
    false,
  );
});

test("traitCombinationValid rejects absorber_bruit without large leaves", () => {
  assert.equal(
    Genetics.traitCombinationValid({
      feuilles: { forme: "fine", taille: "petite" },
      fleurs: null,
      humidite: "humide",
      fonction: { type: "absorber_bruit", intensite: "moyenne" },
    }),
    false,
  );
});

test("traitCombinationValid accepts parfumer unconditionally", () => {
  assert.ok(
    Genetics.traitCombinationValid({
      feuilles: { forme: "ronde", taille: "petite" },
      fleurs: null,
      humidite: "sec",
      fonction: { type: "parfumer", intensite: "faible" },
    }),
  );
});

test("crossCompatible is symmetric and every founder is compatible with itself", () => {
  const ids = Genetics.founders.map((f) => f.id);
  for (const a of ids) {
    assert.ok(Genetics.crossCompatible(a, a), `${a} should be compatible with itself`);
    for (const b of ids) {
      assert.equal(
        Genetics.crossCompatible(a, b),
        Genetics.crossCompatible(b, a),
        `${a}/${b} compatibility should not depend on argument order`,
      );
    }
  }
});

test("Two species at opposite humidity extremes (sec vs humide) are not cross-compatible", () => {
  assert.equal(Genetics.crossCompatible("aster-des-vents", "oreille-de-pluie"), false);
  assert.equal(Genetics.crossCompatible("aster-des-vents", "mousse-de-source"), false);
});

test("Every declared-compatible founder pair has at least one valid reachable trait combination", () => {
  const ids = Genetics.founders.map((f) => f.id);
  let pairsChecked = 0;
  for (const a of ids)
    for (const b of ids) {
      if (!Genetics.crossCompatible(a, b)) continue;
      pairsChecked++;
      const reachable = Genetics.enumerateReachableTraitSets(a, b);
      assert.equal(reachable.length, 64, `${a}/${b} should enumerate 2^6 combinations`);
      const validOnes = reachable.filter((r) => r.valid);
      assert.ok(
        validOnes.length > 0,
        `${a}/${b} is declared compatible but has no valid reachable combination`,
      );
    }
  assert.ok(pairsChecked > 0, "the test should actually have exercised at least one pair");
});

test("enumerateReachableTraitSets flags a fonction/feuilles mismatch as invalid, not silently dropped", () => {
  // oreille-de-pluie (retenir_eau, feuille en coupe) x menthe-de-velours (feuille ronde):
  // drawing the fonction from one parent and the feuilles locus from the other must appear in
  // the enumeration and be marked invalid, never mounted as a legal cultivar.
  const reachable = Genetics.enumerateReachableTraitSets(
    "oreille-de-pluie",
    "menthe-de-velours",
  );
  const mismatch = reachable.find(
    (r) => r.traits.fonction && r.traits.fonction.type === "retenir_eau" && r.traits.feuilles.forme !== "coupe",
  );
  assert.ok(mismatch, "the mismatched combination should be enumerated");
  assert.equal(mismatch.valid, false);
});

test("An unknown founding species id is rejected rather than silently treated as compatible", () => {
  assert.throws(() => Genetics.crossCompatible("oreille-de-pluie", "nope"), /unknown founding species/);
  assert.throws(() => Genetics.enumerateReachableTraitSets("nope", "oreille-de-pluie"), /unknown founding species/);
});
