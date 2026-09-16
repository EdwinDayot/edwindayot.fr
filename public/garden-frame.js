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
  A.frame = function frame(now) {
    const raw = (now - A.last) / 1000;
    A.last = now;
    const dt = Math.min(raw, 0.08);
    if (!document.hidden) {
      if (!A.paused) {
        A.game.step(Math.min(raw, D.OFFLINE_CAP));
        A.saveClock += dt;
      }
      if (A.saveClock > 5) {
        A.saveClock = 0;
        A.save();
      }
      A.syncClock += dt;
      if (A.syncClock > 0.25) {
        A.syncClock = 0;
        A.view.sync();
        if (A.build) A.updateBuild();
      }
      const axis =
        A.paused || A.panel
          ? { x: 0, z: 0 }
          : {
              x:
                Number(A.keys.has("right")) -
                Number(A.keys.has("left")) +
                A.stick.x,
              z:
                Number(A.keys.has("down")) -
                Number(A.keys.has("up")) +
                A.stick.z,
              sprint: A.keys.has("sprint"),
            };
      if (A.paused || A.panel) A.view.routes = [];
      const before = { ...A.view.position };
      A.view.frame(dt, axis, A.reduced.matches || A.game.s.settings.reduced);
      if (
        C.distance(before, A.view.position) > 0.005 &&
        now - A.lastStep > 360
      ) {
        A.sound("step");
        A.lastStep = now;
      }
      if ((axis.x || axis.z) && !A.build) {
        const near = A.view.targetAt(A.view.position);
        if (near) {
          A.selected = near;
          A.view.selected = near;
        }
      }
      if (A.build && A.pointer && !A.ui.hover && !A.panel) {
        const p = A.view.pick(A.pointer.x, A.pointer.y);
        if (
          p &&
          (Math.round(p.x * 2) / 2 !== A.build.x ||
            Math.round(p.z * 2) / 2 !== A.build.z)
        )
          A.aim(A.pointer.x, A.pointer.y);
      }
      if (A.pendingAction && !A.view.routes.length) {
        const id = A.pendingAction;
        A.pendingAction = null;
        if (
          A.selected?.id === id &&
          C.distance(A.view.position, A.selected) < 1.85
        )
          A.act();
      }
      if (
        !A.panel &&
        !A.paused &&
        !A.build &&
        (A.keys.has("act") || A.holdMine) &&
        now >= A.nextMine &&
        A.context().command === "mine"
      )
        A.act();
      if (now > A.toastUntil) A.toast = "";
      const s = A.game.s,
        c = A.context(),
        zone = C.zoneAt(A.view.position.x, A.view.position.z);
      A.ui.draw({
        s,
        activeSlot: A.activeSlot,
        held: A.held(),
        panel: A.panel,
        tab: A.tab,
        item: A.inventoryItem,
        selected: A.selected,
        build: A.build,
        context: c,
        canMove: A.canMove(),
        network: A.view.network,
        stick: A.stick,
        touch: A.touch,
        paused: A.paused,
        toast: A.toast,
        toastUntil: A.toastUntil,
        importReady: !!A.importReady,
        cutting: A.cutting,
        reduced: A.reduced.matches || s.settings.reduced,
        pressed: !!A.press || A.keys.has("act"),
        zone: zone?.name || "Le jardin",
        worldLabel: A.selected?.id.startsWith("resource-")
          ? D.mining[A.selected.type].name
          : A.name(A.selected),
        hint: "Hache · arbres     Pioche · pierre     Pelle · argile     Maintiens E pour travailler",
      });
      const accessible = `${s.inventory.coins} feuilles. ${A.view.lighting?.height >= 0 ? "Jour" : "Nuit"}. ${A.selected ? c.status + ". " + c.label + ". " + (!A.selected.id.startsWith("zone-") ? "V inspecter. " : "") : ""}I inventaire. E agir ou maintenir. F déplacer.`;
      if (A.canvas.getAttribute("aria-label") !== accessible)
        A.canvas.setAttribute("aria-label", accessible);
      if (!A.paused) A.view.adaptQuality(raw);
    }
    requestAnimationFrame(A.frame);
  };
})();
