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
  A.execute = function execute(c) {
    const result = A.game.command(c, { position: A.view.position });
    if (result.ok) {
      A.save();
      A.view.sync();
      A.view.action(result.kind, A.selected);
      A.sound(result.kind);
    }
    if (c.type !== "mine" || !result.ok || A.selected?.ready > A.game.s.elapsed)
      A.announce(result.message);
    return result;
  };
  A.resetInput = function resetInput() {
    A.keys.clear();
    A.stick.x = A.stick.z = 0;
    A.holdMine = false;
    A.press = null;
  };
  A.cancelBuild = function cancelBuild() {
    A.build = null;
    A.view.showPreview(null);
  };
  A.closePanel = function closePanel() {
    A.view.endInspection();
    // Epic C5.14: Échap/the generic panel close already reaches here (garden-boot.js) for every
    // panel, including "gesture-scene" — no bespoke "skip" button needed, same accessibility
    // guarantee design §14 asks for ("permettre de raccourcir une scène"). No-ops when no scene
    // is playing, same guard shape as endInspection() above.
    A.view.endGestureScene();
    A.panel = "";
    A.cutting = null;
    A.resetInput();
    A.canvas.focus({ preventScroll: true });
    A.selectSlot(A.activeSlot);
  };
  A.openPanel = function openPanel(p) {
    if (p !== "inspection") A.view.endInspection();
    if (p === "nursery") A.cutting = null;
    A.panel = p;
    $("game-announcement").textContent =
      "Panneau ouvert. Tab ou flèches pour choisir, Entrée pour valider, Échap pour fermer.";
    A.resetInput();
    A.view.routes = [];
    A.pendingAction = null;
    A.ui.focus = 0;
    A.canvas.focus({ preventScroll: true });
  };
  A.selectSlot = function selectSlot(i) {
    A.activeSlot = i;
    A.cancelBuild();
    A.wireStart = null;
    A.view.connectionPreview(null, null);
    A.pendingAction = null;
    A.holdMine = false;
    A.view.held = A.held();
    if (D.recipes[A.held()]) A.startBuild(A.held());
  };
  A.startBuild = function startBuild(item, id) {
    const e = id ? A.game.s.entities.find((e) => e.id === id) : null;
    A.panel = "";
    A.wireStart = null;
    A.view.connectionPreview(null, null);
    A.view.routes = [];
    A.pendingAction = null;
    A.build = {
      item: e ? e.type : item,
      id: id || null,
      restore: !!e?.stored,
      x: e && !e.stored ? e.x : Math.round(A.view.position.x * 2) / 2,
      z: e && !e.stored ? e.z : Math.round((A.view.position.z - 1.5) * 2) / 2,
      rotation: e?.rotation || 0,
    };
    A.pointer = null;
    A.view.showPreview(A.build);
    A.updateBuild();
  };
  A.updateBuild = function updateBuild() {
    if (!A.build) return;
    const recipe = D.recipes[A.build.item];
    A.build.error =
      C.distance(A.view.position, A.build) > 6
        ? "Rapproche-toi pour construire."
        : C.distance(A.view.position, A.build) <
            C.radius({ type: A.build.item }) + 0.24
          ? "Éloigne-toi de cet emplacement."
          : !A.build.id &&
              !A.game.has({ [A.build.item]: 1 }) &&
              (!A.game.s.plans.includes(A.build.item) ||
                !A.game.has(recipe.cost))
            ? "Matériaux manquants : " + A.costs(recipe.cost)
            : C.placement(
                A.game.s,
                { ...A.build, type: A.build.item },
                A.build.id,
              );
    A.build.cost = A.game.s.inventory[A.build.item]
      ? `${A.game.s.inventory[A.build.item]} en réserve`
      : "Fabrication à la pose · " + A.costs(recipe.cost);
    A.view.updatePreview(A.build);
  };
  A.confirmBuild = function confirmBuild() {
    if (!A.build) return;
    A.updateBuild();
    if (A.build.error) return A.announce(A.build.error);
    const result = A.execute({
      type: A.build.id ? (A.build.restore ? "restore" : "move") : "place",
      ...A.build,
      fabricate: true,
    });
    if (result.ok) {
      A.selected = A.build.id
        ? A.game.s.entities.find((e) => e.id === A.build.id)
        : A.game.s.entities.at(-1);
      A.view.selected = A.selected;
      if (A.build.id) A.cancelBuild();
      else A.updateBuild();
    }
  };
  A.canMove = function canMove() {
    return (
      A.selected &&
      A.game.s.entities.includes(A.selected) &&
      !A.selected.stored &&
      C.distance(A.view.position, A.selected) < 1.85
    );
  };
  A.target = function target(id) {
    return (
      A.game.s.entities.find((e) => e.id === id) ||
      A.game.s.resources.find((r) => r.id === id) ||
      D.caches.find((c) => c.id === id) ||
      D.visitors.find((v) => v.id === id) ||
      (id === "river"
        ? { id, x: 3.5, z: 4 }
        : id?.startsWith("zone-")
          ? {
              id,
              x: D.zones[+id.split("-")[1]].gate[0],
              z: D.zones[+id.split("-")[1]].gate[1],
            }
          : null)
    );
  };
  A.go = function go(id) {
    A.selected = A.target(id);
    if (!A.selected) return;
    A.panel = "";
    A.resetInput();
    A.view.selected = A.selected;
    if (!A.view.go(A.selected))
      A.announce("Le passage n’est pas encore accessible.");
  };
  A.wire = function wire() {
    const e = A.selected;
    if (!["tank", "pump", "pipe", "drip", "pot", "reservoir"].includes(e.type))
      return A.announce("Choisis une installation d’irrigation.");
    if (!A.wireStart) {
      A.wireStart = e;
      A.announce(
        "Installation choisie · vise la suivante. Le sens de l’eau est automatique.",
      );
      return;
    }
    if (A.wireStart === e) {
      A.wireStart = null;
      A.view.connectionPreview(null, null);
      return;
    }
    const exists = A.game.s.links.some(
      (l) => l.includes(e.id) && l.includes(A.wireStart.id),
    );
    if (
      A.execute({
        type: exists ? "disconnect" : "connect",
        id: A.wireStart.id,
        to: e.id,
      }).ok
    ) {
      A.wireStart = e;
      A.view.connectionPreview(null, null);
    }
  };
  A.act = function act() {
    if (A.paused)
      return A.announce("Simulation en pause. Échap pour reprendre.");
    if (A.build) return A.confirmBuild();
    const c = A.context();
    if (c.go) {
      if (A.view.go(A.selected)) A.pendingAction = A.selected.id;
      return;
    }
    if (c.wire) return A.wire();
    if (c.panel) {
      if (c.tab) A.tab = c.tab;
      return A.openPanel(c.panel);
    }
    if (c.move && A.canMove()) return A.startBuild(null, A.selected.id);
    if (!c.command) return A.announce(c.status);
    const result = A.execute({
      type: c.command,
      id: A.selected?.id,
      tool: A.held(),
      zone: c.zone,
      request: c.request,
      species: c.species,
      source: c.source,
    });
    if (c.command === "mine") A.nextMine = performance.now() + 700;
    if (result.ok && ["unlock", "discover"].includes(c.command)) {
      A.selected = null;
      A.view.selected = null;
    }
  };
  A.replaceGame = function replaceGame(next) {
    A.view.endInspection();
    A.view.endNightfallTransition();
    A.view.endGestureScene();
    A.nightSequence = false;
    A.cancelBuild();
    A.game = next;
    A.view.game = A.game;
    // Epic C2.2v: an imported/restored save can carry a completely different campaignClock
    // state (a different day, mid-pause...) — resync the one long-lived instance from it,
    // the same "mirror the loaded state" posture as A.view.position just below.
    A.campaignClock = new Clock.CampaignClock(A.game.s.campaignClock);
    A.view.routes = [];
    A.selected = null;
    A.view.selected = null;
    A.wireStart = null;
    A.view.connectionPreview(null, null);
    A.view.sync();
    if (
      A.game.s.player &&
      C.walkable(A.game.s, A.game.s.player.x, A.game.s.player.z)
    )
      A.view.position = { ...A.game.s.player };
    else if (!C.walkable(A.game.s, A.view.position.x, A.view.position.z))
      A.view.position = { x: 0, z: 4 };
    A.selectSlot(A.activeSlot);
  };
})();
