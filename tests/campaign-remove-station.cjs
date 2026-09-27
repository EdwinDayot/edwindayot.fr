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

const CYCLE = CampaignAutomation.CYCLE_SECONDS;

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
