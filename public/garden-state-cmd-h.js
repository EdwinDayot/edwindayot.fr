/* GardenState.command() branch group H (UMD: node module / browser prototype). Epic C1.6:
   faithful multiplication. plantSpecimen installs a cultivar's first specimen in the campaign's
   own registry (s.specimens); multiplySpecimen copies an existing specimen's cultivarId onto a
   new specimen, with no genetics draw at all — it never requires or calls botany-pot.js, so
   there is nothing here that could re-roll a trait. Neither command targets a world entity
   (c.id, when present, is a specimen id "sp<n>", never an entity id "e<n>"), so neither is
   added to garden-state.js's `physical` list, exactly like sowPot/sleep in -f.js. Names are
   spelled out in full ("plantSpecimen", "multiplySpecimen") rather than reusing "plant"/
   "multiply": both those strings are already existing physical commands in -b.js, and command
   dispatch is a plain string match, so reusing them would silently run the wrong branch. */
(function (root) {
  const Cultivars =
    typeof module !== "undefined"
      ? require("./game/cultivars.js")
      : root.GardenCultivars;
  const M = {
    commandSegH(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "plantSpecimen") {
        st.taken = true;
        const cultivar = s.cultivars.find((cv) => cv.id === c.cultivarId);
        if (!cultivar) return fail("Cultivar inconnu.");
        if (
          typeof c.x !== "number" ||
          typeof c.z !== "number" ||
          !Number.isFinite(c.x) ||
          !Number.isFinite(c.z)
        )
          return fail("Emplacement invalide.");
        Cultivars.createSpecimen(s, {
          cultivarId: cultivar.id,
          x: c.x,
          z: c.z,
        });
        st.message = "Spécimen planté.";
      } else if (c.type === "multiplySpecimen") {
        st.taken = true;
        const source = s.specimens.find((sp) => sp.id === c.specimenId);
        if (!source) return fail("Spécimen source inconnu.");
        if (
          typeof c.x !== "number" ||
          typeof c.z !== "number" ||
          !Number.isFinite(c.x) ||
          !Number.isFinite(c.z)
        )
          return fail("Emplacement invalide.");
        // Only cultivarId is copied — never traits, never a call into botany-genetics.js/
        // botany-pot.js. specimenTraits() below always resolves through the cultivar, so the
        // new specimen is trait-identical to its source by construction, not by luck.
        Cultivars.createSpecimen(s, {
          cultivarId: source.cultivarId,
          x: c.x,
          z: c.z,
        });
        st.message = "Nouveau spécimen, fidèle au cultivar d’origine.";
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
