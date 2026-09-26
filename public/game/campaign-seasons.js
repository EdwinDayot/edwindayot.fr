/* Campaign seasonal clock (UMD: node module / browser GardenCampaignSeasons). Pure derivation
   from `s.campaignDay` (posed by C2.2, validated >= 1 by garden-state-validate.js) — never a
   stored field, on the same "derive on demand, never duplicate" discipline already used by
   `specimenMoisture`/`isMature` in cultivars.js. No migration needed: any existing save's
   `campaignDay`, whatever its value, yields a coherent season the moment this module loads.

   Design §12 gives four seasons of ten days each (a forty-day cycle) as an explicit "à tester"
   starting hypothesis, not a fixed number scattered across files — kept here as a single named,
   easily revisable constant (DAYS_PER_SEASON). Day 1 is the first day of spring. */
(function (root) {
  const SEASONS = ["printemps", "ete", "automne", "hiver"];
  const DAYS_PER_SEASON = 10;
  const CYCLE_DAYS = SEASONS.length * DAYS_PER_SEASON; // 40

  // Pure: the same campaignDay always yields the same season, before or after a save/reload.
  function seasonForDay(campaignDay) {
    const index = Math.floor((campaignDay - 1) / DAYS_PER_SEASON) % SEASONS.length;
    return SEASONS[index];
  }

  const api = { SEASONS, DAYS_PER_SEASON, CYCLE_DAYS, seasonForDay };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignSeasons = api;
})(globalThis);
