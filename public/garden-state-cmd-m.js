/* GardenState.command() branch group M (UMD: node module / browser prototype). Epic C3.4
   (design §5, "Multiplication et vie propre") : formBud/harvestBud, the second-Rainelle
   mechanic. formBud marks a bourgeon present on a named Rainelle (no scripted staging exists
   yet, same posture as triggerFrogEncounter for the first Rainelle at C2.3 — see
   rainelles.js's own comment). harvestBud requires a free living place (campaign-stations.js's
   freeLivingPlaces, counting both the current population AND any bourgeon already waiting in
   the nursery, so two harvests in the same day can never together promise more births than the
   community actually has room for) before it lets go of the bourgeon at all — a refusal here
   never touches the Rainelle. The harvested bourgeon then waits in s.campaignNursery until the
   next "sleep" resolves it into a brand-new individual (garden-state-cmd-f.js) — never
   instantaneous, per the design's own "il s'éveille après une nuit de sommeil". Neither command
   targets a world entity (c.id here is a rainelle id, "r<n>"), so neither is added to
   garden-state.js's `physical` list, same posture as every other rainelle command in -i.js/-j.js/
   -k.js. */
(function (root) {
  const Rainelles =
    typeof module !== "undefined"
      ? require("./game/rainelles.js")
      : root.GardenRainelles;
  const Stations =
    typeof module !== "undefined"
      ? require("./game/campaign-stations.js")
      : root.GardenCampaignStations;
  const M = {
    commandSegM(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "formBud") {
        st.taken = true;
        const rainelle = s.rainelles.find((r) => r.id === c.id);
        if (!rainelle) return fail("Rainelle inconnue.");
        const result = Rainelles.formBud(rainelle);
        if (!result.ok) return fail(result.error);
        st.message = "Un bourgeon se forme.";
      } else if (c.type === "harvestBud") {
        st.taken = true;
        const rainelle = s.rainelles.find((r) => r.id === c.id);
        if (!rainelle) return fail("Rainelle inconnue.");
        if (!rainelle.bourgeon)
          return fail("Cette Rainelle ne porte aucun bourgeon à prélever.");
        // Reserve for the population that will actually exist once every bourgeon already
        // waiting in the nursery has also hatched — never just today's headcount, or two
        // harvests taken before the next sleep could together promise more births than the
        // community has habitats for (see this file's own header comment).
        const reserved = s.rainelles.length + s.campaignNursery.length;
        if (Stations.freeLivingPlaces(s.campaignStations, reserved) <= 0)
          return fail(
            "Aucune place de vie libre : aménager un habitat avant de prélever ce bourgeon.",
          );
        const result = Rainelles.harvestBud(rainelle);
        if (!result.ok) return fail(result.error);
        s.campaignNursery.push({
          id: `nu${s.campaignNurseryNextId++}`,
          cultivarId: result.cultivarId,
        });
        st.message = "Bourgeon prélevé, déposé à la nurserie.";
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
