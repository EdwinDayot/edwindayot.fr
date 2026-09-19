const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Narrative = require("../public/game/data-narrative.js");
const Stations = require("../public/game/campaign-stations.js");

// Épic C4.6 (design §10, chapitre 6, "On ne se fabrique pas tout seul"). Deux volets distincts,
// comme énoncé par le critère de sortie de campagne-backlog.md : (1) la première tentative
// d'enseigner "multiplier" (déjà refusée depuis C2.10) déclenche en plus un texte narratif
// une seule fois, quel que soit le nombre de refus suivants ; (2) le cycle bourgeon → nurserie
// → réveil (C3.4) rejoué jusqu'au second individu réel, et la première Rainelle porte un champ
// `founder` persistant qu'aucun autre individu ne porte jamais.

// Same fixture already used by campaign-chapter4.cjs/campaign-chapter5.cjs/campaign-nursery.cjs:
// triggerFrogEncounter (C2.3) now refuses until a cultivar exists (C4.4), so a warm-up cross
// always comes first.
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

test("the very first Rainelle carries founder: true", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  assert.equal(r.founder, true);
});

test("teachGesture's first 'multiplier' refusal reveals the chapter 6 text exactly once", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  assert.equal(g.s.campaignFlags.includes("on-ne-se-fabrique-pas-seul"), false);

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
  assert.equal(g.s.campaignFlags.includes("on-ne-se-fabrique-pas-seul"), true);
  assert.equal(
    Narrative.TEXTS["on-ne-se-fabrique-pas-seul"].trigger,
    "firstMultiplyRefusalSeen",
  );

  // A second, third refusal never duplicates the flag nor re-fails for any different reason.
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
});

test("demonstrateGesture's 'multiplier' refusal reveals the same text (whichever entry point comes first)", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
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
  assert.equal(g.s.campaignFlags.includes("on-ne-se-fabrique-pas-seul"), true);
});

test("a refusal on a different, unrelated verb never reveals the chapter 6 text", () => {
  const g = new GardenState(null, 1000);
  const r = firstRainelle(g);
  const attempt = g.command({
    type: "teachGesture",
    id: r.id,
    verbe: "voler",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(attempt.ok, false);
  assert.notEqual(attempt.message, Rainelles.MULTIPLY_REFUSAL);
  assert.equal(g.s.campaignFlags.includes("on-ne-se-fabrique-pas-seul"), false);
});

test("bourgeon -> nurserie -> reveil produces a real second individual; only the founder carries founder: true", () => {
  const g = new GardenState(null, 1000);
  const founder = firstRainelle(g);
  assert.equal(founder.founder, true);

  Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  assert.equal(g.command({ type: "formBud", id: founder.id }).ok, true);
  assert.equal(g.command({ type: "harvestBud", id: founder.id }).ok, true);
  assert.equal(g.s.rainelles.length, 1, "the bourgeon only hatches at the next sleep");

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.rainelles.length, 2, "sleep resolved the nursery into a real second individual");

  const second = g.s.rainelles[1];
  assert.equal(second.founder, false);
  assert.equal(second.cultivarId, founder.cultivarId, "de sa lignée (design §5)");
  assert.equal(
    g.s.rainelles.filter((r) => r.founder === true).length,
    1,
    "founder never migrates or duplicates across a real birth",
  );
});

test("founder survives a JSON round-trip after a second individual exists", () => {
  const g = new GardenState(null, 1000);
  const founder = firstRainelle(g);
  Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  g.command({ type: "formBud", id: founder.id });
  g.command({ type: "harvestBud", id: founder.id });
  g.command({ type: "sleep" });

  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.equal(reloaded.s.rainelles.length, 2);
  assert.equal(reloaded.s.rainelles[0].founder, true);
  assert.equal(reloaded.s.rainelles[1].founder, false);
});

test("a pre-epic save (no founder field at all) migrates founder onto its oldest rainelle only", () => {
  const g = new GardenState(null, 1000);
  const founder = firstRainelle(g);
  Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  g.command({ type: "formBud", id: founder.id });
  g.command({ type: "harvestBud", id: founder.id });
  g.command({ type: "sleep" });

  const saved = g.serialize();
  for (const r of saved.rainelles) delete r.founder;
  const migrated = new GardenState(saved);
  assert.equal(migrated.s.rainelles[0].founder, true);
  assert.equal(migrated.s.rainelles[1].founder, false);
});

test("validate() rejects a hand-edited save with two rainelles both marked founder", () => {
  const g = new GardenState(null, 1000);
  const founder = firstRainelle(g);
  Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  g.command({ type: "formBud", id: founder.id });
  g.command({ type: "harvestBud", id: founder.id });
  g.command({ type: "sleep" });

  const saved = g.serialize();
  saved.rainelles[1].founder = true;
  assert.throws(() => new GardenState(saved));
});
