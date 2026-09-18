/* GardenState.command() branch group J (UMD: node module / browser prototype). Epic C2.4: the
   "geste unique" contract (design §5) — teachGesture assigns or replaces the single gesture a
   Rainelle remembers. Not a world entity command (c.id here is a rainelle id, "r<n>", never an
   entity id), so not added to garden-state.js's `physical` list, exactly like renameRainelle
   in -i.js. No execution wiring yet (automation.js, C2.6+): this only maintains the memory slot. */
(function (root) {
  const Rainelles =
    typeof module !== "undefined"
      ? require("./game/rainelles.js")
      : root.GardenRainelles;
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
        if (!r.ok) return fail(r.error);
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
