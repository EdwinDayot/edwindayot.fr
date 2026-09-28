const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

// Epic C2.6c (third and final tier of C2.6's reformulation, see campagne-backlog.md's journal
// des décisions, 2026-09-18): the "arroser"/"recolter" gestures actually run, every tick, once
// bornes/zones/paniers (C2.6a) and specimen humidity/maturity (C2.6b) both exist. See
// campaign-automation.js's own header comment for the design reasoning (job/buffer as this
// file's own reimplementation of automation.js's tickJob/tickBuffer *pattern*, not its code).

const CYCLE = CampaignAutomation.CYCLE_SECONDS;
const RANGE = CampaignAutomation.ZONE_WORK_RANGE;
// Epic C7.30: a "transporter" withdrawal no longer deposits in the same tick it leaves
// `from.buffer` — every existing transporter test below that used to observe both at once now
// waits this many extra ticks for the delivery. "trier" is untouched (still instantaneous, see
// campaign-automation.js's own tickTransporter/tickTrier comments), so its own tests need no
// change.
const TRANSIT = CampaignAutomation.TRANSIT_TICKS;

// Only the scripted frog encounter (C2.3) can create a Rainelle — and its own cultivar — through
// commands. Same fixture already used by tests/campaign-teaching.cjs/-gestures.cjs.
function bornRainelle(g) {
  // Epic C4.4: triggerFrogEncounter now refuses until a cultivar already exists ("après les
  // apprentissages nécessaires", design §10 chapitre 4) — this unrelated warm-up cross satisfies
  // that real precondition before the scripted encounter itself.
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function teach(rainelle, fields) {
  const r = Rainelles.applyGesture(rainelle, {
    condition: "",
    ...fields,
  });
  assert.equal(r.ok, true, r.error);
}

test("arroser: a taught Rainelle fills at the borne and waters every specimen in the zone's range, with no command but the passage of time", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 10,
    z: 10,
  });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 20,
    z: 20,
  });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 21,
    z: 20,
  });
  // Dry the specimen out almost completely by advancing simulated time alone — no water command.
  g.step(3 * 3600 + 100);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) < 1);
  teach(rainelle, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
  });
  assert.equal(rainelle.job, null);
  g.step(CYCLE);
  assert.equal(rainelle.job.remaining, CYCLE);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95);
  assert.equal(specimen.moistureAt, g.s.elapsed);
});

test("arroser: a specimen outside the zone's range is never watered", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const far = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 40,
    z: 40,
  });
  assert.ok(
    Math.hypot(far.x - zone.x, far.z - zone.z) > RANGE,
    "fixture must actually be out of range",
  );
  teach(rainelle, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
  });
  const before = far.moistureAt;
  g.step(CYCLE * 3);
  assert.equal(far.moistureAt, before);
});

test("arroser: an unknown source id, or a poste of the wrong kind, leaves the Rainelle inactive without throwing", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });

  const unknownSource = bornRainelle(g);
  teach(unknownSource, {
    verbe: "arroser",
    poste: zone.id,
    source: "b999",
    destination: "peu-importe",
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(unknownSource.job, null);

  const g2 = new GardenState(null, 1000);
  const zone2 = Stations.registerStation(g2.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const borne2 = Stations.registerStation(g2.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  const wrongKind = bornRainelle(g2);
  // poste points at a borne, not a zone: wrong kind, same as an unresolved id.
  teach(wrongKind, {
    verbe: "arroser",
    poste: borne2.id,
    source: borne2.id,
    destination: "peu-importe",
  });
  assert.doesNotThrow(() => g2.step(CYCLE * 2));
  assert.equal(wrongKind.job, null);
});

test("recolter: a mature specimen in range becomes ready automatically, then lands in the destination panier's buffer and is un-readied", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 5,
    z: 5,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 8,
    z: 5,
  });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 5,
    z: 6,
    stage: Cultivars.MATURE_STAGE,
  });
  assert.equal(specimen.readyToProduce, false);
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  // One tick is enough for the readiness pass alone to flip a mature specimen.
  g.tick();
  assert.equal(specimen.readyToProduce, true);
  g.step(CYCLE - 1);
  assert.equal(panier.buffer[cultivarId], 1);
  assert.equal(specimen.readyToProduce, false);
  // The specimen stays mature and is re-armed the very next tick (see
  // campaign-automation.js's updateSpecimenReadiness comment: no growth-timer/yield-limit
  // model exists yet), so a second full cycle harvests it again rather than staying idle.
  g.step(CYCLE);
  assert.equal(panier.buffer[cultivarId], 2);
});

test("recolter: an immature specimen is never harvested, even in range and forced readyToProduce would be illegal", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0, stage: 0 });
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(CYCLE * 3);
  assert.deepEqual(panier.buffer, {});
});

test("recolter: a mature, ready specimen outside the zone's range is never harvested", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 50,
    z: 50,
    stage: Cultivars.MATURE_STAGE,
  });
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(CYCLE * 3);
  assert.deepEqual(panier.buffer, {});
});

