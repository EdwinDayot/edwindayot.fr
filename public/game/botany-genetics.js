/* Founding-species trait grammar for the campaign's hybridisation system (UMD: node module /
   browser GardenGenetics). Distinct from public/game/data-species.js on purpose: that file is
   the free-garden prototype's real houseplant catalogue (pilea, monstera...), unrelated to the
   campaign's fictional Rivebrume flora named in docs/game-design.md §4. Mixing the two catalogues
   would tie an unrelated game mode to campaign genetics; see the commit message for this epic.

   Design §4: twelve target attribute axes, six exposed by the first prototype — port, feuilles,
   fleurs, palette, humidité préférée, fonction remarquable. Each is one discrete locus: "chaque
   locus discret vient de l'un des parents, à probabilité égale" — so a trait set below is drawn
   axis-by-axis as a whole (e.g. "feuilles" is one locus, not forme/taille drawn independently).

   This module only defines the grammar, the founding species' own trait sets, cross eligibility
   and the structural validity rule for dependent characters (design §4 point 5: "une fonction ne
   peut pas hériter d'un montage impossible"). The actual randomised draw used by the pot lands in
   epic C1.3; this module gives it `enumerateReachableTraitSets` to draw from and
   `traitCombinationValid` to filter against. Nothing here is wired into the pot or a save yet. */
