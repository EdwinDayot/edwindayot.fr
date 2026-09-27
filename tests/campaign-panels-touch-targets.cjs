const { test } = require("node:test");
const assert = require("node:assert/strict");

/* Epic C7.12 (docs/campagne-backlog.md): hud-widgets.js's button() already clamps every button
   to a 44×44 floor (`w = Math.max(44, w); h = Math.max(44, h);`, ahead of any drawing call) — an
   invariant no test positively exercised before this epic. Loading hud.js/hud-widgets.js directly
   in Node (no browser/canvas) locks that floor at its source: real Node/DOM-free instance, no
   reimplementation of the clamp logic. Both files are plain IIFEs written for the browser (bare
   `GardenData`/`window` references, no `module.exports` branch, unlike every other public/game/
   file) — global.window is pointed at global itself so `window.GardenHUD = GardenHUD` lands where
   this file can reach it, and global.GardenData is set before either file loads since
   hud-widgets.js bails out early (`if (!D || !G) return;`) without it. box()/text() (real drawing,
   real canvas 2d calls) are stubbed as no-ops on the fake `this` passed to button() — this test
   locks the floor computed before any drawing happens, not the rendering itself (already exercised
   by tests/campaign-panels-touch-browser.cjs, which runs the real canvas). */
global.window = global;
global.GardenData = {};
require("../public/game/hud.js");
require("../public/game/hud-widgets.js");
const GardenHUD = global.GardenHUD;
assert.ok(typeof GardenHUD === "function", "hud.js must have set window.GardenHUD");
assert.ok(
  typeof GardenHUD.prototype.button === "function",
  "hud-widgets.js must have attached button() to GardenHUD.prototype (GardenData was falsy?)",
);

function fakeHud() {
  return {
    buttons: [],
    hover: null,
    focus: -1,
    keyboard: false,
    palette: { ink: "#000" },
    box() {},
    text() {},
  };
}

test("button() floors width and height to 44 even when asked for smaller, zero, or negative values", () => {
  const hud = fakeHud();
  for (const [w, h] of [
    [10, 10],
    [0, 0],
    [-5, -5],
    [43, 43],
    [1, 44],
    [44, 1],
  ]) {
    const b = GardenHUD.prototype.button.call(
      hud,
      "id-" + w + "-" + h,
      "Label",
      0,
      0,
      w,
      h,
    );
    assert.equal(b.w, 44, `w=${w} must floor to 44`);
    assert.equal(b.h, 44, `h=${h} must floor to 44`);
  }
});

test("button() never shrinks a request already at or above the floor", () => {
  const hud = fakeHud();
  const b = GardenHUD.prototype.button.call(hud, "big", "Label", 0, 0, 120, 60);
  assert.equal(b.w, 120);
  assert.equal(b.h, 60);
});

test("button() registers every call on this.buttons, at the floored size, regardless of caller", () => {
  const hud = fakeHud();
  GardenHUD.prototype.button.call(hud, "a", "A", 0, 0, 10, 10);
  GardenHUD.prototype.button.call(hud, "b", "B", 0, 0, 200, 5);
  assert.equal(hud.buttons.length, 2);
  assert.deepEqual(
    hud.buttons.map((b) => [b.id, b.w, b.h]),
    [
      ["a", 44, 44],
      ["b", 200, 44],
    ],
  );
});
