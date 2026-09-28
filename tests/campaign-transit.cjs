// Epic C7.30 — "Livraison de transport étalée sur plusieurs ticks : une ressource réellement « en
// transit »" (docs/campagne-backlog.md). Before this epic, tickPanierMove withdrew from the
// source and deposited at the destination in the very same call, two lines apart — nothing was
// ever actually "in transit". This file proves the new window on its own primitive terms, on the
// model of tests/campaign-nursery-chain.cjs: a dedicated file per new mechanism, real state driven
// through g.command/g.step, never a hand-built state or a direct call into rainelles.js.
//
// tests/campaign-automation.cjs already re-proves every pre-existing "transporter" budget/filter
// test with the extra TRANSIT_TICKS wait folded in — this file is only about the transit window
// itself: exact timing, survival across a JSON reload, the "one trajet at a time" contract, a
// gesture change mid-flight, and the silent loss C2.8v-b still has to close.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

const CYCLE = CampaignAutomation.CYCLE_SECONDS;
const TRANSIT = CampaignAutomation.TRANSIT_TICKS;

// Only the scripted frog encounter (C2.3) can create a Rainelle — and its own cultivar — through
// commands. Same fixture already used by every other campaign test file.
function bornRainelle(g) {
  assert.equal(g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  return g.s.rainelles[0];
}

function teach(g, rainelle, fields) {
  const r = g.command({ type: "teachGesture", id: rainelle.id, condition: "", ...fields });
  assert.equal(r.ok, true, r.message);
}

function setUpTransporter(g, { fromQty = 5 } = {}) {
  const rainelle = bornRainelle(g);
  const cultivarId = rainelle.cultivarId;
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  from.buffer[cultivarId] = fromQty;
  teach(g, rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  return { rainelle, cultivarId, from, to };
}

test("1-2: the quantity leaves from.buffer at withdrawal, and lands in to.buffer exactly TRANSIT_TICKS later — never before, never after", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId, from, to } = setUpTransporter(g);

  g.step(CYCLE - 1);
  assert.equal(from.buffer[cultivarId], 5, "still waiting for the cycle to complete");
  assert.equal(to.buffer[cultivarId], undefined);

  g.step(1);
  // (1) gone from the source the instant the cycle completes, well before TRANSIT_TICKS elapse.
  assert.equal(from.buffer[cultivarId], undefined, "withdrawn immediately, not deferred");
  assert.equal(to.buffer[cultivarId], undefined, "not yet landed");
  assert.deepEqual(rainelle.carrying, {
    key: cultivarId,
    qty: 5,
    destinationId: to.id,
    ticksRemaining: TRANSIT,
  });

  // (2) never early.
  g.step(TRANSIT - 1);
  assert.equal(to.buffer[cultivarId], undefined, "must not land before TRANSIT_TICKS have passed");
  assert.equal(rainelle.carrying.ticksRemaining, 1);

  // (2) never late either — exactly on the TRANSIT_TICKS-th tick after withdrawal.
  g.step(1);
  assert.equal(to.buffer[cultivarId], 5, "must land exactly TRANSIT_TICKS after withdrawal");
  assert.equal(rainelle.carrying, null);
});

test("3: a real JSON round-trip in the middle of the transit window resumes the countdown without loss or double-deposit", () => {
  const g = new GardenState(null, 1000);
  const { cultivarId, from, to } = setUpTransporter(g, { fromQty: 7 });

  g.step(CYCLE + Math.floor(TRANSIT / 2));
  assert.equal(from.buffer[cultivarId], undefined);
  assert.equal(to.buffer[cultivarId], undefined, "still mid-transit at the reload point");

  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  const reloadedRainelle = reloaded.s.rainelles.find((r) => r.id === g.s.rainelles[0].id);
  const remaining = reloadedRainelle.carrying.ticksRemaining;
  assert.ok(remaining > 0 && remaining < TRANSIT, "carrying must reload exactly where it left off");
  const reloadedTo = reloaded.s.campaignStations.paniers.find((p) => p.id === to.id);

  // One tick short of landing: still nothing, no premature deposit after reload.
  reloaded.step(remaining - 1);
  assert.equal(reloadedTo.buffer[cultivarId], undefined);
  assert.equal(reloadedRainelle.carrying.ticksRemaining, 1);

  // Lands exactly on schedule — the reload never lost or duplicated the payload.
  reloaded.step(1);
  assert.equal(reloadedTo.buffer[cultivarId], 7, "no loss across the reload");
  assert.equal(reloadedRainelle.carrying, null);
  // Running further must never deposit a second time (no double-counting from a stale carry).
  reloaded.step(CYCLE - Math.floor(TRANSIT / 2) - 1);
  assert.equal(reloadedTo.buffer[cultivarId], 7);
});