test("transporter: moves a filtered resource from the source panier's buffer to the destination panier's, one trajet at a time", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const to = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  from.buffer[cultivarId] = 3;
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  // Epic C7.30: the withdrawal itself still happens exactly at CYCLE (unchanged — see the
  // budget/timing comments on tickTransporter), but the resource only reaches `to.buffer` after a
  // further TRANSIT_TICKS in flight, carried on the Rainelle (`rainelle.carrying`).
  g.step(CYCLE - 1);
  assert.equal(from.buffer[cultivarId], 3);
  assert.equal(to.buffer[cultivarId], undefined);
  g.step(1);
  assert.equal(from.buffer[cultivarId], undefined);
  assert.equal(to.buffer[cultivarId], undefined);
  assert.deepEqual(rainelle.carrying, {
    key: cultivarId,
    qty: 3,
    destinationId: to.id,
    ticksRemaining: TRANSIT,
  });
  g.step(TRANSIT - 1);
  assert.equal(to.buffer[cultivarId], undefined);
  g.step(1);
  assert.equal(to.buffer[cultivarId], 3);
  assert.equal(rainelle.carrying, null);
});

test("transporter: an empty condition (no filter taught) departs with only the first eligible key, in buffer order — the rest wait for a future trajet", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const to = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  from.buffer.a1 = 2;
  from.buffer.a2 = 5;
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
  });
  // Epic C7.30: a carry only ever holds a single resource key ("chaque transporteuse garde un
  // seul trajet actif", design §5) — an untaught condition no longer moves every eligible key in
  // the same tick the way it did before this epic. The first cycle departs with only `a1` (first
  // in `Object.keys(from.buffer)` order); `a2` waits, untouched, in `from.buffer`.
  g.step(CYCLE);
  assert.deepEqual(from.buffer, { a2: 5 });
  assert.equal(to.buffer.a1, undefined);
  // Epic C7.30: while `carrying` blocks a second withdrawal, advanceCycle is still called every
  // tick (tickTransporter's own "carrying" branch) — the job keeps ticking (and would complete
  // and restart on its own timer) underneath the wait, exactly like every other verb's cycle,
  // rather than freezing just because a delivery is in flight. So by the time this first delivery
  // lands (TRANSIT ticks later), the job is already TRANSIT ticks into its next cycle — only
  // CYCLE - TRANSIT more ticks are needed for `a2` to depart, not a fresh full CYCLE.
  g.step(TRANSIT);
  assert.deepEqual(to.buffer, { a1: 2 });
  g.step(CYCLE - TRANSIT - 1);
  assert.deepEqual(from.buffer, { a2: 5 });
  g.step(1);
  assert.deepEqual(from.buffer, {});
  assert.deepEqual(rainelle.carrying, {
    key: "a2",
    qty: 5,
    destinationId: to.id,
    ticksRemaining: TRANSIT,
  });
  g.step(TRANSIT);
  assert.deepEqual(to.buffer, { a1: 2, a2: 5 });
});

test("transporter: a panier taught as both source and destination is a degenerate no-op, never a job", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  panier.buffer[cultivarId] = 4;
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: panier.id,
    destination: panier.id,
    condition: cultivarId,
  });
  g.step(CYCLE * 2);
  assert.equal(rainelle.job, null);
  assert.equal(panier.buffer[cultivarId], 4);
});

test("transporter: an unknown source/destination id, or one of the wrong kind, leaves the Rainelle inactive without throwing", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });

  const unknownDest = bornRainelle(g);
  teach(unknownDest, {
    verbe: "transporter",
    poste: "peu-importe",
    source: panier.id,
    destination: "pn999",
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(unknownDest.job, null);

  const g2 = new GardenState(null, 1000);
  const panier2 = Stations.registerStation(g2.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const zone2 = Stations.registerStation(g2.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const wrongKind = bornRainelle(g2);
  // destination points at a zone, not a panier: wrong kind, same as an unresolved id.
  teach(wrongKind, {
    verbe: "transporter",
    poste: "peu-importe",
    source: panier2.id,
    destination: zone2.id,
  });
  assert.doesNotThrow(() => g2.step(CYCLE * 2));
  assert.equal(wrongKind.job, null);
});

test("chain: arroser then recolter then transporter carries a real resource end to end without any manual command", () => {
  const g = new GardenState(null, 1000);
  // Only the scripted encounter (C2.3) can create a Rainelle through a command, and design §5
  // caps it at the very first one ("La première Rainelle est déjà née.") — a second/third
  // Rainelle for this chain is created directly, exactly like tests/campaign-teaching.cjs's own
  // secondRainelle() helper, which never touches or bypasses that one-encounter cap either.
  const waterer = bornRainelle(g);
  const cultivarId = waterer.cultivarId;
  const harvester = Rainelles.createRainelle(g.s, { cultivarId, name: "Récolteuse" });
  const transporter = Rainelles.createRainelle(g.s, { cultivarId, name: "Transporteuse" });

  const borne = Stations.registerStation(g.s.campaignStations, "borne", {
    x: 0,
    z: 0,
  });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const localPanier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const cuisine = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  g.step(3 * 3600 + 100);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) < 1);

  teach(waterer, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
  });
  teach(harvester, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: localPanier.id,
  });
  teach(transporter, {
    verbe: "transporter",
    poste: "peu-importe",
    source: localPanier.id,
    destination: cuisine.id,
    condition: cultivarId,
  });

  // No command other than the passage of time from here on. One cycle is enough: harvester and
  // transporter are taught (and so start their own countdown) at the same tick, so both complete
  // together — the harvest lands in localPanier and is *withdrawn* into the transporter's own
  // `carrying` within that same tick (see campaign-automation.js's tickRainelle: s.rainelles are
  // ticked in order, harvester before transporter). Epic C7.30: the withdrawal no longer deposits
  // in cuisine the same tick it leaves localPanier — a further TRANSIT_TICKS in flight are needed
  // before it actually lands. A second/third cycle would harvest the same specimen again (the
  // documented unbounded-regeneration limit from C2.6c, unrelated to what this test proves).
  g.step(CYCLE);

  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95);
  assert.deepEqual(localPanier.buffer, {});
  assert.equal(cuisine.buffer[cultivarId], undefined);
  assert.deepEqual(transporter.carrying, {
    key: cultivarId,
    qty: 1,
    destinationId: cuisine.id,
    ticksRemaining: CampaignAutomation.TRANSIT_TICKS,
  });
  g.step(CampaignAutomation.TRANSIT_TICKS);
  assert.equal(cuisine.buffer[cultivarId], 1);
});

