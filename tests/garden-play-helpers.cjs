const assert = require("node:assert/strict");
module.exports = function make(browser, url, errors) {
  const state = (p) => p.evaluate(() => __view.game.serialize());
  async function page(options = {}) {
    const p = await browser.newPage(options);
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    // Read-only hit-area and projection hooks. All state changes use keyboard, mouse or touch.
    await p.addInitScript(() => {
      for (const [name, key] of [
        ["GardenView", "__view"],
        ["GardenHUD", "__hud"],
      ]) {
        let Wrapped;
        Object.defineProperty(window, name, {
          configurable: true,
          get: () => Wrapped,
          set: (Base) => {
            Wrapped = class extends Base {
              constructor(...args) {
                super(...args);
                window[key] = this;
              }
            };
          },
        });
      }
    });
    await p.goto(url);
    await p.waitForFunction(() => window.__hud?.model);
    return p;
  }
  async function button(p, id) {
    await p.waitForFunction(
      (id) => __hud.buttons.some((b) => b.id === id && !b.disabled),
      id,
    );
    return p.evaluate((id) => {
      const b = __hud.buttons.find((b) => b.id === id);
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }, id);
  }
  async function click(p, id, touch = false) {
    const b = await button(p, id);
    if (touch) await p.touchscreen.tap(b.x, b.y);
    else await p.mouse.click(b.x, b.y);
    await p.waitForTimeout(80);
  }
  async function point(p, obj) {
    return p.evaluate((obj) => __view.screenPoint(obj, 0), obj);
  }
  async function use(p, id) {
    const e = await p.evaluate(
      (id) =>
        __view.game.s.entities.find((e) => e.id === id) ||
        __view.game.s.resources.find((e) => e.id === id) ||
        GardenData.visitors.find((e) => e.id === id) ||
        (id === "river" ? { x: 3.5, z: 4 } : null),
      id,
    );
    const xy = await point(p, e);
    console.log("use", id);
    await p.mouse.click(xy.x, xy.y);
    await p.waitForFunction(() => !__view.routes.length, null, {
      timeout: 25000,
    });
    await p.waitForTimeout(350);
  }
  async function equip(p, item, slot, craft = false) {
    await p.keyboard.press("i");
    await p.waitForFunction(() => __hud.model.panel === "inventory");
    await click(p, craft ? "tab-craft" : "tab-bag");
    await click(p, "item-" + item);
    await p.keyboard.press(String(slot));
    assert.equal((await state(p)).hotbar[slot - 1], item);
    await p.keyboard.press("i");
    await p.waitForFunction(() => __hud.model.panel === "");
    await p.keyboard.press(String(slot));
  }
  async function place(p, x, z) {
    const pt = await point(p, { x, z });
    await p.mouse.move(pt.x, pt.y);
    await p.waitForTimeout(300);
    assert.equal(
      await p.evaluate(() => __hud.model.build?.error),
      null,
      await p.evaluate(() =>
        JSON.stringify({ build: __hud.model.build, position: __view.position }),
      ),
    );
    await p.keyboard.press("e");
    await p.waitForTimeout(200);
  }
  return { state, page, button, click, point, use, equip, place };
};
