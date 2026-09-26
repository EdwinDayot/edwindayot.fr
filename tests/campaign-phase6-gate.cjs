const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Memory = require("../public/game/campaign-memory.js");
const Narrative = require("../public/game/data-narrative.js");
const Epilogue = require("../public/game/campaign-epilogue.js");
const House = require("../public/game/campaign-house.js");

// Epic C6.29 (docs/campagne-backlog.md "Portes de phase", design §15 : "tous les parcours
// narratifs prévus concluent sans imposer l'exploitation ni inventer une faute"). Rejoue, sur le
// modèle exact de campaign-phase4-gate.cjs/campaign-phase5-gate-mecanique.cjs, deux parties
// distinctes traversant réellement les chapitres 10 à 18 (actes IV à VI) via GardenState.command()
// réel — jamais un accès direct à l'état, à l'exception des mêmes précédents déjà posés par les
// portes précédentes pour ce qui n'a encore aucune commande de placement (Stations.registerStation,
// Cultivars.createSpecimen).
//
// Limite honnête, vérifiée par lecture complète de campaign-epilogue.js avant d'écrire ce test,
// jamais devinée : le critère de sortie de cet epic, tel qu'écrit dans campagne-backlog.md, décrit
// la partie intensive-puis-réparée comme devant lire « accommodements partiels » si un contrat a
// laissé des invendus réels non redistribués. Ce n'est vrai d'aucune ligne de code réelle :
// Epilogue.orientation(s) (C6.17, gelé et testé depuis, 793 tests dépendants) ne lit jamais
// s.specimens ni Contracts.unsoldStock — seulement nightlyActivity/waterWithdrawals/
// habitatTransformations/campaignContracts.length (engagement) et les zones/bornes/campaignFlags
// (levier actif/réparé). Ce test ne réécrit donc jamais cette lecture en dur : il calcule
// l'orientation attendue via un appel réel à Epilogue.orientation(s) juste avant openEpilogue,
// exactement comme le prescrit la même clause du critère de sortie ("la branche exacte à attendre
// se déduit de campaign-epilogue.js's orientation(s) déjà réelle, jamais reformulée en dur dans le
// test"), et documente ici, plutôt que de la deviner ou de la corriger silencieusement, que le
// signal "invendus non redistribués" n'existe simplement pas dans la dérivation aujourd'hui — un
// refinement possible pour un futur Cartographe, explicitement anticipé par la note "limites
// honnêtes" de C6.17 lui-même ("si un futur test de parcours montre que les trois orientations
// actuelles ne suffisent pas... plutôt que de deviner leur poids maintenant"), jamais construit ici
// puisque cet epic n'introduit aucun fichier de production (voir son propre "Fichiers probables").

const OBLIGATION_WORDS = ["doit ", "dois ", "obligatoire", "obligé", "il faut"];

function assertNoObligation(id) {
  const entry = Narrative.TEXTS[id];
  assert.ok(entry, `TEXTS must carry an entry for "${id}"`);
  const lower = entry.text.toLowerCase();
  for (const w of OBLIGATION_WORDS) {
    assert.equal(lower.includes(w), false, `"${id}" must not contain an obligation formulation ("${w}")`);
  }
}

// Seule la rencontre scriptée (C2.3) peut créer une Rainelle via une commande réelle — même
// fixture que toutes les portes de phase précédentes.
function bornRainelle(g) {
  assert.equal(g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  return g.s.rainelles[0];
}

function reachChapter10Flag(g) {
  assert.equal(g.command({ type: "quest", action: "accept", questId: "brume-d-ines" }).ok, true);
  g.s.inventory["cutting:pilea"] = 1;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "brume-d-ines" }).ok,
    true,
  );
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "occasion-de-basile" }).ok,
    true,
  );
  g.s.inventory["cutting:pilea"] = 1;
  const r = g.command({ type: "quest", action: "complete", questId: "occasion-de-basile" });
  assert.equal(r.ok, true, r.error);
  assert.ok(g.s.campaignFlags.includes("la-bonne-occasion"));
}

