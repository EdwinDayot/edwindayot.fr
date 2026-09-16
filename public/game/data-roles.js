/* What a visitor's E-context looks like, keyed by role instead of by literal
   id. Pure data + pure functions (no DOM/app dependency) so a new NPC only
   needs a data row in data-buildings.js, never a new if-branch. */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./data.js") : root.GardenData;
  const E =
    typeof module !== "undefined"
      ? require("./economy.js")
      : root.GardenEconomy;
  const firstName = (id) =>
    (D.visitors.find((v) => v.id === id)?.name || id).split(" · ")[0];
  const roles = {
    // Barters a discovered production for coins, a seed and reputation.
    trader: {
      context(e, s) {
        const r = s.requests.find((r) =>
          E.has(s.inventory, { [r.item]: r.quantity }),
        );
        return r
          ? {
              label: "E · Échanger",
              status: `${firstName(e.id)} · ${r.quantity} ${D.itemName(r.item)}`,
              command: "trade",
              request: r.id,
            }
          : {
              label: "E · Voir les demandes",
              status: `${firstName(e.id)} · demandes`,
              panel: "visitor",
            };
      },
    },
    // Opens this visitor's shop: roleData.wares ([{item, cost}, ...]) drives
    // the generic "shop" panel (hud-panel.js) and the "buy" command
    // (garden-state-cmd-d.js) — a new vendor only ever adds a wares row,
    // never a new panel or command branch.
    vendor: {
      context(e) {
        const wares =
          D.buildings.find((b) => b.visitorId === e.id)?.roleData?.wares || [];
        return {
          label: "E · Acheter",
          status: `${firstName(e.id)} · boutique · ${wares.length} article${wares.length > 1 ? "s" : ""}`,
          panel: "shop",
        };
      },
    },
    // Rewards species-collection milestones.
    botanist: {
      context(e, s) {
        return {
          label: "E · Partager",
          status: `${firstName(e.id)} · ${s.discovered.length} espèces`,
          command: "botany",
        };
      },
    },
    // Purely a neighbour: no shop, no quest, nothing to trade. Exists so the
    // village isn't only NPCs the player extracts something from — E just
    // shows a flavour line (roleData.line) and does nothing (command: null,
    // same no-op pattern the trader/mining fallbacks already use).
    resident: {
      context(e) {
        const line =
          D.buildings.find((b) => b.visitorId === e.id)?.roleData?.line ||
          "habite ici";
        return {
          label: "E · Saluer",
          status: `${firstName(e.id)} · ${line}`,
          command: null,
        };
      },
    },
    // Offers quests from its roleData.quests list (data-buildings.js). The
    // objective-evaluation engine and the "quest" panel are not built yet
    // (see game/data-quests.js) — no visitor uses this role until then.
    "quest-giver": {
      context(e) {
        const quests =
          D.buildings.find((b) => b.visitorId === e.id)?.roleData?.quests || [];
        return {
          label: "E · Voir les quêtes",
          status: `${firstName(e.id)} · ${quests.length} quête${quests.length > 1 ? "s" : ""}`,
          panel: "quest",
        };
      },
    },
  };
  const roleOf = (id) => D.buildings.find((b) => b.visitorId === id)?.role;
  const context = (e, s) => {
    const role = roleOf(e.id);
    return roles[role] ? roles[role].context(e, s) : null;
  };
  const api = { roles, roleOf, context, firstName };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRoles = api;
})(globalThis);
