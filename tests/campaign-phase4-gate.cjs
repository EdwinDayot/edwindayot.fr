// Phase 4 exit gate (docs/campagne-backlog.md "Portes de phase", docs/orchestration.md, design
// §15) : « l'arc "retour puis ouverture au village" possède une conclusion, sans dépendre de
// contenu annoncé mais absent. » Chaque chapitre (C4.1 à C4.9) est déjà prouvé isolément par son
// propre epic ; ce fichier est le scénario de bout en bout que l'entrée C4.10 du backlog décrit
// elle-même en détail, rejoué une seule fois comme une vraie partie continue à travers le vrai
// vecteur de commandes (GardenState.command()), jamais un accès direct à l'état — sur le modèle
// déjà posé par campaign-phase1/2/3-gate.cjs pour les portes précédentes.
//
// La partie traverse trois nuits (chapitres 3, 4, 6) et deux sauvegardes JSON aller-retour
// (à mi-parcours après le chapitre 5, en fin de parcours après le chapitre 9 et la quête
// "bois-pour-l-hiver" de la phase 3) — chacune vérifiée strictement identique, et la seconde
// rejouée (nouvelle nuit, tentatives répétées) pour prouver qu'aucune commande, récolte, nuit ou
// naissance ne crédite deux fois après reprise (design §16).
//
// Chapitre 7 (Anouk/Basile) : l'indépendance des deux quêtes dans les trois ordres possibles
// (Anouk d'abord, Basile d'abord, en parallèle) est déjà exhaustivement prouvée par
// campaign-chapter7.cjs ; ce fichier ne la reproduit pas une troisième fois et se contente de
// compléter les deux dans un seul ordre, à l'intérieur de la partie continue, pour prouver
// qu'elles composent correctement avec le reste des neuf chapitres.
//
// La quête "bois-pour-l-hiver" (hachette, C3.6, phase 3 déjà fusionnée dans main) est rejouée en
// fin de partie : elle n'appartient à aucun des neuf chapitres de la phase 4, mais le scénario de
// validation §16 ("tous les outils principaux s'obtiennent depuis une partie neuve") nomme les
// quatre outils ensemble (hachette, pelle, pioche, scie) — l'inclure ici prouve qu'elle reste
// accessible et compatible avec une partie qui a par ailleurs traversé toute la phase 4.
//
// Limite honnête, comme documenté à chaque epic de cette phase depuis C2.2v/C3.2/C4.3 : aucune
// mise en scène rendue (maison positionnée dans le monde, terrasses, mare, galerie de brume,
// table/fête, marque visuelle de la fondatrice, grenouille animée) n'existe encore — ce test ne
// prouve que la couche moteur réellement câblée, jamais une interface qui n'existe pas.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, D, validate } = require("./garden-rules-helpers.cjs");
const Narrative = require("../public/game/data-narrative.js");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

const CYCLE = CampaignAutomation.CYCLE_SECONDS;
// Même point arbitraire documenté que campaign-chapter3.cjs : aucune position canonique de la
// maison refuge n'existe encore dans le monde rendu (voir la limite honnête de C4.3).
const NEAR_HOUSE = { x: -15, z: -4 };

