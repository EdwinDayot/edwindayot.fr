const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fixture = require("./fixtures/water.cjs");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/garden.js", (r) =>
      r.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await p.goto(url);
    await p.waitForFunction(() => window.GardenView);
    const result = await p.evaluate((saved) => {
      const game = new GardenRules.GardenState(saved),
        view = new GardenView(document.getElementById("garden-world"), game);
      view.span = 12;
      view.position = { x: 0, z: 4 };
      game.step(1);
      view.sync();
      view.frame(0.1, { x: 0, z: 0 }, false);
      const before = view.flows.map((f) => f.bead.position.clone());
      view.frame(0.1, { x: 0, z: 0 }, false);
      const checks = view.flows.map((f, i) => {
        const rate = GardenIrrigation.edgeFlow(game.s, f.a.id, f.b.id),
          active = Math.abs(rate) > 1e-9,
          arrowDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(
            f.arrow.quaternion,
          ),
          movement = f.bead.position.clone().sub(before[i]);
        return {
          edge: [f.a.id, f.b.id],
          rate,
          displayRate: f.rate,
          bead: f.bead.visible,
          arrow: f.arrow.visible,
          movingForward: !active || movement.dot(arrowDirection) > 0,
        };
      });
      view.frame(0.1, { x: 0, z: 0 }, true);
      const reduced = view.flows.every(
        (f) => !f.bead.visible && f.arrow.visible === Math.abs(f.rate) > 1e-9,
      );
      game.command({ type: "disconnect", id: "e3", to: "e4" });
      view.sync();
      view.frame(0.1, { x: 0, z: 0 }, false);
      const cleared = view.flows.every(
        (f) => !f.bead.visible && !f.arrow.visible,
      );
      game.step(1);
      view.sync();
      view.frame(0.1, { x: 0, z: 0 }, false);
      const disconnected = view.flows
        .filter(
          (f) =>
            ["e4", "e5", "e6"].includes(f.a.id) &&
            ["e4", "e5", "e6"].includes(f.b.id),
        )
        .every((f) => !f.arrow.visible);
      window.waterView = view;
      return { checks, reduced, cleared, disconnected };
    }, fixture().serialize());
    for (const c of result.checks) {
      assert.equal(c.displayRate, c.rate);
      assert.equal(c.bead, Math.abs(c.rate) > 1e-9);
      assert.equal(c.arrow, Math.abs(c.rate) > 1e-9);
      assert.ok(c.movingForward, JSON.stringify(c));
    }
    assert.equal(
      result.checks.filter((c) => c.rate < 0).length,
      5,
      "Five reverse-clicked hoses flow against their storage order",
    );
    assert.equal(
      result.checks.filter((c) => c.rate === 0).length,
      3,
      "Unused branches remain still",
    );
    assert.ok(result.reduced && result.cleared && result.disconnected);
    assert.deepEqual(errors, []);
    await p.evaluate(() => {
      document.getElementById("garden-fallback").hidden = true;
    });
    await p.screenshot({ path: "/tmp/garden-water-direction.png" });
    console.log(
      "PASS browser: signed pipe flow, correct arrows and moving droplets, dry/wet branches, reduced motion and immediate disconnection.",
    );
    await p.reload();
    await p.waitForFunction(() => window.GardenView);
    const chain = await p.evaluate((saved) => {
      const game = new GardenRules.GardenState(saved),
        view = new GardenView(document.getElementById("garden-world"), game);
      view.span = 12;
      view.position = { x: -1, z: 3 };
      // Reconnect through the same command used by the hose tool, from downstream to upstream.
      game.command({ type: "disconnect", id: "e4", to: "e6" });
      const connected = game.command({
        type: "connect",
        id: "e6",
        to: "e4",
      }).ok;
      const pots = game.s.entities.filter(GardenIrrigation.isPot);
      pots[0].plant.moisture = 90;
      pots[1].plant.moisture = 90;
      game.step(1);
      view.sync();
      view.frame(0.1, { x: 0, z: 0 }, false);
      const before = view.flows.map((f) => f.bead.position.clone());
      view.frame(0.1, { x: 0, z: 0 }, false);
      const flowing = view.flows
        .filter((f) => f.arrow.visible)
        .map((f) => [f.a.id, f.b.id]);
      const forward = view.flows.every(
        (f, i) =>
          !f.arrow.visible ||
          f.bead.position
            .clone()
            .sub(before[i])
            .dot(
              new THREE.Vector3(0, 1, 0).applyQuaternion(f.arrow.quaternion),
            ) > 0,
      );
      const downstream = pots[2].plant.moisture;
      document.getElementById("garden-fallback").hidden = true;
      return { connected, flowing, forward, downstream };
    }, require("./fixtures/drip-chain.cjs")().serialize());
    assert.ok(chain.connected && chain.forward);
    assert.ok(chain.downstream > 10);
    assert.deepEqual(
      chain.flowing.map((l) => l.slice().sort().join("|")).sort(),
      ["e1|e2", "e2|e4", "e4|e6", "e6|e7"],
    );
    assert.deepEqual(errors, []);
    await p.screenshot({ path: "/tmp/garden-drip-chain.png" });
    console.log(
      "PASS browser: three drips in series, reverse-clicked connection, downstream watering through wet upstream pots, arrows and droplets follow the water.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
