const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Rainelles = require("../public/game/rainelles.js");
const Construction = require("../public/game/construction.js");
const Scenes = require("../public/game/campaign-scenes.js");
const Movement = require("../public/game/rainelle-movement.js");

// Epic C5.10 (design §14, "les Rainelles naviguent sur un graphe ou une grille partagés...
// croisements de passage... priorité stable et temps d'attente borné"). Pure rules only — no
// tick/render wiring exists yet (C5.11's job, see rainelle-movement.js's own header comment).

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands today. Same
// fixture already used by tests/campaign-veilleuses.cjs/-automation.cjs/-scene-location.cjs.
function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function teach(g, id, fields) {
  const r = g.command({ type: "teachGesture", id, condition: "", ...fields });
  assert.equal(r.ok, true, r.error);
}

test("targetPosition: 'poste' for arroser/recolter resolves to the geste's zone coordinates", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 3, z: 4 });
  teach(g, rainelle.id, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "x",
  });
  const target = Movement.targetPosition(g.s, rainelle, Scenes.LOCATIONS.POSTE);
  assert.deepEqual(target, { x: 3, z: 4 });
});

test("targetPosition: 'poste' for transporter resolves to the destination panier's coordinates", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const source = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const destination = Stations.registerStation(g.s.campaignStations, "panier", { x: 5, z: 6 });
  teach(g, rainelle.id, {
    verbe: "transporter",
    poste: "peu-importe",
    source: source.id,
    destination: destination.id,
  });
  const target = Movement.targetPosition(g.s, rainelle, Scenes.LOCATIONS.POSTE);
  assert.deepEqual(target, { x: 5, z: 6 });
});

test("targetPosition: 'repos'/'habitat' resolve to the nearest registered habitat", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  rainelle.x = 0;
  rainelle.z = 0;
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 10, z: 10, capacity: 2 });
  const near = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 1,
    z: 1,
    capacity: 2,
  });
  assert.deepEqual(
    Movement.targetPosition(g.s, rainelle, Scenes.LOCATIONS.REPOS),
    { x: near.x, z: near.z },
  );
  assert.deepEqual(
    Movement.targetPosition(g.s, rainelle, Scenes.LOCATIONS.HABITAT),
    { x: near.x, z: near.z },
  );
});

test("targetPosition: falls back to the documented position when no habitat is registered", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  assert.deepEqual(g.s.campaignStations.habitats, []);
  assert.deepEqual(
    Movement.targetPosition(g.s, rainelle, Scenes.LOCATIONS.HABITAT),
    Movement.FALLBACK_POSITION,
  );
});

test("targetPosition: 'poste' with an unresolved station falls back to habitat/fallback rather than throwing", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  rainelle.geste = {
    verbe: "arroser",
    poste: "z999",
    source: "b999",
    destination: "x",
    condition: "",
  };
  assert.deepEqual(
    Movement.targetPosition(g.s, rainelle, Scenes.LOCATIONS.POSTE),
    Movement.FALLBACK_POSITION,
  );
});

test("routeTo: a Rainelle with no position yet has no route", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  assert.equal(rainelle.x, null);
  assert.equal(rainelle.z, null);
  assert.deepEqual(Movement.routeTo(g.s, rainelle, Scenes.LOCATIONS.HABITAT), []);
});

test("routeTo: correct itinerary toward a simple target, identical to Construction.path itself", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  rainelle.x = 2;
  rainelle.z = 2;
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 5,
    z: 5,
    capacity: 2,
  });
  const route = Movement.routeTo(g.s, rainelle, Scenes.LOCATIONS.HABITAT);
  const expected = Construction.path(g.s, { x: 2, z: 2 }, { x: habitat.x, z: habitat.z });
  assert.deepEqual(route, expected);
  assert.ok(route.length > 0);
  assert.deepEqual(route[route.length - 1], { x: 5, z: 5 });
});

test("routeTo: recomputes after a new obstacle is posed on the path, never cached", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  rainelle.x = 2;
  rainelle.z = 2;
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 5, z: 5, capacity: 2 });
  const before = Movement.routeTo(g.s, rainelle, Scenes.LOCATIONS.HABITAT);
  assert.ok(before.some((p) => p.x === 5 && p.z === 3), "sanity: the direct route passes (5,3)");

  g.s.entities.push({ id: "obstacle-test", type: "pot", x: 5, z: 3, stored: false });
  const after = Movement.routeTo(g.s, rainelle, Scenes.LOCATIONS.HABITAT);
  assert.notDeepEqual(after, before);
  assert.ok(
    !after.some((p) => p.x === 5 && p.z === 3),
    "the newly obstructed cell is never part of the recomputed route",
  );
  assert.deepEqual(after[after.length - 1], { x: 5, z: 5 });
});

