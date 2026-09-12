const test = require("node:test"),
  assert = require("node:assert/strict");
const { GardenState, validate } = require("../public/garden-state.js"),
  L = require("../public/game/lighting.js");
const near = (e) => ({ position: { x: e.x, z: e.z } });
function garden() {
  const g = new GardenState(null, 1000);
  g.s.entities.push({
    id: "e4",
    type: "nursery",
    x: -6,
    z: 1,
    rotation: 0,
    stored: false,
  });
  g.s.nextId = 5;
  g.s.inventory["cutting:monstera"] = 2;
  g.s.inventory["young:pilea"] = 7;
  return g;
}
test("Nursery rejects atomically, chooses species and waits exactly 180 seconds for one collection", () => {
  const g = garden(),
    e = g.s.entities.at(-1),
    snapshot = () => JSON.stringify(g.serialize());
  for (const c of [
    { type: "collectYoung", id: e.id },
    { type: "multiply", id: e.id, species: "unknown" },
    { type: "multiply", id: "e1", species: "monstera" },
  ]) {
    const before = snapshot();
    assert.equal(g.command(c, near(e)).ok, false);
    assert.equal(snapshot(), before);
  }
  assert.equal(
    g.command(
      { type: "multiply", id: e.id, species: "monstera" },
      near({ x: 30, z: 30 }),
    ).ok,
    false,
  );
  assert.ok(
    g.command({ type: "multiply", id: e.id, species: "monstera" }, near(e)).ok,
  );
  assert.equal(g.s.inventory["cutting:monstera"], 1);
  const before = snapshot();
  assert.equal(
    g.command({ type: "multiply", id: e.id, species: "monstera" }, near(e)).ok,
    false,
  );
  assert.equal(snapshot(), before);
  g.step(179);
  assert.equal(e.job.remaining, 1);
  assert.equal(
    g.command({ type: "collectYoung", id: e.id }, near(e)).ok,
    false,
  );
  const produced = g.s.stats.produced;
  g.step(1);
  assert.equal(e.job.remaining, 0);
  assert.equal(g.s.stats.produced, produced + 1);
  assert.equal(g.s.inventory["young:monstera"], undefined);
  g.step(600);
  assert.equal(e.job.remaining, 0);
  assert.ok(g.command({ type: "collectYoung", id: e.id }, near(e)).ok);
  assert.equal(g.s.inventory["young:monstera"], 1);
  assert.equal(g.s.inventory["young:pilea"], 7);
  assert.equal(e.job, null);
  const after = snapshot();
  assert.equal(
    g.command({ type: "collectYoung", id: e.id }, near(e)).ok,
    false,
  );
  assert.equal(snapshot(), after);
});
test("Stored nursery suspends, saved jobs resume, ready state and active/offline rewards agree", () => {
  const g = garden(),
    e = g.s.entities.at(-1);
  g.command({ type: "multiply", id: e.id, species: "monstera" }, near(e));
  g.step(30);
  g.command({ type: "store", id: e.id });
  g.step(500);
  assert.equal(e.job.remaining, 150);
  const restored = new GardenState(validate(g.serialize()));
  const job = restored.s.entities.at(-1);
  assert.equal(job.job.remaining, 150);
  assert.ok(
    restored.command(
      { type: "restore", id: job.id, x: job.x, z: job.z },
      near({ x: 0, z: 4 }),
    ).ok,
  );
  const offline = new GardenState(restored.serialize());
  restored.step(1000);
  offline.catchUp(1001000);
  assert.deepEqual(restored.s.entities, offline.s.entities);
  assert.deepEqual(restored.s.stats, offline.s.stats);
  assert.equal(job.job.remaining, 0);
  const ready = new GardenState(restored.serialize());
  const n = ready.s.stats.produced;
  ready.step(1000);
  assert.equal(ready.s.stats.produced, n);
  assert.ok(ready.command({ type: "collectYoung", id: job.id }, near(job)).ok);
});
test("Solar direction follows the requested clock at dawn, noon, sunset and midnight", () => {
  const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);
  assert.ok(L.at(0).height > 0);
  for (const t of [0, 150, 450, 750, 1050, 1200]) {
    const a = L.at(t);
    approx(Math.hypot(...a.direction), 1);
    a.direction.forEach((v, i) => approx(v, L.at(t + 1200).direction[i]));
  }
  approx(L.at(150).height, 1);
  approx(L.at(450).height, 0);
  approx(L.at(750).height, -1);
  approx(L.at(1050).height, 0);
  assert.ok(L.at(1060).direction[0] > 0);
  assert.ok(L.at(440).direction[0] < 0);
  assert.equal(L.at(750).sunIntensity, 0);
  assert.equal(L.at(150).moonIntensity, 0);
  for (const t of [450, 1050, 1200])
    for (const key of ["sunIntensity", "moonIntensity", "ambient", "night"])
      approx(L.at(t - 1e-7)[key], L.at(t + 1e-7)[key]);
});
test("Lighting shares fractional time and restored time without affecting crops or water", () => {
  const a = new GardenState(null, 1000),
    b = new GardenState(a.serialize());
  a.step(0.35);
  b.step(0.35);
  const paused = L.at(a.s.elapsed + a.s.remainder);
  assert.deepEqual(L.at(a.s.elapsed + a.s.remainder), paused);
  const restored = new GardenState(a.serialize());
  assert.deepEqual(L.at(restored.s.elapsed + restored.s.remainder), paused);
  for (let i = 0; i < 1200; i++) {
    a.step(1);
    L.at(a.s.elapsed + a.s.remainder);
  }
  b.step(1200);
  assert.ok(Math.abs(a.s.remainder - b.s.remainder) < 1e-9);
  const aa = a.serialize(),
    bb = b.serialize();
  delete aa.remainder;
  delete bb.remainder;
  assert.deepEqual(aa, bb);
});
