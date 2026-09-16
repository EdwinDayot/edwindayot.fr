/* GardenState.command() branch group C (UMD: node module / browser prototype). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const I =
    typeof module !== "undefined"
      ? require("./game/irrigation.js")
      : root.GardenIrrigation;
  const P =
    typeof module !== "undefined"
      ? require("./game/progression.js")
      : root.GardenProgression;
  const util =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  const { clone, finite, count, plant, knownItem } = util;
  const M = {
    commandSegC(c, ctx, st) {
      const { s, e, fail } = st;
      /* branch group */
      if (c.type === "collectYoung") {
        st.taken = true;
        if (e.type !== "nursery" || !e.job || e.job.remaining !== 0)
          return fail("Le jeune plant n’est pas encore prêt.");
        this.add(`young:${e.job.species}`, 1);
        e.job = null;
        s.stats.collected++;
        st.message = "Un jeune plant rejoint le sac. L’établi est libre.";
      } else if (c.type === "trade" || c.type === "replace") {
        st.taken = true;
        const index = s.requests.findIndex((r) => r.id === c.request),
          r = s.requests[index];
        if (!r) return fail("Demande introuvable.");
        if (c.type === "trade") {
          if (
            !this.near(
              ctx,
              D.visitors.find((v) => v.id === "lea"),
            ) ||
            !this.has({ [r.item]: r.quantity })
          )
            return fail("Retrouve Léa avec la production demandée.");
          this.pay({ [r.item]: r.quantity });
          P.trade(s, r.item);
          message =
            "Échange terminé : 18 feuilles, une graine et de la réputation.";
        } else message = "Demande remplacée gratuitement.";
        s.requests[index] = this.makeRequest();
      } else if (c.type === "botany") {
        st.taken = true;
        const milestone = [3, 6, 9, 12].find(
          (n) => s.discovered.length >= n && !s.botanyRewards.includes(n),
        );
        if (
          !milestone ||
          !this.near(
            ctx,
            D.visitors.find((v) => v.id === "iris"),
          )
        )
          return fail("Retrouve Iris après de nouvelles découvertes.");
        P.botany(s, milestone);
        st.message = "Iris t’offre un banc et 8 feuilles pour ta collection.";
      } else if (c.type === "rescue") {
        st.taken = true;
        if (
          s.entities.some((e) => e.plant) ||
          Object.entries(s.inventory).some(
            ([k, n]) => n > 0 && /^(seed|young):/.test(k),
          )
        )
          return fail("Ton jardin peut encore grandir : utilise ta réserve.");
        this.add("seed:pilea", 2);
        if (!s.entities.some(I.isPot) && !s.inventory.pot) this.add("pot", 1);
        st.message =
          "Deux graines de Pilea offertes pour recommencer tranquillement.";
      } else if (c.type === "settings") {
        st.taken = true;
        if (
          !["hints", "sound", "reduced"].includes(c.key) ||
          typeof c.value !== "boolean"
        )
          return fail("Réglage invalide.");
        s.settings[c.key] = c.value;
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
