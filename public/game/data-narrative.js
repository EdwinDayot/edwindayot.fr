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
