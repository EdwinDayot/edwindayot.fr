// Epic C2.11 — "Chaîne de validation « fraises de la cuisine »" (design §5, "Deux chaînes
// complètes"; docs/campagne-backlog.md). Dépendances C2.7 (transporter)/C2.8 (réservations,
// capacity/min)/C2.10 (refus de multiplication) sont toutes `fait` — cet epic n'ajoute aucun
// mécanisme nouveau, il prouve, sur une durée représentant plusieurs jours simulés, que la
// chaîne complète eau → arroseuse → fraisiers → récolteuse → panier → transporteuse → réserve de
// cuisine tourne sans aucune intervention manuelle, sature proprement (rien n'est jamais perdu,
// ni au panier local ni à la réserve de cuisine) puis redémarre seule une fois la réserve vidée.
//
// **C'est la porte de sortie de la phase 2** (docs/orchestration.md, "Portes de phase" : "un
// joueur enseigne un geste à une Rainelle sans guide externe ; une chaîne fonctionne, sature
// proprement puis redémarre") — voir tests/campaign-phase2-gate.cjs pour le scénario de clôture
// de phase lui-même (narrative complète via le vrai vecteur de commandes), et campaign-automation
// .cjs's own "chain" test pour la preuve unitaire à un seul cycle que ce fichier étend dans la
// durée plutôt que de répéter.
//
// Aucune commande n'existe encore pour enregistrer une borne/zone/panier (C2.6a, "no command
// calls it yet" — toujours vrai à ce jour) ni pour qu'un joueur "vide" une réserve de cuisine
// (aucun geste "cuisiner"/"consommer" n'est dans le périmètre de C2.4's VERBS) : ces deux points
// sont créés/simulés directement via les modules, comme le fait déjà campaign-automation.cjs —
// la mutation directe de `cuisine.buffer` ci-dessous tient lieu d'un consommateur externe (un
// futur système de cuisine, hors périmètre de cet epic), pas d'une "intervention manuelle" sur la
// chaîne elle-même. L'enseignement des trois gestes, lui, passe par le vrai `g.command()`
// (teachGesture, C2.4) plutôt que par `Rainelles.applyGesture` directement, pour rester le plus
// proche possible du vecteur de commandes réel.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");
const CampaignClock = require("../public/game/campaign-clock.js");

const CYCLE = CampaignAutomation.CYCLE_SECONDS;
const CAPACITY = Stations.DEFAULT_PANIER_CAPACITY; // 24

// Only the scripted frog encounter (C2.3) can create a Rainelle through a command, and design §5
// caps it at the very first one — same fixture already used by tests/campaign-automation.cjs and
// tests/campaign-teaching.cjs.
function bornRainelle(g) {
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  return g.s.rainelles[0];
}

function teach(g, rainelle, fields) {
  const r = g.command({
    type: "teachGesture",
    id: rainelle.id,
    condition: "",
    ...fields,
  });
  assert.equal(r.ok, true, r.message);
}

