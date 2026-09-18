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
    // Épic C3.6: the campaign's first tool quest (design §15 phase 3, "première quête d'outil").
    // npcId points at villageois-1 (data-buildings.js, Épic C3.5), whose existing flavour line
    // ("range le bois pour l'hiver") is reused rather than invented — no Acte I-III identity
    // assigned yet (see the phase 3 header note in campagne-backlog.md), same posture as C3.5
    // itself. quantity/coins are sized against the same yardstick already used by C3.1's house
    // costs (D.balance.resourceYield, 3 per gathering hit, and the campaign's starting 2 wood).
    "bois-pour-l-hiver": {
      npcId: "villageois-1",
      title: "Du bois pour l'hiver",
      objective: { type: "deliver", item: "wood", quantity: 4 },
      reward: { tools: ["hachette"] },
      requires: [],
    },
    // Épic C4.2 (design §10, chapitre 2, "Ce qu'on reconnaît encore"): npcId points at "noe" —
    // NOT a new building. data-buildings.js already has a visitorId "noe" (role "vendor", sells
    // a pot, zone 0, unlocked by default) predating the campaign; the design's own named-cast
    // table (§10) names every campaign character — Noé, Mira, Basile, Anouk, Inès, Léa, Iris —
    // after an already-existing jardin libre visitor, role-for-role plausible in every case
    // (Iris is already role "botanist"). Verified before writing this, not assumed: adding a
    // second, differently-id'd "Noé" building would either collide with the existing id or
    // create two unrelated people sharing one name, neither acceptable; reusing "noe" as-is
    // (role/position/wares all untouched) is the same posture C3.6 already used for
    // villageois-1 (a real quest attached to an npcId whose role stays "resident", never
    // "quest-giver" — the quest-giver role remains unused by any visitor, still reachable only
    // through GardenState.command(), same as every quest so far).
    // Objective item deliberately "cutting:pilea" quantity 1, the exact same item/quantity
    // first-harvest already proves reachable from a brand-new save without the pot (pilea is
    // pre-planted in pot e1 by fresh(), garden-play.cjs exercises the full grow-then-cut path
    // end to end) — matches design's "accessible avec les semences de départ, sans croisement
    // obligatoire" without inventing an untested delivery path.
    "fenetre-de-noe": {
      npcId: "noe",
      title: "Une plante pour sa fenêtre",
      objective: { type: "deliver", item: "cutting:pilea", quantity: 1 },
      reward: { unlockHouseSpace: ["serre"] },
      requires: [],
    },
  };
  P.quests = quests;
  if (typeof module !== "undefined") module.exports = { quests };
})(globalThis);
