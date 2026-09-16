/* Quest catalog. Shape per entry: { npcId, title, objective: {type, ...},
   reward: {coins?, plans?, reputation?}, requires: [id] }. Two starter
   entries prove the chain (`requires`) and the sustained-timer objective end
   to end; the full ~6-10 quest ladder (Épic 2, section 2.2 of the plan) is
   deliberately left for a dedicated content task — no visitor carries the
   quest-giver role yet (npcId is metadata only, same posture as 0.5's
   unused role registration), so these are reachable only through
   GardenState.command(), not yet from a live NPC in the world. */
(function (root) {
  const P = (root.GardenDataParts = root.GardenDataParts || {});
  const quests = {
    "first-harvest": {
      npcId: "lea",
      title: "Première récolte",
      objective: { type: "deliver", item: "cutting:pilea", quantity: 1 },
      reward: { coins: 10 },
      requires: [],
    },
    "first-drip": {
      npcId: "lea",
      title: "Un goutteur actif, trente secondes",
      objective: {
        type: "networkSustained",
        check: "drip",
        count: 1,
        seconds: 30,
      },
      reward: { coins: 20, reputation: 1 },
      requires: ["first-harvest"],
    },
  };
  P.quests = quests;
  if (typeof module !== "undefined") module.exports = { quests };
})(globalThis);
