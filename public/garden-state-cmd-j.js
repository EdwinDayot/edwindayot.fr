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
        if (!Rainelles.VERBS.includes(c.verbe))
          return fail("Geste inconnu.");
        const poste = typeof c.poste === "string" ? c.poste.trim() : "";
        const source = typeof c.source === "string" ? c.source.trim() : "";
        const destination =
          typeof c.destination === "string" ? c.destination.trim() : "";
        const condition =
          typeof c.condition === "string" ? c.condition.trim() : "";
        if (!poste) return fail("Le poste ou la zone ne peut pas être vide.");
        if (!source) return fail("La source ne peut pas être vide.");
        if (!destination)
          return fail("La destination ne peut pas être vide.");
        // Wholesale replacement, never a merge onto the previous gesture: this is the literal
        // proof that "réenseigner remplace intégralement l'ancien geste (jamais un ajout)".
        const hadGesture = !!rainelle.geste;
        rainelle.geste = {
          verbe: c.verbe,
          poste,
          source,
          destination,
          condition,
        };
        st.message = hadGesture
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
