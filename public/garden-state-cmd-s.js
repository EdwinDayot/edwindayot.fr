/* GardenState.command() branch group S (UMD: node module / browser prototype). Epic C6.7 (design
   §10, chapitre 15 "Alma n'a pas la réponse"): restoreArchiveLabels lets the player "restaurer
   les deux noms sur les étiquettes" once Alma's return has already been narrated ("alma-retour",
   revealed by garden-state-cmd-f.js's sleep) — refused before that. On a valid call it reveals a
   third, closing text quoting Alma's exact line. No extra persisted field remembers "already
   done": data-narrative.js's pendingReveal already refuses to reveal an id already present in
   campaignFlags, so a second call is simply without further effect, never a destructive error —
   same principle already used by pinTrait/signContract. Not a world entity command (no c.id),
   same posture as pinTrait/setVeilleuse. */
(function (root) {
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const M = {
    commandSegS(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "restoreArchiveLabels") {
        st.taken = true;
        if (!s.campaignFlags.includes("alma-retour"))
          return fail("Alma n’est pas encore revenue.");
        const revealed = Narrative.pendingReveal(
          s.campaignFlags,
          "archiveLabelsRestored",
        );
        if (revealed) s.campaignFlags.push(revealed.id);
        st.message = revealed
          ? "Les deux noms sont restaurés sur les étiquettes."
          : "Les étiquettes portent déjà les deux noms.";
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
