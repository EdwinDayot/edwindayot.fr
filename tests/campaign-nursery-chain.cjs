// Epic C7.29 — "Chaîne de validation « pépinière » : récolte, compost, multiplication et
// replantation composés sans intervention" (docs/campagne-backlog.md). The five gestes involved
// (recolter C2.6c, transporter C2.7, preparer C7.28, bouturer C7.27, replanter C7.26) are already
// each proven in isolation by tests/campaign-automation.cjs — this file proves nothing new about
// any single gesture's own arithmetic, only that composing five of them, fed from a single shared
// zone and chained through real, registered paniers, actually runs unattended (design §5,
// "Pépinière de fin de jeu"), sature proprement (Z2 never exceeds its capacity, Pjeunes never
// exceeds its own) and never silently drops a unit anywhere along the chain — the same posture
// tests/campaign-rainelles-chain.cjs already proved for the phase 2 gate's simpler chain.
//
// Enseignement via le vrai vecteur de commandes (g.command({type:"teachGesture",...})), jamais
// Rainelles.applyGesture directement — même discipline que campaign-rainelles-chain.cjs, pour
// rester le plus proche possible de ce qu'un joueur ferait réellement.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");

const CYCLE = CampaignAutomation.CYCLE_SECONDS;
const SUBSTRATE_KEY = CampaignAutomation.SUBSTRATE_KEY;
const PANIER_CAPACITY = Stations.DEFAULT_PANIER_CAPACITY;
// "au moins 2, au plus 4" (backlog entry) — assez pour observer une saturation en un temps de
// simulation raisonnable sans en faire un nombre arbitraire non justifié.
const Z2_CAPACITY = 2;

// Seule la rencontre scriptée de la grenouille (C2.3) peut créer une Rainelle — et son cultivar —
// via une vraie commande. Même fixture que tests/campaign-rainelles-chain.cjs/-automation.cjs.
function bornRainelle(g) {
  assert.equal(g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok, true);
  assert.equal(g.command({ type: "sleep" }).ok, true);
  return g.s.rainelles[0];
}

function teach(g, rainelle, fields) {
  const r = g.command({ type: "teachGesture", id: rainelle.id, condition: "", ...fields });
  assert.equal(r.ok, true, r.message);
}

// Stations.depositYoungPlant/withdrawYoungPlant (called by tickBouturer/tickReplanter) never
// mutate a panier in place: they return a whole new campaignStations registry in which only the
// targeted panier is replaced by a new object (campaign-stations.js's own immutability discipline,
// shared with relocateStation/removeStation/labelStation). A station reference captured once at
// registration time — as every other campaign test does for a panier that's only ever mutated
// directly (buffer key assignment, never through this registry-replacing path) — goes stale the
// moment its id is ever the target of one of these two calls. Pjeunes is exactly such a target
// here (bouturiere deposits into it, replanteuse withdraws from it), so every read of its buffer
// below re-resolves it live against the current registry rather than trusting the captured const.
function livePanier(g, id) {
  return g.s.campaignStations.paniers.find((p) => p.id === id);
}

// Aucune valeur de buffer présente ne doit jamais être <= 0 (une clé orpheline à zéro, ou une
// quantité négative) — design §16, "Saturer puis libérer un bac... conserve les ressources".
function assertCleanBuffer(panier, label) {
  for (const [key, qty] of Object.entries(panier.buffer)) {
    assert.ok(Number.isFinite(qty), `${label} : ${key} n'est pas un nombre fini (${qty})`);
    assert.ok(qty > 0, `${label} : ${key} ne doit jamais être une entrée orpheline à zéro/négative (${qty})`);
  }
}

