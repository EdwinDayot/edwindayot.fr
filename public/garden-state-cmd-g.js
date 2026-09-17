/* GardenState.command() branch group G (UMD: node module / browser prototype). Epic C1.4: the
   notebook's disposition commands (renameCultivar, keepCultivar, storeCultivar, giveCultivar,
   compostCultivar) and the campaign seed box (retrieveSeedBoxSeed). None of these target a world
   entity (c.id here is a cultivar id, "c<n>", never an entity id, "e<n>"), so none is added to
   garden-state.js's `physical` list, exactly like sowPot/sleep in -f.js. */
(function (root) {
  const M = {
    commandSegG(c, ctx, st) {
      const { s, fail } = st;
      const find = (id) => s.cultivars.find((cv) => cv.id === id);
      if (c.type === "renameCultivar") {
        st.taken = true;
        const cultivar = find(c.id);
        if (!cultivar) return fail("Cultivar inconnu.");
        const name = typeof c.name === "string" ? c.name.trim() : "";
        if (!name) return fail("Le nom ne peut pas être vide.");
        if (name.length > 40)
          return fail("Le nom est trop long (40 caractères maximum).");
        // Allowed even after a disposition is set: renaming an already-kept cultivar stays
        // legitimate (design: the notebook keeps naming available independently of disposition).
        cultivar.name = name;
        st.message = `Renommé « ${name} ».`;
      } else if (
        c.type === "keepCultivar" ||
        c.type === "storeCultivar" ||
        c.type === "giveCultivar" ||
        c.type === "compostCultivar"
      ) {
        st.taken = true;
        const cultivar = find(c.id);
        if (!cultivar) return fail("Cultivar inconnu.");
        if (cultivar.disposition)
          return fail("Ce résultat a déjà reçu une décision.");
        const disposition = {
          keepCultivar: "kept",
          storeCultivar: "stored",
          giveCultivar: "given",
          compostCultivar: "composted",
        }[c.type];
        cultivar.disposition = disposition;
        // The safety mother seed is recorded once, at the very first successful keepCultivar of
        // the whole game — never rewritten afterwards, even if a later keepCultivar targets a
        // different cultivar. It is deliberately not wired to inventory/economy.js (no resale
        // value): free retrieval lives entirely in retrieveSeedBoxSeed below, not as an item.
        if (disposition === "kept" && !s.campaignSeedBox.seeded) {
          s.campaignSeedBox.seeded = true;
          s.campaignSeedBox.cultivarId = cultivar.id;
        }
        // The cultivar entry itself is never removed or altered beyond `disposition`: this is
        // the literal proof that "le carnet garde la découverte même si l'exemplaire est ensuite
        // composté" (composting never deletes s.cultivars[i]).
        st.message = {
          kept: "Conservé dans le carnet.",
          stored: "Mis en réserve.",
          given: "Offert en don.",
          composted: "Composté — le carnet garde la découverte.",
        }[disposition];
      } else if (c.type === "retrieveSeedBoxSeed") {
        st.taken = true;
        if (!s.campaignSeedBox.seeded)
          return fail("Aucune graine mère n’est encore enregistrée.");
        // Never consumed: repeatable at will, for dépannage only (see header comment above).
        s.campaignSeedBox.retrievals++;
        st.message = "Graine mère récupérée dans la boîte de semences.";
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