test("4: a Rainelle already carrying something never starts a second withdrawal, even while her own cycle keeps completing and restarting underneath the wait", () => {
  const g = new GardenState(null, 1000);
  // A destination with plenty of headroom (never the limiting factor here) and a source with more
  // than enough for a first departure — if a second withdrawal ever slipped through while carrying
  // was still active, it would show up here as a further drop in `from.buffer` or a `carrying`
  // object that no longer matches the first departure.
  const { rainelle, cultivarId, from, to } = setUpTransporter(g, { fromQty: 5 });
  to.capacity = 1000;

  g.step(CYCLE);
  const firstCarry = { ...rainelle.carrying };
  assert.equal(firstCarry.qty, 5);
  const fromAfterFirstDeparture = from.buffer[cultivarId];

  // Step through the entire transit window one tick at a time: `carrying` must stay exactly the
  // first departure's own payload throughout, and `from` must never be touched again, even though
  // advanceCycle keeps running underneath (see campaign-automation.js's own tickTransporter
  // comment) and would, on a buggy implementation that forgot to check `carrying` first, have
  // completed and started a second withdrawal well before delivery.
  for (let i = 1; i < TRANSIT; i++) {
    g.step(1);
    assert.ok(rainelle.carrying, `still in flight at tick ${i} of the transit window`);
    assert.deepEqual(rainelle.carrying.key, firstCarry.key);
    assert.equal(rainelle.carrying.qty, firstCarry.qty, "never overwritten by a second withdrawal");
    assert.equal(from.buffer[cultivarId], fromAfterFirstDeparture, "from.buffer untouched while carrying");
  }
  g.step(1);
  assert.equal(rainelle.carrying, null, "delivered on schedule");
  assert.equal(to.buffer[cultivarId], firstCarry.qty);

  // Once free again, a legitimate second departure does eventually happen — the block above was
  // never permanent, only "one trajet at a time". `from` is topped back up directly here (standing
  // in for whatever upstream gesture would ordinarily refill it in real play, exactly the same
  // "simulate an external actor" posture tests/campaign-rainelles-chain.cjs already uses for its
  // own kitchen-reserve consumer) — this test's own concern is the refusal itself, not where a
  // second batch of stock would come from.
  from.buffer[cultivarId] = 3;
  g.step(CYCLE - TRANSIT - 1);
  assert.equal(rainelle.carrying, null, "not yet time for a second departure");
  g.step(1);
  assert.ok(rainelle.carrying, "a second, entirely legitimate departure starts once the job completes again");
  assert.equal(rainelle.carrying.qty, 3);
});

test("5: re-teaching the Rainelle to a different gesture mid-transit does not prevent the delivery from landing on schedule", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId, from, to } = setUpTransporter(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });

  g.step(CYCLE);
  assert.ok(rainelle.carrying, "in flight before the reteach");
  const carrying = { ...rainelle.carrying };

  // Design §5, "réenseigner remplace le geste" — this never resets `job`, and per C7.30 never
  // touches `carrying` either: resolveCarrying is called unconditionally, before the verb
  // dispatch, so it never even looks at `rainelle.geste`.
  teach(g, rainelle, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
  });
  assert.deepEqual(rainelle.carrying, carrying, "reteaching never touches an in-flight carry");

  g.step(TRANSIT - 1);
  assert.equal(to.buffer[cultivarId], undefined);
  g.step(1);
  assert.equal(to.buffer[cultivarId], carrying.qty, "delivers exactly on schedule despite the reteach");
  assert.equal(rainelle.carrying, null);
  assert.equal(rainelle.geste.verbe, "arroser", "the new gesture itself is untouched by the delivery");
});

