/* Rainelle schema, part of the campaign layer (UMD: node module / browser GardenRainelles).
   A Rainelle is the creature born the night a frog falls into the pot during a trial (design §5,
   chapitre 4): it carries the foliage of the cultivar crossed that same night, but is its own
   entity, distinct from any cultivar/specimen — creating one never removes or alters the
   cultivar it references (see garden-state-cmd-i.js/garden-state-cmd-f.js, which wire the
   encounter into "sleep"). Only the schema and stable-id assignment live here, on the same
   "pure factory, wired by a command" pattern already used by cultivars.js's createCultivar; the
   trigger condition (one scripted encounter, only ever the first Rainelle) is a command's job,
   not this file's.

   Epic C2.4 adds the "geste unique" contract (design §5, « Contrat du geste unique ») as a
   schema field: a Rainelle remembers at most one {verbe, poste, source, destination, condition}
   at a time, never a list. `multiplier` is deliberately excluded from VERBS: design §5 states it
   "ne s'applique jamais aux Rainelles" — a Rainelle can be taught to *use* a multiplication post
   on a plant (multiplying itself is refused elsewhere, C2.10), so the verb the design table calls
   "Multiplier une plante" is out of scope for now and left for the epic that actually wires it.
   The mutation itself (garden-state-cmd-j.js's teachGesture) always replaces `geste` wholesale —
   nothing here merges fields — which is what makes "réenseigner remplace intégralement l'ancien
   geste" true by construction. No execution yet (automation.js wiring is C2.6+): this epic only
   proves the memory slot exists, is exactly one gesture wide, and survives a reload.

   Epic C2.5 ("enseignement en quatre moments", design §5) reuses the exact same five-field shape
   validated here — validateGestureFields/normalizeGesture/applyGesture are shared by
   garden-state-cmd-j.js's teachGesture (the direct, one-shot path already delivered by C2.4) and
   garden-state-cmd-k.js's confirmTeaching/teachGestureQuick (the four-moment flow and its
   "répétition courte" shortcut), so the replace-wholesale rule and the field validation can never
   drift between the two entry points. defaultPhrase/plannedTrajectory are pure, verb-agnostic
   text/data generators standing in for "le jeu propose une phrase... un essai montre la
   trajectoire" — proven here as data, never rendered (no campaign HUD/world hookup exists yet to
   display them against, same gap C2.2 left for C2.2v).

   Epic C2.10 ("Refus de multiplication, réenseignement gratuit", design §5 « Multiplication et vie
   propre ») makes the exclusion of `multiplier` from VERBS an explicit, narrated refusal instead of
   the same generic "Geste inconnu." any other invalid verb string gets — design's own words, "cette
   limite est montrée dès les premières tentatives : elles protègent leur bourgeon, puis reprennent
   tranquillement leur activité", is a distinct in-fiction beat, not an unhandled-input error. Since
   validateGestureFields is already the single gate shared by teachGesture (C2.4) and
   demonstrateGesture (C2.5), special-casing it here covers both entry points by construction —
   there is no third path that assigns a verb to a `geste`. The rest of this epic's criterion
   ("réenseigner ne coûte rien") was already true by construction since C2.4 (teachGesture/
   confirmTeaching never touch `s.economy` or `s.credits`) and is covered by a regression check in
   tests/campaign-refusal.cjs rather than a code change here. */
