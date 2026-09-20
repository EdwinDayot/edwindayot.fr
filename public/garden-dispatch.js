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
      // Epic C1.4 (carnet de botanique). Suffixed "-cultivar" so these never collide with the
      // free garden's own "store" action (built-object storage, keyed off A.build.id, not a
      // cultivar id) — reusing the bare command names here would silently no-op instead of
      // calling GardenState.command().
      case "keep-cultivar":
        A.execute({ type: "keepCultivar", id: data.id });
        break;
      case "store-cultivar":
        A.execute({ type: "storeCultivar", id: data.id });
        break;
      case "give-cultivar":
        A.execute({ type: "giveCultivar", id: data.id });
        break;
      case "compost-cultivar":
        A.execute({ type: "compostCultivar", id: data.id });
        break;
      case "rename-cultivar": {
        // Canvas draws no text field: reuse the same "HTML for what Canvas doesn't do well"
        // principle already applied to the system file picker (see garden-structure.md). The
        // input is shown/positioned only for the duration of this rename.
        const cultivar = A.game.s.cultivars.find((cv) => cv.id === data.id);
        if (!cultivar) break;
        const input = $("cultivar-rename-input");
        input.value = cultivar.name || "";
        input.dataset.cultivarId = data.id;
        input.hidden = false;
        input.focus();
        input.select();
        break;
      }
      case "go":
        A.go(data.id);
        break;
      // Epic C2.2v: the "nightfall" panel's single action — proceeds with whatever the pot
      // holds (possibly nothing, design §3: "il reste possible de ne rien croiser") and calls
      // the already-implemented sleep command. Closing the panel here (like confirm-cutting's
      // own A.closePanel() below) also lets garden-frame.js's own nightfall check notice
      // gameSeconds has been reset to 0 next frame and end the camera transition.
      case "confirm-night": {
        const result = A.execute({ type: "sleep" });
        if (result.ok) {
          A.closePanel();
          // Epic C5.14: result.scenes (garden-state-cmd-f.js/garden-state.js) is the render
          // layer's only signal that a persistance/réparation scene should be staged this exact
          // night — never re-derived from state after the fact (see campaign-scenes.js's own
          // header comment on why workedThisNight cannot be reconstructed safely afterwards).
          // Only the first entry is ever staged (design: "la caméra ne saute pas d'une Rainelle à
          // l'autre"); a Rainelle with no visible model yet makes beginGestureScene() a no-op, so
          // no panel opens for nothing to look at.
          const scene = result.scenes && result.scenes[0];
          if (scene && A.view.beginGestureScene(scene)) A.openPanel("gesture-scene");
        }
        break;
      }
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
      // Epic C2.9 (design §5, "lancer un cycle pas à pas"): only ever fires while the game is
      // already paused generally (A.paused, distinct from the campaignClock pause every open
      // panel already gets for free, garden-frame.js) — the row itself is disabled otherwise
      // (hud-panel.js's own "observation" rows, disabled: !m.paused), and hit() never dispatches
      // a disabled button's action (hud-widgets.js), so this guard is redundant-but-explicit
      // defence, never the only thing stopping a silent double-step. Exactly one call to
      // A.game.step, for exactly one cycle's worth of simulated seconds — never a loop, never a
      // second, duplicated cycle-length constant (GardenCampaignAutomation.CYCLE_SECONDS is the
      // same one campaign-observation.js's own CYCLE_SECONDS re-exports for the row's label).
      case "observation-step":
        if (A.paused) A.game.step(GardenCampaignAutomation.CYCLE_SECONDS);
        break;
      // Epic C6.2: the only real point of entry to setVeilleuse/setPriseFortDebit (C5.2/C5.4) —
      // both commands already existed and were already reachable from GardenState.command()
      // directly (every test since C5.2/C5.4 calls them that way), but no dispatch case ever
      // called either one, so a player had no way to actually flip either flag. Unlike "setting"
      // above (which recomputes the flip here, `!A.game.s.settings[data.key]`), `data.active` is
      // computed once by the row itself at draw time (hud-panel.js, `!zone.veilleuse`/
      // `!borne.priseFortDebit`) and forwarded as-is — this file only relays it to the command.
      case "toggle-veilleuse":
        A.execute({
          type: "setVeilleuse",
          zoneId: data.zoneId,
          active: data.active,
        });
        break;
      case "toggle-prise-fort-debit":
        A.execute({
          type: "setPriseFortDebit",
          borneId: data.borneId,
          active: data.active,
        });
        break;
      // Epic C2.5v-b (C2.5's own screen/trajectory/camera, deferred from C2.5 — see
      // garden-state-cmd-k.js's header comment): the real trigger the mandate requires, wired
      // exactly like "confirm-night"'s own beginGestureScene call site just below in this file —
      // execute the real command, and only on success stage the camera/panel. A.teachingDraft is
      // client-only scratch (never persisted, never read by GardenState) that gathers the five
      // gesture fields the player fills in one at a time before demonstrateGesture is ever called
      // — the same "ephemeral UI state on A, not on s" posture already used by A.cutting/A.build.
      case "begin-teaching": {
        const result = A.execute({ type: "beginTeaching", id: data.id });
        if (result.ok) {
          // Same "close the panel it was triggered from, then open the new one" shape as
          // "confirm-night" above — closePanel() here runs while A.panel is still "observation",
          // before s.campaignTeaching's own guard in garden-cmd.js would ever apply to it.
          A.closePanel();
          A.teachingDraft = {
            verbe: "",
            poste: "",
            source: "",
            destination: "",
            condition: "",
          };
          A.view.beginGestureScene({ rainelleId: data.id, kind: "teaching" });
          A.openPanel("teaching");
        }
        break;
      }
      // Verbe is one of a short, fixed list (Rainelles.VERBS) — cycling through it avoids either
      // a free-text field that could never validate against it, or six extra rows (one per verb)
      // crowding the panel; same "no abstraction the criterion doesn't need" restraint the mandate
      // asks for.
      case "teaching-cycle-verb": {
        if (!A.teachingDraft) break;
        const VERBS = window.GardenRainelles.VERBS,
          i = VERBS.indexOf(A.teachingDraft.verbe);
        A.teachingDraft.verbe = VERBS[(i + 1) % VERBS.length];
        break;
      }
      // poste/source/destination/condition stay free text today (rainelles.js's own header
      // comment: "opaque identifier strings... no player-facing place names exist yet") —
      // demonstrateGesture itself is unchanged by this epic (still validates shape only, never
      // against campaign-stations.js's registry), so this reuses the exact same free-text pattern
      // rather than building a new in-world station-picker the criterion doesn't ask for. The
      // "Stations connues" row (hud-panel.js) lists real ids so a player has something correct to
      // type, without a new selection mechanism.
      case "teaching-edit-field": {
        if (!A.teachingDraft) break;
        const input = $("campaign-text-input");
        input.maxLength = 40;
        input.value = A.teachingDraft[data.field] || "";
        input.dataset.kind = "teaching-field";
        input.dataset.field = data.field;
        input.setAttribute("aria-label", "Champ « " + data.field + " » du geste enseigné");
        input.hidden = false;
        input.focus();
        input.select();
        break;
      }
      case "demonstrate-teaching": {
        if (!A.teachingDraft) break;
        // Only clear the client scratch on success — a validation failure (empty field, unknown
        // verb...) must leave what the player already typed in place, exactly like every other
        // form-shaped command in this file reports its failure via A.announce without discarding
        // input.
        if (A.execute({ type: "demonstrateGesture", ...A.teachingDraft }).ok)
          A.teachingDraft = null;
        break;
      }
      case "revise-phrase-edit": {
        const teaching = A.game.s.campaignTeaching;
        if (!teaching || teaching.step !== "reviewing") break;
        const input = $("campaign-text-input");
        input.maxLength = 240;
        input.value = teaching.draft.phrase;
        input.dataset.kind = "teaching-phrase";
        delete input.dataset.field;
        input.setAttribute("aria-label", "Corriger la phrase enseignée");
        input.hidden = false;
        input.focus();
        input.select();
        break;
      }
      case "confirm-teaching":
        if (A.execute({ type: "confirmTeaching" }).ok) A.closePanel();
        break;
      // closePanel() itself already cancels a still-open lesson (garden-cmd.js) — calling it here
      // after cancelTeaching has already run is a harmless no-op guard, not a double command.
      case "cancel-teaching":
        A.execute({ type: "cancelTeaching" });
        A.closePanel();
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