// Epic C2.8 (design §5, "Conditions, réservations et lecture des blocages"): panier.capacity/
// min are now enforced before campaign-automation.js mutates any buffer — see that file's own
// header comment on tickRecolter/tickTransporter for why this is the whole "reservation" this
// epic needs (s.rainelles ticks strictly in array order, so two Rainelles sharing a target in
// the very same tick can never both count the same unit of headroom).

test("recolter: a full destination panier stops harvesting cleanly — nothing lost, specimen stays ready", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  panier.capacity = 1;
  const a = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  const b = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 1,
    stage: Cultivars.MATURE_STAGE,
  });
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(CYCLE);
  // Both a/b become ready on the readiness pass, but the panier can only ever hold one.
  assert.equal(panier.buffer[cultivarId], 1);
  assert.equal(Stations.panierTotal(panier), 1);
  const stillReady = [a, b].filter((sp) => sp.readyToProduce);
  assert.equal(stillReady.length, 1, "the specimen that didn't fit stays ready, never lost");
});

test("recolter: two récolteuses sharing a zone and a nearly-full panier never overshoot capacity in the same tick", () => {
  const g = new GardenState(null, 1000);
  const first = bornRainelle(g);
  const cultivarId = first.cultivarId;
  const second = Rainelles.createRainelle(g.s, { cultivarId, name: "Deuxième" });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  panier.capacity = 1;
  Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 1,
    stage: Cultivars.MATURE_STAGE,
  });
  teach(first, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  teach(second, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(CYCLE);
  assert.equal(Stations.panierTotal(panier), 1);
});

// Epic C7.7 (design §12, "l'automne favorise les récoltes") — same FAST_CYCLE_SECONDS/
// CYCLE_SECONDS pattern already proven for "arroser" by C5.4, gated on
// GardenCampaignSeasons.seasonForDay(s.campaignDay) instead of a borne flag. FAST is
// recomputed independently from CampaignAutomation.FAST_CYCLE_SECONDS, never copied from the
// code under test, per this file's own test-writing convention (see CYCLE at the top of this
// file).
const FAST = CampaignAutomation.FAST_CYCLE_SECONDS;

test("recolter: a cycle started on an autumn day completes in FAST_CYCLE_SECONDS ticks, not CYCLE_SECONDS", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  g.s.campaignDay = 21; // seasonForDay(21) === "automne" (days 21-30, C7.1's own DAYS_PER_SEASON=10)
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  Cultivars.setReadyToProduce(g.s, specimen, true);
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(FAST - 1);
  assert.deepEqual(panier.buffer, {}, "not yet — the fast cycle hasn't completed");
  g.step(1);
  assert.equal(panier.buffer[cultivarId], 1, "exactly FAST_CYCLE_SECONDS ticks in autumn");
});

test("recolter: a cycle started outside autumn still completes in the ordinary CYCLE_SECONDS ticks", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  g.s.campaignDay = 1; // seasonForDay(1) === "printemps"
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  Cultivars.setReadyToProduce(g.s, specimen, true);
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(CYCLE - 1);
  assert.deepEqual(panier.buffer, {}, "not yet — no bonus outside autumn");
  g.step(1);
  assert.equal(panier.buffer[cultivarId], 1, "exactly CYCLE_SECONDS ticks outside autumn, never shorter");
});

test("recolter: a cycle already running when the season turns to autumn finishes at the duration it started with, never rescaled mid-flight", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  g.s.campaignDay = 1; // printemps: the cycle about to start picks CYCLE_SECONDS
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  Cultivars.setReadyToProduce(g.s, specimen, true);
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(5); // cycle under way, mid-count, still on CYCLE_SECONDS
  g.s.campaignDay = 21; // the season turns to automne mid-cycle, exactly like sleep advancing it
  g.step(CYCLE - 5 - 1);
  assert.deepEqual(panier.buffer, {}, "the running cycle isn't shortened by the season change");
  g.step(1);
  assert.equal(
    panier.buffer[cultivarId],
    1,
    "the first cycle still takes the full CYCLE_SECONDS it started with",
  );
  // Now a fresh cycle starts, and campaignDay is already 21 (automne): it runs fast.
  Cultivars.setReadyToProduce(g.s, specimen, true);
  g.step(FAST - 1);
  assert.equal(panier.buffer[cultivarId], 1, "second cycle not yet complete");
  g.step(1);
  assert.equal(panier.buffer[cultivarId], 2, "second cycle completed in FAST_CYCLE_SECONDS, now that the season is automne");
});

