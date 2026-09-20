const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D } = require("./garden-rules-helpers.cjs");
const Buildings = require("../public/game/data-buildings.js");
const Narrative = require("../public/game/data-narrative.js");
const Stations = require("../public/game/campaign-stations.js");

// Épic C6.1 (design §10, Acte IV, chapitre 10 "La bonne occasion"). npcId "basile" pointe vers le
// même visiteur déjà réel du jardin libre que "fibres-de-basile" (C4.7) — pas une nouvelle
// construction. requires: ["brume-d-ines"] amorce l'Acte IV à la dernière quête écrite de l'Acte
// III, exactement comme documenté par la propre entrée de backlog de cet epic.

test("occasion-de-basile points at the existing jardin libre visitor 'basile', not a new building", () => {
  assert.equal(D.quests["occasion-de-basile"].npcId, "basile");
  const basile = Buildings.buildings.find((b) => b.visitorId === "basile");
  assert.ok(basile, "the existing jardin libre 'basile' building must still exist");
  assert.equal(basile.role, "vendor", "basile's existing role/shop stays untouched");
});

test("the reward schema carries a narrativeFlag naming a real data-narrative.js trigger, no other reward", () => {
  const reward = D.quests["occasion-de-basile"].reward;
  assert.equal(typeof reward.narrativeFlag, "string");
  const entry = Narrative.findByTrigger(reward.narrativeFlag);
  assert.ok(entry, "the trigger must resolve to a real TEXTS entry");
  assert.equal(entry.id, "la-bonne-occasion");
  assert.deepEqual(Object.keys(reward), ["narrativeFlag"]);
});

test("the quest is inaccessible before brume-d-ines is completed", () => {
  const g = new GardenState(null, 1000);
  const r = g.command({
    type: "quest",
    action: "accept",
    questId: "occasion-de-basile",
  });
  assert.equal(r.ok, false);
  assert.deepEqual(g.s.quests.active, []);
});

test("the quest becomes accessible once brume-d-ines is completed", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  const r = g.command({
    type: "quest",
    action: "accept",
    questId: "occasion-de-basile",
  });
  assert.equal(r.ok, true);
});

test("completing occasion-de-basile reveals its narrative text exactly once", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  assert.deepEqual(g.s.campaignFlags, ["chemin-eau-etiquette"]);

  g.command({ type: "quest", action: "accept", questId: "occasion-de-basile" });
  g.s.inventory["cutting:pilea"] = 1;
  const r = g.command({
    type: "quest",
    action: "complete",
    questId: "occasion-de-basile",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(
    [...g.s.campaignFlags].sort(),
    ["chemin-eau-etiquette", "la-bonne-occasion"],
  );
});

test("a second hypothetical completion never re-reveals or duplicates the flag (s.quests.completed already blocks a second accept)", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  g.command({ type: "quest", action: "accept", questId: "occasion-de-basile" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "occasion-de-basile" });
  const flagsAfterFirstCompletion = [...g.s.campaignFlags].sort();

  const r = g.command({
    type: "quest",
    action: "accept",
    questId: "occasion-de-basile",
  });
  assert.equal(r.ok, false);
  assert.deepEqual([...g.s.campaignFlags].sort(), flagsAfterFirstCompletion);
});

test("setVeilleuse and setPriseFortDebit stay usable with no condition on this quest's flag, before or after it is revealed", () => {
  const g = new GardenState(null, 1000);
  assert.equal(g.s.campaignFlags.includes("la-bonne-occasion"), false);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 0 });
  const zoneId = zone.id;
  const borneId = borne.id;
  assert.equal(
    g.command({ type: "setVeilleuse", zoneId, active: true }).ok,
    true,
    "setVeilleuse must stay unconditional, even before the chapter-10 flag is ever revealed",
  );
  assert.equal(
    g.command({ type: "setPriseFortDebit", borneId, active: true }).ok,
    true,
    "setPriseFortDebit must stay unconditional, even before the chapter-10 flag is ever revealed",
  );
});

test("the revealed text names both levers already real in the engine and contains no formulation of obligation", () => {
  const entry = Narrative.findByTrigger("commercialSeriesProposed");
  assert.match(entry.text, /veilleuse/i);
  assert.match(entry.text, /prise d.eau à fort débit/i);
  // Design §15/§10, chapitre 10: "La progression principale ne demande pas d'exploiter pour
  // avancer." — the text must never phrase activation as required.
  for (const obligationWord of ["doit ", "dois ", "obligatoire", "obligé", "il faut"]) {
    assert.equal(
      entry.text.toLowerCase().includes(obligationWord),
      false,
      `the text must not contain an obligation formulation ("${obligationWord}")`,
    );
  }
  assert.match(entry.text, /refuser/i);
});

test("a JSON round-trip after completion keeps the revealed flag exactly", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  g.command({ type: "quest", action: "accept", questId: "occasion-de-basile" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "occasion-de-basile" });
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(
    [...reloaded.s.campaignFlags].sort(),
    ["chemin-eau-etiquette", "la-bonne-occasion"],
  );
});
