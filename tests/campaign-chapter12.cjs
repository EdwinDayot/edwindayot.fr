const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");
const Narrative = require("../public/game/data-narrative.js");

// Epic C6.5 (design §10, chapitre 12 "La variété suivante"). Reaches "la-bonne-occasion" (C6.1)
// through the real quest chain, exactly the same path tests/campaign-chapter10.cjs and
// tests/campaign-chapter11.cjs already prove, rather than pushing the flag onto s.campaignFlags
// by hand.
function reachChapter10Flag(g) {
  g.command({ type: "quest", action: "accept", questId: "brume-d-ines" });
  g.s.inventory["cutting:pilea"] = 1;
  g.command({ type: "quest", action: "complete", questId: "brume-d-ines" });
  g.command({ type: "quest", action: "accept", questId: "occasion-de-basile" });
  g.s.inventory["cutting:pilea"] = 1;
  const r = g.command({
    type: "quest",
    action: "complete",
    questId: "occasion-de-basile",
  });
  assert.equal(r.ok, true, r.error);
  assert.ok(g.s.campaignFlags.includes("la-bonne-occasion"));
}

function firstCultivar(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.cultivars[0];
}

const VARIETE_FLAGS = [
  "variete-suivante-refus",
  "variete-suivante-sobre",
  "variete-suivante-invendus",
];

function varieteFlag(g) {
  return g.s.campaignFlags.filter((f) => VARIETE_FLAGS.includes(f));
}

test("no chapter-12 flag, and no Jeanne note, is ever revealed before chapter 10's own flag exists", () => {
  const g = new GardenState(null, 1000);
  g.command({ type: "sleep" });
  assert.deepEqual(varieteFlag(g), []);
  assert.equal(g.s.campaignFlags.includes("note-jeanne-serre-1"), false);
});

test("no contract ever signed: reveals the 'refus' branch, exactly once, alongside the first Jeanne note", () => {
  const g = new GardenState(null, 1000);
  reachChapter10Flag(g);
  g.command({ type: "sleep" });
  assert.deepEqual(varieteFlag(g), ["variete-suivante-refus"]);
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-1"));
  // The family fires once, permanently — a later night never adds a second, contradictory branch.
  g.command({ type: "sleep" });
  assert.deepEqual(varieteFlag(g), ["variete-suivante-refus"]);
});

test("a contract signed and fully delivered with no specimen left of its cultivar: reveals the 'sobre' branch", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 1,
    pricePerUnit: 10,
  });
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  const contractId = g.s.campaignContracts[0].id;
  const delivery = g.command({
    type: "deliverContract",
    contractId,
    quantity: 1,
  });
  assert.equal(delivery.ok, true, delivery.error);
  reachChapter10Flag(g);
  g.command({ type: "sleep" });
  assert.deepEqual(varieteFlag(g), ["variete-suivante-sobre"]);
});

test("a contract signed with at least one real specimen of its cultivar still unsold: reveals the 'invendus' branch", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 5,
    pricePerUnit: 10,
  });
  // Two real specimens exist, only one ever delivered: one remains, unsold, of this cultivar.
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 1, z: 0 });
  const contractId = g.s.campaignContracts[0].id;
  const delivery = g.command({
    type: "deliverContract",
    contractId,
    quantity: 1,
  });
  assert.equal(delivery.ok, true, delivery.error);
  assert.equal(g.s.specimens.length, 1);
  reachChapter10Flag(g);
  g.command({ type: "sleep" });
  assert.deepEqual(varieteFlag(g), ["variete-suivante-invendus"]);
});

test("a refused delivery (no real specimen, or quota already reached) never invents a phantom unsold specimen", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 1,
    pricePerUnit: 10,
  });
  const contractId = g.s.campaignContracts[0].id;
  const refused = g.command({
    type: "deliverContract",
    contractId,
    quantity: 1,
  });
  assert.equal(refused.ok, false);
  reachChapter10Flag(g);
  g.command({ type: "sleep" });
  // No specimen was ever produced: the cultivar's real unsold count is zero, exactly like a
  // fully-honoured contract — never a dommage fictif attribué au joueur (design §11).
  assert.deepEqual(varieteFlag(g), ["variete-suivante-sobre"]);
});

test("the second Jeanne note never appears before the first, and appears only once a contract is honoured afterwards", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 1,
    pricePerUnit: 10,
  });
  const contractId = g.s.campaignContracts[0].id;
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  // Honoured *before* the first note ever exists: must never count as "ultérieur" to a note not
  // yet revealed.
  g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.equal(g.s.campaignFlags.includes("note-jeanne-serre-2"), false);

  reachChapter10Flag(g);
  g.command({ type: "sleep" });
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-1"));
  assert.equal(g.s.campaignFlags.includes("note-jeanne-serre-2"), false);

  // A later contract, honoured strictly after the first note, reveals the second — once.
  const secondCultivar = (() => {
    g.command({ type: "sowPot", a: "menthe-de-velours", b: "aster-des-vents" });
    g.command({ type: "sleep" });
    return g.s.cultivars[g.s.cultivars.length - 1];
  })();
  g.command({
    type: "signContract",
    cultivarId: secondCultivar.id,
    quota: 1,
    pricePerUnit: 10,
  });
  Cultivars.createSpecimen(g.s, { cultivarId: secondCultivar.id, x: 0, z: 0 });
  const secondContractId =
    g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  g.command({
    type: "deliverContract",
    contractId: secondContractId,
    quantity: 1,
  });
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-2"));
  assert.equal(
    g.s.campaignFlags.filter((f) => f === "note-jeanne-serre-2").length,
    1,
  );
});

test("each of the three chapter-12 texts and the two Jeanne notes contain no obligation formulation and no accusation", () => {
  for (const id of [...VARIETE_FLAGS, "note-jeanne-serre-1", "note-jeanne-serre-2"]) {
    const entry = Narrative.TEXTS[id];
    assert.ok(entry, `TEXTS must carry an entry for "${id}"`);
    const lower = entry.text.toLowerCase();
    for (const obligationWord of [
      "doit ",
      "dois ",
      "obligatoire",
      "obligé",
      "il faut",
    ]) {
      assert.equal(
        lower.includes(obligationWord),
        false,
        `"${id}" must not contain an obligation formulation ("${obligationWord}")`,
      );
    }
  }
  // The two Jeanne notes are word-for-word identical, per the design's own "avec la même phrase".
  assert.equal(
    Narrative.TEXTS["note-jeanne-serre-1"].text,
    Narrative.TEXTS["note-jeanne-serre-2"].text,
  );
});

test("a JSON round-trip after both reveals keeps the exact flags and contract facts", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({
    type: "signContract",
    cultivarId: cultivar.id,
    quota: 2,
    pricePerUnit: 10,
  });
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  reachChapter10Flag(g);
  g.command({ type: "sleep" });
  assert.deepEqual(varieteFlag(g), ["variete-suivante-invendus"]);
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(varieteFlag(reloaded), ["variete-suivante-invendus"]);
  assert.ok(reloaded.s.campaignFlags.includes("note-jeanne-serre-1"));
});
