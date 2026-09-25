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

   No narrative reveal here, deliberately: this epic is moteur pur (its own backlog entry's title),
   the text shown per orientation is C6.19's job once this signal is real — same "moteur avant
   narration" sequencing already applied to C6.4/C6.5, C6.8/C6.9, C6.17/C6.19 itself. */
(function (root) {
  const Epilogue =
    typeof module !== "undefined"
      ? require("./game/campaign-epilogue.js")
      : root.GardenCampaignEpilogue;
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
