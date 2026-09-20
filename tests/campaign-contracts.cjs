const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Cultivars = require("../public/game/cultivars.js");
const Memory = require("../public/game/campaign-memory.js");
const Contracts = require("../public/game/campaign-contracts.js");

// Epic C6.4 (design §10, chapitre 12) : signContract fixes cultivarId/quota/pricePerUnit at
// signature (never recomputed), a single open contract at a time ; deliverContract consumes real
// specimens of the targeted cultivar from s.specimens (never fabricated), up to the remaining
// quota, crediting Memory.contractsFed by exactly what was actually moved — see campaign-
// contracts.js's own header comment for why unsoldStock is derived (never a separately stored
// field) once delivery is understood to remove the specimen.

function firstCultivar(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.cultivars[0];
}

test("signContract: refuses an unknown cultivar, an invalid quota, or an invalid price", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);

  const unknown = g.command({ type: "signContract", cultivarId: "cv999", quota: 5, pricePerUnit: 10 });
  assert.equal(unknown.ok, false);

  const badQuota = g.command({ type: "signContract", cultivarId: cultivar.id, quota: 0, pricePerUnit: 10 });
  assert.equal(badQuota.ok, false);

  const badPrice = g.command({ type: "signContract", cultivarId: cultivar.id, quota: 5, pricePerUnit: -1 });
  assert.equal(badPrice.ok, false);

  assert.deepEqual(g.s.campaignContracts, [], "no contract created by any refused attempt");
});

test("signContract: signs a contract with a fixed price, and refuses a second signature while it is still open", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);

  const first = g.command({ type: "signContract", cultivarId: cultivar.id, quota: 3, pricePerUnit: 20 });
  assert.equal(first.ok, true, first.error);
  assert.equal(g.s.campaignContracts.length, 1);
  const contract = g.s.campaignContracts[0];
  assert.equal(contract.quota, 3);
  assert.equal(contract.pricePerUnit, 20);

  const second = g.command({ type: "signContract", cultivarId: cultivar.id, quota: 9, pricePerUnit: 999 });
  assert.equal(second.ok, false);
  assert.equal(g.s.campaignContracts.length, 1, "still exactly the first contract");
  assert.equal(g.s.campaignContracts[0].pricePerUnit, 20, "price stays fixed, never recomputed");
});

test("signContract: a second contract can be signed once the first reaches its quota", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({ type: "signContract", cultivarId: cultivar.id, quota: 1, pricePerUnit: 10 });
  const contractId = g.s.campaignContracts[0].id;
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  const delivery = g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.equal(delivery.ok, true, delivery.error);

  const second = g.command({ type: "signContract", cultivarId: cultivar.id, quota: 5, pricePerUnit: 30 });
  assert.equal(second.ok, true, second.error);
  assert.equal(g.s.campaignContracts.length, 2);
  assert.equal(g.s.campaignContracts[1].pricePerUnit, 30);
});

test("deliverContract: consumes real specimens, up to quota, and never accepts a delivery beyond it", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({ type: "signContract", cultivarId: cultivar.id, quota: 2, pricePerUnit: 15 });
  const contractId = g.s.campaignContracts[0].id;
  const specimens = Array.from({ length: 5 }, () =>
    Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 }),
  );
  assert.equal(g.s.specimens.length, 5);

  const over = g.command({ type: "deliverContract", contractId, quantity: 5 });
  assert.equal(over.ok, true, over.error);
  assert.equal(g.s.campaignMemory.contractsFed[contractId], 2, "capped at the quota, not the requested quantity");
  assert.equal(g.s.specimens.length, 3, "only the 2 delivered specimens were removed, never fabricated or over-consumed");

  const beyond = g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.equal(beyond.ok, false, "quota already reached: no further delivery accepted");
  assert.equal(g.s.specimens.length, 3, "a refused delivery never touches s.specimens");
  assert.equal(g.s.campaignMemory.contractsFed[contractId], 2, "a refused delivery never becomes a fictional credit");
});

test("deliverContract: caps at the real specimens available, even when the quota allows more", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({ type: "signContract", cultivarId: cultivar.id, quota: 10, pricePerUnit: 15 });
  const contractId = g.s.campaignContracts[0].id;
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });

  const delivery = g.command({ type: "deliverContract", contractId, quantity: 10 });
  assert.equal(delivery.ok, true, delivery.error);
  assert.equal(g.s.campaignMemory.contractsFed[contractId], 1, "only one real specimen existed");
  assert.equal(g.s.specimens.length, 0);
});

