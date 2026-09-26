const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Construction = require("../public/game/construction.js");
const Trajectory = require("../public/game/campaign-teaching-trajectory.js");

// Epic C2.5v-a (moteur pur, premier volet de la reformulation de C2.5v — voir
// campagne-backlog.md). `campaign-teaching-trajectory.js` never mutates `s` and never runs a
// second pathfinding algorithm: only `resolveTrajectory`'s own reuse of
// `GardenConstruction.path(s, from, to)` is exercised here, on the same fixture pattern already
// used by tests/campaign-observation.cjs/-rainelle-movement.cjs.

test("resolveTrajectory: three known stations resolve to their real points, in order", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const b = Stations.registerStation(g.s.campaignStations, "zone", { x: 6, z: 6 });
  const c = Stations.registerStation(g.s.campaignStations, "panier", { x: -6, z: 6 });
  const result = Trajectory.resolveTrajectory(g.s, [a.id, b.id, c.id]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.points, [
    { id: a.id, x: 1, z: 1 },
    { id: b.id, x: 6, z: 6 },
    { id: c.id, x: -6, z: 6 },
  ]);
});

test("resolveTrajectory: chains a continuous path across every leg, reusing Construction.path directly (never a second pathfinder)", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const b = Stations.registerStation(g.s.campaignStations, "zone", { x: 6, z: 6 });
  const c = Stations.registerStation(g.s.campaignStations, "panier", { x: -6, z: 6 });
  const result = Trajectory.resolveTrajectory(g.s, [a.id, b.id, c.id]);
  assert.equal(result.ok, true);
  const legAB = Construction.path(g.s, { x: 1, z: 1 }, { x: 6, z: 6 });
  const legBC = Construction.path(g.s, { x: 6, z: 6 }, { x: -6, z: 6 });
  // Both legs are real, non-trivial itineraries on a fresh save's terrain — otherwise this test
  // would not actually exercise "un chemin continu", only an accidental empty array.
  assert.ok(legAB.length > 0, "borne -> zone leg must be reachable on a fresh save");
  assert.ok(legBC.length > 0, "zone -> panier leg must be reachable on a fresh save");
  assert.deepEqual(result.path, [...legAB, ...legBC]);
  // Continuity: the last point of the first leg is the station itself, and the first point of the
  // second leg is one adjacent half-unit cell away from that same station — never a jump.
  const junction = legAB[legAB.length - 1];
  assert.deepEqual(junction, { x: 6, z: 6 });
  const nextStep = legBC[0];
  const stepDistance = Math.hypot(nextStep.x - junction.x, nextStep.z - junction.z);
  assert.ok(stepDistance <= 0.5 + 1e-9, "the path must not skip a cell at the junction");
});

test("resolveTrajectory: two identical consecutive steps produce no degenerate segment, only an empty leg", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const b = Stations.registerStation(g.s.campaignStations, "zone", { x: 6, z: 6 });
  // plannedTrajectory itself already filters this case out before it ever reaches this function
  // (rainelles.js's own header comment); resolveTrajectory must still stay correct if it doesn't.
  const withDuplicate = Trajectory.resolveTrajectory(g.s, [a.id, a.id, b.id]);
  const withoutDuplicate = Trajectory.resolveTrajectory(g.s, [a.id, b.id]);
  assert.equal(withDuplicate.ok, true);
  assert.deepEqual(withDuplicate.path, withoutDuplicate.path);
  assert.deepEqual(withDuplicate.points[0], withDuplicate.points[1]);
});

test("resolveTrajectory: a single-step trajectory resolves its one point with an empty path, never an error", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const result = Trajectory.resolveTrajectory(g.s, [a.id]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.points, [{ id: a.id, x: 1, z: 1 }]);
  assert.deepEqual(result.path, []);
});

test("resolveTrajectory: an empty trajectory resolves to no points and no path", () => {
  const g = new GardenState(null, 1000);
  const result = Trajectory.resolveTrajectory(g.s, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.points, []);
  assert.deepEqual(result.path, []);
});

test("resolveTrajectory: an unknown station id fails explicitly, never a silent partial path", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const result = Trajectory.resolveTrajectory(g.s, [a.id, "inconnu"]);
  assert.equal(result.ok, false);
  assert.match(result.error, /inconnu/);
});

test("resolveTrajectory: an unknown id anywhere in the list stops before any path is computed, not just the last leg", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const b = Stations.registerStation(g.s.campaignStations, "zone", { x: 6, z: 6 });
  const result = Trajectory.resolveTrajectory(g.s, ["inconnu", a.id, b.id]);
  assert.equal(result.ok, false);
  assert.equal(result.points, undefined);
  assert.equal(result.path, undefined);
});

test("resolveTrajectory never mutates `s`, even called repeatedly", () => {
  const g = new GardenState(null, 1000);
  const a = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const b = Stations.registerStation(g.s.campaignStations, "zone", { x: 6, z: 6 });
  const before = JSON.stringify(g.s);
  for (let i = 0; i < 5; i++) {
    Trajectory.resolveTrajectory(g.s, [a.id, b.id]);
    Trajectory.resolveTrajectory(g.s, ["inconnu"]);
  }
  assert.equal(JSON.stringify(g.s), before);
});