function teachArroser(g, id, { poste, source }) {
  const r = g.command({
    type: "teachGesture",
    id,
    verbe: "arroser",
    poste,
    source,
    destination: "peu-importe",
    condition: "",
  });
  assert.equal(r.ok, true, r.error);
}

function fund(g) {
  g.add("wood", 10);
  g.add("stone", 10);
  g.add("clay", 10);
}

const BILAN_FLAGS = [
  "bilan-matin-preserve",
  "bilan-matin-actif",
  "bilan-matin-actif-bassin",
  "bilan-matin-actif-persistance",
  "bilan-matin-actif-complet",
];
const VARIETE_FLAGS = [
  "variete-suivante-refus",
  "variete-suivante-sobre",
  "variete-suivante-invendus",
];
const PREMIER_NON_FLAGS = ["premier-non-interrogation", "premier-non-signe"];
const CHAPTER15_FLAGS = ["alma-retour", "reconstitution-jeanne"];
const LEVER_REPAIR_FLAGS = [
  "levier-contrat-reduit",
  "levier-veilleuse-coupee",
  "levier-prise-restituee",
  "levier-extension-rendue",
];
const EPILOGUE_ORIENTATION_TEXT_ID = {
  intensive: "epilogue-intensive",
  partiel: "epilogue-partiel",
  durable: "epilogue-durable",
};

function family(g, list) {
  return g.s.campaignFlags.filter((f) => list.includes(f));
}

