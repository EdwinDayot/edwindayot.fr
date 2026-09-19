// Phase 5 exit gate, mécanique seulement (docs/campagne-backlog.md "Portes de phase", entrée
// C5.8 ; design §15, "veilleuses, prélèvement d'eau, repos, mémoire factuelle et une scène de
// culpabilité/réparation sont compris par un joueur, avec une partie attentive distincte d'une
// partie intensive"). Sur le modèle de campaign-phase1/2/3/4-gate.cjs : un scénario de bout en
// bout à travers le vrai vecteur de commandes (GardenState.command()), jamais un accès direct à
// une mutation d'état — seules la création de stations/spécimens (Stations.registerStation,
// Cultivars.createSpecimen) sont lues/appelées hors commande, faute de toute commande de
// placement dans le monde à ce jour, exactement le même précédent que campaign-phase4-gate.cjs
// pour ses bornes/zones/spécimens.
//
// Design §16 ("Culpabilité artificielle ou scène lue comme un bug") : ce test rejoue littéralement
// les deux profils qu'il demande de vérifier — une partie attentive et une partie intensive — et
// vérifie explicitement qu'aucun texte de C5.6/C5.7 ne se déclenche jamais sur la partie
// attentive, sur toute sa durée, tandis que la partie intensive déclenche les deux et fait
// mesurablement baisser le bassin commun (C5.4).
//
// Limite honnête, documentée aussi dans campagne-backlog.md (entrée C5.8) : ce test prouve que
// les *faits* distinguent les deux parties, pas qu'un joueur peut aujourd'hui *observer* la scène
// dans le monde rendu — aucune Rainelle n'a de position ni de représentation 3D à ce jour (voir la
// note d'ouverture du second lot de la phase 5 dans campagne-backlog.md). Ce epic ferme seulement
// la porte mécanique, pas la phase entière : ne pas fusionner `maison-des-possibles` dans `main`
// sur la seule base de ce commit.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Memory = require("../public/game/campaign-memory.js");

// Only the scripted frog encounter (C2.3) can create a Rainelle through commands today — same
// fixture already used by tests/campaign-{automation,memory,veilleuses,overexertion,fort-debit,
// persistent-gesture,gesture-reparation}.cjs.
function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function teachArroser(g, id, { poste, source }) {
  const r = g.command({
    type: "teachGesture",
    id,
    verbe: "arroser",
    poste,
    source,
    destination: "x",
    condition: "",
  });
  assert.equal(r.ok, true, r.error);
}