test("chain: eau → arroseuse → fraisiers → récolteuse → panier → transporteuse → réserve de cuisine tourne sans intervention manuelle sur plusieurs jours simulés, sature proprement puis redémarre seule", () => {
  const g = new GardenState(null, 1000);
  const waterer = bornRainelle(g);
  const cultivarId = waterer.cultivarId;
  const harvester = Rainelles.createRainelle(g.s, { cultivarId, name: "Récolteuse" });
  const transporter = Rainelles.createRainelle(g.s, { cultivarId, name: "Transporteuse" });

  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const localPanier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const cuisine = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });

  // A single mature fraisier ("fraise-timide" is one of the two parents of this cultivar) in
  // range of the zone is enough: campaign-automation.js's updateSpecimenReadiness re-arms it on
  // the very tick after each harvest (no cooldown/quota yet, documented limitation), so it can
  // feed the chain indefinitely without a whole field of plants.
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });

  teach(g, waterer, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "peu-importe" });
  teach(g, harvester, { verbe: "recolter", poste: zone.id, source: "peu-importe", destination: localPanier.id });
  teach(g, transporter, {
    verbe: "transporter",
    poste: "peu-importe",
    source: localPanier.id,
    destination: cuisine.id,
    condition: cultivarId,
  });

  // From here on: no command but the passage of time, until the one direct buffer mutation below
  // that stands in for an external consumer of the kitchen reserve (see file header).

  // 60 cycles is comfortably past the 48 needed to fill both the local panier and the kitchen
  // reserve to their default capacity (24 each): cycles 1-24 fill cuisine directly (harvester and
  // transporter complete in the same tick, so each cycle's unit is carried all the way through);
  // cycles 25-48 then fill localPanier once cuisine has no more room; from cycle 49 on the
  // récolteuse's own capacity guard stops harvesting cleanly, leaving the specimen ready and
  // untouched rather than losing it.
  g.step(60 * CYCLE);

  assert.equal(cuisine.buffer[cultivarId], CAPACITY, "kitchen reserve must saturate at its capacity, not overflow");
  assert.equal(localPanier.buffer[cultivarId], CAPACITY, "local panier must also saturate once the kitchen reserve is full");
  assert.equal(Stations.panierTotal(cuisine), CAPACITY);
  assert.equal(Stations.panierTotal(localPanier), CAPACITY);
  assert.equal(specimen.readyToProduce, true, "a mature specimen the chain cannot yet store must stay ready, never be discarded");
  assert.ok(
    Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95,
    "arroser must keep watering throughout, even while the rest of the chain is saturated",
  );

  // Steady state: several more cycles change nothing — "sature proprement" means staying exactly
  // at capacity forever, not merely reaching it once.
  g.step(5 * CYCLE);
  assert.equal(cuisine.buffer[cultivarId], CAPACITY);
  assert.equal(localPanier.buffer[cultivarId], CAPACITY);

  // The kitchen reserve empties by ten units — simulated directly (see file header: no in-scope
  // command consumes it yet), representing whatever eventually eats/sells from it.
  cuisine.buffer[cultivarId] -= 10;
  assert.equal(cuisine.buffer[cultivarId], 14);

  // A single transporter cycle is enough to notice the new room and move the whole ten-unit
  // budget from the (still full) local panier in one shot — no re-teaching, no new command.
  g.step(CYCLE);
  assert.equal(cuisine.buffer[cultivarId], CAPACITY, "the chain must refill the kitchen reserve on its own once room reopens");
  assert.equal(localPanier.buffer[cultivarId], CAPACITY - 10);

  // With the local panier no longer full, the récolteuse — which had been idly stopping at its
  // capacity guard every cycle since cycle 49 above — resumes depositing on its very next cycle,
  // entirely on its own.
  g.step(CYCLE);
  assert.equal(localPanier.buffer[cultivarId], CAPACITY - 10 + 1, "harvesting must resume on its own once the local panier has room again");
  assert.equal(cuisine.buffer[cultivarId], CAPACITY, "the kitchen reserve is full again, so this cycle's harvest must stay in the local panier");

  // Finally, run the whole setup out to a span of several simulated campaign days (design §3's
  // own 7h-23h day length, 57 600 s.elapsed seconds — see campaign-clock.js; not wired to
  // s.elapsed yet, but the honest existing unit for "a day" rather than an invented number) to
  // prove the chain holds up unattended over the timescale the phase's own exit gate names, not
  // just for a handful of cycles.
  const elapsedSoFar = g.s.elapsed;
  const targetSpan = 3 * CampaignClock.DAY_SECONDS;
  const remaining = targetSpan - elapsedSoFar;
  assert.ok(remaining > 0, "test fixture must actually span multiple simulated days");
  assert.doesNotThrow(() => g.step(remaining));
  assert.ok(g.s.elapsed >= targetSpan);

  assert.ok(cuisine.buffer[cultivarId] <= CAPACITY, "kitchen reserve must never exceed its capacity, even over a multi-day run");
  assert.ok(localPanier.buffer[cultivarId] <= CAPACITY, "local panier must never exceed its capacity, even over a multi-day run");
  assert.ok(Number.isFinite(cuisine.buffer[cultivarId]) && Number.isFinite(localPanier.buffer[cultivarId]));
  assert.ok(
    Cultivars.specimenMoisture(specimen, g.s.elapsed) > 95,
    "arroser must still be sustaining the specimen after several simulated days",
  );

  // Untouched throughout: this scenario never round-trips a save, but a real reload of a chain in
  // this exact saturated state is already proven generically by campaign-automation.cjs's own
  // "round-trip a real JSON save/reload unchanged" test — not repeated here.
});
