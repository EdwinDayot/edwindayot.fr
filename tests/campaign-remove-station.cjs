// Epic C7.11 (design §16, "Saturer puis libérer un bac... conserve les ressources" ; generalises
// removeHabitat's C6.10 pattern to the three other station kinds). Stations.removeStation itself
// is proven as a pure function in tests/campaign-stations.cjs; this file proves the command
// wiring (removeStation({id}) via the real GardenState.command() vector) and the one behaviour a
// pure-function test cannot show on its own: a Rainelle whose gesture referenced the removed
// station falls back, at the next tick, to the already-existing "poste-manquant" state (C2.8) —
// never a crash, never a silently persisting reservation on a station that no longer exists.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Status = require("../public/game/rainelles-status.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");
const Cultivars = require("../public/game/cultivars.js");

const CYCLE = CampaignAutomation.CYCLE_SECONDS;
const RANGE = CampaignAutomation.ZONE_WORK_RANGE;

// Only the scripted frog encounter (C2.3) can create a Rainelle through a command — same fixture
// already used by tests/campaign-rainelles-chain.cjs/campaign-chapter17.cjs.
function bornRainelle(g) {
  assert.equal(g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  return g.s.rainelles[0];
}

test("removeStation command: refuses an unknown id", () => {
  const g = new GardenState(null, 1000);
  const before = JSON.stringify(g.s.campaignStations);
  const result = g.command({ type: "removeStation", id: "z999" });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("removeStation command: refuses a habitat id, pointing at removeHabitat instead", () => {
  const g = new GardenState(null, 1000);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  const before = JSON.stringify(g.s.campaignStations);
  const result = g.command({ type: "removeStation", id: habitat.id });
  assert.equal(result.ok, false);
  assert.match(result.message, /removeHabitat/);
  assert.equal(JSON.stringify(g.s.campaignStations), before);
});

test("removeStation command: removes a zone and a borne", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  assert.equal(g.command({ type: "removeStation", id: zone.id }).ok, true);
  assert.equal(g.command({ type: "removeStation", id: borne.id }).ok, true);
  assert.deepEqual(g.s.campaignStations.zones, []);
  assert.deepEqual(g.s.campaignStations.bornes, []);
});

test("removeStation command: refuses a panier still holding produce, succeeds once emptied", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer.fraise = 5;
  assert.equal(g.command({ type: "removeStation", id: panier.id }).ok, false);
  assert.equal(g.s.campaignStations.paniers.length, 1);
  panier.buffer.fraise = 0;
  assert.equal(g.command({ type: "removeStation", id: panier.id }).ok, true);
  assert.deepEqual(g.s.campaignStations.paniers, []);
});

test("a Rainelle whose gesture pointed at a now-removed zone reports poste-manquant at the next tick, never a crash", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 1 });
  const taught = g.command({
    type: "teachGesture",
    id: rainelle.id,
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "peu-importe",
  });
  assert.equal(taught.ok, true, taught.message);
  assert.notEqual(Status.status(rainelle, g.s).kind, "poste-manquant");

  const removed = g.command({ type: "removeStation", id: zone.id });
  assert.equal(removed.ok, true, removed.message);
  assert.doesNotThrow(() => g.step(CYCLE));

  const status = Status.status(rainelle, g.s);
  assert.equal(status.kind, "poste-manquant");
  assert.equal(typeof status.message, "string");
  assert.ok(status.message.length > 0);
  // The removal itself never rewrote the gesture: it still names the vanished zone id, exactly
  // the same "removeHabitat never touches a Rainelle's own fields" posture already documented in
  // garden-state-cmd-u.js.
  assert.equal(rainelle.geste.poste, zone.id);
});

// Epic C7.17: labelStation({id, label}) via the real GardenState.command() vector — the pure
// function itself (Stations.labelStation) is proven in tests/campaign-stations.cjs; this proves
// the command wiring and that a label survives a real save round-trip.

test("labelStation command: labels a zone, read back from s.campaignStations", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const result = g.command({ type: "labelStation", id: zone.id, label: "Le carré du matin" });
  assert.equal(result.ok, true, result.message);
  assert.equal(
    g.s.campaignStations.zones.find((z) => z.id === zone.id).label,
    "Le carré du matin",
  );
});

test("labelStation command: refuses an unknown id, refuses a habitat id", () => {
  const g = new GardenState(null, 1000);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  assert.equal(g.command({ type: "labelStation", id: "z999", label: "x" }).ok, false);
  const habitatResult = g.command({ type: "labelStation", id: habitat.id, label: "x" });
  assert.equal(habitatResult.ok, false);
  assert.match(habitatResult.message, /habitat/);
});

test("labelStation command: a label survives a JSON save/load round-trip exactly", () => {
  const g = new GardenState(null, 1000);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  assert.equal(
    g.command({ type: "labelStation", id: borne.id, label: "La grande borne" }).ok,
    true,
  );
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.s)), 1000);
  assert.equal(
    reloaded.s.campaignStations.bornes.find((b) => b.id === borne.id).label,
    "La grande borne",
  );
});

