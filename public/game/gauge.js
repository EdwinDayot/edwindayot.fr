/* Pure gauge-fraction rules shared by the world card (garden-context.js) and
   the detail sheet. No DOM/THREE dependency so it can run under Node. */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./data.js") : root.GardenData;
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  function tank(e) {
    return {
      fraction: clamp01(e.water / 160),
      text: `${Math.floor(e.water)}/160`,
      tone: "water",
    };
  }
  function pump(e) {
    return {
      fraction: e.running ? 1 : 0,
      text: e.running ? "Active" : "Veille",
      tone: "water",
    };
  }
  function collector(e, capacity = 24) {
    const total = Object.values(e.buffer || {}).reduce((a, b) => a + b, 0);
    return {
      fraction: clamp01(total / capacity),
      text: `${total}/${capacity}`,
      tone: "amber",
    };
  }
  function nursery(job) {
    if (!job) return null;
    const seconds = D.balance.nurserySeconds;
    return {
      fraction: clamp01(1 - job.remaining / seconds),
      text: job.remaining === 0 ? "Prêt" : `${Math.ceil(job.remaining)} s`,
      tone: "growth",
    };
  }
  function plant(p) {
    return {
      fraction: clamp01(p.moisture / 100),
      text: `${Math.round(p.moisture)} %`,
      tone: p.moisture < 20 ? "amber" : "water",
    };
  }
  function resource(spec, r, now) {
    const remaining = Math.max(0, Math.ceil(r.ready - now));
    if (remaining)
      return {
        fraction: clamp01(1 - (r.ready - now) / spec.renew),
        text: `${remaining} s`,
        tone: "growth",
      };
    return {
      fraction: clamp01((r.work || 0) / spec.hits),
      text: `${r.work || 0}/${spec.hits}`,
      tone: "ready",
    };
  }
  const api = { tank, pump, collector, nursery, plant, resource };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenGauge = api;
})(globalThis);
