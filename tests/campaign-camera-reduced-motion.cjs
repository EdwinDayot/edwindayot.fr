const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/* Epic C7.33 (docs/campagne-backlog.md, design §14 accessibilité "réduction du mouvement"). This
   is an audit, not a new feature: render-camera.js's updateCamera(dt, reduced) already makes the
   camera jump instantly to its target under `reduced` (look.lerp(target, reduced ? 1 : 1 -
   Math.exp(-dt*5)), same for camera.position) — true by construction since C5.14/C6.21 gave every
   scripted-camera target (gestureScene, the current epilogue shot) the same single lerp call as
   `inspection`, with no per-target branch. Nothing here changes production behaviour: every
   assertion below calls the real, unmodified updateCamera against a minimal object carrying only
   the fields it reads (same posture as tests/campaign-panels-touch-targets.cjs for hud.js). */

global.window = global;
global.GardenModels = {}; // M in render-camera.js's guard — never read by updateCamera itself.
global.GardenBotany = {}; // B in the guard — same, never read by updateCamera itself.
global.THREE = require("../public/vendor/three.min.js");
function GardenView() {}
global.GardenView = GardenView;
require("../public/game/render-camera.js");
const T = global.THREE;

assert.ok(
  typeof GardenView.prototype.updateCamera === "function",
  "render-camera.js must have attached updateCamera() to GardenView.prototype (a guard var was falsy?)",
);

// A minimal object carrying only the fields updateCamera(dt, reduced) actually reads, on the
// model of the real GardenView instance it is normally called against.
function freshView(overrides) {
  return Object.assign(
    {
      look: new T.Vector3(0, 0, 0),
      camera: new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
      angle: 0,
      ratio: 1,
      span: 20,
      overview: false,
      position: { x: 0, z: 0 },
      inspection: null,
      gestureScene: null,
      nightfall: null,
      currentEpilogueShot() {
        return null;
      },
    },
    overrides,
  );
}

function exerciseTarget(label, overrides, target) {
  test(`${label}: reduced:false lets the camera glide (partial move after one frame)`, () => {
    const view = freshView(overrides);
    const startDistance = view.look.distanceTo(target);
    assert.ok(startDistance > 0, "test setup: look must start away from the target");
    const dt = 1 / 20; // a realistic, not vanishingly small, frame time
    GardenView.prototype.updateCamera.call(view, dt, false);
    const remaining = view.look.distanceTo(target);
    // look.lerp(target, 1 - Math.exp(-dt*5)) leaves a fraction Math.exp(-dt*5), strictly between
    // 0 and 1 for any finite dt > 0 — the camera must be under way, never arrived, never frozen.
    const expectedFactor = Math.exp(-dt * 5);
    assert.ok(expectedFactor > 0 && expectedFactor < 1, "test setup: lerp factor must be strictly between 0 and 1");
    assert.ok(remaining > 1e-6, `${label}: camera must not have reached the target yet under reduced:false`);
    assert.ok(remaining < startDistance, `${label}: camera must have moved closer to the target`);
    assert.ok(
      Math.abs(remaining - startDistance * expectedFactor) < 1e-9,
      `${label}: remaining distance must match the documented exp(-dt*5) glide exactly`,
    );
  });

  test(`${label}: reduced:true snaps the camera to the target in a single call`, () => {
    const view = freshView(overrides);
    const startDistance = view.look.distanceTo(target);
    assert.ok(startDistance > 0, "test setup: look must start away from the target");
    GardenView.prototype.updateCamera.call(view, 1 / 20, true);
    assert.ok(
      view.look.distanceTo(target) < 1e-9,
      `${label}: look must land exactly on the target in one call under reduced:true`,
    );
    // camera.position lerps toward look + a fixed offset, not toward `target` itself — recompute
    // that same offset the way updateCamera does, rather than assuming an unrelated value.
    const camTarget = target
      .clone()
      .add(
        new T.Vector3(
          Math.sin(view.angle) * 16,
          14,
          Math.cos(view.angle) * 16,
        ),
      );
    assert.ok(
      view.camera.position.distanceTo(camTarget) < 1e-9,
      `${label}: camera.position must land exactly on its target in one call under reduced:true`,
    );
  });
}

// gestureScene (Epic C5.14): the trajectory-teaching mise-en-scène camera target.
exerciseTarget(
  "gestureScene",
  {
    look: new T.Vector3(-30, 5, -30),
    camera: (() => {
      const c = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      c.position.set(-46, 19, -14);
      return c;
    })(),
    gestureScene: { center: new T.Vector3(5, 0, 5), span: 10 },
  },
  new T.Vector3(5, 0, 5),
);

// The current epilogue shot (Epic C6.21): currentEpilogueShot() is stubbed to return a fixed
// plan, exactly the shape render-items.js's real derivation returns — never a second,
// independent re-derivation of that logic in this test.
exerciseTarget(
  "epilogueShot (currentEpilogueShot())",
  {
    look: new T.Vector3(40, -8, 12),
    camera: (() => {
      const c = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      c.position.set(24, 6, 28);
      return c;
    })(),
    currentEpilogueShot() {
      return { center: new T.Vector3(-2, 0.9, 7), span: 9 };
    },
  },
  new T.Vector3(-2, 0.9, 7),
);

// --- Static read of the real file: frame() must keep calling updateCamera unconditionally ---

test("render.js's frame() calls updateCamera(dt, reduced) unconditionally, with no free-garden/campaign branch", () => {
  const renderSrc = fs.readFileSync(
    path.join(__dirname, "../public/game/render.js"),
    "utf8",
  );
  // Exactly one call site in this file (render-camera.js defines the method itself, in a
  // different file, and is not read here).
  const calls = renderSrc.match(/\.updateCamera\(/g) || [];
  assert.equal(calls.length, 1, "frame() must call updateCamera exactly once");
  // The two lines around it, unmodified and at the method's own indentation: proof the call is a
  // plain sequential statement, never nested inside an added conditional block (which would
  // change either the indentation or break up this exact two-line sequence). A future epic that
  // wraps this call in an `if (campaign-mode)` branch changes this snippet and fails this test,
  // rather than silently narrowing the accessibility guarantee to one mode only.
  const unconditionalSequence =
    "      this.updateCamera(dt, reduced);\n      this.updateFlows(reduced);\n";
  assert.ok(
    renderSrc.includes(unconditionalSequence),
    "updateCamera(dt, reduced) must be called as a plain statement, immediately before updateFlows(reduced), at the same indentation — no per-mode branch",
  );
});