test("recolter: night resolution (runNightWork/doRecolter) harvests identically in autumn and outside it — the seasonal bonus is a day-cycle-speed effect only", () => {
  const outcomes = [1, 21].map((day) => {
    const g = new GardenState(null, 1000);
    const rainelle = bornRainelle(g);
    const cultivarId = g.s.cultivars[0].id;
    g.s.campaignDay = day;
    const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
    const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
    const specimen = Cultivars.createSpecimen(g.s, {
      cultivarId,
      x: 0,
      z: 0,
      stage: Cultivars.MATURE_STAGE,
    });
    Cultivars.setReadyToProduce(g.s, specimen, true);
    teach(rainelle, {
      verbe: "recolter",
      poste: zone.id,
      source: "peu-importe",
      destination: panier.id,
    });
    assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
    const worked = CampaignAutomation.runNightWork(g.s);
    return { worked: worked.has(rainelle.id), harvested: Stations.panierTotal(panier) };
  });
  assert.deepEqual(outcomes[0], outcomes[1], "same night-work outcome whatever the season");
  assert.equal(outcomes[0].worked, true);
  assert.equal(outcomes[0].harvested, 1);
});

test("transporter: a full destination blocks the trajet entirely, leaving the source untouched", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const to = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  from.buffer[cultivarId] = 3;
  to.buffer.other = to.capacity; // destination already full (default capacity 24)
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(from.buffer[cultivarId], 3);
  assert.equal(to.buffer[cultivarId], undefined);
});

test("transporter: a partially-full destination moves only as much as fits, splitting the trajet safely", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const to = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  from.buffer[cultivarId] = 5;
  to.buffer.other = 22; // capacity 24 (default) minus 22 already there = room for 2
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  // Epic C7.30: the withdrawal (and so the budget split) still happens exactly at CYCLE,
  // unaffected — only the deposit into `to` is now deferred by TRANSIT_TICKS.
  g.step(CYCLE);
  assert.equal(from.buffer[cultivarId], 3);
  assert.equal(to.buffer[cultivarId], undefined);
  g.step(TRANSIT);
  assert.equal(to.buffer[cultivarId], 2);
  assert.equal(Stations.panierTotal(to), 24);
});

test("transporter: a protected source min never gets drained below its floor", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const to = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  from.buffer[cultivarId] = 5;
  from.min = 2;
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  // Epic C7.30: the withdrawal (so the source's own floor) still happens exactly at CYCLE — only
  // the deposit into `to` is now deferred by TRANSIT_TICKS.
  g.step(CYCLE);
  assert.equal(from.buffer[cultivarId], 2);
  assert.equal(to.buffer[cultivarId], undefined);
  assert.equal(Stations.panierTotal(from), 2);
  g.step(TRANSIT);
  assert.equal(to.buffer[cultivarId], 3);
});

