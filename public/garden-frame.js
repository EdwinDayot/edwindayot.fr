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
    Clock = GardenCampaignClock,
    $ = (id) => document.getElementById(id);
  A.frame = function frame(now) {
    const raw = (now - A.last) / 1000;
    A.last = now;
    const dt = Math.min(raw, 0.08);
    if (!document.hidden) {
      if (!A.paused) {
        A.game.step(Math.min(raw, D.OFFLINE_CAP));
        A.saveClock += dt;
        // Epic C2.2v: campaign-clock.js wired into the live loop. s.campaignClock is plain,
        // persisted data that commands already write directly (garden-state-cmd-k.js's
        // beginTeaching/cancelTeaching/confirmTeaching pause/resume it; garden-state-cmd-f.js's
        // sleep resets gameSeconds to 0 every night) — A.campaignClock is resynced from that
        // state every frame before ticking, so none of those writes are ever overridden here,
        // and only its actually-advanced gameSeconds is written back. Design §3: dialogues,
        // inventaire, construction, carnet et apprentissage pausent le temps — every one of
        // those already means A.panel or A.build is truthy here (teaching's own pause already
        // lives on s.campaignClock.paused itself), so gating on those two flags covers the
        // whole list without a per-panel switch.
        A.campaignClock.activeSeconds = A.game.s.campaignClock.activeSeconds;
        A.campaignClock.gameSeconds = A.game.s.campaignClock.gameSeconds;
        A.campaignClock.paused =
          A.game.s.campaignClock.paused || !!A.panel || !!A.build;
        if (A.campaignClock.tick(now))
          A.game.s.campaignClock.gameSeconds = A.campaignClock.gameSeconds;
        // Nightfall (design §3, epics C2.2/C2.2v): the in-progress build is cancelled at no
        // cost, a scripted camera transition brings the view to the refuge house, and the
        // "nightfall" HUD panel is (re)opened for as long as gameSeconds stays at the day's
        // cap — it stays open even if the player forces it shut (Escape), since nothing else
        // in this atomic transition can proceed until "sleep" actually resolves the night.
        const nightfall =
          A.game.s.campaignClock.gameSeconds >= Clock.DAY_SECONDS;
        if (nightfall && !A.nightSequence) {
          A.nightSequence = true;
          if (A.build) A.cancelBuild();
          A.view.beginNightfallTransition();
        } else if (!nightfall && A.nightSequence) {
          A.nightSequence = false;
          A.view.endNightfallTransition();
        }
        if (nightfall && A.panel !== "nightfall") A.openPanel("nightfall");
        // Epic C5.14: a staged gesture scene ends itself after its own brief, fixed duration
        // (render-items.js's beginGestureScene) and hands control back to the player — the
        // player can also end it sooner via Échap/closePanel (garden-cmd.js). Guarded the same
        // way nightfall's own block above is (inside "not paused"), since a paused game already
        // freezes this.time via view.frame's own dt.
        if (
          A.view.gestureScene &&
          A.view.time - A.view.gestureScene.start > A.view.gestureScene.duration
        ) {
          A.view.endGestureScene();
          if (A.panel === "gesture-scene") A.closePanel();
        }
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
        gestureScene: A.view.gestureScene,
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
