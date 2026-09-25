/* Campaign end-of-game orientation, part of the campaign layer (UMD: node module / browser
   GardenCampaignEpilogue).

   Epic C6.17 (design §10, chapitre 18 : « Trois orientations sont possibles : production toujours
   intensive, accommodements partiels ou transformation durable » ; design §11, the system must
   distinguish "au moins quatre parcours : joueur attentif dès le départ ; joueur qui découvre les
   dégâts et change ; joueur qui effectue quelques gestes sans modifier son fonctionnement ; joueur
   qui assume et poursuit l'intensification" — the three chapter-18 orientations are the condensed
   version of those four parcours). The Cartographe's thirteenth-lot note (campagne-backlog.md)
   found every signal this needs already real and filled in the engine — no new save field, no
   migration: a pure derivation, same "dérivé plutôt que stocké" posture already applied to
   Memory.bassinCommunLevel (C5.4) and Contracts.unsoldStock (C6.4), so this can never drift from
   the real state it reads.

   "intensive"/"partiel"/"durable" are this epic's own chosen identifiers — the design fixes no
   literal keyword for the three orientations, only their French descriptions above.

   `orientation(s)` never mutates its argument (called freely from a future epilogue screen/test at
   any point in a real playthrough, not just once at chapter 18). Reads only:
     - s.campaignMemory.nightlyActivity / s.campaignMemory.waterWithdrawals (C5.2/C5.4/C6.2): a
       lever was really *used* at least once, never merely toggled on with nothing to act on — same
       "posséder une veilleuse éteinte ne compte pas comme une nuit de travail" strictness already
       applied throughout campaign-memory.js.
     - s.campaignContracts (C6.4): a commercial contract was really signed at least once — engaging
       commercially without ever touching a veilleuse/prise still counts as "engaged", so
       everEngaged has to check all three independently rather than only the two lever journals.
     - s.campaignStations.zones[].veilleuse / s.campaignStations.bornes[].priseFortDebit (C5.2/C5.4/
       C6.2): whether a lever is still active *right now*, at the moment orientation() is read.
     - s.campaignFlags (C6.9): the three real-cost renunciation flags (levier-veilleuse-coupee/
       levier-prise-restituee/levier-contrat-reduit) — proof a lever was actually reversed with a
       cost, never guessed from a lever simply being off (a lever can be off because it was never
       turned on in the first place, which everEngaged already separates out below).

   Branch order, read literally off the backlog's own five-branch table:
     1. !everEngaged -> "durable" (never touched a lever or a contract at all — "joueur attentif dès
        le départ").
     2. anyLeverActive && !anyLeverReversed -> "intensive" (a lever has served, is still on, no
        renunciation ever recognized — "joueur qui assume et poursuit l'intensification").
     3. !anyLeverActive && anyLeverReversed -> "durable" (no lever active any more, at least one
        real, recognized renunciation — "joueur qui découvre les dégâts et change").
     4. everything else (a lever still on despite a renunciation elsewhere, or a lever that served
        then was turned off without any of C6.9's three reveals ever having had the chance to fire)
        -> "partiel", read broadly per the backlog: a mixed or incomplete signal, never guessed
        toward either extreme.

   Honest limits, documented rather than guessed (backlog's own): this derives only an internal
   string, never a text/scene/image (chapter 18's narration/rendering is a future epic once this
   signal is real) ; it does not cover "la lecture différente du refus" (chapter 13/C6.6) nor
   Memory.habitatTransformations (still reserved and never filled by any command since C5.1) — both
   exist in the design but not yet in a usable engine form, left to a future refinement of this
   function if a future parcours test (design §16) shows the current three orientations are not
   enough, rather than guessing their weight now. Chapter 17's "protection contre une extension
   lucrative" branch is not covered here either — closed for good by the Cartographe's own note
   above this epic (structurally unreachable, s.campaignPassage.blocked can never become true again
   once restored).

   Epic C6.18 adds `canOpen(s)`, also pure/never mutating: true only once `s.campaignEpilogue`
   (garden-state-lifecycle.js/garden-state-validate.js, new this epic) has a real `unlocksOnDay`
   (set the moment a Rainelle actually settles at the passage, C6.15 — see garden-state-cmd-f.js/
   -u.js/-w.js's own comments for the three sites), the current day has reached it, and the
   epilogue has not already been opened (`openedOnDay` still null) — `openEpilogue`
   (garden-state-cmd-x.js) is the only place this can ever move from false to true, freezing
   `orientation(s)`'s result at that exact moment rather than leaving it live. */
(function (root) {
  const ORIENTATIONS = { INTENSIVE: "intensive", PARTIEL: "partiel", DURABLE: "durable" };

  const LEVER_REVERSAL_FLAGS = [
    "levier-veilleuse-coupee",
    "levier-prise-restituee",
    "levier-contrat-reduit",
  ];

  // Pure: never mutates s. See header comment for the exact reading of each branch.
  function orientation(s) {
    const everEngaged =
      Object.keys(s.campaignMemory.nightlyActivity).length > 0 ||
      Object.keys(s.campaignMemory.waterWithdrawals).length > 0 ||
      s.campaignContracts.length > 0;
    if (!everEngaged) return ORIENTATIONS.DURABLE;

    const anyLeverActive =
      s.campaignStations.zones.some((z) => z.veilleuse) ||
      s.campaignStations.bornes.some((b) => b.priseFortDebit);
    const anyLeverReversed = LEVER_REVERSAL_FLAGS.some((flag) =>
      s.campaignFlags.includes(flag),
    );

    if (anyLeverActive && !anyLeverReversed) return ORIENTATIONS.INTENSIVE;
    if (!anyLeverActive && anyLeverReversed) return ORIENTATIONS.DURABLE;
    return ORIENTATIONS.PARTIEL;
  }

  // Pure: never mutates s. See header comment (Epic C6.18) for what each field of
  // s.campaignEpilogue means and who writes it.
  function canOpen(s) {
    return (
      s.campaignEpilogue.unlocksOnDay !== null &&
      s.campaignDay >= s.campaignEpilogue.unlocksOnDay &&
      s.campaignEpilogue.openedOnDay === null
    );
  }

  const api = { ORIENTATIONS, orientation, canOpen };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignEpilogue = api;
})(globalThis);
