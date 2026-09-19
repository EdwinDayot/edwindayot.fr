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
    // Épic C4.5 (design §10, chapitre 5, "Encore une fois" ; §8, "Lavoir et mare" : "Mira veut
    // garder claires ses bassines de potière... Pelle ; bassins et nurserie"). Same posture
    // already used twice by C4.2/C4.3: npcId points at "mira" — NOT a new building. data-
    // buildings.js already has a visitorId "mira" (role "vendor", position cx:-9.5/cz:11.5,
    // inside zone 0's bounds, unlocked by default) predating the campaign, and the design's own
    // named-cast table (§10) already casts her as the village potter — verified before writing
    // this, not assumed.
    // Objective item deliberately "cutting:pilea" quantity 1 again, the exact same already-
    // deliverable item C4.2 used: design §8 describes the botanical answer as "une petite zone de
    // plantes filtrantes, espèce mère obtenue sur la berge accessible" — no filtering species and
    // no berge/mare exist in the code today, and inventing one would be a whole new botanical
    // system out of scope for a single epic (contrary to "généraliser plutôt que spécialiser").
    // The design explicitly allows this ("les détails de ces rencontres peuvent changer pendant
    // l'écriture", §8's own closing line). Honest limit, not silently narrowed: this quest proves
    // only the reward (reward.tools, C3.6's exact pattern) — no "mare" zone/location is unlocked
    // by it, because none is built by this epic (see campagne-backlog.md's own C4.5 entry).
    "bassines-de-mira": {
      npcId: "mira",
      title: "Garder claires les bassines",
      objective: { type: "deliver", item: "cutting:pilea", quantity: 1 },
      reward: { tools: ["pelle"] },
      requires: [],
    },
    // Épic C4.7 (design §10, chapitre 7, "Une fleur pour une fenêtre" ; §8, "Sentier des vents").
    // Same posture already used three times by C4.2/C4.3/C4.5: npcId points at "anouk" — NOT a
    // new building. data-buildings.js already has visitorId "anouk" (role "vendor", cx:-3.5/
    // cz:20, inside zone 0's bulge polygon — verified against the real polygon before writing,
    // not assumed identical to Noé/Iris/Mira: zone0's polygon reaches [-6, 22], so cz:20 near
    // cx:-3.5 sits inside that bulge, not in zone4 which only starts at z:22), unlocked by
    // default, and the design's own named-cast table (§10) already casts her as the coteau
    // resident who wants her path reopened.
    // Objective item deliberately "cutting:pilea" quantity 1 again, same already-deliverable item
    // as C4.2/C4.5: design §8 describes the botanical answer as "plantation basse adaptée au sec,
    // balisage visible" — no dedicated dry-climate species exists in the code today, and inventing
    // one would be a whole new botanical entry out of scope for a single epic (contrary to
    // "généraliser plutôt que spécialiser"); the design explicitly allows this ("les détails de
    // ces rencontres peuvent changer pendant l'écriture", §8's own closing line).
    "sentier-d-anouk": {
      npcId: "anouk",
      title: "Rouvrir le sentier d'Anouk",
      objective: { type: "deliver", item: "cutting:pilea", quantity: 1 },
      reward: { tools: ["pioche"] },
      requires: [],
    },
    // Épic C4.7, second quest of the same chapter (design §8, "Verger en terrasses" : "Basile
    // manque d'un matériau souple pour réparer ses paniers"). npcId points at "basile" — NOT a
    // new building, same verification: data-buildings.js already has visitorId "basile" (role
    // "vendor", cx:-9.5/cz:20, same zone0 bulge as anouk above), unlocked by default, already
    // cast by the design's table as the basket-maker/merchant.
    // Objective item deliberately "cutting:pilea" quantity 1, same honest reuse as anouk's quest
    // above: design §8 names "une plante à fibres" which does not exist yet as a species — same
    // documented gap, not silently narrowed.
    // Deliberately independent (requires: []), same as anouk's quest: design §10 chapitre 7,
    // "ces deux étapes peuvent être préparées en parallèle" — no `requires` link between the two.
    "fibres-de-basile": {
      npcId: "basile",
      title: "Des fibres pour Basile",
      objective: { type: "deliver", item: "cutting:pilea", quantity: 1 },
      reward: { tools: ["scie"] },
      requires: [],
    },
    // Épic C4.8 (design §10, chapitre 8, "La table longue" : "Léa organise un repas collectif.
    // Le joueur doit alimenter la cuisine pendant un essai court..."). Same posture already used
    // four times (C4.2/C4.3/C4.5/C4.7): npcId points at "lea" — NOT a new building. data-
    // buildings.js already has visitorId "lea" (role "trader", cz:7, zone 0, unlocked by default),
    // already carrying two jardin libre quests (first-harvest/first-drip) — a campaign quest
    // attaching to the same npcId changes nothing about her existing role/shop, same precedent as
    // reusing "noe"/"iris"/"mira"/"anouk"/"basile" as-is.
    // Objective item deliberately "cutting:pilea" quantity 1, same honest reuse as C4.2/C4.5/C4.7:
    // no dedicated "repas"/feast ingredient exists in the botanical catalog, and inventing one
    // would be a whole new item out of scope for a single epic (contrary to "généraliser plutôt
    // que spécialiser"); the design explicitly allows this (§8's closing line).
    // reward.narrativeFlag is a NEW additive reward field (garden-state-cmd-e.js), generalising
    // the ad hoc "unlockHouseSpace includes serre" reveal C4.3 hard-coded: any future quest can
    // reveal a data-narrative.js text at completion by naming its trigger signal here, no new
    // branch of code required (orchestration.md, "généraliser plutôt que spécialiser").
    "table-longue-lea": {
      npcId: "lea",
      title: "Léa prépare un repas collectif",
      objective: { type: "deliver", item: "cutting:pilea", quantity: 1 },
      reward: { narrativeFlag: "leaKitchenStocked" },
      requires: [],
    },
  };
  P.quests = quests;
  if (typeof module !== "undefined") module.exports = { quests };
})(globalThis);
