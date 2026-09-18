const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Narrative = require("../public/game/data-narrative.js");

// Épic C4.4 (design §10, chapitre 4, "Une patte dans les pétales") : triggerFrogEncounter
// (C2.3) refuse désormais tant qu'aucun cultivar n'a encore été obtenu au pot — condition
// minimale et vérifiable pour "après les apprentissages nécessaires" (le pot/l'hybridation sont
// acquis mécaniquement depuis la phase 1, rejoués ici, jamais une dépendance narrative hors
// ordre). La résolution réelle de la rencontre (sleep, quand frogCultivarId produit une nouvelle
// Rainelle) révèle un nouveau texte via le mécanisme générique de C4.1, jamais à l'armement.

test("data-narrative declares the frog encounter's reveal, with its own signal", () => {
  assert.equal(Narrative.TEXTS["traces-mouillees"].trigger, "frogEncounterResolved");
});

test("triggerFrogEncounter refuses on a fresh save (no cultivar yet); succeeds once a first cross has resolved", () => {
  const g = new GardenState(null, 1000);
  const tooEarly = g.command({ type: "triggerFrogEncounter" });
  assert.equal(tooEarly.ok, false);
  assert.equal(g.s.campaignFrogEncounterPending, false, "refusal never arms the flag");

  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.cultivars.length, 1, "a first cultivar now exists");

  const nowAllowed = g.command({ type: "triggerFrogEncounter" });
  assert.equal(nowAllowed.ok, true, "arming succeeds once a cultivar has been obtained");
  assert.equal(g.s.campaignFrogEncounterPending, true);
});

test("the 'traces mouillées' text never reveals at arming — only once the encounter actually resolves into a Rainelle", () => {
  const g = new GardenState(null, 1000);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);

  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.deepEqual(g.s.campaignFlags, [], "arming alone reveals nothing yet");

  // An empty night (nothing sown) carries the encounter over without resolving it — still no
  // reveal, same "never lost, never duplicated" posture already proven by campaign-rainelles.cjs.
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(g.s.campaignFlags, [], "a carried-over, unresolved encounter reveals nothing");

  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  const r = g.command({ type: "sleep" });
  assert.equal(r.ok, true);
  assert.equal(g.s.rainelles.length, 1, "the encounter resolves into a real Rainelle this night");
  assert.deepEqual(
    g.s.campaignFlags,
    ["traces-mouillees"],
    "resolution reveals the text exactly once",
  );
});

test("the reveal never duplicates on a later, unrelated night", () => {
  const g = new GardenState(null, 1000);
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
  assert.deepEqual(g.s.campaignFlags, ["traces-mouillees"]);

  // A later, ordinary night (no new encounter armed, since only the first Rainelle uses this
  // mechanism) never re-reveals the same text.
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(g.s.campaignFlags, ["traces-mouillees"]);
});

test("a real JSON reload keeps the reveal flag and the refusal/success boundary intact", () => {
  const g = new GardenState(null, 1000);
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

  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.campaignFlags, g.s.campaignFlags);
  assert.deepEqual(reloaded.s.rainelles, g.s.rainelles);
  // Only ever the first Rainelle: a second triggerFrogEncounter is refused regardless of the
  // s.cultivars.length gate, exactly as campaign-rainelles.cjs already proves.
  assert.equal(reloaded.command({ type: "triggerFrogEncounter" }).ok, false);
});
