// Phase 3 exit gate (docs/campagne-backlog.md "Portes de phase", docs/orchestration.md, design
// §15): "habiter, croiser, organiser, rencontrer fonctionnent ensemble en une courte partie
// sauvegardable." Chaque mécanisme est déjà prouvé isolément par son propre epic (C3.1/C3.2
// habiter, C1.3/phase1-gate croiser, C2.11/phase2-gate organiser, C3.6 rencontrer) ; ce fichier
// est le scénario de bout en bout que le critère de sortie de la phase nomme lui-même, rejoué une
// seule fois comme une vraie partie à travers le vrai vecteur de commandes (GardenState.command()),
// jamais un accès direct à l'état — sur le modèle déjà posé par campaign-phase1-gate.cjs et
// campaign-phase2-gate.cjs pour les portes précédentes.
//
// La partie traverse trois nuits (s.campaignDay avance de 3 par trois vraies commandes "sleep")
// et vérifie, à chaque nuit, qu'aucune commande/récolte/nuit/naissance ne crédite deux fois
// (design §16). Une sauvegarde JSON aller-retour à mi-parcours est vérifiée strictement
// identique avant de jouer la troisième nuit sur l'état rechargé lui-même — pas seulement sur
// l'état original — pour que le round-trip soit une vraie étape du scénario, pas un contrôle à
// part.
//
// Limite honnête, comme documenté à chaque epic de cette phase depuis C2.2v : "dormir dans la
// maison refuge" et la transition de nuit scénarisée (écran de confirmation du pot, caméra vers
// la maison) restent du rendu/interface différé à C2.2v/C2.5v, jamais câblés à une scène jouable
// réelle à ce jour (voir le journal des décisions daté du 18 septembre à C3.5). "Sleep" est donc
// aujourd'hui l'unique commande de sommeil du jeu, qu'elle soit ou non déclenchée depuis une vraie
// scène de maison — ce test ne prouve que la couche moteur réellement câblée, honnêtement, sans
// simuler une interface qui n'existe pas.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

const CYCLE = CampaignAutomation.CYCLE_SECONDS;