test("chaîne pépinière : récolte, compost, bouturage et replantation composés sans intervention, saturent proprement et ne perdent jamais une unité", () => {
  const g = new GardenState(null, 1000);

  // Six Rainelles, cinq gestes distincts (design §5) — un seul cultivar partagé, issu de la même
  // rencontre scriptée que tout autre test de campagne.
  const harvester1 = bornRainelle(g); // recolter -> P_boutures
  const cultivarId = harvester1.cultivarId;
  const harvester2 = Rainelles.createRainelle(g.s, { cultivarId, name: "Récolteuse résidus" }); // recolter -> P_résidus
  const preparatrice = Rainelles.createRainelle(g.s, { cultivarId, name: "Préparatrice" }); // preparer
  const transporteuse = Rainelles.createRainelle(g.s, { cultivarId, name: "Transporteuse" }); // transporter
  const bouturiere = Rainelles.createRainelle(g.s, { cultivarId, name: "Bouturière" }); // bouturer
  const replanteuse = Rainelles.createRainelle(g.s, { cultivarId, name: "Replanteuse" }); // replanter

  const Z1 = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const Pboutures = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const Presidus = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const PosteBouture = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const Pjeunes = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const Z2 = Stations.registerStation(g.s.campaignStations, "zone", {
    x: 0,
    z: 0,
    capacity: Z2_CAPACITY,
    allowedCultivarIds: [cultivarId],
  });

  // Deux spécimens mûrs suffisent : campaign-automation.js's updateSpecimenReadiness réarme un
  // spécimen mûr à chaque tick (aucun cooldown/quota, la même limitation documentée déjà exploitée
  // par campaign-rainelles-chain.cjs), et doRecolter n'a aucun plafond par récolteuse — chacune
  // récolte tout ce qui est mûr et prêt à portée à chaque cycle achevé, quel que soit leur nombre.
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0, stage: Cultivars.MATURE_STAGE });

  // --- Étage 1 : deux récolteuses sur la même zone, chacune vers son propre panier ---
  // L'écart d'un tick entre les deux enseignements n'est pas cosmétique : sans lui, les deux
  // cycles s'achèvent exactement au même tick, pour toujours (les deux enseignées avant tout
  // step()), et la Rainelle la plus tôt dans s.rainelles (harvester1) draine alors systématiquement
  // tout ce qui est prêt en premier, laissant harvester2 définitivement affamée — updateSpecimen
  // Readiness ne réarme un spécimen qu'au tick *suivant*, trop tard pour une récolteuse dont le
  // propre cycle vient déjà de s'achever ce même tick. Un tick d'écart suffit : les spécimens
  // redeviennent prêts bien avant la prochaine frontière de cycle (20 ticks) de chaque récolteuse.
  teach(g, harvester1, { verbe: "recolter", poste: Z1.id, source: "peu-importe", destination: Pboutures.id });
  g.step(1);
  teach(g, harvester2, { verbe: "recolter", poste: Z1.id, source: "peu-importe", destination: Presidus.id });

  g.step(5 * CYCLE);
  assert.ok(Stations.panierTotal(Pboutures) > 0, "les boutures doivent s'accumuler sans aucune commande, par le seul passage du temps");
  assert.ok(Stations.panierTotal(Presidus) > 0, "les résidus doivent s'accumuler sans aucune commande, par le seul passage du temps");
  assertCleanBuffer(Pboutures, "P_boutures (étage 1)");
  assertCleanBuffer(Presidus, "P_résidus (étage 1)");

  // --- Étage 2 : compost + transport vers le poste de multiplication — bouturière pas encore
  // enseignée à ce stade, donc rien ne peut consommer de substrat. ---
  // Si du substrat apparaît ici, ce ne peut être que tickPreparer qui l'a produit, strictement
  // avant qu'aucune consommation ne soit seulement possible : c'est la preuve réelle et observable
  // exigée par le premier critère de sortie de cet epic, pas une inférence sur l'ordre du tick dans
  // le code source.
  teach(g, preparatrice, {
    verbe: "preparer",
    poste: "peu-importe",
    source: Presidus.id,
    destination: PosteBouture.id,
    condition: cultivarId,
  });
  teach(g, transporteuse, {
    verbe: "transporter",
    poste: "peu-importe",
    source: Pboutures.id,
    destination: PosteBouture.id,
    condition: cultivarId,
  });

  g.step(3 * CYCLE);
  assert.ok(
    (PosteBouture.buffer[SUBSTRATE_KEY] || 0) > 0,
    "le compost doit produire du substrat avant que quoi que ce soit ne puisse le consommer",
  );
  assert.ok(
    (PosteBouture.buffer[cultivarId] || 0) > 0,
    "le transport doit déposer des boutures au même poste",
  );
  assertCleanBuffer(PosteBouture, "poste de multiplication (étage 2)");

  // --- Étage 3 : bouturière enseignée seulement maintenant — toute consommation de substrat est
  // donc nécessairement postérieure à l'apparition déjà observée ci-dessus. ---
  teach(g, bouturiere, {
    verbe: "bouturer",
    poste: PosteBouture.id,
    source: "peu-importe",
    destination: Pjeunes.id,
    condition: cultivarId,
  });

  g.step(3 * CYCLE);
  const jeunesKey = Stations.youngPlantKey(cultivarId);
  assert.ok(
    (livePanier(g, Pjeunes.id).buffer[jeunesKey] || 0) >= 1,
    "au moins un jeune plant doit être déposé après une composition réelle récolte→compost/transport→bouturage",
  );
  assertCleanBuffer(livePanier(g, Pjeunes.id), "P_jeunes_plants (étage 3)");

  // --- Étage 4 : replanteuse enseignée — la zone Z2 se remplit sans jamais dépasser sa capacité,
  // vérifié à chaque tick, pas seulement à quelques points de contrôle. ---
  teach(g, replanteuse, {
    verbe: "replanter",
    poste: Z2.id,
    source: Pjeunes.id,
    destination: "peu-importe",
    condition: cultivarId,
  });

  const specimensInZ2 = () => g.s.specimens.filter((sp) => sp.zoneId === Z2.id);
  let previousAccounted = livePanier(g, Pjeunes.id).buffer[jeunesKey] || 0;
  let sawZoneFull = false;

  // Boucle tick par tick (jamais un step() en bloc) : c'est la seule manière d'observer que
  // l'occupation de la zone ne dépasse jamais sa capacité déclarée à *aucun* instant, et de vérifier
  // à chaque pas la conservation globale (jeunes plants en stock + spécimens déjà replantés ne peut
  // jamais reculer — rien ne détruit un jeune plant une fois produit dans cette composition).
  for (let i = 0; i < 40 * CYCLE; i++) {
    g.step(1);
    const inZone = specimensInZ2();
    assert.ok(
      inZone.length <= Z2_CAPACITY,
      `Z2 (${inZone.length} spécimens) ne doit jamais dépasser sa capacité (${Z2_CAPACITY})`,
    );
    if (inZone.length === Z2_CAPACITY) sawZoneFull = true;
    const currentPjeunes = livePanier(g, Pjeunes.id);
    const jeunesStock = currentPjeunes.buffer[jeunesKey] || 0;
    assert.ok(
      jeunesStock <= PANIER_CAPACITY,
      `P_jeunes_plants (${jeunesStock}) ne doit jamais dépasser sa propre capacité (${PANIER_CAPACITY})`,
    );
    const accounted = jeunesStock + inZone.length;
    assert.ok(
      accounted >= previousAccounted,
      "le total (jeunes plants en stock + spécimens replantés) ne doit jamais reculer",
    );
    previousAccounted = accounted;
    assertCleanBuffer(currentPjeunes, `P_jeunes_plants (tick ${i})`);
    assertCleanBuffer(PosteBouture, `poste de multiplication (tick ${i})`);
  }

  assert.ok(sawZoneFull, "Z2 doit réellement atteindre sa capacité pendant la fenêtre observée");
  assert.equal(
    specimensInZ2().length,
    Z2_CAPACITY,
    "Z2 doit rester exactement à sa capacité, jamais au-delà, une fois pleine",
  );

  // --- Étage 5 : Z2 pleine — la chaîne en amont continue sans perte. Pjeunes doit continuer
  // d'accumuler jusqu'à SA propre capacité puis s'arrêter proprement, sans qu'aucune unité de
  // boutures/résidus/substrat ne disparaisse en cours de route. ---
  g.step(60 * CYCLE);
  assert.equal(
    specimensInZ2().length,
    Z2_CAPACITY,
    "aucun spécimen supplémentaire ne doit jamais apparaître dans Z2 une fois pleine",
  );
  const finalJeunes = livePanier(g, Pjeunes.id).buffer[jeunesKey] || 0;
  assert.ok(
    finalJeunes <= PANIER_CAPACITY,
    "P_jeunes_plants ne doit jamais dépasser sa capacité, même après une longue simulation en aval saturé",
  );
  assertCleanBuffer(livePanier(g, Pjeunes.id), "P_jeunes_plants (fin)");
  assertCleanBuffer(PosteBouture, "poste de multiplication (fin)");
  assertCleanBuffer(Pboutures, "P_boutures (fin)");
  assertCleanBuffer(Presidus, "P_résidus (fin)");

  // Rechargement JSON réel de cette chaîne entièrement composée et partiellement saturée : aucune
  // reprise ne doit jamais créditer deux fois un jeune plant ou un spécimen déjà comptabilisé, ni
  // laisser un pas de simulation ultérieur dépasser une capacité déjà vérifiée.
  const reloaded = new GardenState(JSON.parse(JSON.stringify(g.serialize())));
  const reloadedPjeunes = reloaded.s.campaignStations.paniers.find((p) => p.id === Pjeunes.id);
  const reloadedZ2Count = reloaded.s.specimens.filter((sp) => sp.zoneId === Z2.id).length;
  assert.equal(reloadedPjeunes.buffer[jeunesKey] || 0, finalJeunes);
  assert.equal(reloadedZ2Count, Z2_CAPACITY);

  assert.doesNotThrow(() => reloaded.step(5 * CYCLE));
  assert.equal(
    reloaded.s.specimens.filter((sp) => sp.zoneId === Z2.id).length,
    Z2_CAPACITY,
    "un rechargement suivi d'un pas réel ne doit jamais faire réapparaître un slot de zone déjà occupé",
  );
  const afterReloadPjeunes = reloaded.s.campaignStations.paniers.find((p) => p.id === Pjeunes.id);
  assert.ok(
    (afterReloadPjeunes.buffer[jeunesKey] || 0) <= PANIER_CAPACITY,
    "un rechargement suivi d'un pas réel ne doit jamais dépasser la capacité du panier",
  );
});