test("transporter: a source already at or below its min moves nothing, blocking cleanly", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const to = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  from.buffer[cultivarId] = 2;
  from.min = 2;
  teach(rainelle, {
    verbe: "transporter",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(from.buffer[cultivarId], 2);
  assert.equal(to.buffer[cultivarId], undefined);
});

test("trier: extracts a single filtered category from the source panier's buffer, leaving other categories in place", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const to = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  from.buffer[cultivarId] = 3;
  from.buffer.autre = 5;
  teach(rainelle, {
    verbe: "trier",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(from.buffer[cultivarId], undefined);
  assert.equal(from.buffer.autre, 5);
  assert.equal(to.buffer[cultivarId], 3);
  assert.equal(to.buffer.autre, undefined);
});

test("trier: an empty condition (no category taught) never starts a job", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const to = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  from.buffer[cultivarId] = 3;
  teach(rainelle, {
    verbe: "trier",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: "",
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  assert.equal(from.buffer[cultivarId], 3);
  assert.equal(to.buffer[cultivarId], undefined);
});

test("trier: a panier taught as both source and destination is a degenerate no-op, never a job", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  panier.buffer[cultivarId] = 3;
  teach(rainelle, {
    verbe: "trier",
    poste: "peu-importe",
    source: panier.id,
    destination: panier.id,
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  assert.equal(panier.buffer[cultivarId], 3);
});

test("trier: an unknown source/destination id, or one of the wrong kind, leaves the Rainelle inactive without throwing", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "trier",
    poste: "peu-importe",
    source: from.id,
    destination: "inconnu",
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  teach(rainelle, {
    verbe: "trier",
    poste: "peu-importe",
    source: from.id,
    destination: zone.id,
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
});

test("trier: destination capacity and source min are respected, exactly like transporter's own budget", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const from = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const to = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  from.buffer[cultivarId] = 5;
  from.min = 2;
  to.buffer.other = 22; // capacity 24 (default) minus 22 already there = room for 2
  teach(rainelle, {
    verbe: "trier",
    poste: "peu-importe",
    source: from.id,
    destination: to.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  // Budget is the smaller of the two limits (room at destination = 2, takeable from source =
  // 5 - min(2) = 3): only 2 move, the source's own min floor never even gets exercised here.
  assert.equal(from.buffer[cultivarId], 3);
  assert.equal(to.buffer[cultivarId], 2);
  assert.equal(Stations.panierTotal(to), 24);
});

test("the one remaining out-of-scope verb (preparer) never crashes and never starts a job", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "preparer",
    poste: zone.id,
    source: panier.id,
    destination: panier.id,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
});

// Epic C7.26 (design §5, « Prendre les jeunes plants de {source} ; replanter les emplacements
// vides de {poste}. »): a taught Rainelle actually replants, cycle after cycle, drawing from a
// panier's young-plant stock (C7.23) into a destination zone (C7.20/C7.24/C7.25), never
// consuming stock on a blocked destination.

test("replanter: a full cycle with an available young plant and a free zone slot creates a new specimen, positioned at the zone, and withdraws exactly one unit of stock", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 12,
    z: 7,
    capacity: 3,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const deposit = Stations.depositYoungPlant(g.s, panier.id, cultivarId, 2);
  assert.equal(deposit.ok, true, deposit.error);
  g.s.campaignStations = deposit.registry;
  const before = g.s.specimens.length;
  teach(rainelle, {
    verbe: "replanter",
    poste: zone.id,
    source: panier.id,
    destination: "peu-importe",
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(g.s.specimens.length, before + 1);
  const created = g.s.specimens[g.s.specimens.length - 1];
  assert.equal(created.cultivarId, cultivarId);
  assert.equal(created.zoneId, zone.id);
  assert.equal(created.zoneSlot, 0);
  assert.equal(created.x, zone.x);
  assert.equal(created.z, zone.z);
  const savedPanier = g.s.campaignStations.paniers.find((p) => p.id === panier.id);
  assert.equal(savedPanier.buffer[Stations.youngPlantKey(cultivarId)], 1);
});

test("replanter: an empty condition leaves the Rainelle inactive, never starting a job", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const deposit = Stations.depositYoungPlant(g.s, panier.id, cultivarId, 1);
  g.s.campaignStations = deposit.registry;
  const before = g.s.specimens.length;
  teach(rainelle, {
    verbe: "replanter",
    poste: zone.id,
    source: panier.id,
    destination: "peu-importe",
    condition: "",
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  assert.equal(g.s.specimens.length, before);
});

test("replanter: an unknown poste/source id, or one of the wrong kind, leaves the Rainelle inactive without throwing", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "replanter",
    poste: "inconnu",
    source: panier.id,
    destination: "peu-importe",
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  teach(rainelle, {
    verbe: "replanter",
    poste: panier.id,
    source: panier.id,
    destination: "peu-importe",
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  teach(rainelle, {
    verbe: "replanter",
    poste: zone.id,
    source: "inconnu",
    destination: "peu-importe",
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
});

test("replanter: a full zone ends the cycle without creating a specimen and without touching the young-plant stock", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 1,
  });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 }).zoneId = zone.id;
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const deposit = Stations.depositYoungPlant(g.s, panier.id, cultivarId, 1);
  g.s.campaignStations = deposit.registry;
  const before = g.s.specimens.length;
  teach(rainelle, {
    verbe: "replanter",
    poste: zone.id,
    source: panier.id,
    destination: "peu-importe",
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(g.s.specimens.length, before);
  const savedPanier = g.s.campaignStations.paniers.find((p) => p.id === panier.id);
  assert.equal(savedPanier.buffer[Stations.youngPlantKey(cultivarId)], 1);
});

test("replanter: a cultivar not on the zone's allowedCultivarIds ends the cycle without creating a specimen and without touching the young-plant stock", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
    allowedCultivarIds: ["autre-cultivar"],
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const deposit = Stations.depositYoungPlant(g.s, panier.id, cultivarId, 1);
  g.s.campaignStations = deposit.registry;
  const before = g.s.specimens.length;
  teach(rainelle, {
    verbe: "replanter",
    poste: zone.id,
    source: panier.id,
    destination: "peu-importe",
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(g.s.specimens.length, before);
  const savedPanier = g.s.campaignStations.paniers.find((p) => p.id === panier.id);
  assert.equal(savedPanier.buffer[Stations.youngPlantKey(cultivarId)], 1);
});

test("replanter: a panier without stock under the expected key ends the cycle without creating a specimen", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const before = g.s.specimens.length;
  teach(rainelle, {
    verbe: "replanter",
    poste: zone.id,
    source: panier.id,
    destination: "peu-importe",
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(g.s.specimens.length, before);
});

test("replanter: two consecutive full cycles with at least two young plants in stock place two specimens in two distinct zone slots", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const deposit = Stations.depositYoungPlant(g.s, panier.id, cultivarId, 2);
  g.s.campaignStations = deposit.registry;
  teach(rainelle, {
    verbe: "replanter",
    poste: zone.id,
    source: panier.id,
    destination: "peu-importe",
    condition: cultivarId,
  });
  g.step(CYCLE * 2);
  const created = g.s.specimens.filter((sp) => sp.zoneId === zone.id);
  assert.equal(created.length, 2);
  assert.notEqual(created[0].zoneSlot, created[1].zoneSlot);
  const savedPanier = g.s.campaignStations.paniers.find((p) => p.id === panier.id);
  assert.equal(savedPanier.buffer[Stations.youngPlantKey(cultivarId)], undefined);
});

test("replanter: a real cycle's new specimen and the panier's remaining young-plant stock survive a JSON save/reload round trip", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 5,
    z: 9,
    capacity: 3,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const deposit = Stations.depositYoungPlant(g.s, panier.id, cultivarId, 2);
  g.s.campaignStations = deposit.registry;
  teach(rainelle, {
    verbe: "replanter",
    poste: zone.id,
    source: panier.id,
    destination: "peu-importe",
    condition: cultivarId,
  });
  g.step(CYCLE);
  const saved = g.serialize();
  const reloaded = new GardenState(saved);
  const created = reloaded.s.specimens.find((sp) => sp.zoneId === zone.id);
  assert.ok(created);
  assert.equal(created.cultivarId, cultivarId);
  const savedPanier = reloaded.s.campaignStations.paniers.find((p) => p.id === panier.id);
  assert.equal(savedPanier.buffer[Stations.youngPlantKey(cultivarId)], 1);
});

// Epic C7.27 (design §5, « Multiplier une plante | Boutures + substrat au poste | Jeunes plants
// dans le bac de sortie », taught under the distinct verb "bouturer" — "multiplier" itself stays
// permanently refused, see rainelles.js/campaign-refusal.cjs): a taught Rainelle actually
// bouture, cycle after cycle, consuming boutures (an ordinary harvested-produce buffer key) and
// substrate (SUBSTRATE_KEY, a literal key nothing produces yet) from a single input panier into a
// young-plant stock (C7.23) in a destination panier, never consuming either input on a blocked
// destination.

const SUBSTRATE_KEY = CampaignAutomation.SUBSTRATE_KEY;

test("bouturer: a full cycle with available boutures and substrate deposits one young plant and consumes exactly one unit of each input", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const poste = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  poste.buffer[cultivarId] = 2;
  poste.buffer[SUBSTRATE_KEY] = 2;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 5,
    z: 5,
  });
  teach(rainelle, {
    verbe: "bouturer",
    poste: poste.id,
    source: "peu-importe",
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  const savedPoste = g.s.campaignStations.paniers.find((p) => p.id === poste.id);
  const savedDestination = g.s.campaignStations.paniers.find(
    (p) => p.id === destination.id,
  );
  assert.equal(savedPoste.buffer[cultivarId], 1);
  assert.equal(savedPoste.buffer[SUBSTRATE_KEY], 1);
  assert.equal(savedDestination.buffer[Stations.youngPlantKey(cultivarId)], 1);
});

test("bouturer: an empty condition leaves the Rainelle inactive, never starting a job", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const poste = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  poste.buffer[cultivarId] = 1;
  poste.buffer[SUBSTRATE_KEY] = 1;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "bouturer",
    poste: poste.id,
    source: "peu-importe",
    destination: destination.id,
    condition: "",
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  assert.equal(poste.buffer[cultivarId], 1);
  assert.equal(poste.buffer[SUBSTRATE_KEY], 1);
});

test("bouturer: an unknown poste/destination id, or one of the wrong kind, leaves the Rainelle inactive without throwing", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const poste = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  poste.buffer[cultivarId] = 1;
  poste.buffer[SUBSTRATE_KEY] = 1;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  teach(rainelle, {
    verbe: "bouturer",
    poste: "inconnu",
    source: "peu-importe",
    destination: destination.id,
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  teach(rainelle, {
    verbe: "bouturer",
    poste: zone.id,
    source: "peu-importe",
    destination: destination.id,
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  teach(rainelle, {
    verbe: "bouturer",
    poste: poste.id,
    source: "peu-importe",
    destination: "inconnu",
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
});

test("bouturer: geste.source is never read — an unresolved source never blocks the gesture", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const poste = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  poste.buffer[cultivarId] = 1;
  poste.buffer[SUBSTRATE_KEY] = 1;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "bouturer",
    poste: poste.id,
    source: "identifiant-jamais-resolu",
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  const savedDestination = g.s.campaignStations.paniers.find(
    (p) => p.id === destination.id,
  );
  assert.equal(savedDestination.buffer[Stations.youngPlantKey(cultivarId)], 1);
});

// Found by /code-review before this epic's own commit: unlike tickReplanter (poste is a zone,
// destination a panier — never the same station), bouturer's poste and destination are both
// paniers, so the same-panier degeneracy tickPanierMove already guards for transporter/trier is
// possible here too — and, unguarded, worse than a no-op (see tickBouturer's own comment).
test("bouturer: a panier taught as both poste and destination is a degenerate no-op, never depositing or consuming anything", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  panier.buffer[cultivarId] = 1;
  panier.buffer[SUBSTRATE_KEY] = 1;
  teach(rainelle, {
    verbe: "bouturer",
    poste: panier.id,
    source: "peu-importe",
    destination: panier.id,
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  assert.equal(panier.buffer[cultivarId], 1);
  assert.equal(panier.buffer[SUBSTRATE_KEY], 1);
  assert.equal(panier.buffer[Stations.youngPlantKey(cultivarId)], undefined);
});

test("bouturer: a full destination panier ends the cycle without consuming either input", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const poste = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  poste.buffer[cultivarId] = 1;
  poste.buffer[SUBSTRATE_KEY] = 1;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  destination.capacity = 0;
  teach(rainelle, {
    verbe: "bouturer",
    poste: poste.id,
    source: "peu-importe",
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(poste.buffer[cultivarId], 1);
  assert.equal(poste.buffer[SUBSTRATE_KEY], 1);
  assert.equal(destination.buffer[Stations.youngPlantKey(cultivarId)], undefined);
});

test("bouturer: a poste missing boutures, missing substrate, or missing both ends the cycle without depositing anything", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });

  const posteMissingSubstrate = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  posteMissingSubstrate.buffer[cultivarId] = 1;
  teach(rainelle, {
    verbe: "bouturer",
    poste: posteMissingSubstrate.id,
    source: "peu-importe",
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(destination.buffer[Stations.youngPlantKey(cultivarId)], undefined);
  assert.equal(posteMissingSubstrate.buffer[cultivarId], 1);

  const posteMissingBoutures = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  posteMissingBoutures.buffer[SUBSTRATE_KEY] = 1;
  teach(rainelle, {
    verbe: "bouturer",
    poste: posteMissingBoutures.id,
    source: "peu-importe",
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(destination.buffer[Stations.youngPlantKey(cultivarId)], undefined);
  assert.equal(posteMissingBoutures.buffer[SUBSTRATE_KEY], 1);

  const posteMissingBoth = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "bouturer",
    poste: posteMissingBoth.id,
    source: "peu-importe",
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(destination.buffer[Stations.youngPlantKey(cultivarId)], undefined);
});

test("bouturer: two consecutive full cycles with at least two boutures and two substrate deposit two cumulative young plants", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const poste = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  poste.buffer[cultivarId] = 2;
  poste.buffer[SUBSTRATE_KEY] = 2;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "bouturer",
    poste: poste.id,
    source: "peu-importe",
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE * 2);
  // depositYoungPlant (C7.23) is immutable — it returns a *new* campaignStations registry rather
  // than mutating `destination` in place (unlike `poste`, drained by direct buffer mutation, same
  // discipline as tickTransporter/doRecolter) — so the destination's buffer must be re-read from
  // the live registry, never off the stale `destination` reference captured before either cycle.
  const savedDestination = g.s.campaignStations.paniers.find((p) => p.id === destination.id);
  assert.equal(savedDestination.buffer[Stations.youngPlantKey(cultivarId)], 2);
  assert.equal(poste.buffer[cultivarId], undefined);
  assert.equal(poste.buffer[SUBSTRATE_KEY], undefined);
});

test("bouturer: a real cycle's new young-plant stock and the poste's remaining boutures/substrate survive a JSON save/reload round trip", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const poste = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  poste.buffer[cultivarId] = 2;
  poste.buffer[SUBSTRATE_KEY] = 2;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "bouturer",
    poste: poste.id,
    source: "peu-importe",
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  const saved = g.serialize();
  const reloaded = new GardenState(saved);
  const savedPoste = reloaded.s.campaignStations.paniers.find((p) => p.id === poste.id);
  const savedDestination = reloaded.s.campaignStations.paniers.find(
    (p) => p.id === destination.id,
  );
  assert.equal(savedPoste.buffer[cultivarId], 1);
  assert.equal(savedPoste.buffer[SUBSTRATE_KEY], 1);
  assert.equal(savedDestination.buffer[Stations.youngPlantKey(cultivarId)], 1);
});

// Epic C7.28 (design §5's last row, « Ingrédients au poste » → « Une recette connue en sortie »;
// §7, « Le compost récupère une fraction des résidus »): a taught Rainelle actually préparer,
// cycle after cycle, composting RESIDUE_RATIO units of harvested residue from a source panier
// into one unit of substrate in a destination panier — the last of the design's seven gestures to
// gain a real tick effect (all six teachable verbs now do something; "multiplier" stays refused).

const RESIDUE_RATIO = CampaignAutomation.RESIDUE_RATIO;

test("preparer: a full cycle with enough residue composts RESIDUE_RATIO units into exactly one unit of substrate", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const source = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  source.buffer[cultivarId] = RESIDUE_RATIO * 2;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 5,
    z: 5,
  });
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: source.id,
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(source.buffer[cultivarId], RESIDUE_RATIO);
  assert.equal(destination.buffer[SUBSTRATE_KEY], 1);
});

test("preparer: an empty condition leaves the Rainelle inactive, never starting a job", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const source = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  source.buffer[cultivarId] = RESIDUE_RATIO * 2;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: source.id,
    destination: destination.id,
    condition: "",
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  assert.equal(source.buffer[cultivarId], RESIDUE_RATIO * 2);
  assert.equal(destination.buffer[SUBSTRATE_KEY], undefined);
});

test("preparer: an unknown source/destination id, or one of the wrong kind, leaves the Rainelle inactive without throwing", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const source = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  source.buffer[cultivarId] = RESIDUE_RATIO * 2;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: "inconnu",
    destination: destination.id,
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: zone.id,
    destination: destination.id,
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: source.id,
    destination: "inconnu",
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
});

test("preparer: geste.poste is never read — an unresolved poste never blocks the gesture", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const source = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  source.buffer[cultivarId] = RESIDUE_RATIO;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "preparer",
    poste: "identifiant-jamais-resolu",
    source: source.id,
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(destination.buffer[SUBSTRATE_KEY], 1);
});

// Same degenerate configuration already guarded for transporter/trier/bouturer: source and
// destination are both paniers here too, so teaching the same panier as both must never deposit
// or consume anything.
test("preparer: a panier taught as both source and destination is a degenerate no-op, never composting anything", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
    capacity: 3,
  });
  panier.buffer[cultivarId] = RESIDUE_RATIO * 2;
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: panier.id,
    destination: panier.id,
    condition: cultivarId,
  });
  assert.doesNotThrow(() => g.step(CYCLE * 2));
  assert.equal(rainelle.job, null);
  assert.equal(panier.buffer[cultivarId], RESIDUE_RATIO * 2);
  assert.equal(panier.buffer[SUBSTRATE_KEY], undefined);
});