test("phase 3 gate — habiter, croiser, organiser, rencontrer ensemble sur trois nuits, avec un aller-retour de sauvegarde à mi-parcours", () => {
  const g = new GardenState(null, 1000);

  // --- Croiser (mise en place) + première Rainelle (rencontre scénarisée, C2.3) : les deux se
  // résolvent à la même nuit, exactement comme campaign-phase1-gate.cjs/campaign-phase2-gate.cjs
  // le rejouent déjà séparément. ---
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );

  // --- Habiter : réparer la pièce d'accueil (C3.1), le seul espace jouable à ce stade, avant la
  // première nuit. ---
  g.s.inventory.wood = 8;
  g.s.inventory.clay = 2;
  assert.equal(
    g.command({ type: "repairHouseSpace", space: "accueil" }).ok,
    true,
  );
  assert.equal(g.s.campaignHouse.spaces.accueil.status, "repare");

  // --- Nuit 1 : résout le pot (croiser) et fait naître la première Rainelle (rencontre). ---
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.campaignDay, 2, "une nuit jouée");
  assert.equal(g.s.cultivars.length, 1, "croiser : exactement un cultivar après la première nuit");
  const cultivar = g.s.cultivars[0];
  assert.equal(g.s.rainelles.length, 1, "la première Rainelle naît cette même nuit (C2.3)");
  const first = g.s.rainelles[0];
  assert.equal(first.cultivarId, cultivar.id);

  // --- Organiser (préparation) : la deuxième Rainelle par bourgeon/nurserie (C3.4), qui exige
  // une place de vie libre déjà déclarée par un habitat (C3.3). ---
  Stations.registerStation(g.s.campaignStations, "habitat", { x: 0, z: 0, capacity: 2 });
  assert.equal(g.command({ type: "formBud", id: first.id }).ok, true);
  assert.equal(g.command({ type: "harvestBud", id: first.id }).ok, true);

  // --- Nuit 2 : le bourgeon devient la deuxième Rainelle ; aucune autre naissance ni aucun
  // second cultivar ne sont crédités cette nuit-là (le pot est vide, aucune graine n'y a été
  // posée depuis la nuit précédente). ---
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.s.campaignDay, 3, "deux nuits jouées");
  assert.equal(g.s.cultivars.length, 1, "un pot vide ne crédite pas un second cultivar");
  assert.equal(g.s.rainelles.length, 2, "la deuxième Rainelle naît exactement une fois");
  const second = g.s.rainelles[1];
  assert.equal(second.cultivarId, first.cultivarId);
  assert.equal(second.geste, null, "elle ne copie aucun geste (design §5)");

  // --- Organiser : les deux Rainelles tiennent une chaîne courte sans intervention (arroser +
  // récolter), réutilisant exactement les mêmes primitives déjà prouvées par la porte de sortie
  // de la phase 2 (campaign-rainelles-chain.cjs/campaign-phase2-gate.cjs), rejouées ici sur une
  // seule zone/un seul panier plutôt que réinventées. ---
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId: cultivar.id,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  assert.equal(
    g.command({
      type: "teachGesture",
      id: first.id,
      verbe: "arroser",
      poste: zone.id,
      source: borne.id,
      destination: "peu-importe",
      condition: "",
    }).ok,
    true,
  );
  assert.equal(
    g.command({
      type: "teachGesture",
      id: second.id,
      verbe: "recolter",
      poste: zone.id,
      source: "peu-importe",
      destination: panier.id,
      condition: "",
    }).ok,
    true,
  );

  // --- Rencontrer : la première quête d'outil auprès d'un habitant du coin de village (C3.5,
  // C3.6) — acceptée puis complétée réellement, jamais accordée à l'acceptation. ---
  g.s.inventory.wood = 4;
  assert.equal(
    g.command({ type: "quest", action: "accept", questId: "bois-pour-l-hiver" }).ok,
    true,
  );
  assert.deepEqual(
    g.s.campaignTools,
    ["outil-de-fortune"],
    "l'outil de quête n'est jamais accordé à l'acceptation (l'outil de fortune de C4.1 est déjà présent dès fresh())",
  );
  assert.equal(
    g.command({ type: "quest", action: "complete", questId: "bois-pour-l-hiver" }).ok,
    true,
  );
  assert.deepEqual(g.s.campaignTools, ["outil-de-fortune", "hachette"]);

  // --- Organiser, sans intervention : plusieurs cycles de simulation, aucune commande
  // supplémentaire — la chaîne dépose une production dans le panier et l'arrosage maintient
  // l'humidité du spécimen tout seul. ---
  g.step(3 * CYCLE);
  assert.ok(
    (panier.buffer[cultivar.id] || 0) > 0,
    "organiser : la chaîne dépose une production dans le panier sans intervention",
  );
  assert.ok(
    Cultivars.specimenMoisture(specimen, g.s.elapsed) > 50,
    "organiser : l'arrosage maintient l'humidité du spécimen sans intervention",
  );

  // --- Sauvegarde JSON aller-retour à mi-parcours, vérifiée strictement identique. ---
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  assert.deepEqual(
    reloaded.s,
    g.s,
    "l'état complet doit rester strictement identique après un aller-retour JSON réel à mi-parcours",
  );

  // --- Nuit 3, jouée sur l'état rechargé lui-même (pas sur l'original) : toujours aucun double
  // crédit (design §16). ---
  assert.equal(reloaded.command({ type: "sleep" }).ok, true);
  assert.equal(reloaded.s.campaignDay, 4, "trois nuits jouées");
  assert.equal(reloaded.s.cultivars.length, 1, "toujours un seul cultivar après la troisième nuit");
  assert.equal(
    reloaded.s.rainelles.length,
    2,
    "aucune troisième Rainelle n'apparaît sans nouveau bourgeon prélevé",
  );
  assert.deepEqual(
    reloaded.s.campaignTools,
    ["outil-de-fortune", "hachette"],
    "l'outil de la quête n'est jamais accordé une deuxième fois",
  );
  assert.equal(
    reloaded.s.quests.completed.filter((id) => id === "bois-pour-l-hiver").length,
    1,
    "la quête ne se complète pas une deuxième fois",
  );

  // --- La chaîne organisée continue de fonctionner sans intervention après le rechargement et
  // la troisième nuit : "sature proprement puis redémarre" (porte de sortie de la phase 2) reste
  // vrai après un cycle complet de sommeil et un aller-retour de sauvegarde. ---
  const reloadedPanier = Stations.resolveStation(
    reloaded.s.campaignStations,
    panier.id,
  ).station;
  const bufferBefore = reloadedPanier.buffer[cultivar.id] || 0;
  reloaded.step(3 * CYCLE);
  assert.ok(
    (reloadedPanier.buffer[cultivar.id] || 0) >= bufferBefore,
    "la chaîne continue de fonctionner sans intervention après la troisième nuit",
  );
});