(function (root) {
  // The design's gesture table (§5) lists seven rows, but "Multiplier une plante" never applies
  // to a Rainelle (see header comment above) — six verbs remain teachable by this mechanism.
  const VERBS = [
    "arroser",
    "recolter",
    "transporter",
    "replanter",
    "preparer",
    "trier",
  ];
  // Epic C2.6c: `job` is the countdown campaign-automation.js's tickRainelle drives for
  // "arroser"/"recolter" (the same `{ remaining }` shape as automation.js's own e.job) — null
  // until a valid gesture's first tick creates it, same "the factory sets its own new field"
  // posture C2.6b used for a specimen's moistureAt/readyToProduce (see cultivars.js's header
  // comment). Never touched by applyGesture: reteaching a gesture (design §5, "réenseigner
  // remplace le geste") leaves any in-progress cycle exactly where it was rather than resetting
  // it, since the countdown itself isn't part of what a Rainelle was taught.
  // Epic C3.4: null outside a bourgeon (design §5, "Multiplication et vie propre" — a bourgeon
  // has no separate growth timer of its own before harvest, unlike the nursery entry it becomes
  // once prélevé; see garden-state-cmd-m.js/garden-state-cmd-f.js). `true` rather than an object:
  // there is no state to a bourgeon beyond "present or not" at this stage.
  // Epic C4.6 (design §10, chapitre 6: "la première Rainelle garde une marque distinctive et un
  // nom qui ne se perdent jamais dans un lot") : `founder` is computed from s.rainelles.length
  // *before* the push below, so it is true for the very first individual ever created (whichever
  // path creates it — the scripted frog encounter, C2.3/C4.4, or a later bourgeon/nursery
  // resolution, C3.4) and false for every one after, forever (nothing ever removes from
  // s.rainelles, so "length === 0" can only ever be true once across a save's whole lifetime).
  function createRainelle(s, { cultivarId, name = "" }) {
    const rainelle = {
      id: `r${s.rainelleNextId++}`,
      cultivarId,
      name,
      geste: null,
      job: null,
      bourgeon: null,
      founder: s.rainelles.length === 0,
    };
    s.rainelles.push(rainelle);
    return rainelle;
  }

  // formBud/harvestBud (Epic C3.4, design §5): "après un petit événement de familiarisation
  // générique, une Rainelle forme un bourgeon de sa lignée" — no scripted staging exists yet
  // (same posture as triggerFrogEncounter for the first Rainelle, C2.3), so formBud simply marks
  // the bourgeon present, refusing a second one while the first is still unharvested. No cooldown
  // after a harvest either: the design names no rhythm beyond "l'attente" of the nursery itself
  // (see garden-state-cmd-f.js's "sleep" wiring), so nothing here throttles how soon a Rainelle
  // can form another — a deliberately minimal scope, not an oversight.
  function formBud(rainelle) {
    if (rainelle.bourgeon)
      return { ok: false, error: "Cette Rainelle porte déjà un bourgeon." };
    rainelle.bourgeon = true;
    return { ok: true };
  }

  // Free-living-place gating (design §5, "chaque naissance exige une place de vie libre") is a
  // campaign-stations.js concern, not this file's — see garden-state-cmd-m.js's harvestBud
  // command, which checks it before calling this function at all, so a refusal here never partly
  // consumes the bourgeon. cultivarId is returned, not stored anywhere yet: "de sa lignée" reads
  // as the new individual sharing its parent's cultivar/foliage, carried by the nursery entry the
  // caller creates (garden-state-lifecycle.js's s.campaignNursery) until the next "sleep".
  function harvestBud(rainelle) {
    if (!rainelle.bourgeon)
      return { ok: false, error: "Cette Rainelle ne porte aucun bourgeon à prélever." };
    rainelle.bourgeon = null;
    return { ok: true, cultivarId: rainelle.cultivarId };
  }

  // Same five fields teachGesture already validates (C2.4); pulled out so C2.5's multi-step
  // flow can validate a demonstration before it becomes a draft, without duplicating these rules.
  // Same 40-character bound already used for player-typed names elsewhere (renameCultivar,
  // renameRainelle): found missing here by /code-review before this epic's own commit — without
  // it, an arbitrarily long poste/source/destination/condition could make demonstrateGesture's
  // generated phrase exceed garden-state-validate.js's own 240-character cap on
  // campaignTeaching.draft.phrase, making the very next save unloadable.
  const FIELD_MAX_LENGTH = 40;
  // Design §5 (« Multiplication et vie propre ») : ce refus est une scène, pas une erreur de
  // saisie — distinct du "Geste inconnu." générique renvoyé pour tout autre verbe absent de
  // VERBS, pour que teachGesture/demonstrateGesture puissent l'afficher tel quel au joueur.
  const MULTIPLY_REFUSAL =
    "Elle protège son bourgeon : ce geste ne s'apprend jamais à une Rainelle.";
  function validateGestureFields({ verbe, poste, source, destination, condition }) {
    if (verbe === "multiplier") return MULTIPLY_REFUSAL;
    if (!VERBS.includes(verbe)) return "Geste inconnu.";
    const p = typeof poste === "string" ? poste.trim() : "";
    const src = typeof source === "string" ? source.trim() : "";
    const d = typeof destination === "string" ? destination.trim() : "";
    const cond = typeof condition === "string" ? condition.trim() : "";
    if (!p) return "Le poste ou la zone ne peut pas être vide.";
    if (!src) return "La source ne peut pas être vide.";
    if (!d) return "La destination ne peut pas être vide.";
    if (
      p.length > FIELD_MAX_LENGTH ||
      src.length > FIELD_MAX_LENGTH ||
      d.length > FIELD_MAX_LENGTH ||
      cond.length > FIELD_MAX_LENGTH
    )
      return `Un des champs du geste dépasse ${FIELD_MAX_LENGTH} caractères.`;
    return null;
  }

  // Only valid to call once validateGestureFields(fields) returned null.
  function normalizeGesture({ verbe, poste, source, destination, condition }) {
    return {
      verbe,
      poste: poste.trim(),
      source: source.trim(),
      destination: destination.trim(),
      condition: typeof condition === "string" ? condition.trim() : "",
    };
  }

  // Shared mutation for teachGesture (C2.4, one shot) and confirmTeaching/teachGestureQuick
  // (C2.5): always a wholesale replacement of `geste`, never a merge — see header comment.
  function applyGesture(rainelle, fields) {
    const error = validateGestureFields(fields);
    if (error) return { ok: false, error };
    const geste = normalizeGesture(fields);
    const hadGesture = !!rainelle.geste;
    rainelle.geste = geste;
    return { ok: true, hadGesture, geste };
  }

  // One phrase template per verb (design §5's own example for "récolter" — "Récolter les fruits
  // mûrs dans ce carré ; déposer dans ce panier." — sets the register the other five follow).
  // poste/source/destination are still opaque identifier strings at this engine-only stage (no
  // player-facing place names exist yet, same posture as teachGesture's own fields): the phrase
  // names them directly rather than inventing articles/labels that would have to be undone once
  // a real naming layer exists.
  const PHRASE_BUILDERS = {
    arroser: (poste, source) =>
      `Remplir l'arrosoir à ${source} ; humidifier les plantes de ${poste}.`,
    recolter: (poste, _source, destination) =>
      `Récolter les productions mûres de ${poste} ; déposer dans ${destination}.`,
    transporter: (_poste, source, destination) =>
      `Transporter les productions de ${source} vers ${destination}.`,
    replanter: (poste, source) =>
      `Prendre les jeunes plants de ${source} ; replanter les emplacements vides de ${poste}.`,
    preparer: (poste, source, destination) =>
      `Préparer la recette de ${poste} à partir de ${source} ; sortir vers ${destination}.`,
    trier: (poste, source, destination) =>
      `Trier l'arrivée de ${source} à ${poste} ; extraire vers ${destination}.`,
  };
  function defaultPhrase({ verbe, poste, source, destination, condition }) {
    const build = PHRASE_BUILDERS[verbe];
    if (!build) throw Error("Geste inconnu.");
    let phrase = build(poste, source, destination);
    if (condition) phrase += ` (si ${condition})`;
    return phrase;
  }

  // The generic planned path an "essai" would preview: go to the source, then the poste, then
  // the destination, collapsing a step that repeats the one right before it (e.g. a gesture
  // whose poste and source are the same zone, as design §5's own "arroser" row implies).
  function plannedTrajectory({ source, poste, destination }) {
    return [source, poste, destination].filter(
      (step, i, steps) => i === 0 || step !== steps[i - 1],
    );
  }

  const api = {
    createRainelle,
    formBud,
    harvestBud,
    VERBS,
    MULTIPLY_REFUSAL,
    validateGestureFields,
    normalizeGesture,
    applyGesture,
    defaultPhrase,
    plannedTrajectory,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRainelles = api;
})(globalThis);
