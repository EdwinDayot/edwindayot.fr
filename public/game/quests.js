/* Objective evaluation for the quest system: pure functions of {objective, s},
   plus an optional persisted "entry" (the s.quests.active row) for objective
   types that need transient memory across ticks (networkSustained). */
(function (root) {
  const I =
    typeof module !== "undefined"
      ? require("./irrigation.js")
      : root.GardenIrrigation;
  const done = (progress, complete) => ({
    progress: Math.min(1, progress),
    complete,
  });
  function evaluateObjective(o, s, entry) {
    if (o.type === "deliver") {
      const have = s.inventory[o.item] || 0;
      return done(have / o.quantity, have >= o.quantity);
    }
    if (o.type === "networkState") {
      const count = s.entities.filter(
        (e) => !e.stored && e.type === o.check && I.activity(s, e.id) > 0,
      ).length;
      return done(count / o.count, count >= o.count);
    }
    if (o.type === "networkSustained") {
      const met = evaluateObjective({ ...o, type: "networkState" }, s).complete,
        progress = (entry.progress = entry.progress || {});
      if (!met) {
        delete progress.sustainedSince;
        return done(0, false);
      }
      // Based on the simulation clock (s.elapsed), never wall time, so the
      // timer survives offline catch-up and can't be gamed by the system clock.
      if (progress.sustainedSince === undefined)
        progress.sustainedSince = s.elapsed;
      const held = s.elapsed - progress.sustainedSince;
      return done(held / o.seconds, held >= o.seconds);
    }
    if (o.type === "discoverSpecies")
      return done(
        s.discovered.length / o.count,
        s.discovered.length >= o.count,
      );
    if (o.type === "reputation")
      return done(s.reputation / o.threshold, s.reputation >= o.threshold);
    return done(0, false);
  }
  const api = { evaluateObjective };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenQuests = api;
})(globalThis);