test("preparer: a full destination panier ends the cycle without consuming any residue", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const source = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  source.buffer[cultivarId] = RESIDUE_RATIO * 2;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  destination.capacity = 0;
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: source.id,
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(source.buffer[cultivarId], RESIDUE_RATIO * 2);
  assert.equal(destination.buffer[SUBSTRATE_KEY], undefined);
});

test("preparer: a source with fewer than RESIDUE_RATIO units of residue (including zero) ends the cycle without any consumption or deposit", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });

  const shortSource = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  shortSource.buffer[cultivarId] = RESIDUE_RATIO - 1;
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: shortSource.id,
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(shortSource.buffer[cultivarId], RESIDUE_RATIO - 1);
  assert.equal(destination.buffer[SUBSTRATE_KEY], undefined);

  const emptySource = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: emptySource.id,
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  assert.equal(emptySource.buffer[cultivarId], undefined);
  assert.equal(destination.buffer[SUBSTRATE_KEY], undefined);
});

test("preparer: two consecutive full cycles with at least 2*RESIDUE_RATIO residue compost two cumulative units of substrate", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const source = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  source.buffer[cultivarId] = RESIDUE_RATIO * 2;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: source.id,
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE * 2);
  assert.equal(destination.buffer[SUBSTRATE_KEY], 2);
  assert.equal(source.buffer[cultivarId], undefined);
});

