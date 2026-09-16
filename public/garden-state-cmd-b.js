/* GardenState.command() branch group B (UMD: node module / browser prototype). */
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
  const util =
    typeof module !== "undefined"
      ? require("./garden-state-util.js")
      : root.GardenStateParts.util;
  const { clone, finite, count, plant, knownItem } = util;
  const M = {
    commandSegB(c, ctx, st) {
      const { s, e, fail } = st;
      /* branch group */
      if (c.type === "craft") {
        st.taken = true;
        const recipe = D.recipes[c.item],
          cost = recipe?.cost;
        if (!recipe || !s.plans.includes(c.item) || !this.has(cost))
          return fail("Plan ou matériaux manquants.");
        this.pay(cost);
        this.add(c.item, 1);
        st.message = `${recipe.name} ajouté à la réserve. Choisis son emplacement.`;
      } else if (["place", "move", "restore"].includes(c.type)) {
        st.taken = true;
        if (!Number.isInteger(c.rotation ?? 0))
          return fail("La rotation doit être un nombre de quarts de tour.");
        const existing = c.type !== "place";
        if (existing && (!e || (c.type === "restore" && !e.stored)))
          return fail("Objet introuvable.");
        const type = existing ? e.type : c.item;
        if (!D.recipes[type]) return fail("Construction inconnue.");
        const fabricate =
          !existing && !this.has({ [type]: 1 }) && c.fabricate === true;
        if (
          !existing &&
          !this.has({ [type]: 1 }) &&
          (!fabricate ||
            !s.plans.includes(type) ||
            !this.has(D.recipes[type].cost))
        )
          return fail("Matériaux insuffisants pour cet objet.");
        if (
          !existing &&
          s.entities.filter((o) => I.isPot(o) === I.isPot({ type })).length >=
            (I.isPot({ type }) ? Math.min(48, s.unlocked.length * 12) : 192)
        )
          return fail(
            "Capacité atteinte : ouvre une parcelle ou réutilise un objet.",
          );
        const obj = {
          ...(existing ? e : {}),
          type,
          x: c.x,
          z: c.z,
          rotation: (((c.rotation || 0) % 4) + 4) % 4,
          stored: false,
        };
        const error = C.placement(s, obj, existing ? e.id : null);
        if (error) return fail(error);
        if (
          ctx.position &&
          C.distance(ctx.position, obj) < C.radius(obj) + 0.24
        )
          return fail("Éloigne-toi de cet emplacement avant de poser l’objet.");
        if (existing) Object.assign(e, obj);
        else {
          this.pay(fabricate ? D.recipes[type].cost : { [type]: 1 });
          obj.id = `e${s.nextId++}`;
          if (I.isPot(obj)) obj.plant = null;
          if (type === "tank") obj.water = 0;
          if (
            D.recipes[type].buffer ||
            D.recipes[type].sow ||
            D.recipes[type].dispense
          )
            obj.buffer = {};
          s.entities.push(obj);
        }
        const old = s.links.length;
        s.links = s.links.filter(([a, b]) =>
          I.validLink(
            s.entities.find((o) => o.id === a),
            s.entities.find((o) => o.id === b),
          ),
        );
        st.message =
          old > s.links.length
            ? "Objet déplacé. Les raccords hors de portée ont été retirés."
            : "Emplacement validé.";
      } else if (c.type === "store") {
        st.taken = true;
        if (!e || e.stored) return fail("Objet introuvable.");
        e.stored = true;
        s.links = s.links.filter((l) => !l.includes(e.id));
        st.message =
          "Objet rangé intact. Sa plante et son travail sont en pause.";
      } else if (c.type === "connect" || c.type === "disconnect") {
        st.taken = true;
        const b = s.entities.find((e) => e.id === c.to),
          index = s.links.findIndex(
            (l) => l.includes(c.id) && l.includes(c.to),
          );
        if (c.type === "disconnect") {
          if (index < 0) return fail("Aucun raccordement.");
          s.links.splice(index, 1);
        } else {
          if (
            index >= 0 ||
            !I.canConnect(e, b, s) ||
            [e, b].some(
              (o) => I.isPot(o) && s.links.some((l) => l.includes(o.id)),
            )
          )
            return fail(
              "Relie pompe/composteur, citerne, tuyaux et goutteurs en chaîne (4 unités), puis chaque pot à un goutteur (1,8 unité). Un même circuit ne mélange pas deux substances.",
            );
          s.links.push([e.id, b.id]);
        }
        st.message = "Raccordements mis à jour.";
      } else if (c.type === "fillTank") {
        st.taken = true;
        if (e.type !== "tank" || e.water >= 160 || s.water <= 0)
          return fail("La citerne est pleine ou ton arrosoir est vide.");
        const q = Math.min(s.water, 160 - e.water);
        s.water -= q;
        e.water += q;
        st.message = `${q} unités versées dans la citerne.`;
      } else if (c.type === "withdraw") {
        st.taken = true;
        const recipe = D.recipes[e.type];
        if (
          !(recipe?.buffer || recipe?.sow || recipe?.dispense) ||
          !Object.values(e.buffer).some((n) => n)
        )
          return fail("Rien à récupérer ici.");
        for (const [id, n] of Object.entries(e.buffer)) this.add(id, n);
        e.buffer = {};
        st.message = `${recipe.name} vidé dans la réserve.`;
      } else if (c.type === "load") {
        st.taken = true;
        const recipe = D.recipes[e.type],
          item = `${c.source || "seed"}:${c.species}`,
          used = Object.values(e.buffer || {}).reduce((a, b) => a + b, 0);
        if (
          !recipe?.sow ||
          !["seed", "young"].includes(c.source || "seed") ||
          used >= recipe.capacity ||
          !this.has({ [item]: 1 })
        )
          return fail("Choisis une graine disponible pour ce planteur.");
        this.pay({ [item]: 1 });
        e.buffer[item] = (e.buffer[item] || 0) + 1;
        st.message = `Planteur chargé : ${D.itemName(item)}.`;
      } else if (c.type === "multiply") {
        st.taken = true;
        if (
          e.type !== "nursery" ||
          e.job ||
          !D.species.some((p) => p.id === c.species) ||
          !this.has({ [`cutting:${c.species}`]: 1 })
        )
          return fail("Choisis une bouture et un établi libre.");
        this.pay({ [`cutting:${c.species}`]: 1 });
        e.job = { species: c.species, remaining: D.balance.nurserySeconds };
        st.message =
          "Multiplication en cours : un jeune plant dans trois minutes.";
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
