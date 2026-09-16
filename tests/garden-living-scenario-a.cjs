const assert = require("node:assert/strict");
const { GardenState } = require("../public/garden-state.js");
module.exports = async function runA(browser, url, mobile) {
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
  assert.equal(await p.evaluate(() => __view.models.get("e4").cutting), null);
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
  if (mobile) await click("inspect");
  else await p.keyboard.press("v");
  await p.waitForFunction(() => !!__view.inspection);
  await p.waitForTimeout(200);
  return { p, old, errors };
};