test("preparer: a real cycle's new substrate stock and the source's remaining residue survive a JSON save/reload round trip", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const source = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  source.buffer[cultivarId] = RESIDUE_RATIO * 2;
  const destination = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  teach(rainelle, {
    verbe: "preparer",
    poste: "peu-importe",
    source: source.id,
    destination: destination.id,
    condition: cultivarId,
  });
  g.step(CYCLE);
  const saved = g.serialize();
  const reloaded = new GardenState(saved);
  const savedSource = reloaded.s.campaignStations.paniers.find((p) => p.id === source.id);
  const savedDestination = reloaded.s.campaignStations.paniers.find(
    (p) => p.id === destination.id,
  );
  assert.equal(savedSource.buffer[cultivarId], RESIDUE_RATIO);
  assert.equal(savedDestination.buffer[SUBSTRATE_KEY], 1);
});

test("a save without rainelle.job or panier.buffer (pre-epic) migrates to correct defaults without error", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });
  const saved = g.serialize();
  delete saved.rainelles[0].job;
  delete saved.campaignStations.paniers[0].buffer;
  const migrated = new GardenState(saved);
  assert.equal(migrated.s.rainelles[0].job, null);
  assert.deepEqual(migrated.s.campaignStations.paniers[0].buffer, {});
  assert.doesNotThrow(() => migrated.tick());
});

