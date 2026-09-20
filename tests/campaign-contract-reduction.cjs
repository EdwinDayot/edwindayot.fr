const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");

// Epic C6.8 (design §10, chapitre 16 "Ce qu'on accepte de perdre") : reduceContract lowers an
// already-signed contract's quota — "réduire une commande fait perdre la prime correspondante,
// sans dette en cascade". pricePerUnit is never touched (no renegotiation path). Reducing exactly
// to what has already been delivered closes the contract at once (isContractOpen already reads
// contractsFed[id] < quota), freeing a second contract to be signed — no separate closed flag.

function firstCultivar(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.cultivars[0];
}

function signedContract(g, quota = 5, pricePerUnit = 20) {
  const cultivar = firstCultivar(g);
  g.command({ type: "signContract", cultivarId: cultivar.id, quota, pricePerUnit });
  return { cultivar, contractId: g.s.campaignContracts[0].id };
}

test("reduceContract: refuses a quota that does not actually reduce the contract", () => {
  const g = new GardenState(null, 1000);
  const { contractId } = signedContract(g, 5, 20);

  const same = g.command({ type: "reduceContract", contractId, quota: 5 });
  assert.equal(same.ok, false, "equal to current quota is not a reduction");

  const bigger = g.command({ type: "reduceContract", contractId, quota: 9 });
  assert.equal(bigger.ok, false, "greater than current quota is not a reduction");

  assert.equal(g.s.campaignContracts[0].quota, 5, "quota untouched by either refusal");
});

test("reduceContract: refuses undoing a delivery already made", () => {
  const g = new GardenState(null, 1000);
  const { cultivar, contractId } = signedContract(g, 5, 20);
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  g.command({ type: "deliverContract", contractId, quantity: 3 });
  assert.equal(g.s.campaignMemory.contractsFed[contractId], 3);

  const under = g.command({ type: "reduceContract", contractId, quota: 2 });
  assert.equal(under.ok, false, "cannot reduce below what has already been delivered");
  assert.equal(g.s.campaignContracts[0].quota, 5, "refused reduction never mutates the contract");
});

test("reduceContract: refuses an unknown contract, or one already closed by full delivery", () => {
  const g = new GardenState(null, 1000);
  const { cultivar, contractId } = signedContract(g, 2, 20);

  const unknown = g.command({ type: "reduceContract", contractId: "ct999", quota: 1 });
  assert.equal(unknown.ok, false);

  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  g.command({ type: "deliverContract", contractId, quantity: 2 });
  assert.equal(g.s.campaignMemory.contractsFed[contractId], 2, "contract fully delivered, already closed");

  const closed = g.command({ type: "reduceContract", contractId, quota: 1 });
  assert.equal(closed.ok, false, "a fully delivered contract cannot be reduced any further");
});

test("reduceContract: leaves pricePerUnit untouched — no renegotiation by this command", () => {
  const g = new GardenState(null, 1000);
  const { contractId } = signedContract(g, 8, 42);

  const result = g.command({ type: "reduceContract", contractId, quota: 3 });
  assert.equal(result.ok, true, result.error);
  assert.equal(g.s.campaignContracts[0].quota, 3);
  assert.equal(g.s.campaignContracts[0].pricePerUnit, 42, "price stays fixed");
});

test("reduceContract: reducing exactly to what has been delivered closes the contract, freeing a second signature", () => {
  const g = new GardenState(null, 1000);
  const { cultivar, contractId } = signedContract(g, 10, 20);
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  g.command({ type: "deliverContract", contractId, quantity: 2 });
  assert.equal(g.s.campaignMemory.contractsFed[contractId], 2);

  const stillBlocked = g.command({ type: "signContract", cultivarId: cultivar.id, quota: 1, pricePerUnit: 5 });
  assert.equal(stillBlocked.ok, false, "the reduced-but-not-yet-closed contract is still open");

  const reduced = g.command({ type: "reduceContract", contractId, quota: 2 });
  assert.equal(reduced.ok, true, reduced.error);
  assert.equal(g.s.campaignContracts[0].quota, 2);

  const second = g.command({ type: "signContract", cultivarId: cultivar.id, quota: 1, pricePerUnit: 5 });
  assert.equal(second.ok, true, second.error, "the now-closed contract no longer blocks a second signature");
  assert.equal(g.s.campaignContracts.length, 2);
});

test("reduceContract: never accepts a reduction to a quota below 1, even on a never-delivered contract", () => {
  const g = new GardenState(null, 1000);
  const { contractId } = signedContract(g, 5, 20);

  const toZero = g.command({ type: "reduceContract", contractId, quota: 0 });
  assert.equal(toZero.ok, false, "a contract's quota must remain a positive integer");
  assert.equal(g.s.campaignContracts[0].quota, 5);
});

test("a refused reduceContract never mutates campaignContracts or campaignMemory", () => {
  const g = new GardenState(null, 1000);
  const { contractId } = signedContract(g, 5, 20);
  const before = JSON.stringify({ contracts: g.s.campaignContracts, memory: g.s.campaignMemory });

  g.command({ type: "reduceContract", contractId: "ct999", quota: 1 });
  g.command({ type: "reduceContract", contractId, quota: 5 });
  g.command({ type: "reduceContract", contractId, quota: 0 });

  const after = JSON.stringify({ contracts: g.s.campaignContracts, memory: g.s.campaignMemory });
  assert.equal(after, before);
});

test("a real JSON round-trip keeps a reduced contract's quota strictly identical", () => {
  const g = new GardenState(null, 1000);
  const { contractId } = signedContract(g, 6, 30);
  g.command({ type: "reduceContract", contractId, quota: 2 });

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignContracts, g.s.campaignContracts);
  assert.equal(reloaded.campaignContracts[0].quota, 2);
});
