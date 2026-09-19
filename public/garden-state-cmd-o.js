/* GardenState.command() branch group O (UMD: node module / browser prototype). Epic C1.5
   (design §4, l.147: "le carnet permet d'épingler un caractère déjà observé provenant d'un
   parent... garanti à l'essai suivant, les autres restent variables") and design §10, chapitre 3
   ("Iris montre comment épingler un caractère déjà vu"): pinTrait records a single pending pin
   (`s.campaignPin`, replaced wholesale on re-pinning — never merged with a previous one, same
   "one active choice at a time" posture as teachGesture/C2.4), gated on the "iris-epinglage"
   narrative flag revealed by meetIris (garden-state-cmd-n.js/C4.3) — the design's own "après le
   premier chapitre de botanique" condition, the only one the game currently exposes as a checkable
   signal. The pin itself is only ever *consumed* by sowPot (garden-state-cmd-f.js), which is what
   actually attaches it to the pending pair and clears s.campaignPin — this command only ever sets
   or replaces the pending pin, never touches the pot. Not a world entity command (no c.id), same
   posture as sowPot/chooseFurnitureTreatment. */
(function (root) {
  const Genetics =
    typeof module !== "undefined"
      ? require("./game/botany-genetics.js")
      : root.GardenGenetics;
  const M = {
    commandSegO(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "pinTrait") {
        st.taken = true;
        if (!s.campaignFlags.includes("iris-epinglage"))
          return fail("Il faut d’abord voir Iris montrer comment épingler un caractère.");
        if (!Genetics.AXES.includes(c.axis))
          return fail(`Caractère inconnu : "${c.axis}".`);
        if (!Genetics.founders.some((f) => f.id === c.speciesId))
          return fail("Espèce fondatrice inconnue.");
        s.campaignPin = { axis: c.axis, speciesId: c.speciesId };
        st.message = "Caractère épinglé, garanti au prochain essai.";
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