test("validate rejects a malformed rainelle.job or panier.buffer", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  Stations.registerStation(g.s.campaignStations, "panier", { x: 1, z: 1 });

  const badJob = g.serialize();
  badJob.rainelles[0].job = { remaining: -1 };
  assert.throws(() => validate(badJob), /Rainelle invalide/);

  const overCycle = g.serialize();
  overCycle.rainelles[0].job = { remaining: CYCLE + 1 };
  assert.throws(() => validate(overCycle), /Rainelle invalide/);

  const badBuffer = g.serialize();
  badBuffer.campaignStations.paniers[0].buffer = { "not-a-cultivar": 1 };
  assert.throws(() => validate(badBuffer), /Registre de stations invalide/);

  const badQty = g.serialize();
  const cultivarId = badQty.cultivars[0]?.id;
  if (cultivarId) {
    badQty.campaignStations.paniers[0].buffer = { [cultivarId]: -1 };
    assert.throws(() => validate(badQty), /Registre de stations invalide/);
  }
});

test("a well-formed rainelle.job/panier.buffer round-trip a real JSON save/reload unchanged", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const zone = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
  });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", {
    x: 0,
    z: 0,
  });
  Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  teach(rainelle, {
    verbe: "recolter",
    poste: zone.id,
    source: "peu-importe",
    destination: panier.id,
  });
  g.step(CYCLE * 2);
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloaded.s.rainelles, g.s.rainelles);
  assert.deepEqual(reloaded.s.campaignStations, g.s.campaignStations);
});
