const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";
(async () => {
  const b = await chromium.launch({
    headless: true,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    const p = await b.newPage({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() => {
      for (const [name, key] of [
        ["GardenView", "__view"],
        ["GardenHUD", "__hud"],
      ]) {
        let Wrapped;
        Object.defineProperty(window, name, {
          get: () => Wrapped,
          set: (Base) =>
            (Wrapped = class extends Base {
              constructor(...args) {
                super(...args);
                window[key] = this;
              }
            }),
        });
      }
    });
    await p.goto(url);
    await p.waitForFunction(() => window.__hud?.model);
    const click = async (id) => {
      await p.waitForFunction(
        (id) => __hud.buttons.some((b) => b.id === id && !b.disabled),
        id,
      );
      const pt = await p.evaluate((id) => {
        const b = __hud.buttons.find((b) => b.id === id);
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      }, id);
      await p.mouse.click(pt.x, pt.y);
      await p.waitForTimeout(100);
    };
    await click("open-settings");
    await click("row-0");
    assert.equal(await p.evaluate(() => __view.game.s.settings.sound), true);
    await click("row-0");
    const download = p.waitForEvent("download");
    await click("row-4");
    const file = await download,
      stream = await file.createReadStream(),
      chunks = [];
    for await (const c of stream) chunks.push(c);
    const raw = Buffer.concat(chunks);
    assert.equal(JSON.parse(raw).version, 3);
    await click("next");
    let chooser = p.waitForEvent("filechooser");
    await click("row-0");
    await (
      await chooser
    ).setFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
    await p.waitForFunction(() => __hud.model.toast.includes("Import refusé"));
    assert.equal(await p.evaluate(() => __hud.model.importReady), false);
    chooser = p.waitForEvent("filechooser");
    await click("row-0");
    await (
      await chooser
    ).setFiles({
      name: "garden.json",
      mimeType: "application/json",
      buffer: raw,
    });
    await p.waitForFunction(() => __hud.model.importReady);
    await click("row-0");
    await p.waitForFunction(() => !__hud.model.panel);
    assert.deepEqual(
      await p.evaluate(() => __view.game.s.inventory),
      JSON.parse(raw).inventory,
    );
    await click("open-map");
    const tree = await p.evaluate(() =>
      __view.game.s.resources.find((r) => r.treeId && r.zone === 0),
    );
    let id = null;
    for (let i = 0; i < 20; i++) {
      id = await p.evaluate(
        (target) =>
          __hud.buttons.find((b) => b.action === "go" && b.data.id === target)
            ?.id,
        tree.id,
      );
      if (id) break;
      await click("next");
    }
    assert.ok(id, "A landscape tree has a real mining destination");
    await click(id);
    await p.waitForFunction(() => !__view.routes.length, null, {
      timeout: 30000,
    });
    await p.waitForTimeout(300);
    await p.keyboard.press("3");
    const initial = await p.evaluate(() => __view.game.s.inventory.wood);
    await p.keyboard.down("e");
    await p.waitForFunction(
      (id) =>
        __view.game.s.resources.find((r) => r.id === id).ready >
        __view.game.s.elapsed,
      tree.id,
      { timeout: 7000 },
    );
    await p.keyboard.up("e");
    await p.waitForTimeout(400);
    assert.equal(
      await p.evaluate(() => __view.game.s.inventory.wood),
      initial + 3,
    );
    assert.equal(
      await p.evaluate(
        (id) => __view.treeData.some((t) => t.id === id),
        tree.treeId,
      ),
      false,
      "The actual landscape canopy and trunk disappear",
    );
    assert.equal(
      await p.evaluate(
        (id) => __view.nodes.get(id).userData.depleted.visible,
        tree.id,
      ),
      true,
    );
    await p.screenshot({ path: "/tmp/garden-canvas-landscape-cut.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Canvas settings, audio switch, export, rejected invalid import, confirmed valid import, and cutting an actual landscape tree.",
    );
    await p.evaluate(() => localStorage.clear());
    await p.goto(url);
    await p.waitForFunction(() => window.__hud?.model);
    await p.evaluate(() => {
      const r = __view.game.s.resources.find((q) => q.id === "resource-0-wood");
      if (Math.hypot(r.x - __view.position.x, r.z - __view.position.z) < 1.85)
        throw Error("Expected the resource to be far from the spawn");
      __hud.dispatch("go", { id: "resource-0-wood" });
    });
    await p.waitForFunction(
      () =>
        __view.selected?.id === "resource-0-wood" &&
        __view.routes.length > 0 &&
        __hud.model.context?.go === true,
    );
    const farCtx = await p.evaluate(() => ({
      label: __hud.model.context.label,
      go: __hud.model.context.go,
    }));
    assert.equal(farCtx.go, true);
    assert.notEqual(farCtx.label, "E · Rejoindre");
    assert.match(farCtx.label, /Équiper|Maintenir E|Renouvellement/);
    await p.waitForFunction(
      () => __view.selected?.id === "resource-0-wood" && !__view.routes.length,
      { timeout: 30000 },
    );
    await p.waitForFunction(() => !__hud.model.context?.go);
    assert.match(
      await p.evaluate(() => __hud.model.context.label),
      /Équiper|Maintenir E|Renouvellement/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS Canvas world action: a far target shows its real action, walking then acting on arrival without a redundant Rejoindre button.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
