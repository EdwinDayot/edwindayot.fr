(() => {
  const A = window.GardenApp;
  if (!A || !A.view) {
    return;
  }
  const D = GardenData,
    C = GardenConstruction,
    I = GardenIrrigation,
    R = GardenRules,
    S = GardenSave,
    $ = (id) => document.getElementById(id);
  A.aim = function aim(x, y) {
    A.pointer = { x, y };
    if (A.build) {
      const p = A.view.pick(x, y);
      if (p) {
        A.build.x = Math.round(p.x * 2) / 2;
        A.build.z = Math.round(p.z * 2) / 2;
        A.updateBuild();
      }
    } else if (A.wireStart) {
      const p = A.view.pick(x, y),
        e = A.view.pickTarget(x, y) || (p && A.view.targetAt(p));
      A.view.connectionPreview(
        A.wireStart,
        e || p,
        !!e && I.canConnect(A.wireStart, e),
      );
    }
  };
  A.worldClick = function worldClick(x, y) {
    if (A.paused) return;
    const p = A.view.pick(x, y);
    if (!p) return;
    if (A.build) {
      A.aim(x, y);
      A.confirmBuild();
      return;
    }
    const found = A.view.pickTarget(x, y) || A.view.targetAt(p);
    if (found) {
      A.selected = found;
      A.view.selected = found;
      if (C.distance(A.view.position, found) < 1.85) A.act();
      else if (A.view.go(found)) A.pendingAction = found.id;
      A.holdMine = found.id.startsWith("resource-");
    } else {
      A.pendingAction = null;
      A.view.terrain(p);
    }
  };
  A.joystick = function joystick(x, y, b) {
    const dx = x - b.x - b.w / 2,
      dz = y - b.y - b.h / 2,
      n = Math.max(26, Math.hypot(dx, dz));
    A.stick.x = Math.abs(dx) > 4 ? dx / n : 0;
    A.stick.z = Math.abs(dz) > 4 ? dz / n : 0;
    A.view.routes = [];
    A.pendingAction = null;
  };
})();
