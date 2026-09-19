/* GardenState.command() branch group F (UMD: node module / browser prototype). Epic C1.3: the
   pot's two commands, sowPot and sleep. Neither targets a world entity (no c.id, no pot mesh
   yet — that is the campaign's own s.campaignPot, not the free-garden's "pot" entity type), so
   neither is added to garden-state.js's `physical` list, which requires a nearby entity.
   Epic C2.2 extends "sleep" with the campaign day/clock bilan (see its own comment below);
   Epic C2.3 further extends it with the scripted frog encounter (see below); Epic C3.4 further
   extends it with the bourgeon/nursery resolution (see below). Epic C1.5 extends sowPot itself
   (a pending pin consumed once, see below) and passes it through to resolvePotDraw in sleep.
   Epic C5.2 further extends "sleep" with campaign-automation.js's runNightWork (veilleuses de
   croissance, see below) — real work under an active veilleuse and the C5.1 rest counter are now
   mutually exclusive per Rainelle per night, resolved together in the same block. Epic C5.3 adds
   the overexertion streak update to that same block (up on a worked night, down on a rested one —
   see campaign-memory.js's own header comment). Epic C5.7 adds the réparation detection
   (campaign-scenes.js's detectRepairedGestures), read *after* that same streak update — see its
   own comment below for why the order matters. */
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
  const CampaignAutomation =
    typeof module !== "undefined"
      ? require("./game/campaign-automation.js")
      : root.GardenCampaignAutomation;
  const Scenes =
    typeof module !== "undefined"
      ? require("./game/campaign-scenes.js")
      : root.GardenCampaignScenes;
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
        // Epic C5.2 (design §11, "veilleuses de croissance"): resolved here, against the same
        // pre-birth snapshot of s.rainelles, before anything else about tonight is decided — a
        // Rainelle born this same night has no geste yet (design §5: it "ne copie pas un souvenir
        // ni une obligation de métier") so it can never be eligible anyway, but resolving night
        // work first keeps this block in the same "captured before any new individual" order as
        // restingIds just above, rather than relying on that incidental fact.
        const workedIds = CampaignAutomation.runNightWork(s);
        // Epic C5.6 (design §11, scène "la pause qui ne commence pas") : capturé ici, contre le
        // même instantané pré-mise à jour que capacityLimit lit déjà (campaign-automation.js) —
        // avant que la boucle increase/decreaseOverexertion plus bas ne fasse avancer le compteur
        // de cette nuit même. Une Rainelle entrant dans cette nuit déjà sursollicitée par les
        // nuits précédentes est le sujet de la scène, pas ce que la récupération automatique
        // d'un point va lui retirer dans un instant.
        const persistentIds = Scenes.detectPersistentGestures(s, workedIds);
        // Epic C5.7 (design §11, réparation) : capturé ici, avant que persistentIds ne soit
        // replié plus bas dans ce même champ persisté — "déjà vue en persistance" ne peut donc
        // jamais désigner cette nuit même (de toute façon impossible : REPOS et la persistance
        // sont deux verdicts mutuellement exclusifs de deriveLocation pour une même Rainelle),
        // seulement une nuit strictement antérieure.
        const previouslyPersistentIds = new Set(s.campaignMemory.persistentGestureIds);
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
        // Epic C5.1/C5.2: every Rainelle that already existed before tonight's resolution either
        // did real night work under an active veilleuse (workedIds, recorded above by
        // runNightWork's own effect and here by recordNightlyActivity) or rested — the two are
        // mutually exclusive per Rainelle per night, never both, never neither.
        // Epic C5.3: the same split also drives the overexertion streak — up on a worked night,
        // down (floored, progressive) on a rested one, same call sites, same mutual exclusion.
        for (const id of restingIds)
          if (workedIds.has(id)) {
            Memory.recordNightlyActivity(s.campaignMemory, id);
            Memory.increaseOverexertion(s.campaignMemory, id);
          } else {
            Memory.recordRest(s.campaignMemory, id);
            Memory.decreaseOverexertion(s.campaignMemory, id);
          }
        // Epic C5.7 : calculé seulement maintenant, après que la boucle ci-dessus ait fait
        // avancer overexertion pour cette nuit même — "cessé d'être sursollicitée" doit lire le
        // niveau d'après-récupération, jamais celui d'avant cette nuit (même politique que
        // capacityLimit, campaign-automation.js). Utilise previouslyPersistentIds capturé plus
        // haut, avant que persistentIds ne soit replié dans la mémoire ci-dessous.
        const repairedIds = Scenes.detectRepairedGestures(
          s,
          workedIds,
          previouslyPersistentIds,
        );
        // Épic C5.7 : chaque Rainelle détectée en persistance cette nuit rejoint le registre
        // borné de campaign-memory.js, une fois, jamais dupliquée — après le calcul de
        // repairedIds ci-dessus, pour qu'une Rainelle nouvellement détectée en persistance cette
        // nuit même ne puisse jamais aussi compter, cette même nuit, comme sa propre réparation
        // (déjà impossible par construction, deriveLocation étant à valeur unique, mais cet ordre
        // rend cette garantie explicite plutôt qu'accidentelle).
        for (const id of persistentIds)
          Memory.recordPersistentGesture(s.campaignMemory, id);
        // Epic C5.6: révélé la toute première fois qu'au moins une Rainelle est détectée en
        // persistance de geste cette nuit — jamais à l'armement d'une veilleuse, seulement au
        // moment où le fait se produit réellement (même posture que "traces-mouillees" ci-dessus).
        if (persistentIds.length) {
          const revealed = Narrative.pendingReveal(
            s.campaignFlags,
            "persistentGestureDetected",
          );
          if (revealed) s.campaignFlags.push(revealed.id);
        } else if (Object.keys(s.campaignMemory.nightlyActivity).length) {
          // Épic C5.6, texte de repli : reconnaît la première nuit sans aucune persistance alors
          // qu'au moins une veilleuse a déjà réellement produit du travail sur cette partie
          // (nightlyActivity non vide — le seul fait déjà existant attestant qu'une veilleuse a
          // servi pour de vrai, voir data-narrative.js's own comment) ; jamais si aucune veilleuse
          // n'a jamais rien produit, pour ne pas féliciter un joueur qui n'a simplement jamais
          // touché au mécanisme.
          const revealed = Narrative.pendingReveal(
            s.campaignFlags,
            "attentiveNightRecognized",
          );
          if (revealed) s.campaignFlags.push(revealed.id);
        }
        // Epic C5.7 : indépendant des deux révélations ci-dessus (states différents, jamais les
        // mêmes cette même nuit pour la même Rainelle — voir campaign-scenes.js's own comment sur
        // l'exclusion mutuelle REPOS/persistance — mais deux Rainelles distinctes pourraient en
        // théorie déclencher persistance et réparation la même nuit chacune de son côté).
        if (repairedIds.length) {
          const revealed = Narrative.pendingReveal(
            s.campaignFlags,
            "persistentGestureRepaired",
          );
          if (revealed) s.campaignFlags.push(revealed.id);
        }
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
