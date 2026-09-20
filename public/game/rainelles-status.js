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

   Six of the seven states were implemented here from the start. "passage bloqué" was left out
   at first: design §5 ties it to Rainelles actually navigating a shared graph/grid ("les
   croisements de passage utilisent une priorité stable et un temps d'attente borné") — a
   Rainelle used to have no world position and no travel time at all (a gesture's
   poste/source/destination were resolved and acted on directly, every cycle, never walked to),
   so there was no "passage" for anything to block. Building one then would have meant inventing
   Rainelle movement in the same epic as this status readout — exactly the "jamais une refonte
   simultanée de plusieurs systèmes" orchestration forbids, the same reasoning that split
   C2.2/C2.2v and C2.5/C2.5v.

   Epic C2.8v-a (design §5/§14, "passage bloqué... une Rainelle bloquée se range à un point
   d'attente sans devenir un obstacle permanent") adds the seventh state now that real movement
   exists (C5.10's rainelle-movement.js, C5.11's tick wiring in garden-state.js). The source of
   truth for "how many consecutive steps has she been blocked" is `this.rainelleWaitCounts`, a
   GardenState *instance* field (rainelle-movement.js's own resolveStep parameter) — never part
   of `s` (see garden-state.js's own comment on why it is never serialized) — so `status()` cannot
   read it from `s` alone the way every other state here does. It arrives as a third, optional
   parameter instead: `status(rainelle, s)` (every existing caller, including garden-state.js's
   own tickRainelleMovement, which only ever checks `.kind === "au-travail"` and never needed this
   state) keeps working identically, unchanged; a caller that wants a live, accurate "passage
   bloqué" reading passes the wait-counts map explicitly, read *after* a tick has fully resolved
   (`GardenState`'s own `.rainelleWaitCounts`, by then holding that tick's fresh numbers — see
   below for why a mid-tick reading would be stale).
   Threshold chosen and documented here, the same way OVEREXERTION_THRESHOLD/MAX_WAIT_STEPS/
   MIN_HABITAT_CAPACITY were before it (design names no number): `waitCounts[rainelle.id] >=
   RainelleMovement.MAX_WAIT_STEPS`. Note this is one tick *earlier* than resolveStep's own
   sidestep attempt, which only fires once its internal, about-to-be-recorded `waited` value
   (the stored count plus the step being resolved) exceeds the bound (`waited >
   RainelleMovement.MAX_WAIT_STEPS`) — so a stored count already at the bound means "the wait
   budget C5.10 established as tolerable is now fully spent, and the very next tick either frees
   her or sidesteps her", not a brief one-or-two-step wait at an ordinary crossing (already
   covered, unremarkably, by C5.10's own bounded wait). This is never stale by
   construction: resolveStep resets a Rainelle's wait count to exactly 0 the instant she has no
   contested route at all (no destination cell, a successful move, or a successful sidestep — see
   rainelle-movement.js's own resolveStep), so a positive count above the bound can only mean she
   was genuinely blocked on a real itinerary as of the *last* tick that ran — never "no itinerary"
   and never "the target cell was actually free". Checked first, ahead of the verb dispatch below:
   this movement fact is orthogonal to whatever campaign-automation.js's tick already decided
   about her gesture this same instant (position is still cosmetic to automation, C5.11's own
   header comment — a Rainelle can be mid-route toward a poste that is, by itself, perfectly
   workable), so "passage bloqué" can and should override "au-travail"/"repos"/anything else
   rather than compete with it.

   For the same reason "passage bloqué" itself was deferred at first, "réserver un emplacement de
   sortie... si la cible disparaît, la réservation se libère et l'objet déjà porté rejoint un bac
   de secours" (an item already
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
  // Epic C2.8v-a: MAX_WAIT_STEPS is the single source of truth for "how long is a normal wait" —
  // never a second, duplicated number here. index.html loads rainelle-movement.js before this
  // file for exactly this (see its own ordering comment there).
  const RainelleMovement =
    typeof module !== "undefined"
      ? require("./rainelle-movement.js")
      : root.GardenRainelleMovement;

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
  function status(rainelle, s, waitCounts) {
    if (waitCounts && (waitCounts[rainelle.id] || 0) >= RainelleMovement.MAX_WAIT_STEPS)
      return {
        kind: "passage-bloque",
        message: "Le passage est encombré : elle attend son tour.",
      };
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