test("phase 5 gate (mécanique) — une partie attentive ne déclenche jamais les scènes C5.6/C5.7 ni de baisse du bassin commun ; une partie intensive déclenche les deux textes et fait mesurablement baisser le bassin", () => {
  // ---- Partie attentive : aucune veilleuse, aucune prise à fort débit, jamais activées ----
  const attentive = new GardenState(null, 1000);
  const rainelleA = bornRainelle(attentive);
  const borneA = Stations.registerStation(attentive.s.campaignStations, "borne", { x: 0, z: 0 });
  const zoneA = Stations.registerStation(attentive.s.campaignStations, "zone", { x: 0, z: 0 });
  const cultivarA = attentive.s.cultivars[0].id;
  Cultivars.createSpecimen(attentive.s, { cultivarId: cultivarA, x: 0, z: 0 });
  teachArroser(attentive, rainelleA.id, { poste: zoneA.id, source: borneA.id });

  assert.equal(borneA.priseFortDebit, false, "jamais activée sur cette partie");
  assert.equal(zoneA.veilleuse, false, "jamais activée sur cette partie");

  for (let night = 0; night < 10; night++) {
    assert.equal(attentive.command({ type: "sleep" }).ok, true);
    assert.equal(
      attentive.s.campaignFlags.includes("persistance-geste-vide"),
      false,
      "aucune persistance sans veilleuse jamais activée",
    );
    assert.equal(
      attentive.s.campaignFlags.includes("geste-qui-sarrete"),
      false,
      "aucune réparation sans persistance préalable",
    );
    assert.equal(
      Memory.bassinCommunLevel(attentive.s.campaignMemory),
      Memory.BASSIN_COMMUN_CAPACITY,
      "le bassin commun ne baisse jamais sans prise à fort débit jamais activée",
    );
  }
  assert.equal(attentive.s.campaignMemory.overexertion[rainelleA.id] || 0, 0, "aucun travail nocturne, jamais sursollicitée");

  // ---- Partie intensive : veilleuse et prise à fort débit toutes deux utilisées ----
  const intensive = new GardenState(null, 1000);
  const rainelleI = bornRainelle(intensive);
  const borneI = Stations.registerStation(intensive.s.campaignStations, "borne", { x: 0, z: 0 });
  const zoneI = Stations.registerStation(intensive.s.campaignStations, "zone", { x: 0, z: 0 });
  const cultivarI = intensive.s.cultivars[0].id;
  Cultivars.createSpecimen(intensive.s, { cultivarId: cultivarI, x: 0, z: 0 });
  teachArroser(intensive, rainelleI.id, { poste: zoneI.id, source: borneI.id });
  assert.equal(intensive.command({ type: "setVeilleuse", zoneId: zoneI.id, active: true }).ok, true);
  assert.equal(
    intensive.command({ type: "setPriseFortDebit", borneId: borneI.id, active: true }).ok,
    true,
  );

  const levelBeforeWork = Memory.bassinCommunLevel(intensive.s.campaignMemory);
  assert.equal(levelBeforeWork, Memory.BASSIN_COMMUN_CAPACITY, "intact avant toute nuit travaillée");

  // Plusieurs nuits consécutives de travail nocturne réel, au-delà du seuil de sursollicitation
  // (design §11 : "des limites physiologiques finissent par réduire la capacité" ; le seuil
  // choisi par C5.3, Memory.OVEREXERTION_THRESHOLD, franchi ici sans ambiguïté).
  for (let night = 0; night < Memory.OVEREXERTION_THRESHOLD + 1; night++) {
    assert.equal(intensive.command({ type: "sleep" }).ok, true);
  }
  assert.ok(
    intensive.s.campaignMemory.overexertion[rainelleI.id] > Memory.OVEREXERTION_THRESHOLD,
    "réellement sursollicitée après ces nuits de travail réel",
  );
  const levelAfterWork = Memory.bassinCommunLevel(intensive.s.campaignMemory);
  assert.ok(levelAfterWork < levelBeforeWork, "usage intensif : le bassin commun baisse mesurablement");
  assert.equal(
    intensive.s.campaignFlags.includes("persistance-geste-vide"),
    false,
    "chaque nuit ci-dessus a réellement travaillé : jamais de persistance tant que la source ne tarit pas",
  );

  // La source se tarit (design §11, scène "la pause qui ne commence pas") : borne et zone restent
  // résolues, la veilleuse reste allumée, mais plus aucun spécimen à arroser — la Rainelle entre
  // cette nuit déjà sursollicitée par les nuits précédentes.
  intensive.s.specimens.length = 0;
  assert.equal(intensive.command({ type: "sleep" }).ok, true);
  assert.equal(
    intensive.s.campaignFlags.includes("persistance-geste-vide"),
    true,
    "persistance détectée : geste maintenu devant un poste vide, déjà sursollicitée",
  );
  assert.deepEqual(intensive.s.campaignMemory.persistentGestureIds, [rainelleI.id]);
  const levelAfterPersistence = Memory.bassinCommunLevel(intensive.s.campaignMemory);
  assert.equal(
    levelAfterPersistence,
    levelAfterWork,
    "aucun travail réel cette nuit de persistance : aucune baisse de plus",
  );
  assert.equal(
    intensive.s.campaignFlags.includes("geste-qui-sarrete"),
    false,
    "pas encore de réparation : toujours sursollicitée, jamais repassée au repos réel",
  );

  // Coupe la veilleuse et la prise à fort débit : retour au repos réel, la sursollicitation
  // redescend progressivement (design §11 : "réduit... progressivement plutôt que de le repartir
  // instantanément à zéro"), jamais un bouton pardon.
  assert.equal(
    intensive.command({ type: "setVeilleuse", zoneId: zoneI.id, active: false }).ok,
    true,
  );
  assert.equal(
    intensive.command({ type: "setPriseFortDebit", borneId: borneI.id, active: false }).ok,
    true,
  );
  let restNights = 0;
  while (intensive.s.campaignMemory.overexertion[rainelleI.id] > 0) {
    assert.equal(intensive.command({ type: "sleep" }).ok, true);
    restNights += 1;
    assert.ok(restNights < 50, "garde-fou : la décroissance progressive doit converger");
  }
  assert.equal(
    intensive.s.campaignFlags.includes("geste-qui-sarrete"),
    true,
    "réparation détectée : repos réel atteint après une persistance déjà consignée",
  );
  assert.equal(
    Memory.bassinCommunLevel(intensive.s.campaignMemory),
    levelAfterPersistence,
    "couper la prise arrête la baisse du bassin commun sans jamais la faire remonter (réparation à coût réel, jamais une annulation gratuite)",
  );
});
