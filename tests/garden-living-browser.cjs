const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { GardenState } = require("../public/garden-state.js");
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
    for (const mobile of [false, true]) {
      const errors = [],
        g = new GardenState();
      g.s.player = { x: -5, z: 1 };
      g.s.inventory["cutting:monstera"] = 2;
      g.s.inventory["cutting:pilea"] = 1;
      g.s.entities.push(
        { id: "e4", type: "nursery", x: -6, z: 1, rotation: 0, stored: false },
        {
          id: "e5",
          type: "tank",
          x: -8,
          z: 1,
          rotation: 0,
          stored: false,
          water: 80,
        },
        ...[
          [-4, 2],
          [-4, 4],
          [-7, 4],
          [-9, 4],
        ].map(([x, z], i) => ({
          id: "e" + (6 + i),
          type: "lantern",
          x,
          z,
          rotation: 0,
          stored: false,
        })),
      );
      g.s.nextId = 10;
      const p = await browser.newPage({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await p.addInitScript((state) => {
        localStorage.setItem("edwin-garden-v3", JSON.stringify(state));
        for (const [name, key] of [
          ["GardenView", "__view"],
          ["GardenHUD", "__hud"],
        ]) {
          let W;
          Object.defineProperty(window, name, {
            get: () => W,
            set: (B) =>
              (W = class extends B {
                constructor(...args) {
                  super(...args);
                  window[key] = this;
                }
              }),
          });
        }
      }, g.serialize());
      await p.goto(url);
      await p.waitForFunction(() => window.__hud?.model);
      await p.waitForTimeout(600);
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
      const select = async (id) => {
        const pt = await p.evaluate(
          (id) =>
            __view.screenPoint(
              __view.game.s.entities.find((e) => e.id === id),
              0.72,
            ),
          id,
        );
        if (mobile) await p.touchscreen.tap(pt.x, pt.y);
        else await p.mouse.click(pt.x, pt.y);
        await p.waitForTimeout(350);
      };
      await select("e4");
      await p.waitForFunction(() => __hud.model.panel === "nursery");
      assert.equal(
        await p.evaluate(() => __view.game.s.inventory["cutting:monstera"]),
        2,
      );
      const row = await p.evaluate(
        () => __hud.buttons.find((b) => b.data.species === "monstera").id,
      );
      await click(row);
      assert.equal(
        await p.evaluate(() => __view.game.s.inventory["cutting:monstera"]),
        2,
      );
      await click(row);
      assert.equal(
        await p.evaluate(
          () => __view.game.s.entities.find((e) => e.id === "e4").job.species,
        ),
        "monstera",
      );
      assert.equal(
        await p.evaluate(() => __view.game.s.inventory["cutting:monstera"]),
        1,
      );
      await p.evaluate(() => {
        __view.game.step(180);
        __view.sync();
      });
      await p.waitForTimeout(100);
      assert.equal(
        await p.evaluate(() => __view.game.s.inventory["young:monstera"] || 0),
        0,
      );
      await p.screenshot({
        path: `/tmp/garden-nursery-${mobile ? "mobile" : "desktop"}.png`,
      });
      await click("act");
      assert.equal(
        await p.evaluate(() => __view.game.s.inventory["young:monstera"]),
        1,
      );
      assert.equal(
        await p.evaluate(() => __view.models.get("e4").cutting),
        null,
      );
      // The notebook and V both inspect the real mesh. Use the HUD dispatch for selecting all species in this visual fixture.
      await p.evaluate(() => {
        __view.position = { x: -4, z: 0 };
        __view.routes = [];
        __view.game.s.settings.reduced = true;
      });
      await p.waitForTimeout(200);
      await select("e1");
      await p.waitForFunction(() => __hud.model.selected?.id === "e1");
      const old = await p.evaluate(() => ({
        span: __view.span,
        angle: __view.angle,
        position: { ...__view.position },
      }));
      if (mobile) await click("inspect-plant");
      else await p.keyboard.press("v");
      await p.waitForFunction(() => !!__view.inspection);
      await p.waitForTimeout(200);
      const frozen = await p.evaluate(() => ({ ...__view.position }));
      await p.keyboard.down("ArrowDown");
      await p.waitForTimeout(1200);
      await p.keyboard.up("ArrowDown");
      assert.deepEqual(
        await p.evaluate(() => ({ ...__view.position })),
        frozen,
      );
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
      console.log(
        "PASS living garden " + (mobile ? "mobile" : "desktop"),
        lights,
      );
      await p.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