test("deliverContract: refuses an unknown contract, or a delivery with no real specimen of the targeted cultivar", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({ type: "signContract", cultivarId: cultivar.id, quota: 3, pricePerUnit: 15 });
  const contractId = g.s.campaignContracts[0].id;

  const unknown = g.command({ type: "deliverContract", contractId: "ct999", quantity: 1 });
  assert.equal(unknown.ok, false);

  const empty = g.command({ type: "deliverContract", contractId, quantity: 1 });
  assert.equal(empty.ok, false, "no specimen of the cultivar exists yet");
  assert.equal(g.s.campaignMemory.contractsFed[contractId] ?? 0, 0);
});

test("unsoldStock: derived directly from s.specimens, reflecting only what delivery has not yet consumed", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  assert.equal(Contracts.unsoldStock(g.s.specimens, cultivar.id), 0, "zero when no specimen exists");

  const specimens = Array.from({ length: 4 }, () =>
    Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 }),
  );
  assert.equal(Contracts.unsoldStock(g.s.specimens, cultivar.id), 4);

  g.command({ type: "signContract", cultivarId: cultivar.id, quota: 3, pricePerUnit: 15 });
  const contractId = g.s.campaignContracts[0].id;
  g.command({ type: "deliverContract", contractId, quantity: 3 });
  assert.equal(Contracts.unsoldStock(g.s.specimens, cultivar.id), 1, "the 3 delivered specimens are gone, 1 real specimen remains unsold");

  g.command({ type: "deliverContract", contractId, quantity: 5 });
  assert.equal(Contracts.unsoldStock(g.s.specimens, cultivar.id), 1, "delivery already capped at quota (3): the remaining specimen was never touched");
});

test("a save without any campaignContracts/contractNextId/campaignMemory.contractsFed (pre-epic) migrates without error", () => {
  const g = new GardenState(null, 1000);
  const raw = g.serialize();
  delete raw.campaignContracts;
  delete raw.contractNextId;
  delete raw.campaignMemory.contractsFed;
  const migrated = validate(raw);
  assert.deepEqual(migrated.campaignContracts, []);
  assert.equal(migrated.contractNextId, 1);
  assert.deepEqual(migrated.campaignMemory.contractsFed, {});
});

test("validate rejects a malformed campaignContracts entry or an out-of-bound campaignMemory.contractsFed", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({ type: "signContract", cultivarId: cultivar.id, quota: 3, pricePerUnit: 15 });
  const contract = g.s.campaignContracts[0];

  const unknownCultivar = g.serialize();
  unknownCultivar.campaignContracts[0].cultivarId = "cv999";
  assert.throws(() => validate(unknownCultivar), /Contrat commercial invalide/);

  const badQuota = g.serialize();
  badQuota.campaignContracts[0].quota = 0;
  assert.throws(() => validate(badQuota), /Contrat commercial invalide/);

  const unknownContractId = g.serialize();
  unknownContractId.campaignMemory.contractsFed = { ct999: 1 };
  assert.throws(() => validate(unknownContractId), /Mémoire de campagne invalide/);

  const overQuota = g.serialize();
  overQuota.campaignMemory.contractsFed = { [contract.id]: contract.quota + 1 };
  assert.throws(() => validate(overQuota), /Mémoire de campagne invalide/);

  const valid = g.serialize();
  valid.campaignMemory.contractsFed = { [contract.id]: contract.quota };
  assert.doesNotThrow(() => validate(valid));
});

test("a real JSON round-trip keeps a populated campaignContracts/campaignMemory.contractsFed strictly identical", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  g.command({ type: "signContract", cultivarId: cultivar.id, quota: 2, pricePerUnit: 15 });
  const contractId = g.s.campaignContracts[0].id;
  Cultivars.createSpecimen(g.s, { cultivarId: cultivar.id, x: 0, z: 0 });
  g.command({ type: "deliverContract", contractId, quantity: 1 });

  const reloaded = validate(JSON.parse(JSON.stringify(g.s)));
  assert.deepEqual(reloaded.campaignContracts, g.s.campaignContracts);
  assert.deepEqual(reloaded.campaignMemory.contractsFed, g.s.campaignMemory.contractsFed);
});

test("a refused signContract/deliverContract never moves campaignMemory (no fictional damage attributed)", () => {
  const g = new GardenState(null, 1000);
  const cultivar = firstCultivar(g);
  const before = JSON.stringify(g.s.campaignMemory);

  g.command({ type: "signContract", cultivarId: "cv999", quota: 5, pricePerUnit: 10 });
  g.command({ type: "deliverContract", contractId: "ct999", quantity: 1 });

  assert.equal(JSON.stringify(g.s.campaignMemory), before);
});
