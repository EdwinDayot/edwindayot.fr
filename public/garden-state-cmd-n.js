/* GardenState.command() branch group N (UMD: node module / browser prototype). Epic C4.1
   (design §10, chapitre 1): chooseFurnitureTreatment records the player's one-shot, mutually
   exclusive decision on the armoire's rediscovered marques de taille (conserver/encadrer/
   repeindre), then resolves any narrative trigger it fires through data-narrative.js's generic
   mechanism — the same "pure check in the data file, mutation here" split as
   garden-state-cmd-l.js's repairHouseSpace versus campaign-house.js's canRepair. Not a world
   entity command (c has no entity id, only a fixed choice), same posture as repairHouseSpace/
   teachGesture. */
(function (root) {
  const House =
    typeof module !== "undefined"
      ? require("./game/campaign-house.js")
      : root.GardenCampaignHouse;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const M = {
    commandSegN(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "chooseFurnitureTreatment") {
        st.taken = true;
        if (!House.FURNITURE_TREATMENTS.includes(c.choice))
          return fail(`Choix inconnu : "${c.choice}".`);
        if (s.campaignHouse.furnitureMarks !== null)
          return fail("Ce choix a déjà été fait.");
        s.campaignHouse.furnitureMarks = c.choice;
        const revealed = Narrative.pendingReveal(
          s.campaignFlags,
          "furnitureMarksChosen",
        );
        if (revealed) s.campaignFlags.push(revealed.id);
        st.message = revealed
          ? `Marques de l’armoire : ${c.choice}. Nouvelle page dans le carnet.`
          : `Marques de l’armoire : ${c.choice}.`;
      } else if (c.type === "meetIris") {
        // Epic C4.3 (design §10, chapitre 3) : Iris (déjà un visiteur réel du jardin libre,
        // data-buildings.js, role "botanist" — même principe que "noe" pour C4.2, aucune seconde
        // entrée inventée) montre comment épingler un caractère déjà vu. Pas encore câblée à une
        // interaction du monde 3D (même limite honnête que chooseFurnitureTreatment/
        // repairHouseSpace posées avant leur habillage) : une commande réelle et testée,
        // idempotente, jamais un échec — se rencontrer une seconde fois ne re-déclenche
        // simplement pas la révélation déjà vue.
        st.taken = true;
        const revealed = Narrative.pendingReveal(s.campaignFlags, "irisPinningShown");
        if (revealed) s.campaignFlags.push(revealed.id);
        st.message = revealed
          ? "Iris montre comment épingler un caractère déjà vu. Nouvelle page dans le carnet."
          : "Iris te salue à nouveau.";
      }
      return null;
    },
  };
  if (typeof module !== "undefined") module.exports = M;
  else {
    const S = root.GardenStateParts.state;
    Object.assign(S.prototype, M);
    S.commandSegs.push(...Object.values(M));
  }
})(globalThis);