test("resolveStep: a single unobstructed Rainelle simply advances to its next cell", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  rainelle.x = 2;
  rainelle.z = 2;
  const { positions, waitCounts } = Movement.resolveStep(g.s, [
    { rainelle, route: [{ x: 2.5, z: 2 }] },
  ]);
  assert.deepEqual(positions[rainelle.id], { x: 2.5, z: 2 });
  assert.equal(waitCounts[rainelle.id], 0);
});

test("resolveStep: movers with no finite position are skipped entirely", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  assert.equal(rainelle.x, null);
  const { positions, waitCounts } = Movement.resolveStep(g.s, [
    { rainelle, route: [{ x: 2.5, z: 2 }] },
  ]);
  assert.equal(positions[rainelle.id], undefined);
  assert.equal(waitCounts[rainelle.id], undefined);
});

test("resolveStep: two Rainelles converging on the same cell — lower id wins by stable priority, the other waits then reroutes past the bound", () => {
  const g = new GardenState(null, 1000);
  const first = bornRainelle(g); // "r1"
  const cultivarId = first.cultivarId;
  const second = Rainelles.createRainelle(g.s, { cultivarId, name: "Deuxième" }); // "r2"
  first.x = 1.5;
  first.z = 2;
  second.x = 2.5;
  second.z = 2;
  assert.ok(priorityOf(first.id) < priorityOf(second.id));

  // Step 1: both want the empty cell (2,2), which neither currently occupies.
  let waitCounts = {};
  let step = Movement.resolveStep(
    g.s,
    [
      { rainelle: first, route: [{ x: 2, z: 2 }] },
      { rainelle: second, route: [{ x: 2, z: 2 }] },
    ],
    waitCounts,
  );
  assert.deepEqual(step.positions[first.id], { x: 2, z: 2 }, "the lower id wins the contested cell");
  assert.deepEqual(step.positions[second.id], { x: 2.5, z: 2 }, "the other waits in place");
  assert.equal(step.waitCounts[second.id], 1);
  applyPositions(g.s, step.positions);
  waitCounts = step.waitCounts;

  // Steps 2 and 3: first has already arrived (empty route, exactly as a real routeTo() call
  // would report once on target) and never moves again; second keeps waiting for the now
  // permanently occupied cell, its wait counter climbing but not yet past MAX_WAIT_STEPS (3).
  for (let n = 0; n < 2; n++) {
    step = Movement.resolveStep(
      g.s,
      [
        { rainelle: first, route: [] },
        { rainelle: second, route: [{ x: 2, z: 2 }] },
      ],
      waitCounts,
    );
    assert.deepEqual(step.positions[second.id], { x: 2.5, z: 2 }, "still waiting, not yet past the bound");
    applyPositions(g.s, step.positions);
    waitCounts = step.waitCounts;
  }
  assert.equal(waitCounts[second.id], 3);

  // Step 4: the wait bound (3) is now exceeded — second gives up the contested cell and steps
  // aside to a free neighbour instead of waiting indefinitely (design ch. 14, "se range à un
  // point d'attente sans devenir un obstacle permanent").
  step = Movement.resolveStep(
    g.s,
    [
      { rainelle: first, route: [] },
      { rainelle: second, route: [{ x: 2, z: 2 }] },
    ],
    waitCounts,
  );
  assert.notDeepEqual(step.positions[second.id], { x: 2.5, z: 2 });
  assert.notDeepEqual(step.positions[second.id], { x: 2, z: 2 }, "never the still-occupied cell");
  assert.equal(step.waitCounts[second.id], 0, "the wait counter resets once it has moved");
  assert.ok(Construction.walkable(g.s, step.positions[second.id].x, step.positions[second.id].z));
});

test("resolveStep never mutates Construction's own obstacle/walkable reading — read-only reuse, no regression", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  rainelle.x = 2;
  rainelle.z = 2;
  const beforeWalkable = Construction.walkable(g.s, 3, 3);
  const beforePath = Construction.path(g.s, { x: 2, z: 2 }, { x: 5, z: 5 });
  Movement.resolveStep(g.s, [{ rainelle, route: [{ x: 2.5, z: 2 }] }]);
  assert.equal(Construction.walkable(g.s, 3, 3), beforeWalkable);
  assert.deepEqual(Construction.path(g.s, { x: 2, z: 2 }, { x: 5, z: 5 }), beforePath);
});

function priorityOf(id) {
  return Number(id.slice(1));
}

function applyPositions(s, positions) {
  for (const rainelle of s.rainelles) {
    if (positions[rainelle.id]) {
      rainelle.x = positions[rainelle.id].x;
      rainelle.z = positions[rainelle.id].z;
    }
  }
}
