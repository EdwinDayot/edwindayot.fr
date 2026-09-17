/* The pot's randomised draw for a founder cross (UMD: node module / browser GardenPot). This is
   the resolver named as still missing by botany-genetics.js's own header comment: that module
   only supplies the grammar (founders, crossCompatible, traitCombinationValid,
   enumerateReachableTraitSets) for epic C1.3 to draw from; this module is that draw.

   Design §4 point 2: "chaque locus discret vient de l'un des parents, à probabilité égale
   lorsque les deux sont compatibles." Each of the six axes (port, feuilles, fleurs, palette,
   humidite, fonction — the same fixed order botany-genetics.js enumerates in) is drawn
   independently: one random() call per axis, parent A below 0.5, parent B otherwise. If the
   resulting trait set fails GardenGenetics.traitCombinationValid (design §4 point 5: a fonction
   must find its structural requirement on the *same* set), the whole set — all six axes — is
   discarded and redrawn from scratch (six fresh random() calls), never patched locus by locus:
   patching one axis alone would silently bias the axes kept from the first attempt away from
   50/50. campaign-genetics.cjs already proves every compatible pair has at least one valid
   reachable combination, so this loop always terminates for a real compatible pair; the attempt
   cap below is a defensive guard only, not a real code path in play.

   `random` defaults to Math.random but is always overridable, precisely so a test can supply a
   seeded generator and check the per-axis 50/50 property statistically over many draws without
   depending on the platform's real RNG. Depends only on GardenGenetics — nothing here touches a
   save, a command or the DOM. */
(function (root) {
  const Genetics =
    typeof module !== "undefined"
      ? require("./botany-genetics.js")
      : root.GardenGenetics;

  // Fixed draw order, matching botany-genetics.js's own AXES (see its enumerateReachableTraitSets).
  const AXES = ["port", "feuilles", "fleurs", "palette", "humidite", "fonction"];
  const MAX_ATTEMPTS = 1000;

  function resolvePotDraw(idA, idB, random = Math.random) {
    const a = Genetics.founders.find((f) => f.id === idA);
    const b = Genetics.founders.find((f) => f.id === idB);
    if (!a || !b) throw new Error(`unknown founding species: ${idA} / ${idB}`);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const traits = {};
      for (const axis of AXES) traits[axis] = random() < 0.5 ? a.traits[axis] : b.traits[axis];
      if (Genetics.traitCombinationValid(traits)) return traits;
    }
    throw new Error(
      `resolvePotDraw: no valid trait combination drawn for ${idA} x ${idB} after ${MAX_ATTEMPTS} attempts`,
    );
  }

  const api = { resolvePotDraw };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenPot = api;
})(globalThis);
