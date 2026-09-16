/* Accessible, non-expiring requests and permanent collection rewards. */
(function (root) {
  const D =
    typeof module !== "undefined" ? require("./data.js") : root.GardenData;
  const E =
    typeof module !== "undefined"
      ? require("./economy.js")
      : root.GardenEconomy;
  function request(s, index = 0) {
    const choices = D.species.filter((p) => s.discovered.includes(p.id)),
      p = choices[(s.requestSerial + index) % choices.length];
    return { id: ++s.requestSerial, item: `${p.product}:${p.id}`, quantity: 1 };
  }
  function discover(s, species) {
    s.discovered.push(species);
    E.add(s.inventory, `seed:${species}`, 2);
    s.reputation++;
  }
  function unlock(s, id) {
    s.unlocked.push(id);
    for (const plan of id === 1
      ? ["nursery"]
      : id === 2
        ? ["pump", "collector", "autoPlanter"]
        : id === 3
          ? ["composter", "collectorT2", "greenhouse", "seedDispenser"]
          : [])
      if (!s.plans.includes(plan)) s.plans.push(plan);
  }
  function trade(s, item) {
    E.credit(s.inventory, D.balance.tradeReward);
    s.trades++;
    s.reputation++;
    E.add(s.inventory, `seed:${item.split(":")[1]}`, 1);
    if (s.trades === 1) {
      for (const id of ["tank", "pipe", "drip"])
        if (!s.plans.includes(id)) s.plans.push(id);
      E.credit(s.inventory, D.balance.firstTradeBonus);
    }
  }
  function botany(s, milestone) {
    s.botanyRewards.push(milestone);
    E.credit(s.inventory, D.balance.botanyReward);
  }
  const api = { request, discover, unlock, trade, botany };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenProgression = api;
})(globalThis);
