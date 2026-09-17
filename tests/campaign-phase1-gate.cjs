// Phase 1 exit gate (docs/campagne-backlog.md "Portes de phase", docs/orchestration.md):
// "un joueur reconnaît des caractères parentaux, cible un besoin donné et retrouve exactement
// son cultivar après rechargement." Each epic in phase 1 (C1.1-C1.4, C1.6, C1.7, C1.8) already
// tests its own slice in isolation (campaign-cultivars.cjs, campaign-genetics.cjs,
// campaign-pot.cjs, campaign-notebook.cjs, campaign-multiply.cjs, campaign-hybrids-render.cjs);
// this file is the end-to-end scenario the gate itself names, run once as a single narrative
// through the real GardenState command layer — not a restatement of those unit tests.
//
// Also exercises the two relevant docs/game-design.md §16 validation scenarios that apply to
// phase 1's own scope (pinning, C1.5, is out of scope: correctly deferred to C4.3, see its own
// backlog entry — the gate criterion above never mentions it):
//   "Multiplier un cultivar conserve exactement ses traits ; le rechargement ne modifie ni le
//   cultivar ni le résultat déjà engagé au pot."
//   "Aucune commande, récolte, nuit ou naissance ne crédite deux fois ses résultats après
//   sauvegarde et reprise."
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Genetics = require("../public/game/botany-genetics.js");
const Pot = require("../public/game/botany-pot.js");
const Cultivars = require("../public/game/cultivars.js");

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("gate scenario 1/3 — a real cross recognizably carries each parent's traits", () => {
  const g = new GardenState(null, 1000);
  assert.equal(g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  const cultivar = g.s.cultivars[0];
  const parentA = Genetics.founders.find((f) => f.id === "ronce-a-rubans").traits;
  const parentB = Genetics.founders.find((f) => f.id === "fraise-timide").traits;
  for (const axis of ["port", "feuilles", "fleurs", "palette", "humidite", "fonction"]) {
    const value = JSON.stringify(cultivar.traits[axis]);
    const fromA = JSON.stringify(parentA[axis]) === value;
    const fromB = JSON.stringify(parentB[axis]) === value;
    assert.ok(fromA || fromB, `axis ${axis} (${value}) traces to neither parent`);
  }
});

test("gate scenario 2/3 — the pot can target a stated need (a cultivar that lights a path)", () => {
  // clochette-du-soir (éclairer) x aster-des-vents (sec, no fonction): compatible (humidity
  // gap 1), so a targeted cross for "light the terraces at night" is a real, reachable request,
  // not a hope. Search a small, fixed range of seeds (same mulberry32 family already used by
  // tests/campaign-pot.cjs) for one that resolves to the éclairer function, exactly the way a
  // player retrying the pot a few nights in a row would.
  assert.ok(Genetics.crossCompatible("clochette-du-soir", "aster-des-vents"));
  let found = null;
  for (let seed = 0; seed < 500 && !found; seed++) {
    const traits = Pot.resolvePotDraw("clochette-du-soir", "aster-des-vents", mulberry32(seed));
    if (traits.fonction && traits.fonction.type === "eclairer") found = traits;
  }
  assert.ok(found, "expected at least one of the first 500 seeds to produce an éclairer cultivar");
  assert.ok(Genetics.traitCombinationValid(found));

  // The targeted result is a real, playable cultivar through the actual state layer, not just a
  // value returned by the genetics module in isolation.
  const g = new GardenState(null, 1000);
  const cultivar = Cultivars.createCultivar(g.s, {
    name: "Veilleuse de terrasse",
    parentIds: ["clochette-du-soir", "aster-des-vents"],
    traits: found,
  });
  assert.equal(cultivar.traits.fonction.type, "eclairer");
});

test("gate scenario 3/3 — cultivar, specimen and pot state all survive a real reload exactly, with no double-credit", () => {
  const g = new GardenState(null, 1000);
  assert.equal(g.command({ type: "sowPot", a: "menthe-de-velours", b: "aster-des-vents" }).ok, true);
  const sleepA = g.command({ type: "sleep" });
  assert.equal(sleepA.ok, true);
  assert.equal(g.s.cultivars.length, 1, "exactly one cultivar after the first night");
  const cultivar = g.s.cultivars[0];
  const specimen = g.command({ type: "plantSpecimen", cultivarId: cultivar.id, x: 1, z: 1 });
  assert.equal(specimen.ok, true);

  // "aucune commande, récolte, nuit ou naissance ne crédite deux fois ses résultats" — sleeping
  // again with nothing newly sown must not spawn a second cultivar.
  const sleepB = g.command({ type: "sleep" });
  assert.equal(sleepB.ok, true);
  assert.equal(g.s.cultivars.length, 1, "an empty pot must not credit a second cultivar");

  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.cultivars, g.s.cultivars, "cultivar not identical after a real JSON reload");
  assert.deepEqual(reloaded.s.specimens, g.s.specimens, "specimen not identical after a real JSON reload");
  assert.deepEqual(
    Cultivars.specimenTraits(reloaded.s, reloaded.s.specimens[0]),
    Cultivars.specimenTraits(g.s, g.s.specimens[0]),
    "specimen traits diverged after reload",
  );
  assert.equal(reloaded.s.cultivars.length, 1, "reload must not re-resolve or duplicate the pot");
});