// Epic C7.18: relocateStation({id, x, z}) via the real GardenState.command() vector — the pure
// function itself (Stations.relocateStation) is proven in tests/campaign-stations.cjs; this
// proves the command wiring, a real save round-trip, and design §16's own validation scenario
// ("déplacer un poste... conserve les ressources et libère correctement les réservations") via
// real teachGesture/ticks, never a manual simulation of the expected behaviour.

test("relocateStation command: moves a zone, read back from s.campaignStations", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const result = g.command({ type: "relocateStation", id: zone.id, x: 10, z: -10 });
  assert.equal(result.ok, true, result.message);
  const moved = g.s.campaignStations.zones.find((z) => z.id === zone.id);
  assert.equal(moved.x, 10);
  assert.equal(moved.z, -10);
});

test("relocateStation command: refuses an unknown id, refuses a habitat id, refuses an out-of-bound position", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 0,
    z: 0,
    capacity: 2,
  });
  assert.equal(g.command({ type: "relocateStation", id: "z999", x: 1, z: 1 }).ok, false);
  const habitatResult = g.command({ type: "relocateStation", id: habitat.id, x: 1, z: 1 });
  assert.equal(habitatResult.ok, false);
  assert.match(habitatResult.message, /habitat/);
  const outOfBound = g.command({ type: "relocateStation", id: zone.id, x: 100, z: 0 });
  assert.equal(outOfBound.ok, false);
  assert.deepEqual(g.s.campaignStations.zones.find((z) => z.id === zone.id), {
    id: zone.id,
    x: 0,
    z: 0,
    veilleuse: false,
    extensionCommerciale: false,
  });
});

test("relocateStation command: a non-empty panier moves without being refused, unlike removeStation", () => {
  const g = new GardenState(null, 1000);
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.buffer.fraise = 5;
  const result = g.command({ type: "relocateStation", id: panier.id, x: 8, z: 8 });
  assert.equal(result.ok, true, result.message);
  const moved = g.s.campaignStations.paniers.find((p) => p.id === panier.id);
  assert.equal(moved.x, 8);
  assert.equal(moved.z, 8);
  assert.deepEqual(moved.buffer, { fraise: 5 });
});

test("relocateStation command: a new position survives a JSON save/load round-trip exactly, every other field untouched", () => {
  const g = new GardenState(null, 1000);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  assert.equal(g.command({ type: "labelStation", id: borne.id, label: "La borne" }).ok, true);
  assert.equal(g.command({ type: "relocateStation", id: borne.id, x: 15, z: -3 }).ok, true);
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.s)), 1000);
  const moved = reloaded.s.campaignStations.bornes.find((b) => b.id === borne.id);
  assert.equal(moved.x, 15);
  assert.equal(moved.z, -3);
  assert.equal(moved.label, "La borne");
  assert.equal(moved.priseFortDebit, false);
});

test("design §16 scenario: an arrosage cycle survives a small relocateStation that keeps the specimen in range, then restarts cleanly once moved out of range", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const cultivarId = g.s.cultivars[0].id;
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, { cultivarId, x: 2, z: 0 });
  assert.ok(
    Math.hypot(specimen.x - zone.x, specimen.z - zone.z) <= RANGE,
    "fixture must start in range",
  );
  assert.equal(
    g
      .command({
        type: "teachGesture",
        id: rainelle.id,
        verbe: "arroser",
        poste: zone.id,
        source: borne.id,
        destination: "peu-importe",
      })
      .ok,
    true,
  );

  // Dry the specimen out, then start the cycle and stop mid-course (rainelle.job.remaining half
  // spent) — exactly the "réservation" the design scenario names, before the move happens.
  g.step(3 * 3600 + 100);
  g.step(CYCLE / 2);
  assert.equal(rainelle.job.remaining, CYCLE / 2);
  const before = specimen.moistureAt;

  // A small move: the zone stays close enough to the specimen (still in range), and the mid-
  // course cycle is untouched by the move itself.
  const smallMove = g.command({ type: "relocateStation", id: zone.id, x: 1, z: 0 });
  assert.equal(smallMove.ok, true, smallMove.message);
  assert.ok(
    Math.hypot(specimen.x - 1, specimen.z - 0) <= RANGE,
    "fixture must still be in range after the small move",
  );
  assert.equal(rainelle.job.remaining, CYCLE / 2);

  // Finish the interrupted cycle: the specimen is still watered normally, proving the move
  // preserved the zone's resources/effect rather than resetting or breaking anything.
  g.step(CYCLE / 2);
  assert.equal(rainelle.job.remaining, CYCLE);
  assert.ok(Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95);
  assert.equal(specimen.moistureAt, g.s.elapsed);

  // Now move the zone far out of range: the next cycle restarts cleanly (no throw, job still
  // ticking) but waters nothing — never a crash, never a stuck reservation.
  const farMove = g.command({ type: "relocateStation", id: zone.id, x: 50, z: 50 });
  assert.equal(farMove.ok, true, farMove.message);
  const afterWater = specimen.moistureAt;
  assert.doesNotThrow(() => g.step(CYCLE));
  assert.equal(rainelle.job.remaining, CYCLE);
  assert.equal(specimen.moistureAt, afterWater);
});
