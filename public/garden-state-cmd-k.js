/* GardenState.command() branch group K (UMD: node module / browser prototype). Epic C2.5:
   "enseignement en quatre moments" (design §5) as a pure state machine atop C2.4's single-gesture
   memory (rainelles.js). "Regarde-moi" (beginTeaching) pauses the already-existing campaign clock
   (s.campaignClock, C2.2) exactly as design §5 describes; a demonstration is captured as data
   (demonstrateGesture) rather than from a real in-world player action — no campaign scene/HUD
   exists yet to capture one from, the same gap C2.2 left open for C2.2v (still todo). The
   proposed phrase and planned trajectory (design's "le jeu propose une phrase... un essai montre
   la trajectoire prévue") are proven here as pure computations (rainelles.js's defaultPhrase/
   plannedTrajectory) attached to the draft; showing them to the player is deferred to a new
   C2.5v (interface), same split as C2.2/C2.2v and for the same reason.

   teachGestureQuick is design §5's "après avoir démontré un geste une fois... enseigner par une
   courte répétition... sans refaire tout le tutoriel" : it reapplies the last *confirmed*
   demonstration (s.campaignLastDemonstration) straight to another Rainelle, no pause/session
   needed — the four-moment flow above is what produces that recorded template in the first
   place.

   Epic C4.6 (design §10, chapitre 6): demonstrateGesture is the other entry point that can
   produce Rainelles.MULTIPLY_REFUSAL (garden-state-cmd-j.js's teachGesture is the first) — same
   one-time narrative reveal fired here, so whichever path the player tries first is the one that
   shows it. */
(function (root) {
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
    commandSegK(c, ctx, st) {
      const { s, fail } = st;
      if (c.type === "beginTeaching") {
        st.taken = true;
        const rainelle = s.rainelles.find((r) => r.id === c.id);
        if (!rainelle) return fail("Rainelle inconnue.");
        if (s.campaignTeaching)
          return fail(
            "Une leçon est déjà en cours — termine-la ou annule-la d'abord.",
          );
        s.campaignTeaching = { rainelleId: c.id, step: "watching", draft: null };
        s.campaignClock.paused = true;
        st.message = "« Regarde-moi » : le temps s'arrête.";
      } else if (c.type === "demonstrateGesture") {
        st.taken = true;
        if (!s.campaignTeaching)
          return fail("Aucune leçon en cours — commence par « Regarde-moi ».");
        if (s.campaignTeaching.step !== "watching")
          return fail("La démonstration a déjà été faite pour cette leçon.");
        const error = Rainelles.validateGestureFields(c);
        if (error) {
          if (error === Rainelles.MULTIPLY_REFUSAL) {
            const revealed = Narrative.pendingReveal(
              s.campaignFlags,
              "firstMultiplyRefusalSeen",
            );
            if (revealed) s.campaignFlags.push(revealed.id);
          }
          return fail(error);
        }
        const geste = Rainelles.normalizeGesture(c);
        const phrase = Rainelles.defaultPhrase(geste);
        const trajectory = Rainelles.plannedTrajectory(geste);
        s.campaignTeaching.draft = { ...geste, phrase, trajectory };
        s.campaignTeaching.step = "reviewing";
        st.message = "Geste démontré : phrase proposée, essai prêt.";
      } else if (c.type === "reviseGesturePhrase") {
        st.taken = true;
        if (!s.campaignTeaching || s.campaignTeaching.step !== "reviewing")
          return fail("Rien à corriger — démontre d'abord le geste.");
        const phrase = typeof c.phrase === "string" ? c.phrase.trim() : "";
        if (!phrase) return fail("La phrase ne peut pas être vide.");
        if (phrase.length > 240) return fail("La phrase est trop longue.");
        s.campaignTeaching.draft.phrase = phrase;
        st.message = "Phrase modifiée.";
      } else if (c.type === "confirmTeaching") {
        st.taken = true;
        if (!s.campaignTeaching || s.campaignTeaching.step !== "reviewing")
          return fail("Rien à confirmer — démontre d'abord le geste.");
        const rainelle = s.rainelles.find(
          (r) => r.id === s.campaignTeaching.rainelleId,
        );
        // Unreachable today (nothing removes an entry from s.rainelles, and validate() already
        // rejects a saved campaignTeaching.rainelleId that doesn't resolve), kept anyway so a
        // future removal epic fails safely here instead of throwing: same defensive posture as
        // the other three lookups in this file.
        if (!rainelle) return fail("Rainelle inconnue.");
        const { verbe, poste, source, destination, condition } =
          s.campaignTeaching.draft;
        const r = Rainelles.applyGesture(rainelle, {
          verbe,
          poste,
          source,
          destination,
          condition,
        });
        s.campaignLastDemonstration = {
          verbe,
          poste,
          source,
          destination,
          condition,
        };
        s.campaignClock.paused = false;
        s.campaignTeaching = null;
        // Epic C5.1: same manual-intervention/first-gesture recording as teachGesture's own
        // success path (garden-state-cmd-j.js) — confirmTeaching is the four-moment flow's own
        // gesture-assignment command.
        Memory.recordManualIntervention(s.campaignMemory);
        if (!r.hadGesture)
          Memory.recordFirstGesture(s.campaignMemory, rainelle.id, verbe);
        st.message = r.hadGesture
          ? `Ancien geste remplacé : ${verbe}.`
          : `Geste appris : ${verbe}.`;
      } else if (c.type === "cancelTeaching") {
        st.taken = true;
        if (!s.campaignTeaching) return fail("Aucune leçon en cours.");
        s.campaignClock.paused = false;
        s.campaignTeaching = null;
        st.message = "Leçon annulée.";
      } else if (c.type === "teachGestureQuick") {
        st.taken = true;
        const rainelle = s.rainelles.find((r) => r.id === c.id);
        if (!rainelle) return fail("Rainelle inconnue.");
        // Found by /code-review before this epic's own commit: without this check, a quick
        // teach could fire while a full lesson is mid-review, mutating a gesture while
        // campaignTeaching's own draft stays stale and unrelated to what just changed.
        if (s.campaignTeaching)
          return fail(
            "Une leçon est en cours — termine-la ou annule-la avant une répétition rapide.",
          );
        if (!s.campaignLastDemonstration)
          return fail(
            "Aucun geste démontré pour l'instant — montre-le une première fois.",
          );
        const r = Rainelles.applyGesture(rainelle, s.campaignLastDemonstration);
        // Epic C5.1: same recording as confirmTeaching/teachGesture above — a quick repetition is
        // still a direct gesture command the player issued.
        Memory.recordManualIntervention(s.campaignMemory);
        if (!r.hadGesture)
          Memory.recordFirstGesture(
            s.campaignMemory,
            rainelle.id,
            s.campaignLastDemonstration.verbe,
          );
        st.message = r.hadGesture
          ? `Ancien geste remplacé (répétition rapide) : ${s.campaignLastDemonstration.verbe}.`
          : `Geste transmis rapidement : ${s.campaignLastDemonstration.verbe}.`;
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
