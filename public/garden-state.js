/* WebGL-free simulation: commands validate before mutation, one deterministic tick per second.
   Split into parts (util, validate, lifecycle, command segments) registered on GardenStateParts
   in the browser and require()d here in node. */
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
  const E =
    typeof module !== "undefined"
      ? require("./game/economy.js")
      : root.GardenEconomy;
  const P =
    typeof module !== "undefined"
      ? require("./game/progression.js")
      : root.GardenProgression;
  const parts =
    typeof module !== "undefined"
      ? {
          util: require("./garden-state-util.js"),
          ...require("./garden-state-validate.js"),
          ...require("./garden-state-lifecycle.js"),
        }
      : (root.GardenStateParts = root.GardenStateParts || {});
  const { clone } = parts.util;
  const { validate, fresh, migrate } = parts;
  class GardenState {
    constructor(saved, now = Date.now()) {
      this.state = saved ? validate(saved) : fresh(now);
      this.events = [];
      if (!saved)
        for (let i = 0; i < 3; i++)
          this.state.requests.push(this.makeRequest(i));
    }
    get s() {
      return this.state;
    }
    serialize() {
      return clone(this.s);
    }
    makeRequest(index = 0) {
      return P.request(this.s, index);
    }
    has(cost) {
      return E.has(this.s.inventory, cost);
    }
    add(id, n) {
      E.add(this.s.inventory, id, n);
    }
    pay(cost) {
      return E.debit(this.s.inventory, cost);
    }
    near(ctx, target) {
      return ctx?.position && C.distance(ctx.position, target) <= 1.85;
    }
    command(c, ctx = {}) {
      const s = this.s,
        e = s.entities.find((o) => o.id === c.id),
        fail = (message) => ({ ok: false, message });
      const st = { s, e, fail, message: "C’est fait.", taken: false };
      const physical = [
        "plant",
        "water",
        "collect",
        "fillTank",
        "withdraw",
        "multiply",
        "collectYoung",
      ];
      if (physical.includes(c.type) && (!e || e.stored || !this.near(ctx, e)))
        return fail("Approche-toi de cette installation.");
      for (const seg of GardenState.commandSegs) {
        const r = seg.call(this, c, ctx, st);
        if (r) return r;
      }
      if (!st.taken) return fail("Commande inconnue.");
      if (
        ["connect", "disconnect", "place", "move", "restore", "store"].includes(
          c.type,
        )
      )
        I.invalidate(s);
      const result = { ok: true, kind: c.type, message: st.message, id: e?.id };
      this.events.push(result);
      if (this.events.length > 30) this.events.shift();
      return result;
    }
    tick() {
      const s = this.s;
      s.elapsed++;
      for (const e of s.entities) e.running = false;
      I.tick(s);
      for (const e of s.entities) {
        if (e.stored) continue;
        if (e.plant) {
          const p = e.plant,
            sp = D.species.find((o) => o.id === p.species),
            zone = C.zoneAt(e.x, e.z) || D.zones[0];
          p.moisture = Math.max(
            0,
            p.moisture -
              sp.dry / zone.humidity / (e.type === "reservoir" ? 2.5 : 1),
          );
          if (p.moisture > 5) {
            const rate =
              (zone.light === sp.light ? 1 : 0.65) *
              (p.moisture >= 20 && p.moisture <= 85 ? 1 : 0.45);
            if (p.growth < 1)
              p.growth = Math.min(
                1,
                p.growth + rate / (p.growth < 0.12 ? 210 : sp.grow),
              );
            else if (p.ready < 3) {
              p.progress += rate;
              if (p.progress >= sp.produce) {
                p.progress -= sp.produce;
                p.ready++;
                s.stats.produced++;
              }
            }
          }
        }
        if (e.type === "nursery" && e.job?.remaining > 0) {
          e.running = true;
          e.job.remaining = Math.max(0, e.job.remaining - 1);
          if (e.job.remaining === 0) {
            e.running = false;
            s.stats.produced++;
          }
        }
        if (e.type === "collector") {
          let room = 24 - Object.values(e.buffer).reduce((a, b) => a + b, 0);
          e.running = room > 0;
          for (const pot of s.entities) {
            if (!room) break;
            if (pot.stored || !pot.plant?.ready || C.distance(e, pot) > 4)
              continue;
            const p = pot.plant,
              sp = D.species.find((o) => o.id === p.species),
              q = Math.min(room, p.ready),
              id = `${sp.product}:${sp.id}`;
            e.buffer[id] = (e.buffer[id] || 0) + q;
            p.ready -= q;
            room -= q;
            s.stats.collected += q;
          }
        }
      }
    }
    step(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      this.s.remainder += seconds;
      const ticks = Math.floor(this.s.remainder + 1e-9);
      this.s.remainder = Math.max(0, this.s.remainder - ticks);
      for (let i = 0; i < ticks; i++) this.tick();
    }
    catchUp(now = Date.now()) {
      const seconds =
        Number.isFinite(now) && now >= this.s.updatedAt
          ? Math.min(D.OFFLINE_CAP, (now - this.s.updatedAt) / 1000)
          : 0;
      const before = this.s.stats.produced;
      this.step(seconds);
      this.s.updatedAt = now;
      return {
        seconds,
        produced: this.s.stats.produced - before,
        stopped: this.s.entities.filter(
          (e) =>
            !e.stored &&
            ["tank", "pump", "collector", "nursery"].includes(e.type) &&
            !e.running,
        ).length,
      };
    }
  }
  GardenState.commandSegs = [];
  if (typeof module !== "undefined")
    for (const k of ["a", "b", "c"]) {
      const M = require("./garden-state-cmd-" + k + ".js");
      Object.assign(GardenState.prototype, M);
      GardenState.commandSegs.push(...Object.values(M));
    }
  parts.state = GardenState;
  const api = { GardenState, validate, migrate, species: D.species };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRules = api;
})(globalThis);
