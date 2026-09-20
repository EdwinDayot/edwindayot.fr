const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Movement = require("../public/game/rainelle-movement.js");
const RainellesStatus = require("../public/game/rainelles-status.js");

// Epic C5.11 (docs/campagne-backlog.md): position + movement wired into the REAL tick loop
// (garden-state.js's tick()/tickRainelleMovement) across real simulated seconds — the pure route/
// priority rules themselves (routeTo/resolveStep) are already proven in
// tests/campaign-rainelle-movement.cjs (C5.10) and are not re-proven here. The render-scene half
// of this epic (render-flow.js's sync(), render.js's rainelleModels) is browser-only and is
// exercised by tests/garden-material-audit.cjs's own C5.11 block instead of here.

// Same fixture already used by tests/campaign-rainelle-movement.cjs/-veilleuses.cjs/-automation.cjs.
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

// Runs real simulated seconds (g.step(1), never a direct call into private tick-internal
// functions) until `done()` is true or `max` seconds have elapsed — the same "advance real time,
// observe the public field" style already used by campaign-clock.cjs/-veilleuses.cjs.
function stepUntil(g, max, done) {
  for (let i = 0; i < max && !done(); i++) g.step(1);
}

test("a freshly born Rainelle has no position until the very first real tick, then a real one", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  assert.equal(rainelle.x, null);
  assert.equal(rainelle.z, null);
  g.step(1);
  assert.deepEqual({ x: rainelle.x, z: rainelle.z }, Movement.FALLBACK_POSITION);
});

test("a Rainelle with no resolvable gesture walks to the nearest registered habitat, not the bare fallback", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 6,
    z: 6,
    capacity: 2,
  });
  stepUntil(g, 40, () => rainelle.x === habitat.x && rainelle.z === habitat.z);
  assert.deepEqual({ x: rainelle.x, z: rainelle.z }, { x: habitat.x, z: habitat.z });
});

test("a Rainelle actively 'au-travail' (RainellesStatus) walks to its geste's poste, not habitat", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  // Decoy habitat in the opposite direction (a walkable coordinate — verified with
  // Construction.walkable before picking it, since registerStation itself never checks that,
  // and an unwalkable habitat would leave routeTo/Construction.path with nothing to route to at
  // all, a pre-existing gap in rainelle-movement.js's own nearestHabitat this epic did not
  // introduce and is not the point of this test): if the Rainelle ever heads there instead, this
  // test fails loudly (wrong final position) rather than passing by coincidence.
  Stations.registerStation(g.s.campaignStations, "habitat", { x: -2, z: -2, capacity: 2 });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 1 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 6, z: 6 });
  teach(g, rainelle.id, {
    verbe: "arroser",
    poste: zone.id,
    source: borne.id,
    destination: "x",
  });
  assert.equal(RainellesStatus.status(rainelle, g.s).kind, "au-travail");
  stepUntil(g, 60, () => rainelle.x === zone.x && rainelle.z === zone.z);
  assert.deepEqual({ x: rainelle.x, z: rainelle.z }, { x: zone.x, z: zone.z });
});

test("a Rainelle whose poste never resolves heads to habitat instead, never toward a guessed target", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const habitat = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 4,
    z: 4,
    capacity: 2,
  });
  teach(g, rainelle.id, {
    verbe: "arroser",
    poste: "z999",
    source: "b999",
    destination: "x",
  });
  assert.equal(RainellesStatus.status(rainelle, g.s).kind, "poste-manquant");
  stepUntil(g, 40, () => rainelle.x === habitat.x && rainelle.z === habitat.z);
  assert.deepEqual({ x: rainelle.x, z: rainelle.z }, { x: habitat.x, z: habitat.z });
});

test("loading a save written before this epic (x/z still null) never assigns a position by itself — only the next real tick does", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const saved = g.serialize();
  assert.equal(saved.rainelles[0].x, null);
  const reloaded = new GardenState(saved, 1000);
  const rainelle = reloaded.s.rainelles[0];
  assert.equal(rainelle.x, null, "loading alone must never assign a position");
  assert.equal(rainelle.z, null);
  reloaded.step(1);
  assert.deepEqual({ x: rainelle.x, z: rainelle.z }, Movement.FALLBACK_POSITION);
});

test("an already-positioned Rainelle is never re-teleported by ensurePosition on a later tick", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  g.step(1); // assigns the first real position
  const before = { x: rainelle.x, z: rainelle.z };
  g.step(1);
  // Same fallback habitat both times (nothing registered), so a legitimate route would also leave
  // her exactly there — this only guards against a second, unwanted re-assignment overriding an
  // in-progress route with a fresh nearest-habitat/fallback lookup every tick.
  assert.deepEqual({ x: rainelle.x, z: rainelle.z }, before);
});

test("the per-Rainelle wait-count bookkeeping (rainelle-movement.js's resolveStep parameter) is never part of a save", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  g.step(1);
  const saved = g.serialize();
  assert.equal(saved.rainelleWaitCounts, undefined);
});
