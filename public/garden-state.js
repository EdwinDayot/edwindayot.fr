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
  const Automation =
    typeof module !== "undefined"
      ? require("./game/automation.js")
      : root.GardenAutomation;
  const CampaignAutomation =
    typeof module !== "undefined"
      ? require("./game/campaign-automation.js")
      : root.GardenCampaignAutomation;
  // Epic C5.11: the three campaign-layer modules position/movement wiring needs, all already
  // loaded earlier (see index.html's own ordering comments on each) but never required from here
  // before this epic, since nothing here read them.
  const RainellesStatus =
    typeof module !== "undefined"
      ? require("./game/rainelles-status.js")
      : root.GardenRainellesStatus;
  const CampaignScenes =
    typeof module !== "undefined"
      ? require("./game/campaign-scenes.js")
      : root.GardenCampaignScenes;
  const RainelleMovement =
    typeof module !== "undefined"
      ? require("./game/rainelle-movement.js")
      : root.GardenRainelleMovement;
  const Quests =
    typeof module !== "undefined"
      ? require("./game/quests.js")
      : root.GardenQuests;
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
      // Epic C5.11: how many consecutive steps each Rainelle has spent blocked mid-route
      // (rainelle-movement.js's own resolveStep parameter). Deliberately never part of `this.state`
      // (never serialized by serialize() below, same "instance-only, not a save field" posture as
      // `this.events` right above) — rainelle-movement.js's own header comment is explicit that
      // this bounded wait count is not a persisted save field, only something a real tick loop
      // keeps across calls within one running session.
      this.rainelleWaitCounts = {};
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
        "load",
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
      // Epic C5.14: an optional, additive signal a command segment (today only "sleep",
      // garden-state-cmd-f.js) can attach to its own `st` — which Rainelle(s) a render layer
      // should stage a scripted scene for, exactly at the same moment its own narrative text was
      // revealed. Absent for every other command (unset `st.scenes`), so this changes nothing
      // about the result shape any existing caller/test already relies on.
      if (st.scenes) result.scenes = st.scenes;
      this.events.push(result);
      if (this.events.length > 30) this.events.shift();
      return result;
    }
    tick() {
      const s = this.s;
      s.elapsed++;
      for (const e of s.entities) e.running = false;
      I.tick(s);
      // A sustained objective's timer runs continuously while the quest is
      // active (not only when the player checks in), so its progress is
      // already accurate on arrival, and survives offline catch-up like any
      // other s.elapsed-based state.
      for (const q of s.quests.active) {
        const objective = D.quests[q.questId]?.objective;
        if (objective?.type === "networkSustained")
          Quests.evaluateObjective(objective, s, q);
      }
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
              (p.moisture >= 20 && p.moisture <= 85 ? 1 : 0.45) *
              (p.boostUntil > s.elapsed ? 1.5 : 1);
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
        Automation.tick(e, s);
      }
      // Epic C2.6c: the campaign layer's own actors (s.rainelles) are a separate array from the
      // free garden's s.entities above — never folded into that loop, same "rules before
      // rendering" posture already used to keep them apart (see rainelles.js/cultivars.js/
      // campaign-stations.js's own header comments). A mature specimen becomes ready to produce
      // once, automatically (see campaign-automation.js's updateSpecimenReadiness for why), then
      // each taught Rainelle gets exactly one tick of its own gesture.
      CampaignAutomation.updateSpecimenReadiness(s);
      for (const r of s.rainelles) CampaignAutomation.tickRainelle(r, s);
      this.tickRainelleMovement(s);
    }
    // Epic C5.11 (design §14): one shared simulation step of Rainelle movement, run right after
    // the gesture ticks above so a Rainelle's route target reflects work this exact tick already
    // did. Deliberately its own method, not folded into tick() itself: this is the one place
    // `this.rainelleWaitCounts` (instance-only, see the constructor's own comment) is read and
    // replaced, exactly the shape rainelle-movement.js's resolveStep already documents as its
    // caller's job.
    //
    // Live "location" here is deliberately RainellesStatus.status(...).kind === "au-travail",
    // never CampaignScenes.deriveLocation: that function's own header says any future render layer
    // must call it, but its POSTE/REPOS/HABITAT split is built entirely around `workedThisNight`,
    // a Set that only ever exists right after "sleep" resolves one specific night (garden-state-
    // cmd-f.js) — it does not describe live daytime activity, and campaign-automation.js's own
    // day-tick (tickArroser/tickRecolter/tickTransporter, called just above) never gates on
    // `zone.veilleuse` at all (that flag only matters to runNightWork). RainellesStatus.status is
    // the campaign layer's own live, per-second readout of "is this Rainelle actually working
    // right now" (C2.8's own purpose, "l'état qu'un joueur verrait réellement") — "au-travail"
    // exactly matches this epic's own criterion, "pendant un travail réel"; every other status
    // ("repos", "source-vide", "stock-cible-atteint", "sortie-pleine", "poste-manquant") matches
    // its own "habitat/repos sinon", and already collapses to the same nearest-habitat target under
    // rainelle-movement.js's targetPosition regardless of which of the two LOCATIONS constants is
    // passed, so no finer split is needed here.
    tickRainelleMovement(s) {
      const { LOCATIONS } = CampaignScenes;
      const movers = [];
      for (const rainelle of s.rainelles) {
        RainelleMovement.ensurePosition(s, rainelle);
        const location =
          RainellesStatus.status(rainelle, s).kind === "au-travail"
            ? LOCATIONS.POSTE
            : LOCATIONS.HABITAT;
        movers.push({ rainelle, route: RainelleMovement.routeTo(s, rainelle, location) });
      }
      const { positions, waitCounts } = RainelleMovement.resolveStep(
        s,
        movers,
        this.rainelleWaitCounts,
      );
      for (const rainelle of s.rainelles) {
        const p = positions[rainelle.id];
        if (p) {
          rainelle.x = p.x;
          rainelle.z = p.z;
        }
      }
      this.rainelleWaitCounts = waitCounts;
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
    for (const k of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v"]) {
      const M = require("./garden-state-cmd-" + k + ".js");
      Object.assign(GardenState.prototype, M);
      GardenState.commandSegs.push(...Object.values(M));
    }
  parts.state = GardenState;
  const api = { GardenState, validate, migrate, species: D.species };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRules = api;
})(globalThis);
