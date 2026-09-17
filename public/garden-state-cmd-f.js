/* GardenState.command() branch group F (UMD: node module / browser prototype). Epic C1.3: the
   pot's two commands, sowPot and sleep. Neither targets a world entity (no c.id, no pot mesh
   yet — that is the campaign's own s.campaignPot, not the free-garden's "pot" entity type), so
   neither is added to garden-state.js's `physical` list, which requires a nearby entity. */
(function (root) {
  const Genetics =
    typeof module !== "undefined"
      ? require("./game/botany-genetics.js")
      : root.GardenGenetics;
  const Pot =
    typeof module !== "undefined"
      ? require("./game/botany-pot.js")
      : root.GardenPot;
  const Cultivars =
    typeof module !== "undefined"
      ? require("./game/cultivars.js")
      : root.GardenCultivars;
  const M = {
    commandSegF(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "sowPot") {
        st.taken = true;
        const known = (id) => Genetics.founders.some((f) => f.id === id);
        if (!known(c.a) || !known(c.b))
          return fail("Choisis deux espèces fondatrices connues.");
        if (!Genetics.crossCompatible(c.a, c.b))
          return fail("Ces deux espèces ne peuvent pas être croisées ensemble.");
        if (s.campaignPot.pending.length >= s.campaignPot.capacity)
          return fail("Le pot est déjà occupé pour cette nuit.");
        s.campaignPot.pending.push({ a: c.a, b: c.b });
        st.message = "Graines posées dans le pot, prêtes pour la nuit.";
      } else if (c.type === "sleep") {
        st.taken = true;
        // Resolved and materialised synchronously here, once, at the moment the command runs:
        // there is no intermediate "drawn but not yet saved" state besides pending itself (which
        // only ever holds seeds *not yet* resolved). A reload after this command therefore
        // cannot draw a second time — resolvePotDraw is never called from validate/fresh/load.
        for (const { a, b } of s.campaignPot.pending) {
          const traits = Pot.resolvePotDraw(a, b);
          // Name left empty on purpose: naming the cultivar is C1.4's job (carnet de
          // botanique), not this epic's.
          Cultivars.createCultivar(s, { name: "", parentIds: [a, b], traits });
        }
        s.campaignPot.pending = [];
        st.message = "Une nouvelle nuit commence.";
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