test("phase 6 gate — partie attentive : aucun levier jamais activé, aucun contrat jamais signé, le passage est restauré, l'épilogue s'ouvre sur « durable »", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);

  reachChapter10Flag(g);
  // Un seul sleep révèle à la fois la famille du chapitre 11 (bilan matinal) et celle du
  // chapitre 12 (variété suivante) : aucun levier ni aucun contrat n'existe encore à cet instant.
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(family(g, BILAN_FLAGS), ["bilan-matin-preserve"]);
  assert.deepEqual(family(g, VARIETE_FLAGS), ["variete-suivante-refus"]);
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-1"));

  // Écart honnête, vérifié plutôt que deviné (voir l'en-tête de ce fichier) : la seconde note de
  // Jeanne (et donc alma-retour/reconstitution-jeanne/archives-restaurees/jeanne-serre-sans-usage,
  // chapitre 15) exige un second contrat réellement livré (tests/campaign-chapter12.cjs, "the
  // second Jeanne note... appears only once a contract is honoured afterwards") ; or tout contrat
  // signé, même honoré sans invendu, rend s.campaignContracts.length > 0 pour le reste de la
  // partie (aucune commande ne retire jamais un contrat de ce tableau, campaign-contracts.js),
  // ce qui empêche définitivement Epilogue.orientation(s) de lire "durable" en fin de partie
  // (everEngaged devient vrai et reste vrai, sans qu'aucun levier n'ait jamais existé à réparer
  // — orientation retombe alors dans la branche "partiel", jamais "durable"). Une partie
  // réellement attentive au sens strict de ce test (qui doit atteindre "durable" de façon
  // garantie, pas seulement probable) ne peut donc pas non plus emprunter la suite du chapitre 15
  // : ce n'est pas une réduction silencieuse du critère de sortie de cet epic-ci, mais un fait
  // vérifié sur l'arbre de dépendances narratif déjà "fait" depuis C6.5/C6.7, laissé en l'état.

  // Aucun des trois leviers ni de leurs réparations ne fire jamais.
  for (let i = 0; i < 5; i++) assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(family(g, LEVER_REPAIR_FLAGS), []);
  assert.equal(
    Memory.bassinCommunLevel(g.s.campaignMemory),
    Memory.BASSIN_COMMUN_CAPACITY,
    "jamais de prise à fort débit activée : le bassin commun reste plein",
  );
  assert.deepEqual(g.s.campaignMemory.habitatTransformations, []);

  // ---- Chapitre 17 : passage restauré, la Rainelle (geste toujours null) s'installe ----
  assert.equal(rainelle.geste, null);
  assert.equal(rainelle.settledAt, false);
  const restore = g.command({ type: "restorePassage" });
  assert.equal(restore.ok, true, restore.error);
  assert.equal(rainelle.settledAt, true, "seule Rainelle à geste null : s'installe dès le passage rétabli");
  assert.ok(g.s.campaignFlags.includes("passage-rainelle-installee"));
  assert.notEqual(g.s.campaignEpilogue.unlocksOnDay, null);

  // Aller-retour JSON à mi-parcours.
  const reloadedMid = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloadedMid.s, g.s, "état strictement identique après un aller-retour JSON à mi-parcours");

  // ---- Chapitre 18 : délai d'observation puis ouverture de l'épilogue ----
  assert.equal(Epilogue.canOpen(g.s), false, "le délai de trois jours n'est pas encore écoulé");
  const refusedEarly = g.command({ type: "openEpilogue" });
  assert.equal(refusedEarly.ok, false);
  assert.equal(g.s.campaignEpilogue.orientation, null, "un refus ne fige jamais l'orientation");

  while (g.s.campaignDay < g.s.campaignEpilogue.unlocksOnDay) {
    assert.equal(g.command({ type: "sleep" }).ok, true);
  }
  assert.equal(Epilogue.canOpen(g.s), true);
  assert.equal(Epilogue.orientation(g.s), "durable", "aucun levier ni contrat jamais engagé : durable, garanti par construction");

  const opened = g.command({ type: "openEpilogue" });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(g.s.campaignEpilogue.orientation, "durable");
  assert.ok(g.s.campaignFlags.includes("epilogue-durable"));
  assert.ok(g.s.campaignFlags.includes("epilogue-suite"));
  assert.equal(g.s.campaignFlags.includes("epilogue-intensive"), false);
  assert.equal(g.s.campaignFlags.includes("epilogue-partiel"), false);
  assert.deepEqual(g.s.campaignEpilogue.gift, Epilogue.gift());

  // Second appel refusé, sans re-figer ni re-révéler.
  const flagsBeforeSecond = [...g.s.campaignFlags];
  const secondOpen = g.command({ type: "openEpilogue" });
  assert.equal(secondOpen.ok, false);
  assert.deepEqual(g.s.campaignFlags, flagsBeforeSecond);

  // « Après le générique, les travaux, commandes et découvertes continuent » (design §10) :
  // aucune fin qui verrouille la partie.
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
    "une commande ordinaire réussit encore après l'ouverture de l'épilogue",
  );

  // Absence de formulation d'obligation/d'accusation sur tout ce qui a été révélé cette partie.
  for (const id of [
    "bilan-matin-preserve",
    "variete-suivante-refus",
    "note-jeanne-serre-1",
    "passage-rainelle-installee",
    "epilogue-durable",
    "epilogue-suite",
  ])
    assertNoObligation(id);

  // Aller-retour JSON en fin de partie, puis re-validation stricte.
  const reloadedEnd = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloadedEnd.s, g.s, "état strictement identique après un aller-retour JSON en fin de partie");
  validate(reloadedEnd.serialize());
});

