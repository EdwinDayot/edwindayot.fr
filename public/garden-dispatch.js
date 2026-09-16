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
  A.dispatch = function dispatch(action, data = {}) {
    switch (action) {
      case "panel":
        A.openPanel(data.panel);
        break;
      case "close":
        A.closePanel();
        break;
      case "tab":
        A.tab = data.tab;
        A.ui.page = 0;
        break;
      case "page":
        A.ui.page = Math.max(0, A.ui.page + data.delta);
        break;
      case "item":
        A.inventoryItem = data.item;
        A.announce(A.label(data.item));
        break;
      case "slot":
        A.selectSlot(data.slot);
        break;
      case "assign":
        if (A.inventoryItem)
          A.execute({ type: "equip", item: A.inventoryItem, slot: data.slot });
        else A.announce("Choisis d’abord un objet.");
        break;
      case "act":
        A.act();
        break;
      case "move":
        if (A.canMove()) A.startBuild(null, A.selected.id);
        break;
      case "place":
        A.confirmBuild();
        break;
      case "rotate":
        if (A.build) {
          A.build.rotation = (A.build.rotation + 1) % 4;
          A.updateBuild();
        }
        break;
      case "cancel":
        A.cancelBuild();
        break;
      case "store":
        if (A.build?.id && A.execute({ type: "store", id: A.build.id }).ok) {
          A.cancelBuild();
          A.selected = null;
          A.view.selected = null;
        }
        break;
      case "restore":
        A.startBuild(null, data.id);
        break;
      case "reserve":
        A.openPanel("reserve");
        break;
      case "buy":
        A.execute({ type: "buy", vendor: data.vendor, item: data.item });
        break;
      case "quest-accept":
        A.execute({ type: "quest", action: "accept", questId: data.questId });
        break;
      case "quest-complete":
        A.execute({ type: "quest", action: "complete", questId: data.questId });
        break;
      case "go":
        A.go(data.id);
        break;
      case "inspect": {
        const e = data.id
          ? A.target(data.id)
          : A.game.s.entities.find(
              (e) => !e.stored && e.plant?.species === data.species,
            );
        if (e) {
          A.cancelBuild();
          A.wireStart = null;
          A.view.connectionPreview(null, null);
          A.selected = e;
          A.view.selected = e;
          A.openPanel("inspection");
          A.view.inspect(e);
        } else A.announce("Plante cette espèce pour la voir dans le jardin.");
        break;
      }
      case "inspect-orbit":
        A.view.angle += (data.delta * Math.PI) / 4;
        break;
      case "choose-cutting":
        A.cutting = data.species;
        break;
      case "confirm-cutting":
        if (
          A.cutting === data.species &&
          A.execute({
            type: "multiply",
            id: A.selected?.id,
            species: A.cutting,
          }).ok
        )
          A.closePanel();
        break;
      case "trade":
      case "replace":
        A.execute({ type: action, request: data.request });
        break;
      case "setting":
        A.execute({
          type: "settings",
          key: data.key,
          value: !A.game.s.settings[data.key],
        });
        if (data.key === "sound") {
          if (A.game.s.settings.sound) A.sound("plant");
          else A.audio?.suspend();
        }
        break;
      case "pause":
        A.paused = !A.paused;
        A.resetInput();
        break;
      case "rescue":
        A.execute({ type: "rescue" });
        break;
      case "export": {
        A.save();
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(A.game.serialize(), null, 2)], {
              type: "application/json",
            }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download = "mon-jardin.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case "import":
        if (A.importReady) {
          try {
            A.replaceGame(A.store.import(A.importReady));
            A.importReady = null;
            A.panel = "";
            A.announce("Partie importée.");
          } catch (e) {
            A.announce(e.message);
          }
        } else $("import-file").click();
        break;
      case "backup":
        try {
          A.replaceGame(A.store.restore());
          A.panel = "";
          A.announce("Copie précédente restaurée.");
        } catch (e) {
          A.announce(e.message);
        }
        break;
      case "zoom-in":
        A.view.span = Math.max(7, A.view.span - 2);
        break;
      case "zoom-out":
        A.view.span = Math.min(34, A.view.span + 2);
        break;
      case "orbit":
        A.view.angle += Math.PI / 4;
        break;
      case "network":
        A.view.network = !A.view.network;
        break;
    }
  };
})();
