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
  A.ui = new GardenHUD(A.canvas, A.view, A.dispatch);
  $("import-file").onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2e6) throw Error("Fichier trop volumineux.");
      const raw = await file.text(),
        s = JSON.parse(raw);
      R.validate(s.version === 2 ? R.migrate(s) : s);
      A.importReady = raw;
      A.announce(
        "Fichier valide. Clique à nouveau sur Importer pour confirmer le remplacement. Une copie sera conservée.",
      );
    } catch (e) {
      A.announce("Import refusé : " + e.message);
    } finally {
      e.target.value = "";
    }
  };
  window.addEventListener("keydown", (e) => {
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.target.closest?.(".site-header") ||
      e.target.tagName === "INPUT"
    )
      return;
    const key = /^Digit[1-5]$/.test(e.code)
      ? e.code.slice(-1)
      : e.key.length === 1
        ? e.key.toLowerCase()
        : e.key;
    if (key === "i" && !e.repeat) {
      e.preventDefault();
      A.panel ? A.closePanel() : A.openPanel("inventory");
      return;
    }
    if (key === "Escape") {
      e.preventDefault();
      if (A.panel) A.closePanel();
      else if (A.build) A.cancelBuild();
      else if (A.wireStart) {
        A.wireStart = null;
        A.view.connectionPreview(null, null);
      } else A.openPanel("settings");
      return;
    }
    if (A.panel) {
      if (/^[1-5]$/.test(key) && A.panel === "inventory") {
        e.preventDefault();
        A.dispatch("assign", { slot: +key - 1 });
      } else if (
        ["Tab", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(key)
      ) {
        e.preventDefault();
        A.ui.keyboard = true;
        const delta =
          e.shiftKey || ["ArrowLeft", "ArrowUp"].includes(key) ? -1 : 1;
        A.ui.focus =
          (A.ui.focus + delta + A.ui.buttons.length) % A.ui.buttons.length;
        $("game-announcement").textContent =
          A.ui.buttons[A.ui.focus]?.label ||
          A.ui.buttons[A.ui.focus]?.item ||
          "Objet";
      } else if (key === "Enter" || key === " ") {
        e.preventDefault();
        A.ui.activate(A.ui.buttons[A.ui.focus]);
      }
      return;
    }
    if (key === "Shift") {
      A.keys.add("sprint");
      return;
    }
    if (A.keyMap[key]) {
      e.preventDefault();
      A.keys.add(A.keyMap[key]);
      A.pendingAction = null;
      A.view.routes = [];
      return;
    }
    if (key === "e") {
      e.preventDefault();
      A.keys.add("act");
      if (!e.repeat) A.act();
      return;
    }
    if (e.repeat) return;
    if (/^[1-5]$/.test(key)) {
      e.preventDefault();
      A.selectSlot(+key - 1);
    } else if (key === "Enter") {
      e.preventDefault();
      A.act();
    } else if (key === "v" && A.selected?.plant)
      A.dispatch("inspect", { id: A.selected.id });
    else if (key === "f") A.dispatch("move");
    else if (key === "g") A.dispatch("store");
    else if (key === "r") A.dispatch("rotate");
    else if (key === "n") A.dispatch("network");
    else if (key === "j") A.openPanel("notebook");
    else if (key === "m") A.openPanel("map");
  });
  addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    A.keys.delete(
      e.key === "Shift"
        ? "sprint"
        : key === "e"
          ? "act"
          : A.keyMap[e.key] || A.keyMap[key],
    );
  });
  addEventListener("blur", A.resetInput);
  A.canvas.onpointerdown = (e) => {
    if (e.button === 2) return;
    A.canvas.focus({ preventScroll: true });
    A.canvas.setPointerCapture(e.pointerId);
    A.ui.keyboard = false;
    const b = A.ui.hit(e.clientX, e.clientY);
    A.press = { id: e.pointerId, x: e.clientX, y: e.clientY, button: b };
    if (b?.action === "joystick") A.joystick(e.clientX, e.clientY, b);
    else if (b?.action === "act") {
      A.act();
      A.holdMine = A.selected?.id.startsWith("resource-");
    } else if (!b && !A.panel) A.worldClick(e.clientX, e.clientY);
  };
  A.canvas.onpointermove = (e) => {
    A.ui.pointer = { x: e.clientX, y: e.clientY };
    A.ui.hover = A.ui.hit(e.clientX, e.clientY);
    if (A.press?.button?.action === "joystick") {
      A.joystick(e.clientX, e.clientY, A.press.button);
      return;
    }
    if (
      A.press?.button?.item &&
      Math.hypot(e.clientX - A.press.x, e.clientY - A.press.y) > 7
    )
      A.ui.drag = {
        item: A.press.button.item,
        slot: A.press.button.inventory ? null : A.press.button.slot,
      };
    if (!A.ui.hover && !A.panel) A.aim(e.clientX, e.clientY);
  };
  A.canvas.onpointerup = (e) => {
    const b = A.ui.hit(e.clientX, e.clientY);
    if (A.ui.drag) {
      if (b && ["slot", "assign"].includes(b.action)) {
        A.execute(
          A.ui.drag.slot === null
            ? { type: "equip", item: A.ui.drag.item, slot: b.data.slot }
            : { type: "swapSlots", a: A.ui.drag.slot, b: b.data.slot },
        );
        if (!A.panel) A.selectSlot(A.activeSlot);
      }
    } else if (
      A.press?.button &&
      b?.id === A.press.button.id &&
      !["joystick", "act"].includes(b.action)
    )
      A.ui.activate(b);
    A.ui.drag = null;
    A.press = null;
    A.holdMine = false;
    A.stick.x = A.stick.z = 0;
  };
  A.canvas.onpointercancel = () => {
    A.ui.drag = null;
    A.resetInput();
  };
  A.canvas.oncontextmenu = (e) => {
    e.preventDefault();
    A.cancelBuild();
    A.wireStart = null;
    A.view.connectionPreview(null, null);
    A.pendingAction = null;
    A.holdMine = false;
  };
  A.canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (A.panel) A.ui.page = Math.max(0, A.ui.page + Math.sign(e.deltaY));
      else
        A.view.span = Math.max(
          7,
          Math.min(34, A.view.span + Math.sign(e.deltaY)),
        );
    },
    { passive: false },
  );
  $("garden-world").addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    A.paused = true;
    A.save();
    A.canvas.hidden = true;
    $("garden-fallback").hidden = false;
  });
  document.addEventListener("visibilitychange", () => {
    A.resetInput();
    if (document.hidden) {
      A.hiddenAt = Date.now();
      A.save();
      A.audio?.suspend();
    } else {
      if (A.hiddenAt && !A.paused) {
        const summary = A.game.catchUp();
        A.save();
        A.view.sync();
        if (summary.seconds > 30)
          A.announce(
            `${summary.produced} productions pendant ton absence. ${summary.stopped} installations en attente. Les ressources se renouvellent aussi.`,
          );
      }
      A.hiddenAt = null;
      A.last = performance.now();
    }
  });
  addEventListener("pagehide", A.save);
  A.view.held = A.held();
  A.save();
  A.canvas.focus({ preventScroll: true });
  requestAnimationFrame(A.frame);
  if (A.loaded.summary.seconds > 30)
    A.announce(
      `${A.loaded.summary.produced} productions pendant ton absence. ${A.loaded.summary.stopped} installations en attente.`,
    );
  else if (A.loaded.message) A.announce(A.loaded.message);
})();
