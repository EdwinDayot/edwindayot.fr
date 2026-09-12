(() => {
  const A = (window.GardenApp = {});
  const D = GardenData,
    C = GardenConstruction,
    I = GardenIrrigation,
    R = GardenRules,
    S = GardenSave,
    $ = (id) => document.getElementById(id);
  A.storage = undefined;
  try {
    A.storage = localStorage;
  } catch {
    A.storage = {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
    };
  }
  A.store = new S.SaveStore(A.storage);
  A.loaded = A.store.load();
  A.game = A.loaded.game;
  A.view = undefined;
  A.ui = undefined;
  try {
    A.view = new GardenView($("garden-world"), A.game);
  } catch (error) {
    console.warn("Jardin WebGL indisponible.", error);
    return;
  }
  $("garden-fallback").hidden = true;
  $("garden-hud").hidden = false;
  A.activeSlot = 1;
  A.panel = "";
  A.tab = "bag";
  A.inventoryItem = null;
  A.selected = null;
  A.build = null;
  A.wireStart = null;
  A.pendingAction = null;
  A.pointer = null;
  A.paused = false;
  A.toast = "";
  A.toastUntil = 0;
  A.importReady = null;
  A.cutting = null;
  A.last = performance.now();
  A.saveClock = 0;
  A.syncClock = 0;
  A.hiddenAt = null;
  A.nextMine = 0;
  A.holdMine = false;
  A.press = null;
  A.audio = null;
  A.ambient = null;
  A.lastStep = 0;
  A.canvas = $("garden-hud");
  A.keys = new Set();
  A.stick = { x: 0, z: 0 };
  A.touch =
    matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
  A.reduced = matchMedia("(prefers-reduced-motion:reduce)");
  A.held = () => A.game.s.hotbar[A.activeSlot];
  A.label = (id) => D.tools[id] || D.itemName(id);
  A.costs = (c) =>
    Object.entries(c)
      .map(([id, n]) => `${n} ${D.itemName(id)}`)
      .join(" · ");
  A.name = function name(e) {
    return (
      e?.name ||
      (e?.plant && D.species.find((s) => s.id === e.plant.species).name) ||
      D.recipes[e?.type]?.name ||
      D.mining[e?.type]?.name ||
      "Le jardin"
    );
  };
  A.announce = function announce(text) {
    A.toast = text;
    A.toastUntil = performance.now() + 4200;
    $("game-announcement").textContent = text;
  };
  A.save = function save() {
    A.game.s.player = { ...A.view.position };
    if (!A.store.save(A.game)) A.announce(A.store.message);
  };
  A.sound = function sound(kind) {
    if (!A.game.s.settings.sound) return;
    try {
      A.audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (A.audio.state === "suspended") A.audio.resume();
      if (!A.ambient) {
        const buffer = A.audio.createBuffer(
            1,
            A.audio.sampleRate * 3,
            A.audio.sampleRate,
          ),
          data = buffer.getChannelData(0);
        let n = 0;
        for (let i = 0; i < data.length; i++) {
          n = (n + (Math.random() * 2 - 1) * 0.02) / 1.025;
          data[i] = n;
        }
        A.ambient = A.audio.createBufferSource();
        A.ambient.buffer = buffer;
        A.ambient.loop = true;
        const g = A.audio.createGain();
        g.gain.value = 0.035;
        A.ambient.connect(g).connect(A.audio.destination);
        A.ambient.start();
      }
      const o = A.audio.createOscillator(),
        g = A.audio.createGain(),
        now = A.audio.currentTime;
      o.type = kind === "mine" || kind === "step" ? "triangle" : "sine";
      o.frequency.setValueAtTime(
        kind === "mine"
          ? A.held() === "pickaxe"
            ? 460
            : 140
          : kind === "step"
            ? 80
            : 650,
        now,
      );
      o.frequency.exponentialRampToValueAtTime(60, now + 0.2);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(
        kind === "step" ? 0.008 : 0.045,
        now + 0.012,
      );
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      o.connect(g).connect(A.audio.destination);
      o.start();
      o.stop(now + 0.24);
    } catch {}
  };
})();
