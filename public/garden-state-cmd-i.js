/* GardenState.command() branch group I (UMD: node module / browser prototype). Epic C2.3: the
   first Rainelle's encounter trigger (triggerFrogEncounter) and its rename command
   (renameRainelle, on the same pattern as renameCultivar in -g.js). Neither targets a world
   entity (c.id here is a rainelle id, "r<n>", never an entity id), so neither is added to
   garden-state.js's `physical` list, exactly like sowPot/sleep in -f.js. The actual creation of
   the Rainelle happens in -f.js's "sleep" (the night the encounter resolves against a real pot
   draw), not here — this file only arms and names it. */
(function (root) {
  const M = {
    commandSegI(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "triggerFrogEncounter") {
        st.taken = true;
        // Only ever the *first* Rainelle: later individuals come from the bourgeon/nursery
        // mechanic (design §5, chapitre 6), a different epic, not a second frog encounter.
        if (s.rainelles.length)
          return fail("La première Rainelle est déjà née.");
        if (s.campaignFrogEncounterPending)
          return fail("Une grenouille rôde déjà près du pot.");
        s.campaignFrogEncounterPending = true;
        st.message = "Une grenouille rôde près du pot cette nuit.";
      } else if (c.type === "renameRainelle") {
        st.taken = true;
        const rainelle = s.rainelles.find((r) => r.id === c.id);
        if (!rainelle) return fail("Rainelle inconnue.");
        const name = typeof c.name === "string" ? c.name.trim() : "";
        if (!name) return fail("Le nom ne peut pas être vide.");
        if (name.length > 40)
          return fail("Le nom est trop long (40 caractères maximum).");
        rainelle.name = name;
        st.message = `Renommée « ${name} ».`;
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
