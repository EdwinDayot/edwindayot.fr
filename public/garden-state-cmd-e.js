/* GardenState.command() branch group E (UMD: node module / browser prototype). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const Q =
    typeof module !== "undefined"
      ? require("./game/quests.js")
      : root.GardenQuests;
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
          if (reward.reputation) s.reputation += reward.reputation;
          st.message = `${quest.title} · terminée.`;
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
