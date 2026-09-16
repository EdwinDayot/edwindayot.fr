/* GardenState.command() branch group A (UMD: node module / browser prototype). */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./game/data.js") : root.GardenData;
  const C =
    typeof module !== "undefined"
      ? require("./game/construction.js")
      : root.GardenConstruction;
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
  const { clone, finite, count, sow, knownItem } = util;
  const M = {
    commandSegA(c, ctx, st) {
      const { s, e, fail } = st;
      /* branch group */
      if (c.type === "equip") {
        st.taken = true;
        if (
          !Number.isInteger(c.slot) ||
          c.slot < 0 ||
          c.slot > 4 ||
          typeof c.item !== "string" ||
          !(
            D.tools[c.item] ||
            (D.recipes[c.item] && s.plans.includes(c.item)) ||
            (/^(seed|young|cutting):/.test(c.item) &&
              knownItem(c.item) &&
              s.discovered.includes(c.item.split(":")[1]))
          )
        )
          return fail("Choisis un objet connu et un emplacement de 1 à 5.");
        s.hotbar[c.slot] = c.item;
        st.message = `Emplacement ${c.slot + 1} équipé.`;
      } else if (c.type === "swapSlots") {
        st.taken = true;
        if (![c.a, c.b].every((n) => Number.isInteger(n) && n >= 0 && n < 5))
          return fail("Emplacement invalide.");
        [s.hotbar[c.a], s.hotbar[c.b]] = [s.hotbar[c.b], s.hotbar[c.a]];
        st.message = "Barre rapide réorganisée.";
      } else if (c.type === "fill") {
        st.taken = true;
        if (!this.near(ctx, { x: 3.5, z: 4 }))
          return fail("Approche-toi du ponton pour puiser de l’eau.");
        s.water = 100;
        st.message = "Arrosoir rempli à la rivière.";
      } else if (c.type === "plant") {
        st.taken = true;
        const sp = D.species.find((p) => p.id === c.species),
          item = `${c.source || "seed"}:${c.species}`;
        if (
          !I.isPot(e) ||
          e.plant ||
          !sp ||
          !["seed", "young"].includes(c.source || "seed") ||
          !s.discovered.includes(sp.id) ||
          !this.has({ [item]: 1 })
        )
          return fail("Choisis une graine disponible et un pot vide.");
        this.pay({ [item]: 1 });
        sow(e, sp.id, c.source || "seed");
        st.message = `${sp.name} planté. Un arrosage pour commencer.`;
      } else if (c.type === "water") {
        st.taken = true;
        if (
          !e.plant ||
          e.plant.moisture > 65 ||
          s.water < D.balance.wateringCost
        )
          return fail("Il faut une plante, du terreau sec et 20 unités d’eau.");
        s.water -= D.balance.wateringCost;
        s.stats.waterUsed += D.balance.wateringCost;
        e.plant.moisture = Math.min(
          100,
          e.plant.moisture + D.balance.wateringMoisture,
        );
        st.message = "Une pluie douce sur le terreau.";
      } else if (c.type === "collect") {
        st.taken = true;
        if (!e.plant?.ready) return fail("La production se prépare encore.");
        const p = D.species.find((p) => p.id === e.plant.species);
        this.add(`${p.product}:${p.id}`, e.plant.ready);
        s.stats.collected += e.plant.ready;
        e.plant.ready = 0;
        st.message = `Récolte de ${p.name} rangée dans l’inventaire.`;
      } else if (c.type === "mine") {
        st.taken = true;
        const r = s.resources.find((r) => r.id === c.id),
          now = s.elapsed + s.remainder;
        if (
          !r ||
          !s.unlocked.includes(r.zone) ||
          !C.resourceClear(s, r) ||
          !this.near(ctx, r) ||
          r.ready > s.elapsed
        )
          return fail("Approche-toi d’une ressource disponible.");
        const spec = D.mining[r.type];
        if (c.tool !== spec.tool)
          return fail(
            `Équipe ${D.tools[spec.tool].toLowerCase()} pour ${spec.verb.toLowerCase()}.`,
          );
        if ((r.nextHit || 0) > now) return fail("Le geste se termine.");
        r.work = (r.work || 0) + 1;
        r.nextHit = now + 0.65;
        if (r.work >= spec.hits) {
          this.add(r.type, D.balance.resourceYield);
          r.work = 0;
          r.ready = s.elapsed + spec.renew;
          message = `+3 ${D.itemName(r.type)} · renouvellement dans ${spec.renew} s.`;
        } else
          message = `${spec.verb} · ${r.work}/${spec.hits} · maintiens E ou le clic.`;
      } else if (c.type === "discover") {
        st.taken = true;
        const cache = D.caches.find((o) => o.id === c.id);
        if (
          !cache ||
          !s.unlocked.includes(cache.zone) ||
          !this.near(ctx, cache) ||
          s.discovered.includes(cache.species)
        )
          return fail("Cette découverte n’est pas accessible.");
        P.discover(s, cache.species);
        st.message = `Découverte : ${D.species.find((p) => p.id === cache.species).name}. Deux graines et une page au carnet.`;
      } else if (c.type === "unlock") {
        st.taken = true;
        const z = D.zones[c.zone];
        if (
          !z ||
          s.unlocked.includes(z.id) ||
          (z.id === 3 && !s.unlocked.includes(2)) ||
          !this.near(ctx, { x: z.gate[0], z: z.gate[1] }) ||
          s.reputation < z.rep ||
          !this.has(z.cost)
        )
          return fail(
            "Rejoins le passage avec les matériaux, les feuilles et la réputation indiqués.",
          );
        this.pay(z.cost);
        P.unlock(s, z.id);
        st.message = `${z.name} est accessible. Explore les caches botaniques.`;
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