(function (root) {
  // Every function with a structural dependency names the axis and value it requires present in
  // the *same* trait set. "parfumer" has no structural requirement in the design text.
  const functionRequirements = {
    retenir_eau: { axis: "feuilles", check: (feuilles) => feuilles && feuilles.forme === "coupe" },
    eclairer: { axis: "fleurs", check: (_feuilles, fleurs) => !!fleurs },
    filtrer: { axis: "humidite", check: (_f, _fl, humidite) => humidite === "humide" },
    absorber_bruit: { axis: "feuilles", check: (feuilles) => feuilles && feuilles.taille === "grande" },
    parfumer: { axis: null, check: () => true },
  };

  // Eight founding species named in docs/game-design.md §4 ("Premières espèces et usages
  // proposés"). C1.8 (visual prototype) picks six of these to model first; all eight are defined
  // here since the design already names and characterises them.
  const founders = [
    {
      id: "oreille-de-pluie",
      name: "Oreille-de-pluie",
      traits: {
        port: "rosette",
        feuilles: { forme: "coupe", taille: "grande" },
        fleurs: null,
        palette: { dominante1: "vert-sauge", dominante2: "vert-clair", accent: "blanc" },
        humidite: "humide",
        fonction: { type: "retenir_eau", intensite: "forte" },
      },
    },
    {
      id: "clochette-du-soir",
      name: "Clochette du soir",
      traits: {
        port: "tige-dressee",
        feuilles: { forme: "fine", taille: "petite" },
        fleurs: { forme: "cloche", groupement: "simple" },
        palette: { dominante1: "bleu-nuit", dominante2: "argent", accent: "jaune-pale" },
        humidite: "frais",
        fonction: { type: "eclairer", intensite: "moyenne" },
      },
    },
    {
      id: "menthe-de-velours",
      name: "Menthe de velours",
      traits: {
        port: "touffe",
        feuilles: { forme: "ronde", taille: "petite" },
        fleurs: { forme: "epi", groupement: "groupee" },
        palette: { dominante1: "vert-velours", dominante2: "gris-vert", accent: "mauve" },
        humidite: "frais",
        fonction: { type: "parfumer", intensite: "faible" },
      },
    },
    {
      id: "ronce-a-rubans",
      name: "Ronce à rubans",
      traits: {
        port: "grimpant",
        feuilles: { forme: "palmee", taille: "moyenne" },
        fleurs: null,
        palette: { dominante1: "vert-fibre", dominante2: "brun-clair", accent: "rose" },
        humidite: "frais",
        fonction: null, // fibre production is the "Production" axis, out of scope for C1.2
      },
    },
    {
      id: "mousse-de-source",
      name: "Mousse de source",
      traits: {
        port: "touffe",
        feuilles: { forme: "fine", taille: "petite" },
        fleurs: null,
        palette: { dominante1: "vert-mousse", dominante2: "vert-fonce", accent: "blanc" },
        humidite: "humide",
        fonction: { type: "filtrer", intensite: "moyenne" },
      },
    },
    {
      id: "fraise-timide",
      name: "Fraise timide",
      traits: {
        port: "retombant",
        feuilles: { forme: "ronde", taille: "moyenne" },
        fleurs: { forme: "etoile", groupement: "simple" },
        palette: { dominante1: "vert-clair", dominante2: "rouge", accent: "blanc" },
        humidite: "frais",
        fonction: null, // fruit is the "Production" axis, out of scope for C1.2
      },
    },
    {
      id: "fougere-decho",
      name: "Fougère d'écho",
      traits: {
        port: "touffe",
        feuilles: { forme: "fine", taille: "grande" },
        fleurs: null,
        palette: { dominante1: "vert-fonce", dominante2: "vert-tendre", accent: null },
        humidite: "humide",
        fonction: { type: "absorber_bruit", intensite: "moyenne" },
      },
    },
    {
      id: "aster-des-vents",
      name: "Aster des vents",
      traits: {
        port: "tige-dressee",
        feuilles: { forme: "fine", taille: "petite" },
        fleurs: { forme: "etoile", groupement: "groupee" },
        palette: { dominante1: "violet", dominante2: "gris-vert", accent: "jaune" },
        humidite: "sec",
        fonction: null,
      },
    },
  ];
  const byId = new Map(founders.map((f) => [f.id, f]));

  const humidityRank = { sec: 0, frais: 1, humide: 2 };

  // A structural validity check on one full trait set: any fonction with a requirement must find
  // it satisfied on the *same* set. Used both to sanity-check the founders above (tested) and,
  // later (C1.3), to filter a generated cultivar's draw.
  function traitCombinationValid(traits) {
    if (!traits.fonction) return true;
    const req = functionRequirements[traits.fonction.type];
    if (!req) throw new Error(`unknown fonction type: ${traits.fonction.type}`);
    return req.check(traits.feuilles, traits.fleurs, traits.humidite);
  }

  // Cross eligibility between two founding species: an ecological rule (adjacent humidity
  // preference), not an ad hoc pair list, so a new founding species only needs its own trait set
  // to slot into the existing compatibility graph. Neither species needs to exist in
  // data-species.js; ids here are this module's own.
  function crossCompatible(idA, idB) {
    const a = byId.get(idA),
      b = byId.get(idB);
    if (!a || !b) throw new Error(`unknown founding species: ${idA} / ${idB}`);
    return Math.abs(humidityRank[a.traits.humidite] - humidityRank[b.traits.humidite]) <= 1;
  }

  // Every reachable trait set for a cross of speciesA x speciesB: each of the six loci is drawn,
  // independently of the others, from either parent (design §4: "chaque locus discret vient de
  // l'un des parents"). Not every one of the resulting 64 combinations is a *legal* cultivar —
  // `valid` flags which ones satisfy traitCombinationValid; the pot (C1.3) draws only from the
  // valid subset, rerolling instead of ever presenting an impossible mounting.
  const AXES = ["port", "feuilles", "fleurs", "palette", "humidite", "fonction"];
  function enumerateReachableTraitSets(idA, idB) {
    const a = byId.get(idA),
      b = byId.get(idB);
    if (!a || !b) throw new Error(`unknown founding species: ${idA} / ${idB}`);
    const results = [];
    for (let mask = 0; mask < 1 << AXES.length; mask++) {
      const traits = {};
      AXES.forEach((axis, i) => {
        const from = mask & (1 << i) ? b : a;
        traits[axis] = from.traits[axis];
      });
      results.push({ traits, valid: traitCombinationValid(traits) });
    }
    return results;
  }

  const api = {
    founders,
    functionRequirements,
    traitCombinationValid,
    crossCompatible,
    enumerateReachableTraitSets,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenGenetics = api;
})(globalThis);
