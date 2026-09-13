const assert = require("node:assert/strict");
module.exports = async function runB(p, old, mobile, errors) {
  const click = async (id) => {
    await p.waitForFunction(
      (id) => __hud.buttons.some((b) => b.id === id && !b.disabled),
      id,
    );
    const pt = await p.evaluate((id) => {
      const b = __hud.buttons.find((b) => b.id === id);
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }, id);
    if (mobile) await p.touchscreen.tap(pt.x, pt.y);
    else await p.mouse.click(pt.x, pt.y);
    await p.waitForTimeout(130);
  };
  const frozen = await p.evaluate(() => ({ ...__view.position }));
  await p.keyboard.down("ArrowDown");
  await p.waitForTimeout(1200);
  await p.keyboard.up("ArrowDown");
  assert.deepEqual(await p.evaluate(() => ({ ...__view.position })), frozen);
  for (const species of require("../public/game/data.js").species) {
    await p.evaluate((id) => {
      const e = __view.game.s.entities[0];
      e.plant.species = id;
      e.plant.growth = 1;
      __view.sync();
      __view.frame(0.016, {}, true);
      __view.inspect(e);
    }, species.id);
    await p.waitForTimeout(100);
    await p.screenshot({
      path: `/tmp/garden-inspect-${mobile ? "mobile" : "desktop"}-${species.id}.png`,
    });
    assert.equal(
      await p.evaluate(() => __view.models.get("e1").species),
      species.id,
    );
    for (let angle = 1; angle < 4; angle++) {
      await click("inspect-right");
      await p.screenshot({
        path: `/tmp/garden-inspect-${mobile ? "mobile" : "desktop"}-${species.id}-${angle}.png`,
      });
    }
    await click("inspect-right");
  }
  await click("inspect-right");
  await click("close");
  assert.equal(await p.evaluate(() => __view.inspection), null);
  assert.equal(await p.evaluate(() => __view.span), old.span);
  assert.equal(await p.evaluate(() => __view.angle), old.angle);
  await p.evaluate(() => {
    __view.game.s.elapsed = 750;
    __view.game.s.remainder = 0;
  });
  await p.waitForTimeout(200);
  const lights = await p.evaluate(() => ({
    enabled: __view.renderer.shadowMap.enabled,
    quality: __view.quality,
    sun: __view.sun.intensity,
    moon: __view.moon.intensity,
    locals: __view.localLights.filter((l) => l.intensity > 0).length,
    shadows: __view.localLights.filter((l) => l.castShadow).length,
    shadowCrowns: __view.shadowCrowns.count,
    crowns: __view.crowns.count + __view.fadedCrowns.count,
  }));
  assert.equal(lights.enabled, true);
  assert.equal(lights.sun, 0);
  assert.ok(lights.moon > 0);
  assert.equal(lights.locals, 4);
  assert.equal(lights.shadows, mobile ? 1 : 2);
  assert.equal(lights.shadowCrowns, lights.crowns);
  await p.screenshot({
    path: `/tmp/garden-night-${mobile ? "mobile" : "desktop"}.png`,
  });
  // Pause controls the same saved clock; inspection itself did not pause simulation.
  await click("open-settings");
  await click("row-3");
  const paused = await p.evaluate(
    () => __view.game.s.elapsed + __view.game.s.remainder,
  );
  await p.waitForTimeout(1100);
  assert.equal(
    await p.evaluate(() => __view.game.s.elapsed + __view.game.s.remainder),
    paused,
  );
  await click("row-3");
  await click("close");
  for (const [name, time] of [
    ["dawn", 1100],
    ["noon", 150],
    ["sunset", 400],
    ["moon", 750],
  ]) {
    await p.evaluate((time) => {
      __view.game.s.elapsed = time;
      __view.game.s.remainder = 0;
    }, time);
    await p.waitForTimeout(150);
    await p.screenshot({
      path: `/tmp/garden-light-${mobile ? "mobile" : "desktop"}-${name}.png`,
    });
  }
  for (const water of [0, 16, 80, 160])
    for (let angle = 0; angle < 4; angle++) {
      await p.evaluate(
        ({ water, angle }) => {
          const e = __view.game.s.entities.find((e) => e.id === "e5");
          e.water = water;
          __view.position = { x: -8, z: 2 };
          __view.angle = (angle * Math.PI) / 2;
          __view.span = 7;
          __view.game.s.elapsed = 150;
          __view.frame(0.016, {}, true);
        },
        { water, angle },
      );
      await p.waitForTimeout(70);
      await p.screenshot({
        path: `/tmp/garden-tank-${mobile ? "mobile" : "desktop"}-${water}-${angle}.png`,
      });
    }
  assert.deepEqual(errors, []);
  console.log("PASS living garden " + (mobile ? "mobile" : "desktop"), lights);
  await p.close();
};
