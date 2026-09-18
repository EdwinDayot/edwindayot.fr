/* Rainelle blockage/activity diagnostics, part of the campaign layer (UMD: node module /
   browser GardenRainellesStatus).

   Epic C2.8 (design §5, "Conditions, réservations et lecture des blocages") : "les états
   visibles sont : au travail, stock cible atteint, source vide, sortie pleine, passage bloqué,
   poste manquant, repos. Chaque état affiche une phrase d'action." This file is the campaign
   layer's equivalent of irrigation-status.js: it never mutates anything, only reads
   `s.rainelles`/`s.campaignStations`/`s.specimens` and campaign-automation.js's own constants
   to explain, in one call, why a given Rainelle is or isn't doing something right now — the gap
   campaign-automation.js's own header comment names explicitly ("the readable blocage state a
   player would actually see is C2.8's job, not this one's").

   Six of the seven states are implemented here. "passage bloqué" is not: design §5 ties it to
   Rainelles actually navigating a shared graph/grid ("les croisements de passage utilisent une
   priorité stable et un temps d'attente borné") — a Rainelle in this codebase has no world
   position and no travel time at all yet (a gesture's poste/source/destination are resolved and
   acted on directly, every cycle, never walked to), so there is no "passage" for anything to
   block. Building one now would mean inventing Rainelle movement in the same epic as this
   status readout — exactly the "jamais une refonte simultanée de plusieurs systèmes" orchestration
   forbids, the same reasoning that split C2.2/C2.2v and C2.5/C2.5v. Left for a future epic
   (backlog's C2.8v) once real movement exists to report a state about.

   For the same reason, "réserver un emplacement de sortie... si la cible disparaît, la
   réservation se libère et l'objet déjà porté rejoint un bac de secours" (an item already
   "in transit" needing rescue) has no scenario to cover yet either: every gesture here still
   picks up and delivers a resource in the same atomic step (see campaign-automation.js), and no
   command exists yet to remove a borne/zone/panier once registered, so a target can't actually
   "disappear" mid-cycle in real play. What this epic *does* deliver of that same design
   paragraph — a resource and an output slot genuinely unavailable to a second Rainelle, because
   panier.capacity/min are enforced before campaign-automation.js ever mutates a buffer — is
   exposed below as "sortie pleine"/"stock cible atteint", and proven never to double-count in
   tests/campaign-automation.cjs (s.rainelles ticks strictly in array order, so no two Rainelles
   ever read the same stale headroom in one tick). */
(function (root) {
  const C =
    typeof module !== "undefined"
      ? require("./construction.js")
      : root.GardenConstruction;
  const Stations =
    typeof module !== "undefined"
      ? require("./campaign-stations.js")
      : root.GardenCampaignStations;
  const Cultivars =
    typeof module !== "undefined"
      ? require("./cultivars.js")
      : root.GardenCultivars;
  const Automation =
    typeof module !== "undefined"
      ? require("./campaign-automation.js")
      : root.GardenCampaignAutomation;

  function resolve(s, id, kind) {
    const r = Stations.resolveStation(s.campaignStations, id);
    return r.ok && r.kind === kind ? r.station : null;
  }

  function statusArroser(geste, s) {
    const borne = resolve(s, geste.source, "borne");
    const zone = resolve(s, geste.poste, "zone");
    if (!borne || !zone)
      return { kind: "poste-manquant", message: "Poste introuvable : vérifie la borne et la zone." };
    return { kind: "au-travail", message: "Arrose la zone assignée." };
  }

  function statusRecolter(geste, s) {
    const zone = resolve(s, geste.poste, "zone");
    const panier = resolve(s, geste.destination, "panier");
    if (!zone || !panier)
      return { kind: "poste-manquant", message: "Poste introuvable : vérifie la zone et le panier." };
    const ready = s.specimens.some(
      (sp) =>
        Cultivars.isMature(sp) &&
        sp.readyToProduce &&
        C.distance(zone, sp) <= Automation.ZONE_WORK_RANGE,
    );
    if (!ready)
      return { kind: "source-vide", message: "Rien à récolter dans cette zone pour l'instant." };
    if (Stations.panierTotal(panier) >= panier.capacity)
      return {
        kind: "sortie-pleine",
        message: "Le panier est plein — ajoute une destination ou augmente son seuil.",
      };
    return { kind: "au-travail", message: "Récolte les productions mûres de la zone." };
  }

  function statusTransporter(geste, s) {
    const from = resolve(s, geste.source, "panier");
    const to = resolve(s, geste.destination, "panier");
    if (!from || !to || from === to)
      return {
        kind: "poste-manquant",
        message: "Poste introuvable : vérifie le panier source et le panier destination.",
      };
    const keys = geste.condition ? [geste.condition] : Object.keys(from.buffer);
    const available = keys.reduce((n, k) => n + (from.buffer[k] || 0), 0);
    if (available <= 0)
      return { kind: "source-vide", message: "Rien à transporter depuis ce panier pour l'instant." };
    const sourceTotal = Stations.panierTotal(from);
    if (sourceTotal <= from.min)
      return {
        kind: "stock-cible-atteint",
        message: "La réserve de la source est protégée — augmente le stock ou baisse son seuil.",
      };
    if (Stations.panierTotal(to) >= to.capacity)
      return {
        kind: "sortie-pleine",
        message: "Le panier est plein — ajoute une destination ou augmente son seuil.",
      };
    return { kind: "au-travail", message: "Transporte les ressources vers la destination." };
  }

  // One Rainelle, one status — never throws, mirrors campaign-automation.js's own failure
  // posture (an invalid/unresolved setup is a readable state here, not an exception there).
  // Rainelles.VERBS only ever admits "arroser"/"recolter"/"transporter" (handled below) or one
  // of UNIMPLEMENTED_VERBS (also "repos") — validateGestureFields already refuses anything else
  // at teach time, so there is no fourth case to fall back on here.
  function status(rainelle, s) {
    const geste = rainelle.geste;
    if (!geste)
      return { kind: "repos", message: "Au repos : aucun geste enseigné." };
    if (geste.verbe === "arroser") return statusArroser(geste, s);
    if (geste.verbe === "recolter") return statusRecolter(geste, s);
    if (geste.verbe === "transporter") return statusTransporter(geste, s);
    return { kind: "repos", message: "Au repos : ce geste n'est pas encore mis en œuvre." };
  }

  const api = { status };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRainellesStatus = api;
})(globalThis);
