/* GardenState.command() branch group X (UMD: node module / browser prototype). Epic C6.18
   (design §10, chapitre 18, deuxième temps : "délai d'observation et gel du résultat") wires the
   one command campaign-epilogue.js's canOpen(s) gates: openEpilogue, taking no parameter. Not a
   world entity command (s.campaignEpilogue is a single object, never addressed by c.id), so not
   added to garden-state.js's `physical` list, same posture as restorePassage/releaseGesture.

   Refused, without any mutation, for two distinct reasons a player needs to tell apart (same
   discipline as restorePassage/reduceContractQuota's own refusals): "déjà ouvert" if
   s.campaignEpilogue.openedOnDay is already set (openEpilogue is one-way, like restorePassage —
   no command ever resets it), checked first so it always wins over the other reason once true;
   "pas encore accessible" otherwise, whenever Epilogue.canOpen(s) is still false (no Rainelle has
   settled yet, or the three-day delay from C6.18's own unlocksOnDay has not elapsed).

   On success, Epilogue.orientation(s) is read exactly once and its result frozen into
   s.campaignEpilogue.orientation/openedOnDay = s.campaignDay — "le joueur ouvre le domaine dans
   l'état qu'il a choisi", a photograph, never a value that keeps tracking the live state
   afterward (a lever toggled back on after this command runs must never move the frozen
   orientation, see tests/campaign-epilogue-gate.cjs).

   Epic C6.19 (design §10, chapitre 18, troisième temps : "texte de l'épilogue par orientation")
   adds the narrative reveal here, on success only: Narrative.epilogueOrientationSignal maps the
   just-frozen orientation to its own trigger (exactly one of epilogueOuvertIntensive/-Partiel/
   -Durable, data-narrative.js), then the common closing clause ("epilogueOuvert",
   "epilogue-suite") is revealed right after — always both, on every successful call, never either
   alone (openEpilogue is one-way, C6.18, so this can only ever run once per game). */
(function (root) {
  const Epilogue =
    typeof module !== "undefined"
      ? require("./game/campaign-epilogue.js")
      : root.GardenCampaignEpilogue;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const M = {
    commandSegX(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "openEpilogue") {
        st.taken = true;
        if (s.campaignEpilogue.openedOnDay !== null)
          return fail("L'épilogue est déjà ouvert.");
        if (!Epilogue.canOpen(s))
          return fail("L'épilogue n'est pas encore accessible.");
        s.campaignEpilogue.orientation = Epilogue.orientation(s);
        s.campaignEpilogue.openedOnDay = s.campaignDay;
        const orientationRevealed = Narrative.pendingReveal(
          s.campaignFlags,
          Narrative.epilogueOrientationSignal(s.campaignEpilogue.orientation),
        );
        if (orientationRevealed) s.campaignFlags.push(orientationRevealed.id);
        const suiteRevealed = Narrative.pendingReveal(
          s.campaignFlags,
          "epilogueOuvert",
        );
        if (suiteRevealed) s.campaignFlags.push(suiteRevealed.id);
        st.message = "Épilogue ouvert.";
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