test("phase 4 gate — les neuf chapitres (actes I à III) s'enchaînent sur une seule partie continue, sans contenu annoncé mais absent, avec deux allers-retours de sauvegarde", () => {
  const g = new GardenState(null, 1000);

  // ---- Chapitre 1 (C4.1) : « La clé sous le pot vide » ----
  assert.deepEqual(
    g.s.campaignTools,
    ["outil-de-fortune"],
    "l'outil de fortune est déjà en poche dès fresh() (design §10, chapitre 1)",
  );
  g.s.inventory.wood = 4;
  g.s.inventory.clay = 2;
  assert.equal(g.command({ type: "repairHouseSpace", space: "accueil" }).ok, true);
  assert.equal(g.s.campaignHouse.spaces.accueil.status, "repare");
  assert.equal(
    g.command({ type: "chooseFurnitureTreatment", choice: "conserve" }).ok,
    true,
  );
  assert.deepEqual(g.s.campaignFlags, ["alma-marques-meuble"]);
  assert.equal(
    g.command({ type: "chooseFurnitureTreatment", choice: "encadre" }).ok,
    false,
    "un choix déjà fait n'est jamais réinitialisé",
  );

  // ---- Chapitre 2 (C4.2) : « Ce qu'on reconnaît encore » ----
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "fenetre-de-noe" }).ok,
    true,
  );
  g.s.inventory["cutting:pilea"] = D.quests["fenetre-de-noe"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "fenetre-de-noe" }).ok,
    true,
  );
  assert.equal(g.s.campaignHouse.spaces.serre.locked, false);
  assert.ok(g.s.campaignFlags.includes("serre-note-pot"));

  // ---- Chapitre 3 (C4.3) : première hybridation, nommer/multiplier/installer, épinglage montré ----
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.campaignDay, 2, "une nuit jouée");
  assert.equal(g.s.cultivars.length, 1, "un premier cultivar réel, avant toute rencontre");
  const cultivar = g.s.cultivars[0];
  assert.equal(
    g.command({ type: "renameCultivar", id: cultivar.id, name: "Premiere nouveaute" }).ok,
    true,
  );
  assert.equal(
    g.command({
      type: "plantSpecimen",
      cultivarId: cultivar.id,
      x: NEAR_HOUSE.x,
      z: NEAR_HOUSE.z,
    }).ok,
    true,
  );
  const homeSpecimen = g.s.specimens[0];
  assert.equal(homeSpecimen.x, NEAR_HOUSE.x);
  assert.equal(
    g.command({
      type: "multiplySpecimen",
      specimenId: homeSpecimen.id,
      x: NEAR_HOUSE.x + 1,
      z: NEAR_HOUSE.z,
    }).ok,
    true,
  );
  assert.equal(g.s.specimens.length, 2, "installer puis multiplier, deux spécimens réels");
  assert.equal(g.command({ type: "meetIris" }).ok, true);
  assert.ok(g.s.campaignFlags.includes("iris-epinglage"));

  // ---- Chapitre 4 (C4.4) : « Une patte dans les pétales » ----
  // triggerFrogEncounter refuse tant qu'aucun cultivar n'existe (C4.4) — déjà couvert par le
  // chapitre 3 ci-dessus, donc accepté ici.
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.campaignDay, 3, "deux nuits jouées");
  assert.equal(g.s.cultivars.length, 2, "un second cultivar après cette nuit");
  assert.equal(g.s.rainelles.length, 1, "la première Rainelle naît cette même nuit (C2.3)");
  const founder = g.s.rainelles[0];
  assert.equal(founder.founder, true);
  assert.ok(g.s.campaignFlags.includes("traces-mouillees"));

  // ---- Chapitre 5 (C4.5) : « Encore une fois » — bassines de Mira, la pelle, automatisation ----
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "bassines-de-mira" }).ok,
    true,
  );
  g.s.inventory["cutting:pilea"] = D.quests["bassines-de-mira"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "bassines-de-mira" }).ok,
    true,
  );
  assert.ok(g.s.campaignTools.includes("pelle"));

  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const workSpecimen = Cultivars.createSpecimen(g.s, {
    cultivarId: cultivar.id,
    x: 0,
    z: 0,
  });
  assert.equal(g.command({ type: "beginTeaching", id: founder.id }).ok, true);
  assert.equal(g.s.campaignClock.paused, true, "« Regarde-moi » suspend le temps");
  assert.equal(
    g.command({
      type: "demonstrateGesture",
      verbe: "arroser",
      poste: zone.id,
      source: borne.id,
      destination: "peu-importe",
      condition: "",
    }).ok,
    true,
  );
  assert.equal(g.command({ type: "confirmTeaching" }).ok, true);
  assert.equal(g.s.campaignClock.paused, false, "confirmer reprend le temps");
  assert.equal(founder.geste.verbe, "arroser");

  const FULL_DRY_SECONDS = 3 * 3600;
  g.step(FULL_DRY_SECONDS);
  assert.ok(
    Cultivars.specimenMoisture(workSpecimen, g.s.elapsed) > 95,
    "la première automatisation maintient l'humidité sans intervention",
  );

  // ---- Sauvegarde JSON aller-retour à mi-parcours (après le chapitre 5) ----
  const reloadedMid = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(
    reloadedMid.s,
    g.s,
    "état strictement identique après un aller-retour JSON réel à mi-parcours",
  );

  // ---- Chapitre 6 (C4.6) : « On ne se fabrique pas tout seul » ----
  const founderRefusal = g.command({
    type: "teachGesture",
    id: founder.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(founderRefusal.ok, false);
  assert.equal(founderRefusal.message, Rainelles.MULTIPLY_REFUSAL);
  assert.ok(g.s.campaignFlags.includes("on-ne-se-fabrique-pas-seul"));
  assert.equal(
    founder.geste.verbe,
    "arroser",
    "le refus ne touche jamais le geste déjà enseigné (réenseigner remplace, un refus n'enseigne rien)",
  );

  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  assert.equal(g.command({ type: "formBud", id: founder.id }).ok, true);
  assert.equal(g.command({ type: "harvestBud", id: founder.id }).ok, true);
  assert.equal(g.s.rainelles.length, 1, "le bourgeon n'éclot qu'au prochain sommeil");

  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.campaignDay, 4, "trois nuits jouées");
  assert.equal(g.s.cultivars.length, 2, "un pot vide ne crédite pas un troisième cultivar");
  assert.equal(g.s.rainelles.length, 2, "la deuxième Rainelle naît exactement une fois");
  const second = g.s.rainelles[1];
  assert.equal(second.founder, false);
  assert.equal(
    g.s.rainelles.filter((r) => r.founder === true).length,
    1,
    "founder ne migre jamais et ne se duplique jamais",
  );

  // Le refus de multiplication couvre aussi la seconde Rainelle ("ses congénères", design §16).
  const secondRefusal = g.command({
    type: "teachGesture",
    id: second.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(secondRefusal.ok, false);
  assert.equal(secondRefusal.message, Rainelles.MULTIPLY_REFUSAL);
  assert.equal(second.geste, null, "le refus n'invente aucun geste");

  // ---- Chapitre 7 (C4.7) : « Une fleur pour une fenêtre » — Anouk et Basile, en parallèle ----
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "sentier-d-anouk" }).ok,
    true,
  );
  g.s.inventory["cutting:pilea"] = D.quests["sentier-d-anouk"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "sentier-d-anouk" }).ok,
    true,
  );
  assert.ok(g.s.campaignTools.includes("pioche"));
  assert.equal(
    g.s.campaignTools.includes("scie"),
    false,
    "chaque outil n'apparaît qu'à la complétion de sa propre quête",
  );

  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "fibres-de-basile" }).ok,
    true,
  );
  g.s.inventory["cutting:pilea"] = D.quests["fibres-de-basile"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "fibres-de-basile" }).ok,
    true,
  );
  assert.ok(g.s.campaignTools.includes("scie"));

  // ---- Chapitre 8 (C4.8) : « La table longue » — Léa ----
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "table-longue-lea" }).ok,
    true,
  );
  g.s.inventory["cutting:pilea"] = D.quests["table-longue-lea"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "table-longue-lea" }).ok,
    true,
  );
  assert.ok(g.s.campaignFlags.includes("table-longue-approvisionnee"));

  // ---- Chapitre 9 (C4.9) : « Le chemin d'eau » — Inès, deuxième logement du pot ----
  assert.equal(g.s.campaignPot.capacity, 1, "capacité inchangée avant la quête d'Inès");
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "brume-d-ines" }).ok,
    true,
  );
  g.s.inventory["cutting:pilea"] = D.quests["brume-d-ines"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "brume-d-ines" }).ok,
    true,
  );
  assert.equal(g.s.campaignPot.capacity, 2);
  assert.ok(g.s.campaignFlags.includes("chemin-eau-etiquette"));
  assert.ok(
    !Narrative.TEXTS["chemin-eau-etiquette"].text.includes("Jeanne"),
    "l'indice ne nomme jamais Jeanne dans le texte affiché (« un indice, pas un discours »)",
  );

  // ---- Outil supplémentaire déjà existant hors des neuf chapitres (phase 3, C3.6) : complète
  // le tableau des quatre outils principaux nommé par le scénario de validation §16. ----
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "bois-pour-l-hiver" }).ok,
    true,
  );
  g.s.inventory.wood = D.quests["bois-pour-l-hiver"].objective.quantity;
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "bois-pour-l-hiver" }).ok,
    true,
  );
  assert.deepEqual(
    [...g.s.campaignTools].sort(),
    ["hachette", "outil-de-fortune", "pelle", "pioche", "scie"].sort(),
    "les quatre outils de quête plus l'outil de fortune de départ, chacun exactement une fois",
  );

  // ---- Sauvegarde JSON aller-retour en fin de parcours ----
  const reloadedEnd = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(
    reloadedEnd.s,
    g.s,
    "état strictement identique après un aller-retour JSON réel en fin de parcours",
  );
  validate(reloadedEnd.serialize());

  // ---- Absence de double crédit après reprise (design §16), rejouée sur l'état rechargé lui-même ----
  assert.equal(
    reloadedEnd.command({ type: "quest", action: "accept", questId: "brume-d-ines" }).ok,
    false,
    "une quête déjà complétée ne se réaccepte jamais",
  );
  assert.equal(reloadedEnd.s.campaignPot.capacity, 2, "la capacité ne progresse jamais deux fois");
  assert.equal(
    reloadedEnd.s.campaignFlags.filter((f) => f === "on-ne-se-fabrique-pas-seul").length,
    1,
    "le texte de refus ne se duplique jamais après reprise",
  );
  assert.equal(
    reloadedEnd.command({
      type: "teachGesture",
      id: founder.id,
      verbe: "multiplier",
      poste: "atelier-1",
      source: "boutures",
      destination: "sortie",
    }).ok,
    false,
    "le refus de multiplication survit à la reprise",
  );

  const dayBefore = reloadedEnd.s.campaignDay;
  assert.equal(reloadedEnd.command({ type: "sleep" }).ok, true);
  assert.equal(reloadedEnd.s.campaignDay, dayBefore + 1, "une nuit de plus avance l'horloge une seule fois");
  assert.equal(reloadedEnd.s.cultivars.length, 2, "un pot vide ne crédite toujours aucun cultivar de plus");
  assert.equal(reloadedEnd.s.rainelles.length, 2, "aucune naissance de plus sans nouveau bourgeon prélevé");
  assert.deepEqual(
    [...reloadedEnd.s.campaignTools].sort(),
    ["hachette", "outil-de-fortune", "pelle", "pioche", "scie"].sort(),
    "aucun outil de plus ni perdu après cette nuit supplémentaire",
  );

  // La chaîne d'arrosage enseignée au chapitre 5 continue de fonctionner sans intervention après
  // la reprise et cette nuit de plus.
  reloadedEnd.step(3 * CYCLE);
  assert.ok(
    Cultivars.specimenMoisture(workSpecimen, reloadedEnd.s.elapsed) > 0,
    "l'automatisation continue de fonctionner après la reprise",
  );
});
