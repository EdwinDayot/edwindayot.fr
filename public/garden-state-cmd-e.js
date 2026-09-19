/* GardenState.command() branch group E (UMD: node module / browser prototype). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const Q =
    typeof module !== "undefined"
      ? require("./game/quests.js")
      : root.GardenQuests;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const M = {
    commandSegE(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "quest") {
        st.taken = true;
        const quest = D.quests[c.questId];
        if (!quest) return fail("Quête inconnue.");
        if (c.action === "accept") {
          if (
            s.quests.active.some((q) => q.questId === c.questId) ||
            s.quests.completed.includes(c.questId) ||
            !quest.requires.every((id) => s.quests.completed.includes(id))
          )
            return fail("Cette quête n’est pas encore accessible.");
          s.quests.active.push({
            id: c.questId,
            questId: c.questId,
            npcId: quest.npcId,
            progress: {},
          });
          st.message = `${quest.title} · en cours.`;
        } else if (c.action === "complete") {
          const entry = s.quests.active.find((q) => q.questId === c.questId);
          if (!entry) return fail("Cette quête n’est pas en cours.");
          if (!Q.evaluateObjective(quest.objective, s, entry).complete)
            return fail("Objectif pas encore atteint.");
          s.quests.active = s.quests.active.filter((q) => q !== entry);
          s.quests.completed.push(c.questId);
          const reward = quest.reward || {};
          if (reward.coins)
            s.inventory.coins = (s.inventory.coins || 0) + reward.coins;
          for (const plan of reward.plans || [])
            if (!s.plans.includes(plan)) s.plans.push(plan);
          // Épic C3.6: additive extension of the reward schema, same shape as reward.plans just
          // above — a named tool joins s.campaignTools only at completion, never at acceptance.
          for (const tool of reward.tools || [])
            if (!s.campaignTools.includes(tool)) s.campaignTools.push(tool);
          // Épic C4.2: same additive pattern again — a named house space is unlocked (locked:
          // false) only at completion, never repaired automatically (repairHouseSpace, C3.1,
          // stays the only way to actually repair it; a missing/unknown space id is ignored
          // rather than thrown, same defensive posture as the tools/plans loops above).
          for (const spaceId of reward.unlockHouseSpace || [])
            if (s.campaignHouse.spaces[spaceId])
              s.campaignHouse.spaces[spaceId].locked = false;
          if (reward.reputation) s.reputation += reward.reputation;
          // Épic C4.9: reward.potCapacity generalises the campaign pot's capacity growth (design
          // §4, "la capacité vient de la progression narrative") to any quest, same additive
          // non-regression guarantee as the loops above — never lowers an already-higher capacity
          // if some future quest happened to grant a smaller value.
          if (reward.potCapacity)
            s.campaignPot.capacity = Math.max(
              s.campaignPot.capacity,
              reward.potCapacity,
            );
          // Épic C4.3 (design §10, chapitre 2/3) : déverrouiller la serre révèle la note du pot
          // qu'elle contient, via le mécanisme générique de C4.1 — un signal fixe (le
          // déverrouillage réel de "serre"), jamais re-dérivé ici.
          let revealed = null;
          if ((reward.unlockHouseSpace || []).includes("serre")) {
            revealed = Narrative.pendingReveal(s.campaignFlags, "serreUnlocked");
            if (revealed) s.campaignFlags.push(revealed.id);
          }
          // Épic C4.8: reward.narrativeFlag generalises the reveal above — any quest can name a
          // trigger signal directly, no new hard-coded condition needed per chapter. Additive:
          // only consulted when the serre case above didn't already reveal something this turn.
          if (!revealed && reward.narrativeFlag) {
            revealed = Narrative.pendingReveal(s.campaignFlags, reward.narrativeFlag);
            if (revealed) s.campaignFlags.push(revealed.id);
          }
          st.message = revealed
            ? `${quest.title} · terminée. Nouvelle page dans le carnet.`
            : `${quest.title} · terminée.`;
        } else return fail("Action de quête inconnue.");
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
