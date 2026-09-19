/* Campaign narrative layer: generic, reusable once-only text reveals (UMD: node module /
   browser GardenNarrative).

   Epic C4.1 (design §10, chapitre 1 "La clé sous le pot vide"): the first mechanism of its
   kind in the campaign layer — a catalog of short texts ({id, trigger, title, text}), each
   unlocked once when its `trigger` signal fires, recorded into s.campaignFlags (a flat set of
   already-seen text ids, same "flat unique list of strings" shape as s.campaignTools —
   see garden-state-validate.js). Built generic on purpose, not hard-coded to this one letter:
   the phase-4 backlog entry for this epic calls it out explicitly as "réutilisable par les
   chapitres suivants". A future chapter adds a TEXTS entry here and fires its `trigger` signal
   from its own command (see garden-state-cmd-n.js's chooseFurnitureTreatment for the only
   caller today) — no engine change required, same "generalise, not specialise" principle
   orchestration.md asks for.

   `trigger` is a plain signal string, not a predicate/expression language re-deriving a
   condition from state: the command that fires it already knows the condition holds (it just
   made it true), so there is nothing left for this module to re-check — deliberately not a
   scenario engine, per the epic's own critère de sortie. */
(function (root) {
  const TEXTS = {
    "alma-marques-meuble": {
      id: "alma-marques-meuble",
      trigger: "furnitureMarksChosen",
      title: "Lettre d’Alma",
      text: "Tu peux déplacer les meubles. Même ceux dont tu crois te souvenir exactement.",
    },
    // Epic C4.3 (design §10, chapitre 3) : révélée quand la serre est déverrouillée (le
    // déverrouillage de C4.2, "serre" dans reward.unlockHouseSpace, est le seul signal qui la
    // fait apparaître — voir garden-state-cmd-e.js).
    "serre-note-pot": {
      id: "serre-note-pot",
      trigger: "serreUnlocked",
      title: "Note dans la serre",
      text: "Deux graines. Une nuit. Regarder avant de décider.",
    },
    // Epic C4.3 : révélée par la commande meetIris (garden-state-cmd-n.js). Devient la condition
    // nécessaire et suffisante dont dépend C1.5 ("après le chapitre de botanique correspondant") —
    // C1.5 elle-même reste non implémentée par cet epic.
    "iris-epinglage": {
      id: "iris-epinglage",
      trigger: "irisPinningShown",
      title: "Iris et l’épinglage",
      text: "Un caractère déjà vu peut être fixé, pas seulement observé — regarde où la ressemblance ne bouge pas.",
    },
    // Epic C4.4 (design §10, chapitre 4) : révélée quand la rencontre scénarisée avec la
    // grenouille se résout réellement (garden-state-cmd-f.js, "sleep" — le même soir que le
    // croisement qui donne son feuillage à la Rainelle), jamais à l'armement (triggerFrogEncounter)
    // ni sur une nuit où l'essai n'a rien résolu. Le design décrit la scène en prose ("Au matin, le
    // joueur suit des traces mouillées jusqu'à un arrosoir déplacé.") sans la citer entre
    // guillemets comme la note de C4.3 — reformulation fidèle à la même image, même écart
    // documenté que "iris-epinglage" (C4.3) quand aucune citation exacte n'existe.
    "traces-mouillees": {
      id: "traces-mouillees",
      trigger: "frogEncounterResolved",
      title: "Traces mouillées",
      text: "Au matin, des traces mouillées mènent jusqu’à un arrosoir déplacé.",
    },
    // Epic C4.6 (design §10, chapitre 6, "On ne se fabrique pas tout seul") : révélée la toute
    // première fois qu'une tentative d'enseigner le verbe "multiplier" est refusée (teachGesture
    // ou demonstrateGesture, garden-state-cmd-j.js/-k.js — le refus déjà existant depuis C2.10,
    // Rainelles.MULTIPLY_REFUSAL), quel que soit le nombre de refus suivants. Le design est
    // explicite : "le jeu enseigne la manipulation sans certifier sa neutralité morale" — ce texte
    // constate ce que la Rainelle refuse et ce que le héros découvre pouvoir faire, sans jamais
    // dire si c'est bien ou mal.
    "on-ne-se-fabrique-pas-seul": {
      id: "on-ne-se-fabrique-pas-seul",
      trigger: "firstMultiplyRefusalSeen",
      title: "On ne se fabrique pas tout seul",
      text: "Elle refuse de se transformer elle-même, et refuse de le faire à une autre. Toi, personne ne t’a jamais refusé ce geste.",
    },
    // Epic C4.8 (design §10, chapitre 8, "La table longue") : révélée quand la quête
    // "table-longue-lea" (data-quests.js) est réellement complétée — signal générique
    // reward.narrativeFlag, garden-state-cmd-e.js. La fête, le décor et les tables eux-mêmes ne
    // sont pas construits par cet epic (voir sa propre entrée de campagne-backlog.md) : ce texte
    // ne raconte que ce qui est réellement vrai à ce stade, la réserve remplie, pas la fête.
    "table-longue-approvisionnee": {
      id: "table-longue-approvisionnee",
      trigger: "leaKitchenStocked",
      title: "La table longue",
      text: "La réserve de la cuisine ne manque plus de rien. Léa peut enfin penser à autre chose qu’au manque.",
    },
  };

  function findByTrigger(signal) {
    return Object.values(TEXTS).find((t) => t.trigger === signal) || null;
  }

  // Pure: the entry to record if `signal` fires and hasn't been seen yet, else null. Never
  // mutates campaignFlags itself — same "pure check here, caller mutates" split as
  // campaign-house.js's canRepair versus garden-state-cmd-l.js's repairHouseSpace.
  function pendingReveal(campaignFlags, signal) {
    const entry = findByTrigger(signal);
    if (!entry || campaignFlags.includes(entry.id)) return null;
    return entry;
  }

  const api = { TEXTS, findByTrigger, pendingReveal };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenNarrative = api;
})(globalThis);