test("phase 6 gate — partie intensive-puis-réparée : les trois leviers sont activés puis réparés avant l'ouverture de l'épilogue", () => {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);

  // ---- Stations réelles pour les trois leviers, posées avant tout, comme les portes précédentes
  // le font déjà pour ce qui n'a encore aucune commande de placement. ----
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 1, z: 0 });
  const habitatSpare = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: -20,
    z: -20,
    capacity: 10,
  });
  const habitatToExtend = Stations.registerStation(g.s.campaignStations, "habitat", {
    x: 2,
    z: 2,
    capacity: 4,
  });
  const zoneExt = Stations.registerStation(g.s.campaignStations, "zone", { x: 5, z: 5 });

  // ---- Premier contrat, réellement livré avec un invendu réel constaté (design §16 : « le
  // premier contrat provoque un invendu réel »), signé avant même la première rencontre du
  // chapitre 10 pour que sa toute première évaluation révèle directement "invendus", jamais
  // "refus" (tests/campaign-chapter12.cjs, même ordre déjà prouvé). ----
  const sellCultivar = g.s.cultivars[0];
  const sign1 = g.command({
    type: "signContract",
    cultivarId: sellCultivar.id,
    quota: 5,
    pricePerUnit: 10,
  });
  assert.equal(sign1.ok, true, sign1.error);
  Cultivars.createSpecimen(g.s, { cultivarId: sellCultivar.id, x: 8, z: 8 });
  Cultivars.createSpecimen(g.s, { cultivarId: sellCultivar.id, x: 9, z: 8 });
  const contract1Id = g.s.campaignContracts[0].id;
  const delivery1 = g.command({ type: "deliverContract", contractId: contract1Id, quantity: 1 });
  assert.equal(delivery1.ok, true, delivery1.error);
  assert.equal(g.s.specimens.length, 1, "un spécimen livré, un invendu réel constaté");

  // ---- Les deux leviers à journal (veilleuse/prise) activés et réellement utilisés avant la
  // première évaluation du chapitre 11, pour que "bilan-matin-actif*" (jamais "preserve") soit la
  // branche fixée une fois pour toutes de cette partie. ----
  teachArroser(g, rainelle.id, { poste: zone.id, source: borne.id });
  const workSpecimen = Cultivars.createSpecimen(g.s, { cultivarId: sellCultivar.id, x: 0, z: 0 });
  assert.equal(g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok, true);
  assert.equal(g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true }).ok, true);

  // ---- Le troisième levier (extension commerciale), instantané, avant la même évaluation. ----
  const extend = g.command({
    type: "extendZoneOverHabitat",
    zoneId: zoneExt.id,
    habitatId: habitatToExtend.id,
  });
  assert.equal(extend.ok, true, extend.error);
  assert.deepEqual(g.s.campaignMemory.habitatTransformations, [
    { zoneId: zoneExt.id, habitatId: habitatToExtend.id, capacity: 4, day: g.s.campaignDay },
  ]);

  reachChapter10Flag(g);
  // Ce sleep travaille réellement la nuit (veilleuse active, spécimen assoiffé arrosé depuis la
  // borne à prise à fort débit) ET révèle, en une fois, les familles des chapitres 11/12.
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.notEqual(family(g, BILAN_FLAGS)[0], "bilan-matin-preserve");
  assert.deepEqual(family(g, VARIETE_FLAGS), ["variete-suivante-invendus"]);
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-1"));
  assert.ok(
    Object.keys(g.s.campaignMemory.nightlyActivity).length > 0,
    "un vrai travail nocturne a bien eu lieu (veilleuse active, spécimen réellement arrosé)",
  );
  assert.ok(
    Object.keys(g.s.campaignMemory.waterWithdrawals).length > 0,
    "un vrai prélèvement d'eau a bien eu lieu (borne à prise à fort débit réellement utilisée)",
  );
  const bassinAfterWork = Memory.bassinCommunLevel(g.s.campaignMemory);
  assert.ok(bassinAfterWork < Memory.BASSIN_COMMUN_CAPACITY, "le bassin commun a mesurablement baissé");

  // Le premier contrat (quota 5, un seul livré) reste "ouvert" (fed < quota) et signContract
  // refuse une seconde signature tant qu'un contrat est encore ouvert — clôturé ici en réduisant
  // son quota jusqu'à ce qui a déjà été livré (aucune révélation avant archives-restaurees,
  // encore loin à ce stade de la partie).
  const closeContract1 = g.command({ type: "reduceContract", contractId: contract1Id, quota: 1 });
  assert.equal(closeContract1.ok, true, closeContract1.error);
  assert.deepEqual(family(g, LEVER_REPAIR_FLAGS), [], "aucune révélation avant archives-restaurees");

  // ---- Second contrat, entièrement honoré (« honoré » = amène le contrat à son quota, quel que
  // soit le contrat concerné, garden-state-cmd-r.js), strictement après la première note de
  // Jeanne : révèle la seconde. ----
  assert.equal(g.command({ type: "sowPot", a: "menthe-de-velours", b: "aster-des-vents" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  const secondCultivar = g.s.cultivars[g.s.cultivars.length - 1];
  const sign2 = g.command({
    type: "signContract",
    cultivarId: secondCultivar.id,
    quota: 1,
    pricePerUnit: 10,
  });
  assert.equal(sign2.ok, true, sign2.error);
  Cultivars.createSpecimen(g.s, { cultivarId: secondCultivar.id, x: 10, z: 10 });
  const contract2Id = g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  const delivery2 = g.command({ type: "deliverContract", contractId: contract2Id, quantity: 1 });
  assert.equal(delivery2.ok, true, delivery2.error);
  assert.ok(g.s.campaignFlags.includes("note-jeanne-serre-2"));

  // Troisième contrat, signé une fois le second clos, délibérément laissé ouvert (quota 3, un
  // seul livré, deux invendus réels) pour servir, plus tard, à la réparation du chapitre 16
  // (reduceContract exige un contrat déjà nourri mais pas encore clos).
  const sign3 = g.command({
    type: "signContract",
    cultivarId: secondCultivar.id,
    quota: 3,
    pricePerUnit: 10,
  });
  assert.equal(sign3.ok, true, sign3.error);
  Cultivars.createSpecimen(g.s, { cultivarId: secondCultivar.id, x: 11, z: 10 });
  Cultivars.createSpecimen(g.s, { cultivarId: secondCultivar.id, x: 12, z: 10 });
  const contract3Id = g.s.campaignContracts[g.s.campaignContracts.length - 1].id;
  const delivery3 = g.command({ type: "deliverContract", contractId: contract3Id, quantity: 1 });
  assert.equal(delivery3.ok, true, delivery3.error);

  // ---- Chapitre 13 : le premier non ----
  assert.equal(g.command({ type: "formBud", id: rainelle.id }).ok, true);
  const refusal = g.command({
    type: "teachGesture",
    id: rainelle.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(refusal.ok, false);
  assert.ok(family(g, PREMIER_NON_FLAGS).length === 1);

  // ---- Chapitre 15 : retour d'Alma, reconstitution, restauration des étiquettes ----
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.deepEqual(family(g, CHAPTER15_FLAGS).sort(), CHAPTER15_FLAGS.slice().sort());
  assert.equal(g.s.campaignFlags.includes("archives-restaurees"), false);
  const restoreLabels = g.command({ type: "restoreArchiveLabels" });
  assert.equal(restoreLabels.ok, true, restoreLabels.error);
  assert.ok(g.s.campaignFlags.includes("archives-restaurees"));
  assert.equal(g.s.campaignFlags.includes("jeanne-serre-sans-usage"), false);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.ok(g.s.campaignFlags.includes("jeanne-serre-sans-usage"));

  // Aller-retour JSON à mi-parcours (fin des actes IV/V, avant toute réparation).
  const reloadedMid = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloadedMid.s, g.s, "état strictement identique après un aller-retour JSON à mi-parcours");

  // ---- Chapitre 16 : réparation des trois leviers, chacune sa révélation, coût réel jamais annulé ----
  const reduce = g.command({ type: "reduceContract", contractId: contract3Id, quota: 1 });
  assert.equal(reduce.ok, true, reduce.error);
  assert.ok(g.s.campaignFlags.includes("levier-contrat-reduit"));

  const veilleuseOff = g.command({ type: "setVeilleuse", zoneId: zone.id, active: false });
  assert.equal(veilleuseOff.ok, true, veilleuseOff.error);
  assert.ok(g.s.campaignFlags.includes("levier-veilleuse-coupee"));
  assert.equal(zone.veilleuse, false);

  // Plusieurs nuits se sont écoulées depuis la première (chapitres 12/13/15), veilleuse toujours
  // active jusqu'ici : le bassin a continué de baisser au-delà de bassinAfterWork — capturé juste
  // avant de couper la prise, pas au moment du tout premier travail nocturne.
  const bassinBeforeRepair = Memory.bassinCommunLevel(g.s.campaignMemory);
  assert.ok(bassinBeforeRepair <= bassinAfterWork);
  const priseOff = g.command({ type: "setPriseFortDebit", borneId: borne.id, active: false });
  assert.equal(priseOff.ok, true, priseOff.error);
  assert.ok(g.s.campaignFlags.includes("levier-prise-restituee"));
  assert.equal(borne.priseFortDebit, false);
  // Écart honnête, vérifié dans campaign-memory.js et déjà couvert par
  // tests/campaign-phase5-gate-mecanique.cjs ("sans jamais la faire remonter") : couper une prise
  // arrête sa contribution à la baisse future du bassin commun, il ne remonte jamais — une
  // réparation à coût réel, jamais une annulation gratuite, jamais littéralement une remontée.
  assert.equal(
    Memory.bassinCommunLevel(g.s.campaignMemory),
    bassinBeforeRepair,
    "couper la prise arrête la baisse sans jamais la faire remonter (coût réel, jamais annulé)",
  );

  fund(g);
  const convert = g.command({ type: "convertZoneToLivingSpace", zoneId: zoneExt.id, x: 50, z: 50 });
  assert.equal(convert.ok, true, convert.error);
  assert.ok(g.s.campaignFlags.includes("levier-extension-rendue"));
  assert.equal(zoneExt.extensionCommerciale, false);
  const newHabitat = g.s.campaignStations.habitats.find((h) => h.x === 50 && h.z === 50);
  assert.ok(newHabitat, "un nouvel habitat de capacité identique existe après conversion");
  assert.equal(newHabitat.capacity, 4);

  assert.deepEqual(family(g, LEVER_REPAIR_FLAGS).sort(), LEVER_REPAIR_FLAGS.slice().sort());

  // ---- Chapitre 17 : la Rainelle est libérée de son geste puis le passage restauré ; elle s'installe ----
  assert.notEqual(rainelle.geste, null);
  const release = g.command({ type: "releaseGesture", rainelleId: rainelle.id });
  assert.equal(release.ok, true, release.error);
  assert.equal(rainelle.geste, null);
  assert.equal(rainelle.settledAt, false, "toujours bloqué : aucune installation avant restorePassage");
  const restore = g.command({ type: "restorePassage" });
  assert.equal(restore.ok, true, restore.error);
  assert.equal(rainelle.settledAt, true);
  assert.ok(g.s.campaignFlags.includes("passage-rainelle-installee"));
  assert.notEqual(g.s.campaignEpilogue.unlocksOnDay, null);

  // ---- Chapitre 18 : orientation calculée réellement (jamais reformulée en dur, voir l'en-tête
  // de ce fichier), puis ouverture de l'épilogue une fois le délai écoulé ----
  while (g.s.campaignDay < g.s.campaignEpilogue.unlocksOnDay) {
    assert.equal(g.command({ type: "sleep" }).ok, true);
  }
  assert.equal(Epilogue.canOpen(g.s), true);
  assert.equal(
    g.s.campaignStations.zones.some((z) => z.veilleuse || z.extensionCommerciale),
    false,
    "aucun levier zone actif au moment d'ouvrir",
  );
  assert.equal(
    g.s.campaignStations.bornes.some((b) => b.priseFortDebit),
    false,
    "aucune borne à prise à fort débit active au moment d'ouvrir",
  );
  const expectedOrientation = Epilogue.orientation(g.s);
  assert.notEqual(
    expectedOrientation,
    "intensive",
    "aucun levier n'est plus actif à l'ouverture : jamais la branche « intensive »",
  );

  const opened = g.command({ type: "openEpilogue" });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(g.s.campaignEpilogue.orientation, expectedOrientation);
  assert.ok(g.s.campaignFlags.includes(EPILOGUE_ORIENTATION_TEXT_ID[expectedOrientation]));
  assert.ok(g.s.campaignFlags.includes("epilogue-suite"));
  for (const [key, id] of Object.entries(EPILOGUE_ORIENTATION_TEXT_ID))
    if (key !== expectedOrientation) assert.equal(g.s.campaignFlags.includes(id), false);
  assert.deepEqual(g.s.campaignEpilogue.gift, Epilogue.gift());

  // « Après le générique... » : aucune fin qui verrouille la partie.
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
    "une commande ordinaire réussit encore après l'ouverture de l'épilogue",
  );

  // Les scènes de culpabilité sélectionnent des faits présents : jamais la branche de la partie
  // attentive sur cette partie-ci.
  assert.equal(g.s.campaignFlags.includes("bilan-matin-preserve"), false);
  assert.equal(g.s.campaignFlags.includes("variete-suivante-refus"), false);
  assert.equal(g.s.campaignFlags.includes("epilogue-durable") && expectedOrientation !== "durable", false);

  // Absence de formulation d'obligation/d'accusation sur tout ce qui a été révélé cette partie.
  for (const id of [
    ...family(g, BILAN_FLAGS),
    "variete-suivante-invendus",
    "note-jeanne-serre-1",
    "note-jeanne-serre-2",
    ...family(g, PREMIER_NON_FLAGS),
    "alma-retour",
    "reconstitution-jeanne",
    "archives-restaurees",
    "jeanne-serre-sans-usage",
    "levier-contrat-reduit",
    "levier-veilleuse-coupee",
    "levier-prise-restituee",
    "levier-extension-rendue",
    "passage-rainelle-installee",
    EPILOGUE_ORIENTATION_TEXT_ID[expectedOrientation],
    "epilogue-suite",
  ])
    assertNoObligation(id);

  // Aller-retour JSON en fin de partie, puis re-validation stricte.
  const reloadedEnd = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(reloadedEnd.s, g.s, "état strictement identique après un aller-retour JSON en fin de partie");
  validate(reloadedEnd.serialize());
});

test("phase 6 gate — une sauvegarde de fin de phase 5 (sans champs de phase 6) migre proprement vers leur valeur par défaut", () => {
  const g = new GardenState(null, 1000);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const raw = JSON.parse(JSON.stringify(g.s));

  // Champs introduits par la phase 6 (C6.4/C6.12/C6.18, C6.26), absents d'une sauvegarde de fin de
  // phase 5 : retirés explicitement plutôt que supposés absents.
  delete raw.campaignContracts;
  delete raw.campaignPassage;
  delete raw.campaignEpilogue;
  delete raw.campaignStations.zones.find((z) => z.id === zone.id).extensionCommerciale;

  const reloaded = validate(raw);
  assert.deepEqual(reloaded.campaignContracts, []);
  assert.equal(reloaded.campaignPassage.blocked, true);
  assert.equal(typeof reloaded.campaignPassage.x, "number");
  assert.equal(typeof reloaded.campaignPassage.z, "number");
  assert.deepEqual(reloaded.campaignEpilogue, {
    unlocksOnDay: null,
    orientation: null,
    openedOnDay: null,
    gift: null,
  });
  assert.equal(
    reloaded.campaignStations.zones.find((z) => z.id === zone.id).extensionCommerciale,
    false,
  );

  // La partie reste jouable après migration : une commande ordinaire réussit.
  const migrated = new GardenState(reloaded);
  assert.equal(
    migrated.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
});
