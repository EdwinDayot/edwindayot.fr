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
   own comment below for why the order matters. Epic C6.3 adds the chapter 11 "bilan matinal"
   reveal; Epic C6.5 adds, right after it and gated on the same "la-bonne-occasion" flag, the
   chapter 12 "variété suivante" reveal and the first of the two "note de Jeanne" reveals (its
   second half lives in garden-state-cmd-r.js's deliverContract). Epic C6.7 adds, right after
   that, the chapter 15 "retour d'Alma" reveal (see below). */
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
  const Contracts =
    typeof module !== "undefined"
      ? require("./game/campaign-contracts.js")
      : root.GardenCampaignContracts;
  const RainelleMovement =
    typeof module !== "undefined"
      ? require("./game/rainelle-movement.js")
      : root.GardenRainelleMovement;
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
        // Epic C6.15 (found by /code-review before this epic's own commit: neither restorePassage
        // nor releaseGesture is ever called by "sleep" itself, so a Rainelle born right here —
        // frog encounter above, or a bourgeon resolved in the loop just above, both created with
        // geste null — could already satisfy the settling condition (passage already open, no one
        // settled yet) without either of this epic's own two entry points ever running again to
        // notice her: restorePassage is one-way and refuses once already open, releaseGesture
        // refuses on a Rainelle whose geste is already null. Checked once here, after both birth
        // loops above, same "decide there (pure), mutate here" split already applied to
        // garden-state-cmd-w.js/-u.js.
        const settleId = RainelleMovement.selectRainelleToSettle(s);
        if (settleId) s.rainelles.find((r) => r.id === settleId).settledAt = true;
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
          if (revealed) {
            s.campaignFlags.push(revealed.id);
            // Epic C5.14 (design §14, mise en scène observable): staged exactly when — never
            // before, never separately from — the text itself is actually (first-time) revealed,
            // matching the critère de sortie literally ("la révélation... s'accompagne d'une mise
            // en scène"). st.scenes is read by garden-state.js's own command() to become
            // result.scenes, the render layer's only signal (garden-dispatch.js's "confirm-night")
            // — never a new persisted field, never inferred a second time from state after the
            // fact (workedThisNight, read above, only ever exists for this one call).
            st.scenes = st.scenes || [];
            st.scenes.push({
              kind: "persistance",
              rainelleId: Scenes.selectSceneRainelle(persistentIds),
            });
          }
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
          if (revealed) {
            s.campaignFlags.push(revealed.id);
            // Epic C5.14: same posture as the persistance branch above. Both could in principle
            // fire the same night (two distinct Rainelles, one entering persistance while another
            // is repaired) — st.scenes stays an array rather than a single slot so neither is
            // silently dropped; the render layer (garden-dispatch.js) only ever stages the first.
            st.scenes = st.scenes || [];
            st.scenes.push({
              kind: "reparation",
              rainelleId: Scenes.selectSceneRainelle(repairedIds),
            });
          }
        }
        // Epic C6.3 (design §10, chapitre 11 "La nuit où tout continue") : évalué une seule fois
        // par partie, à la toute première nuit résolue après que le texte de C6.1 ("la-bonne-
        // occasion") a déjà été vu — jamais avant (le levier n'a pas encore été proposé), jamais
        // une seconde fois ensuite. Les cinq entrées "bilan-matin-*" de data-narrative.js forment
        // une seule famille mutuellement exclusive : le garde ci-dessous vérifie qu'aucune d'elles
        // n'a encore été révélée avant d'en choisir une, jamais après (une partie ne repasse
        // jamais par ce bloc une deuxième fois, contrairement à persistance/réparation qui se
        // réévaluent chaque nuit).
        if (
          s.campaignFlags.includes("la-bonne-occasion") &&
          !s.campaignFlags.some((f) => f.startsWith("bilan-matin-"))
        ) {
          const leverActive =
            s.campaignStations.zones.some((z) => z.veilleuse) ||
            s.campaignStations.bornes.some((b) => b.priseFortDebit);
          let signal;
          if (!leverActive) {
            signal = "chapter11BilanPreserved";
          } else {
            const bassinLow =
              Memory.bassinCommunLevel(s.campaignMemory) <
              Memory.BASSIN_COMMUN_CAPACITY;
            const hasPersistence =
              s.campaignMemory.persistentGestureIds.length > 0;
            signal =
              bassinLow && hasPersistence
                ? "chapter11BilanActiveComplet"
                : bassinLow
                  ? "chapter11BilanActiveBassin"
                  : hasPersistence
                    ? "chapter11BilanActivePersistance"
                    : "chapter11BilanActive";
          }
          const revealed = Narrative.pendingReveal(s.campaignFlags, signal);
          if (revealed) s.campaignFlags.push(revealed.id);
        }
        // Epic C6.5 (design §10, chapitre 12 "La variété suivante") : évalué à la même toute
        // première nuit que le bilan du chapitre 11 ci-dessus, même garde littérale du backlog
        // ("au premier sleep résolu après que le flag narratif de C6.1 a déjà été révélé") — une
        // famille "variete-suivante-*" séparée et mutuellement exclusive, jamais réévaluée
        // ensuite (même garde-avant-choix que bilan-matin-* juste au-dessus).
        if (
          s.campaignFlags.includes("la-bonne-occasion") &&
          !s.campaignFlags.some((f) => f.startsWith("variete-suivante-"))
        ) {
          // Écart assumé et documenté ici, pas deviné : le critère de sortie de l'epic évoque
          // "Memory.unsoldStock[cultivarId]", mais campaign-memory.js documente lui-même (C6.4)
          // que ce champ reste réservé et toujours vide — la vraie réponse dérivée est
          // Contracts.unsoldStock(s.specimens, cultivarId), exactement comme deliverContract
          // (garden-state-cmd-r.js) la calcule déjà. Lire littéralement le champ jamais rempli
          // aurait rendu la branche (c) inatteignable. "Le contrat" désigné par le critère est le
          // dernier signé (s.campaignContracts n'est jamais vidé — un contrat honoré y reste,
          // seul son quota atteint le ferme) : à ce stade très amont de l'acte IV, il n'y en a
          // normalement jamais plus d'un, mais cette lecture reste correcte même si un second a
          // déjà été signé après que le premier a atteint son quota.
          const lastContract =
            s.campaignContracts[s.campaignContracts.length - 1] || null;
          let signal;
          if (!lastContract) {
            signal = "chapter12NoContract";
          } else {
            const unsold = Contracts.unsoldStock(
              s.specimens,
              lastContract.cultivarId,
            );
            signal =
              unsold > 0 ? "chapter12SuccessInvendus" : "chapter12SuccessSobre";
          }
          const varieteRevealed = Narrative.pendingReveal(
            s.campaignFlags,
            signal,
          );
          if (varieteRevealed) s.campaignFlags.push(varieteRevealed.id);
          // Design §10, chapitre 12 : « Une ancienne note d'Alma apparaît... Puis une autre, à
          // une date ultérieure, avec la même phrase. » Première révélation ici, au même sleep
          // que les trois branches ci-dessus ; la seconde vit dans garden-state-cmd-r.js's
          // deliverContract, au prochain contrat honoré strictement après celle-ci (jamais ici :
          // ce même sleep ne peut pas aussi être "ultérieur" à lui-même).
          const jeanneRevealed = Narrative.pendingReveal(
            s.campaignFlags,
            "jeanneGreenhouseNoteFirst",
          );
          if (jeanneRevealed) s.campaignFlags.push(jeanneRevealed.id);
        }
        // Epic C6.7 (design §10, chapitre 15 "Alma n'a pas la réponse"): at the first sleep once
        // both upstream conditions hold — one of the two "premier-non-*" flags (C6.6) and
        // "note-jeanne-serre-2" (C6.5, the second honoured contract) — and at least one Rainelle
        // exists, reveal both chapter-15 texts together. Not a mutually-exclusive family like
        // bilan-matin-*/variete-suivante-* above: each entry's own pendingReveal call is already
        // idempotent (refuses an id already in campaignFlags), so no extra guard-before-choose is
        // needed — a later sleep with the gate still true simply reveals nothing more, each text
        // exactly once.
        if (
          s.campaignFlags.some((f) => f.startsWith("premier-non-")) &&
          s.campaignFlags.includes("note-jeanne-serre-2") &&
          s.rainelles.length > 0
        ) {
          const almaRevealed = Narrative.pendingReveal(
            s.campaignFlags,
            "almaReturnDiscoversRainelles",
          );
          if (almaRevealed) s.campaignFlags.push(almaRevealed.id);
          const jeanneReconstRevealed = Narrative.pendingReveal(
            s.campaignFlags,
            "jeanneReconstitutionSeason",
          );
          if (jeanneReconstRevealed)
            s.campaignFlags.push(jeanneReconstRevealed.id);
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
