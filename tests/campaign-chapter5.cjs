const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

// Épic C4.5 (design §10, chapitre 5, "Encore une fois" ; §8, "Lavoir et mare"). Deux volets
// distincts, comme énoncé par le critère de sortie de campagne-backlog.md : (1) une quête réelle
// chez Mira, "bassines-de-mira", extension additive de reward.tools (même patron exact que
// C3.6/hachette) ; (2) un test d'intégration rejouant, via le vrai vecteur de commandes, la
// première démonstration volontaire du geste Arroser (C2.5, quatre moments) suivie d'un cycle
// automatisé sans aucune intervention (C2.6c) — la preuve mécanique de "la première automatisation
// libère du temps de vie identifiable".

const CYCLE = CampaignAutomation.CYCLE_SECONDS;

// Same fixture already used by campaign-chapter4.cjs/campaign-teaching.cjs/campaign-rainelles-
// chain.cjs: triggerFrogEncounter (C2.3) now refuses until a cultivar exists (C4.4), so a
// warm-up cross always comes first.
function bornRainelle(g) {
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

test("bassines-de-mira points at the existing jardin libre visitor Mira, not a new building", () => {
  const Buildings = require("../public/game/data-buildings.js");
  assert.equal(D.quests["bassines-de-mira"].npcId, "mira");
  const mira = Buildings.buildings.find((b) => b.visitorId === "mira");
  assert.ok(mira, "the existing jardin libre 'mira' building must still exist");
  assert.equal(mira.role, "vendor", "mira's existing role/shop stays untouched");
});

test("completing bassines-de-mira grants the pelle tool only at completion, never at acceptance", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "bassines-de-mira" }).ok,
    true,
  );
  assert.equal(
    g.s.campaignTools.includes("pelle"),
    false,
    "accepting the quest must not grant the tool yet",
  );
  g.s.inventory["cutting:pilea"] =
    D.quests["bassines-de-mira"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "bassines-de-mira" }).ok,
    true,
  );
  assert.equal(g.s.campaignTools.includes("pelle"), true);
});

test("completing before the delivery is met is rejected and grants nothing", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "bassines-de-mira" });
  g.s.inventory["cutting:pilea"] = 0;
  const r = g.command({
    type: "quest",
    action: "complete",
    questId: "bassines-de-mira",
  });
  assert.equal(r.ok, false);
  assert.equal(g.s.campaignTools.includes("pelle"), false);
});

test("first voluntary demonstration of Arroser (C2.5's four moments) then automated cycles keep a specimen watered indefinitely with zero further intervention (design: 'la première automatisation libère du temps de vie identifiable')", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);

  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId: rainelle.cultivarId,
    x: 0,
    z: 0,
  });

  // Baseline: without any watering, this constant is exactly what fully dries a specimen out
  // (cultivars.js's own MOISTURE_DECAY_PER_ELAPSED_SECOND = 100 / (3 * 3600)) — three simulated
  // hours. Used below as the elapsed span to simulate, so "still watered after this long" is a
  // real, falsifiable claim, not an arbitrarily short window.
  const FULL_DRY_SECONDS = 3 * 3600;
  assert.equal(
    Cultivars.specimenMoisture(specimen, FULL_DRY_SECONDS),
    0,
    "sanity check on the constant this test relies on: unwatered, moisture reaches exactly zero here",
  );

  // The four-moment flow itself (design §5), through the real command vector — not
  // teachGesture's one-shot shortcut, and not Rainelles.applyGesture called directly.
  assert.equal(g.command({ type: "beginTeaching", id: rainelle.id }).ok, true);
  assert.equal(g.s.campaignClock.paused, true, "« Regarde-moi » stops the clock");
  assert.equal(
    g.command({
      type: "demonstrateGesture",
      verbe: "arroser",
      poste: zone.id,
      source: borne.id,
      destination: "peu-importe",
      condition: "",
    }).ok,
    true,
  );
  assert.equal(
    rainelle.geste,
    null,
    "a demonstration is only a preview — nothing is taught until confirmTeaching",
  );
  assert.equal(g.command({ type: "confirmTeaching" }).ok, true);
  assert.equal(g.s.campaignClock.paused, false, "confirming resumes the clock");
  assert.equal(rainelle.geste.verbe, "arroser");

  // From here on: no command but the passage of time — exactly "sans intervention".
  g.step(FULL_DRY_SECONDS);

  assert.ok(
    Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95,
    "the automated cycle must have kept rewatering throughout — a specimen left unwatered this " +
      "long would have reached zero (see the sanity check above)",
  );

  // Steady state: several more cycles change nothing — the automation restarts itself forever,
  // never stalling once the countdown hits zero.
  g.step(10 * CYCLE);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95);
});
