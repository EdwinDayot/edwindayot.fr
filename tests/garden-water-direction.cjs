const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fixture = require("./fixtures/water.cjs"),
  I = require("../public/game/irrigation.js"),
  { GardenState } = require("../public/garden-state.js");
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);
const dripChain = require("./fixtures/drip-chain.cjs");
test("Drips connect in series and share limited water fairly, independent of click order", () => {
  const g = dripChain(),
    reverse = dripChain();
  reverse.s.links = reverse.s.links.map((l) => l.slice().reverse()).reverse();
  assert.equal(g.command({ type: "disconnect", id: "e2", to: "e4" }).ok, true);
  assert.equal(g.command({ type: "connect", id: "e4", to: "e2" }).ok, true);
  assert.equal(I.orientation(g.s.entities[1], g.s.entities[3]), 0);
  const pots = g.s.entities.filter(I.isPot),
    other = reverse.s.entities.filter(I.isPot);
  for (let tick = 0; tick < 3; tick++) {
    I.tick(g.s);
    I.tick(reverse.s);
    close(I.edgeFlow(g.s, "e1", "e2"), 1);
    for (const [a, b] of g.s.links)
      close(I.edgeFlow(g.s, a, b), I.edgeFlow(reverse.s, a, b));
  }
  for (let i = 0; i < pots.length; i++) {
    close(pots[i].plant.moisture, 11);
    close(pots[i].plant.moisture, other[i].plant.moisture);
  }
  close(g.s.entities[0].water, 7);
  close(I.edgeFlow(g.s, "e2", "e4"), 0.5);
  close(I.edgeFlow(g.s, "e4", "e6"), 0.5);
  assert.equal(I.status(g.s, g.s.entities[1]).pots, 3);
  assert.equal(I.status(g.s, g.s.entities[5]).kind, "flowing");
});
test("Wet upstream pots do not stop downstream drips; breaking the chain and empty tanks do", () => {
  const g = dripChain(),
    pots = g.s.entities.filter(I.isPot);
  pots[0].plant.moisture = 90;
  pots[1].plant.moisture = 90;
  I.tick(g.s);
  close(pots[2].plant.moisture, 10.5);
  for (const [a, b] of [
    ["e1", "e2"],
    ["e2", "e4"],
    ["e4", "e6"],
    ["e6", "e7"],
  ])
    close(I.edgeFlow(g.s, a, b), 0.5);
  assert.equal(g.command({ type: "disconnect", id: "e2", to: "e4" }).ok, true);
  I.tick(g.s);
  close(pots[2].plant.moisture, 10.5);
  close(I.edgeFlow(g.s, "e4", "e6"), 0);
  assert.equal(I.status(g.s, g.s.entities[5]).kind, "no-tank");
  assert.equal(g.command({ type: "connect", id: "e2", to: "e4" }).ok, true);
  g.s.entities[0].water = 0.2;
  I.tick(g.s);
  close(pots[2].plant.moisture, 10.7);
  close(g.s.entities[0].water, 0);
  I.tick(g.s);
  close(I.edgeFlow(g.s, "e4", "e6"), 0);
});
test("Drip loops conserve water and series irrigation survives saving and offline catch-up", () => {
  const g = dripChain();
  assert.equal(g.command({ type: "connect", id: "e6", to: "e2" }).ok, true);
  I.tick(g.s);
  close(g.s.entities[0].water, 9);
  close(
    g.s.entities.filter(I.isPot).reduce((n, p) => n + p.plant.moisture, 0),
    31,
  );
  const a = dripChain(),
    b = new GardenState(a.serialize());
  a.step(120);
  b.catchUp(121000);
  a.s.updatedAt = b.s.updatedAt;
  assert.deepEqual(a.serialize(), b.serialize());
});
test("Flow follows pump → storage → pipes → drip → pot regardless of click order", () => {
  const a = fixture(),
    b = fixture();
  b.s.links = b.s.links.map((l) => l.slice().reverse()).reverse();
  a.step(1);
  b.step(1);
  for (const [from, to, q] of [
    ["e1", "e2", 2],
    ["e2", "e3", 2],
    ["e3", "e4", 0.5],
    ["e4", "e5", 0.5],
    ["e5", "e6", 0.5],
  ]) {
    close(I.edgeFlow(a.s, from, to), q);
    close(I.edgeFlow(a.s, to, from), -q);
    close(I.edgeFlow(b.s, from, to), q);
  }
  close(a.s.entities[2].water, 11.5);
  close(a.s.entities[5].plant.moisture, 10.5 - 0.075);
  for (const [x, y] of [
    ["e3", "e7"],
    ["e4", "e8"],
    ["e8", "e9"],
  ])
    close(I.edgeFlow(a.s, x, y), 0);
  assert.equal(I.status(a.s, a.s.entities[0]).kind, "filling");
  assert.equal(I.status(a.s, a.s.entities[2]).kind, "flowing");
  close(I.status(a.s, a.s.entities[2]).inflow, 2);
  close(I.status(a.s, a.s.entities[2]).outflow, 0.5);
  close(I.status(a.s, a.s.entities[2]).flow, 0.5);
  assert.equal(a.s.entities[6].flowing, false);
});
test("Sinks cannot feed pipes or another tank; legacy connections never create reverse flow", () => {
  const g = fixture();
  g.s.entities[8].plant.moisture = 10;
  g.s.links = [
    ["e3", "e5"],
    ["e5", "e4"],
    ["e4", "e8"],
    ["e8", "e9"],
  ];
  g.step(1);
  close(g.s.entities[2].water, 10);
  close(I.edgeFlow(g.s, "e5", "e4"), 0);
  close(I.edgeFlow(g.s, "e8", "e9"), 0);
  const pump = g.s.entities[0],
    drip = g.s.entities[4];
  const nearbyDrip = { ...drip, x: 2, z: 0 };
  assert.equal(I.validLink(pump, nearbyDrip), true);
  assert.equal(I.canConnect(pump, nearbyDrip), false);
  const a = fixture();
  a.s.entities.push({
    id: "e10",
    type: "tank",
    x: -5,
    z: 0,
    rotation: 0,
    stored: false,
    water: 0,
  });
  a.s.nextId = 11;
  a.s.links = [
    ["e1", "e2"],
    ["e2", "e3"],
    ["e3", "e4"],
    ["e4", "e10"],
  ];
  a.step(2);
  close(a.s.entities[2].water, 14);
  close(a.s.entities[9].water, 0);
  close(I.edgeFlow(a.s, "e3", "e4"), 0);
  const snapshot = a.serialize();
  assert.equal(a.command({ type: "connect", id: "e3", to: "e10" }).ok, false);
  assert.deepEqual(a.serialize(), snapshot);
});
test("Full cisterns, wet pots, empty sources and disconnections produce no phantom flow", () => {
  const full = fixture();
  full.s.entities[2].water = 160;
  full.s.entities[5].plant.moisture = 90;
  full.step(1);
  for (const l of full.s.links) close(I.edgeFlow(full.s, ...l), 0);
  assert.equal(full.s.entities[0].running, false);
  const empty = fixture();
  empty.s.links = empty.s.links.filter((l) => !l.includes("e1"));
  empty.s.entities[2].water = 0;
  empty.step(1);
  for (const l of empty.s.links) close(I.edgeFlow(empty.s, ...l), 0);
  const g = fixture();
  g.step(1);
  assert.ok(I.edgeFlow(g.s, "e3", "e4") > 0);
  assert.equal(g.command({ type: "disconnect", id: "e3", to: "e4" }).ok, true);
  for (const l of g.s.links) close(I.edgeFlow(g.s, ...l), 0);
  g.step(1);
  close(I.edgeFlow(g.s, "e5", "e6"), 0);
  assert.ok(
    I.edgeFlow(g.s, "e1", "e2") > 0,
    "The pump can still fill its storage",
  );
});
test("Cycles conserve water, edge volumes cancel correctly and offline simulation uses the same routes", () => {
  const g = fixture();
  g.s.links.push(["e7", "e4"]);
  g.s.entities[8].plant.moisture = 10;
  const before =
    g.s.entities[2].water +
    g.s.entities[5].plant.moisture +
    g.s.entities[8].plant.moisture;
  g.step(1);
  const after =
    g.s.entities[2].water +
    g.s.entities[5].plant.moisture +
    g.s.entities[8].plant.moisture;
  close(after, before + 2 - 0.15);
  for (const pot of ["e6", "e9"])
    close(
      [...I.flowRates(g.s)]
        .filter(([key]) => key.split("|").includes(pot))
        .reduce((n, [, q]) => n + Math.abs(q), 0),
      0.5,
    );
  const shared = fixture();
  shared.s.entities[4].x = 1;
  shared.s.entities[5].x = 1;
  shared.s.entities[5].z = 2.5;
  shared.s.links = [
    ["e1", "e2"],
    ["e2", "e3"],
    ["e2", "e5"],
    ["e5", "e6"],
  ];
  shared.step(1);
  close(
    I.edgeFlow(shared.s, "e2", "e3"),
    1.5,
    "Net flow towards storage, after irrigating .5",
  );
  const a = fixture(),
    b = new GardenState(a.serialize());
  a.step(600);
  b.catchUp(601000);
  a.s.updatedAt = b.s.updatedAt;
  assert.deepEqual(a.serialize(), b.serialize());
  for (const l of a.s.links)
    close(I.edgeFlow(a.s, ...l), I.edgeFlow(b.s, ...l));
});
