/* GardenState.command() branch group J (UMD: node module / browser prototype). Epic C2.4: the
   "geste unique" contract (design §5) — teachGesture assigns or replaces the single gesture a
   Rainelle remembers. Not a world entity command (c.id here is a rainelle id, "r<n>", never an
   entity id), so not added to garden-state.js's `physical` list, exactly like renameRainelle
   in -i.js. No execution wiring yet (automation.js, C2.6+): this only maintains the memory slot.

   Epic C4.6 (design §10, chapitre 6): a refusal here that is specifically
   Rainelles.MULTIPLY_REFUSAL (never any other applyGesture error) also fires the "on-ne-se-
   fabrique-pas-seul" narrative reveal (data-narrative.js), same "pure check in the data file,
   push here" split as every other narrative trigger in -f.js/-i.js/-n.js. Mutating
   s.campaignFlags on a failed command is deliberate: the refusal itself *is* the in-fiction
   beat the design names ("montrée dès les premières tentatives"), not a side effect of a
   successful teach. */
(function (root) {
  const Rainelles =
    typeof module !== "undefined"
      ? require("./game/rainelles.js")
      : root.GardenRainelles;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const Memory =
    typeof module !== "undefined"
      ? require("./game/campaign-memory.js")
      : root.GardenCampaignMemory;
  const M = {
    commandSegJ(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "teachGesture") {
        st.taken = true;
        const rainelle = s.rainelles.find((r) => r.id === c.id);
        if (!rainelle) return fail("Rainelle inconnue.");
        // Shared with garden-state-cmd-k.js (epic C2.5's confirmTeaching/teachGestureQuick) so
        // the "wholesale replacement, never a merge" rule and field validation can never drift
        // between the one-shot path here and the four-moment flow there.
        const r = Rainelles.applyGesture(rainelle, c);
        if (!r.ok) {
          if (r.error === Rainelles.MULTIPLY_REFUSAL) {
            const revealed = Narrative.pendingReveal(
              s.campaignFlags,
              "firstMultiplyRefusalSeen",
            );
            if (revealed) s.campaignFlags.push(revealed.id);
          }
          return fail(r.error);
        }
        // Epic C5.1: a direct gesture command is a manual intervention (design §11); recorded
        // only here on success, never on the refusal above (design §11, "une commande refusée ne
        // devient jamais un dommage fictif attribué au joueur").
        Memory.recordManualIntervention(s.campaignMemory);
        if (!r.hadGesture)
          Memory.recordFirstGesture(s.campaignMemory, rainelle.id, c.verbe);
        st.message = r.hadGesture
          ? `Ancien geste remplacé : ${c.verbe}.`
          : `Geste appris : ${c.verbe}.`;
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
