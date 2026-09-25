/* GardenState.command() branch group W (UMD: node module / browser prototype). Epic C6.12
   (design §10, chapitre 17 "Rendre le passage") wires the one command campaign-passage.js poses:
   restorePassage, a thin wrapper over the pure Passage.restorePassage (campaign-passage.js) — see
   that file's own header comment for the "why only this one clause of the chapter, for now"
   reasoning. Not a world entity command (s.campaignPassage is a single object, never addressed by
   c.id), so not added to garden-state.js's `physical` list, same posture as setVeilleuse/
   releaseGesture.

   No narrative reveal here, deliberately: an accueil narratif would need a real, factual sign that
   the passage was actually used (someone crossing it, once it has a position) — nothing in the
   engine can produce that yet, since this epic gives the passage no position or navigation-graph
   link at all. Left for a future epic, once that socle exists, same "moteur avant narration"
   sequencing already applied to C6.4/C6.5 and C6.8/C6.9.

   Epic C6.15 adds one further step once restorePassage itself has actually succeeded: the passage
   opening is one of the two events that can complete the settling condition (the other is
   releaseGesture, garden-state-cmd-u.js) — RainelleMovement.selectRainelleToSettle(s) (pure,
   never mutates) is consulted immediately after, and its candidate (if any) is the one place this
   command applies `settledAt = true`, same "decide there, mutate here" split already documented
   in rainelle-movement.js's own header comment for this function.

   Epic C6.16 adds the narrative reveal for that same event: once settleId is really non-null
   here, Narrative.pendingReveal fires "passageRainelleSettled" (data-narrative.js), same one-shot
   pattern already used by every other campaignFlags reveal in this codebase.

   Epic C6.18 adds one further step, only once settleId is really non-null here and only if
   s.campaignEpilogue.unlocksOnDay is still null (the first of the three settling sites reached
   wins, the other two never run this again for the same game — a Rainelle only ever settles
   once, C6.15): s.campaignEpilogue.unlocksOnDay = s.campaignDay + 3, the same three-site pattern
   as settledAt/the narrative reveal just above. */
(function (root) {
  const Passage =
    typeof module !== "undefined"
      ? require("./game/campaign-passage.js")
      : root.GardenCampaignPassage;
  const RainelleMovement =
    typeof module !== "undefined"
      ? require("./game/rainelle-movement.js")
      : root.GardenRainelleMovement;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const M = {
    commandSegW(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "restorePassage") {
        st.taken = true;
        const result = Passage.restorePassage(s.campaignPassage);
        if (!result.ok) return fail(result.error);
        s.campaignPassage.blocked = result.blocked;
        st.message = "Passage rétabli.";
        const settleId = RainelleMovement.selectRainelleToSettle(s);
        if (settleId) {
          s.rainelles.find((r) => r.id === settleId).settledAt = true;
          const revealed = Narrative.pendingReveal(
            s.campaignFlags,
            "passageRainelleSettled",
          );
          if (revealed) s.campaignFlags.push(revealed.id);
          if (s.campaignEpilogue.unlocksOnDay === null)
            s.campaignEpilogue.unlocksOnDay = s.campaignDay + 3;
        }
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