test("6: the destination vanishing mid-transit (removeStation) loses the carried quantity silently — the exact gap C2.8v-b is left to close", () => {
  const g = new GardenState(null, 1000);
  const { rainelle, cultivarId, from, to } = setUpTransporter(g);

  g.step(CYCLE);
  assert.ok(rainelle.carrying, "withdrawal already happened, cargo is in flight");
  const carriedQty = rainelle.carrying.qty;

  // The destination panier is empty (everything already withdrawn onto the Rainelle), so
  // removeStation accepts it — campaign-stations.js's own removeStation only refuses a panier
  // whose *buffer* is non-empty; a reservation in flight toward it is invisible to that check.
  const result = g.command({ type: "removeStation", id: to.id });
  assert.equal(result.ok, true);
  assert.equal(
    g.s.campaignStations.paniers.some((p) => p.id === to.id),
    false,
    "the destination is really gone from the registry",
  );

  g.step(TRANSIT);
  // The gap this epic makes observable, not yet closes: destinationId no longer resolves at all,
  // so resolveCarrying's own "landed on a panier" branch never runs — the quantity is not
  // rerouted anywhere, it simply never appears again. Nothing in this repository's state holds
  // it: not the (now-deleted) old destination, not `from` (it never returns there), nothing.
  assert.equal(rainelle.carrying, null, "the in-flight record itself is still cleared on schedule");
  assert.equal(
    g.s.campaignStations.paniers.reduce(
      (total, p) => total + (Stations.panierTotal(p) || 0),
      0,
    ),
    0,
    `all ${carriedQty} carried units are gone from every panier in the registry — silently lost, exactly the gap C2.8v-b exists to close`,
  );
});

test("7 (/code-review finding, fixed before commit): two Rainelles racing for the same destination's headroom never jointly overshoot its capacity", () => {
  const g = new GardenState(null, 1000);
  const rainelleA = bornRainelle(g);
  const cultivarId = rainelleA.cultivarId;
  const rainelleB = Rainelles.createRainelle(g.s, { cultivarId, name: "Seconde transporteuse" });

  const fromA = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const fromB = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  // A small, shared destination: both flows together would overshoot it if either withdrawal
  // ignored the other's own in-flight reservation. registerStation only honours an explicit
  // `capacity` for a zone, never a panier (always DEFAULT_PANIER_CAPACITY at creation) — set
  // directly here, same pattern tests/campaign-automation.cjs's own budget tests already use.
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  to.capacity = 10;
  fromA.buffer[cultivarId] = 8;
  fromB.buffer[cultivarId] = 8;

  teach(g, rainelleA, {
    verbe: "transporter",
    poste: "peu-importe",
    source: fromA.id,
    destination: to.id,
    condition: cultivarId,
  });
  // A one-tick offset between the two withdrawals (same reasoning tests/campaign-nursery-chain.cjs
  // already documents for its own two harvesters): distinct completion ticks are what makes two
  // *separate* in-flight reservations toward the same destination observable at all — two
  // withdrawals on the exact same tick would just split one shared budget as before this epic
  // (s.rainelles ticks in array order), never exercising the cross-tick gap /code-review found.
  g.step(1);
  teach(g, rainelleB, {
    verbe: "transporter",
    poste: "peu-importe",
    source: fromB.id,
    destination: to.id,
    condition: cultivarId,
  });

  g.step(CYCLE - 1);
  assert.ok(rainelleA.carrying, "A has already withdrawn and is in flight");
  assert.equal(rainelleA.carrying.qty, 8);
  assert.equal(to.buffer[cultivarId], undefined, "not yet landed");

  // B completes her own cycle one tick later, while A's own delivery (TRANSIT_TICKS away) has not
  // landed yet — `to.buffer` is still empty, but 8 units are already spoken for by A.
  g.step(1);
  assert.ok(rainelleB.carrying, "B has withdrawn too, before A has landed");
  assert.equal(
    rainelleB.carrying.qty,
    2,
    "B's own withdrawal is capped by the two remaining units of room once A's reservation is counted",
  );
  assert.equal(fromB.buffer[cultivarId], 6, "B's withdrawal itself still only takes what the corrected budget allows");

  // Both eventually land — the shared destination must never have exceeded its declared capacity
  // at any point, and must not exceed it once both deliveries have landed either.
  g.step(TRANSIT);
  assert.ok(Stations.panierTotal(to) <= to.capacity, "capacity must hold once A lands");
  g.step(1);
  assert.equal(to.buffer[cultivarId], 10, "both deliveries land, exactly filling — never overflowing — the shared destination");
  assert.equal(Stations.panierTotal(to), 10);
});
