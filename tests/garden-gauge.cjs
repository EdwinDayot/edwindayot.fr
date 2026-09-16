const { test } = require("node:test");
const assert = require("node:assert/strict");
const Gauge = require("../public/game/gauge.js");
const D = require("../public/game/data.js");

test("Tank gauge is a fraction of 160 with the water tone", () => {
  const g = Gauge.tank({ water: 34 });
  assert.equal(g.text, "34/160");
  assert.ok(Math.abs(g.fraction - 34 / 160) < 1e-9);
  assert.equal(g.tone, "water");
});

test("Plant gauge follows moisture and turns amber under 20%", () => {
  const wet = Gauge.plant({ moisture: 62 }),
    dry = Gauge.plant({ moisture: 12 });
  assert.equal(wet.tone, "water");
  assert.equal(dry.tone, "amber");
  assert.equal(dry.fraction, 0.12);
  assert.equal(dry.text, "12 %");
});

test("Resource gauge shows renewal countdown while cooling and work progress once ready", () => {
  const spec = D.mining.wood,
    cooling = Gauge.resource(spec, { ready: 130, work: 0 }, 90),
    ready = Gauge.resource(spec, { ready: 0, work: 2 }, 90);
  assert.equal(cooling.tone, "growth");
  assert.equal(cooling.text, "40 s");
  assert.equal(ready.tone, "ready");
  assert.equal(ready.text, `2/${spec.hits}`);
  assert.equal(ready.fraction, 2 / spec.hits);
});

test("Nursery gauge fills over the balance duration and reports null without a job", () => {
  assert.equal(Gauge.nursery(null), null);
  const seconds = D.balance.nurserySeconds,
    g = Gauge.nursery({ species: "pilea", remaining: seconds - 5 });
  assert.ok(Math.abs(g.fraction - 5 / seconds) < 1e-9);
  assert.equal(g.text, `${seconds - 5} s`);
  const done = Gauge.nursery({ species: "pilea", remaining: 0 });
  assert.equal(done.fraction, 1);
  assert.equal(done.text, "Prêt");
});

test("Collector gauge totals the buffer out of 24", () => {
  const g = Gauge.collector({ buffer: { coins: 3, wood: 5 } });
  assert.equal(g.text, "8/24");
  assert.equal(g.tone, "amber");
});
