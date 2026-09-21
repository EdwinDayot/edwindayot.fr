/* GardenState.command() branch group V (UMD: node module / browser prototype). Epic C6.11
   (design §10, chapitre 17 "Rendre le passage" : "redimensionner les bacs") : resizePanier sets a
   panier's `capacity`/`min` (campaign-stations.js, posed by C2.8, never settable by any command
   until now — every panier has only ever carried Stations.DEFAULT_PANIER_CAPACITY/MIN since its
   creation). Not a world entity command (no c.id — a panier is addressed by its own
   campaignStations id, c.panierId), so not added to garden-state.js's `physical` list, same
   posture as setVeilleuse/setPriseFortDebit.

   Refused explicitly (never a silent no-op, same discipline as setVeilleuse's kind check) on: an
   unknown id or one that does not resolve to a panier; a non-integer/non-finite/negative
   capacity or min (garden-state-util.js's `count`, shared with reduceContract's own quota check);
   `capacity < 1` (a zero/negative-capacity panier is not a panier); `min > capacity`; and —
   the one rule specific to this command — a `capacity` that would drop below
   Stations.panierTotal(panier), the resource the panier already holds. Shrinking a panier must
   never make an already-stored resource silently disappear, exactly the concern
   campagne-backlog.md's own criterion names. `buffer` and every other panier in the registry are
   left untouched.

   No narrative reveal here, deliberately, same reasoning as C6.10's removeHabitat/releaseGesture:
   a panier's capacity/min is not one of the three intensification levers named by design §11's
   table — inventing a reveal here would not be reading the design. */
(function (root) {
  const Stations =
    typeof module !== "undefined"
      ? require("./game/campaign-stations.js")
      : root.GardenCampaignStations;
  const { count } =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  const M = {
    commandSegV(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "resizePanier") {
        st.taken = true;
        if (!count(c.capacity) || c.capacity < 1)
          return fail("Capacité de panier invalide.");
        if (!count(c.min)) return fail("Minimum de panier invalide.");
        if (c.min > c.capacity)
          return fail("Le minimum ne peut pas dépasser la capacité.");
        const resolved = Stations.resolveStation(s.campaignStations, c.panierId);
        if (!resolved.ok) return fail(resolved.error);
        if (resolved.kind !== "panier")
          return fail(`"${c.panierId}" n'est pas un panier.`);
        const held = Stations.panierTotal(resolved.station);
        if (c.capacity < held)
          return fail(
            `Ce panier contient déjà ${held} unité(s) : impossible de réduire sa capacité en dessous.`,
          );
        resolved.station.capacity = c.capacity;
        resolved.station.min = c.min;
        st.message = `Panier redimensionné (capacité ${c.capacity}, minimum ${c.min}).`;
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
