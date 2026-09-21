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
   sequencing already applied to C6.4/C6.5 and C6.8/C6.9. */
(function (root) {
  const Passage =
    typeof module !== "undefined"
      ? require("./game/campaign-passage.js")
      : root.GardenCampaignPassage;
  const M = {
    commandSegW(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "restorePassage") {
        st.taken = true;
        const result = Passage.restorePassage(s.campaignPassage);
        if (!result.ok) return fail(result.error);
        s.campaignPassage.blocked = result.blocked;
        st.message = "Passage rétabli.";
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
