/* Campaign passage-to-the-pond state, part of the campaign layer (UMD: node module / browser
   GardenCampaignPassage).

   Epic C6.12 (design §10, chapitre 17 : "rétablir l'accès à une mare"), the engine-only socle the
   Cartographe's eighth-lot note (campagne-backlog.md) singled out as the one literal clause of
   the chapter buildable without inventing pond geometry, a navigation-graph branch or a lucrative-
   extension threat model — none of which exist anywhere in the engine today (verified by the
   Cartographe: no "mare"/"berge"/"extension"/"conversion" concept in public/game/*.js or
   public/render*.js beyond comments already noting the gap). Same "rules before rendering" posture
   already applied to a Rainelle's derived location (C5.5) before its real position (C5.9-C5.11).

   A passage starts blocked ("bloqué par défaut" : the chapter presents restoring it as a real
   repair, never a starting given, design §10). restorePassage is the only transition, one-way by
   design (no "re-block" command exists, none is asked for by the design) — refusing a restore
   that would change nothing ("blocked" already false) is the same "an operation that changes
   nothing is a refusal, never a silent repeated effect" discipline already applied to
   releaseGesture/reduceContractQuota (C6.8/C6.10). */
(function (root) {
  // Pure: caller (garden-state-cmd-w.js) applies the returned `blocked` to s.campaignPassage
  // itself. Never touches anything beyond the single field this concept owns — no pond geometry,
  // no navigation graph, no threat-of-conversion state, none of which exist yet (see header).
  function restorePassage(passage) {
    if (!passage.blocked)
      return { ok: false, error: "Le passage est déjà rétabli." };
    return { ok: true, blocked: false };
  }

  const api = { restorePassage };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignPassage = api;
})(globalThis);
