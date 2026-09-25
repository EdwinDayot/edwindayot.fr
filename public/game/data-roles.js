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
    //
    // Epic C6.25: an optional roleData.narrativeAction lets a resident also
    // expose a one-shot story command once a flag is set, without a new role
    // or an id literal here — the branching stays entirely data-driven, same
    // generalisation already applied to wares/quests above. Gated on two
    // flags: `flag` (must be present to offer anything beyond the plain
    // line) and `doneFlag` (once present, the action is already spent — a
    // constat line replaces it, command reverts to null so the player is
    // never shown a live action that would no longer do anything).
    resident: {
      context(e, s) {
        const b = D.buildings.find((b) => b.visitorId === e.id);
        const na = b?.roleData?.narrativeAction;
        if (na && s?.campaignFlags?.includes(na.flag)) {
          const done = s.campaignFlags.includes(na.doneFlag);
          return {
            label: done ? "E · Saluer" : na.label,
            status: `${firstName(e.id)} · ${done ? na.doneStatus : na.activeStatus}`,
            command: done ? null : na.command,
          };
        }
        return {
          label: "E · Saluer",
          status: `${firstName(e.id)} · ${b?.roleData?.line || "habite ici"}`,
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
