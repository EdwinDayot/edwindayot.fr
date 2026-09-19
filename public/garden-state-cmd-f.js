/* GardenState.command() branch group F (UMD: node module / browser prototype). Epic C1.3: the
   pot's two commands, sowPot and sleep. Neither targets a world entity (no c.id, no pot mesh
   yet — that is the campaign's own s.campaignPot, not the free-garden's "pot" entity type), so
   neither is added to garden-state.js's `physical` list, which requires a nearby entity.
   Epic C2.2 extends "sleep" with the campaign day/clock bilan (see its own comment below);
   Epic C2.3 further extends it with the scripted frog encounter (see below); Epic C3.4 further
   extends it with the bourgeon/nursery resolution (see below). Epic C1.5 extends sowPot itself
   (a pending pin consumed once, see below) and passes it through to resolvePotDraw in sleep. */
(function (root) {
  const Genetics =
    typeof module !== "undefined"
      ? require("./game/botany-genetics.js")
      : root.GardenGenetics;
  const Pot =
    typeof module !== "undefined"
      ? require("./game/botany-pot.js")
      : root.GardenPot;
  const Cultivars =
    typeof module !== "undefined"
      ? require("./game/cultivars.js")
      : root.GardenCultivars;
  const Rainelles =
    typeof module !== "undefined"
      ? require("./game/rainelles.js")
      : root.GardenRainelles;
  const Narrative =
    typeof module !== "undefined"
      ? require("./game/data-narrative.js")
      : root.GardenNarrative;
  const Memory =
    typeof module !== "undefined"
      ? require("./game/campaign-memory.js")
      : root.GardenCampaignMemory;
  const M = {
    commandSegF(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "sowPot") {
        st.taken = true;
        const known = (id) => Genetics.founders.some((f) => f.id === id);
        if (!known(c.a) || !known(c.b))
          return fail("Choisis deux espèces fondatrices connues.");
        if (!Genetics.crossCompatible(c.a, c.b))
          return fail("Ces deux espèces ne peuvent pas être croisées ensemble.");
        if (s.campaignPot.pending.length >= s.campaignPot.capacity)
          return fail("Le pot est déjà occupé pour cette nuit.");
        const pending = { a: c.a, b: c.b };
        // Epic C1.5: a pending pin (pinTrait, garden-state-cmd-o.js) is consumed here, once, by
        // the very next sowPot — "garanti à l'essai suivant" (design §4), not to some later
        // night. Attached only when it actually names one of these two parents; otherwise this
        // sowPot fails explicitly rather than silently dropping a pin the player still expects to
        // apply to a different pair.
        if (s.campaignPin) {
          if (s.campaignPin.speciesId !== c.a && s.campaignPin.speciesId !== c.b)
            return fail("Le caractère épinglé ne vient d’aucun des deux parents choisis.");
          pending.pin = s.campaignPin;
          s.campaignPin = null;
        }
        s.campaignPot.pending.push(pending);
        st.message = pending.pin
          ? "Graines posées dans le pot, caractère épinglé garanti pour cette nuit."
          : "Graines posées dans le pot, prêtes pour la nuit.";
      } else if (c.type === "sleep") {
        st.taken = true;
        // Resolved and materialised synchronously here, once, at the moment the command runs:
        // there is no intermediate "drawn but not yet saved" state besides pending itself (which
        // only ever holds seeds *not yet* resolved). A reload after this command therefore
        // cannot draw a second time — resolvePotDraw is never called from validate/fresh/load.
        // Epic C2.3: a scripted frog encounter (armed by triggerFrogEncounter, -i.js) resolves
        // against whichever pair is actually drawn *this* night — never a second, separate
        // draw. The cultivar created below is completely unaffected by the encounter (design:
        // "aucune graine de quête perdue" — the pot resolution is identical either way); the
        // encounter only adds a Rainelle carrying that same cultivar's foliage. If nothing was
        // sown this night, the encounter simply carries over (campaignFrogEncounterPending stays
        // true) to the next night that actually resolves a pair, never lost, never duplicated.
        // Epic C5.1 (design §11, "périodes de repos par Rainelle... vrai par défaut avant toute
        // veilleuse"): captured before any new individual is created below, so a Rainelle born
        // this same night is never counted as having rested a night it did not live through.
        const restingIds = s.rainelles.map((r) => r.id);
        let frogCultivarId = null;
        for (const { a, b, pin } of s.campaignPot.pending) {
          const traits = Pot.resolvePotDraw(a, b, undefined, pin || null);
          // Name left empty on purpose: naming the cultivar is C1.4's job (carnet de
          // botanique), not this epic's.
          const cultivar = Cultivars.createCultivar(s, {
            name: "",
            parentIds: [a, b],
            traits,
          });
          if (s.campaignFrogEncounterPending && !s.rainelles.length)
            frogCultivarId = cultivar.id;
        }
        s.campaignPot.pending = [];
        if (frogCultivarId) {
          const born = Rainelles.createRainelle(s, {
            cultivarId: frogCultivarId,
            name: "",
          });
          Memory.recordBirth(s.campaignMemory, born.id);
          s.campaignFrogEncounterPending = false;
          // Epic C4.4: the "traces mouillées" text (design §10, chapitre 4) only ever fires here,
          // the exact night the encounter actually resolves into a real Rainelle — never at
          // triggerFrogEncounter (arming), never on a night that only carries the flag over.
          const revealed = Narrative.pendingReveal(
            s.campaignFlags,
            "frogEncounterResolved",
          );
          if (revealed) s.campaignFlags.push(revealed.id);
        }
        // Epic C3.4: every bourgeon harvestBud already deposited resolves here, exactly once,
        // the same "posed, then resolved at the next sleep" pattern as campaignPot.pending just
        // above — never on load, only inside this command. Each new individual is born without a
        // taught gesture (design §5: "il ne copie pas un souvenir ni une obligation de métier"),
        // sharing the cultivar of the Rainelle that formed its bourgeon (see rainelles.js's own
        // harvestBud comment).
        for (const bud of s.campaignNursery) {
          const born = Rainelles.createRainelle(s, {
            cultivarId: bud.cultivarId,
            name: "",
          });
          Memory.recordBirth(s.campaignMemory, born.id);
        }
        s.campaignNursery = [];
        // Epic C5.1: every Rainelle that already existed before tonight's resolution above just
        // rested — true by default, since no veilleuse mechanism exists yet (C5.2).
        for (const id of restingIds) Memory.recordRest(s.campaignMemory, id);
        // Epic C2.2: the atomic night bilan. "sleep" is the single command a scripted 23h
        // transition and a voluntary early bedtime ("dormir plus tôt", design §3) both end up
        // calling — neither reads s.campaignClock.gameSeconds beforehand, so an early sleep
        // resolves identically to a full day's one, and no work/sale is simulated for whatever
        // hours were skipped (this command never touches s.inventory/s.elapsed itself). Always
        // exactly one day per call: a new day starts at 7h, unpaused.
        s.campaignDay += 1;
        s.campaignClock.gameSeconds = 0;
        s.campaignClock.paused = false;
        // Epic C2.5: an in-progress, unconfirmed lesson is exactly the kind of "placement non
        // validé" design §3 says nightfall cancels without cost — never carried into the next
        // day, and never left stranding the clock paused or blocking every future beginTeaching
        // (found by /code-review before this epic's own commit: sleep used to leave a stale
        // campaignTeaching in place while still unpausing the clock underneath it).
        s.campaignTeaching = null;
        st.message = "Une nouvelle nuit commence.";
      }
      return null;
    },
  };
  if (typeof module !== "undefined") module.exports = M;
  else {
    const S = root.GardenStateParts.state;
    Object.assign(S.prototype, M);
    S.commandSegs.push(...Object.values(M));
  }
})(globalThis);
