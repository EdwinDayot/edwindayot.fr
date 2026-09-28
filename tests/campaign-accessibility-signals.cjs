const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/* Epic C7.31 (docs/campagne-backlog.md, design §14 "Tout signal coloré possède une forme ou un
   texte"). This is an audit, not a new feature: it locks a rule already true by construction on
   the three real mechanisms that carry it today (GardenGauge, hud-widgets.js's gauge() widget,
   RainellesStatus), and the current absence of any colour-only mapping in the render layer — the
   same "formaliser une garantie déjà vraie plutôt que la supposer" posture already used by C2.10.
   Nothing here changes production behaviour; every assertion below calls the real, unmodified
   functions. */

// --- 1. GardenGauge (public/game/gauge.js) : text non vide, tone connue, sur chaque branche ---

const Gauge = require("../public/game/gauge.js");
const D = require("../public/game/data.js");

const KNOWN_TONES = new Set(["water", "amber", "growth", "ready"]);

function assertSignal(g, label) {
  assert.ok(g && typeof g === "object", `${label}: doit renvoyer un objet`);
  assert.equal(typeof g.text, "string", `${label}: text doit être une chaîne`);
  assert.ok(g.text.length > 0, `${label}: text ne doit jamais être vide`);
  assert.ok(KNOWN_TONES.has(g.tone), `${label}: tone "${g.tone}" doit être connue du renderer`);
}

test("GardenGauge.tank always carries a non-empty text and a known tone", () => {
  assertSignal(Gauge.tank({ water: 0 }), "tank(0)");
  assertSignal(Gauge.tank({ water: 160 }), "tank(160)");
});

test("GardenGauge.pump carries a non-empty text and a known tone on both branches (running/veille)", () => {
  assertSignal(Gauge.pump({ running: true }), "pump(running)");
  assertSignal(Gauge.pump({ running: false }), "pump(veille)");
});

test("GardenGauge.collector carries a non-empty text and a known tone, empty or full", () => {
  assertSignal(Gauge.collector({ buffer: {} }), "collector(vide)");
  assertSignal(Gauge.collector({ buffer: { a: 5, b: 3 } }, 24), "collector(rempli)");
});

test("GardenGauge.nursery carries a non-empty text and a known tone on both non-null branches (en cours/prêt)", () => {
  const seconds = D.balance.nurserySeconds;
  assertSignal(Gauge.nursery({ species: "pilea", remaining: seconds - 5 }), "nursery(en cours)");
  assertSignal(Gauge.nursery({ species: "pilea", remaining: 0 }), "nursery(prêt)");
  // null reste un cas légitime et distinct : hud-widgets.js/hud-panel.js n'appellent jamais
  // gauge() sur un résultat null (le job absent saute l'affichage), donc rien à verrouiller ici.
  assert.equal(Gauge.nursery(null), null);
});

test("GardenGauge.plant carries a non-empty text and a known tone on both branches (humide/sec)", () => {
  assertSignal(Gauge.plant({ moisture: 62 }), "plant(humide)");
  assertSignal(Gauge.plant({ moisture: 12 }), "plant(sec)");
});

test("GardenGauge.resource carries a non-empty text and a known tone on both branches (refroidit/prêt)", () => {
  const spec = D.mining.wood;
  assertSignal(Gauge.resource(spec, { ready: 130, work: 0 }, 90), "resource(refroidit)");
  assertSignal(Gauge.resource(spec, { ready: 0, work: 2 }, 90), "resource(prêt)");
});

// --- 2. hud-widgets.js's gauge(x, y, w, h, g) : le texte est toujours dessiné, jamais omis ---
// Même patron déjà en usage pour ce module (tests/campaign-panels-touch-targets.cjs, Epic
// C7.12) : hud.js/hud-widgets.js sont de simples IIFE écrites pour le navigateur (références
// nues à `GardenData`/`window`, aucun module.exports) — global.window est pointé sur global lui-
// même pour que `window.GardenHUD = GardenHUD` atterrisse où ce fichier peut le lire, et
// global.GardenData est posé avant le chargement puisque hud-widgets.js sort tôt sans lui
// (`if (!D || !G) return;`). box() est stubbée en no-op (dessin réel déjà couvert par
// tests/campaign-panels-touch-browser.cjs, un vrai canvas) ; text() est ici un espion, pas un
// no-op, pour observer exactement ce que ce widget lui transmet.
global.window = global;
global.GardenData = {};
require("../public/game/hud.js");
require("../public/game/hud-widgets.js");
const GardenHUD = global.GardenHUD;
assert.ok(typeof GardenHUD === "function", "hud.js doit avoir posé window.GardenHUD");
assert.ok(
  typeof GardenHUD.prototype.gauge === "function",
  "hud-widgets.js doit avoir attaché gauge() à GardenHUD.prototype (GardenData était-il faux ?)",
);

function fakeHudWithTextSpy() {
  const calls = [];
  return {
    hud: {
      palette: { ink: "#000" },
      box() {},
      text(...args) {
        calls.push(args);
      },
    },
    calls,
  };
}

test("gauge() always draws g.text via this.text(), including at fraction 0 (empty bar, text still drawn)", () => {
  const { hud, calls } = fakeHudWithTextSpy();
  GardenHUD.prototype.gauge.call(hud, 0, 0, 100, 20, {
    fraction: 0,
    text: "0/160",
    tone: "water",
  });
  assert.equal(calls.length, 1, "text() doit être appelé exactement une fois");
  assert.equal(calls[0][0], "0/160", "text() doit recevoir g.text tel quel");
});

test("gauge() draws g.text identically across every known tone, never conditionally omitted", () => {
  for (const tone of KNOWN_TONES) {
    const { hud, calls } = fakeHudWithTextSpy();
    GardenHUD.prototype.gauge.call(hud, 0, 0, 100, 20, {
      fraction: 0.5,
      text: `texte-${tone}`,
      tone,
    });
    assert.equal(calls.length, 1, `tone=${tone}: text() doit être appelé`);
    assert.equal(calls[0][0], `texte-${tone}`, `tone=${tone}: text() doit recevoir g.text`);
  }
});

test("gauge() falls back to the water colour for an unknown tone but still draws the text", () => {
  const { hud, calls } = fakeHudWithTextSpy();
  GardenHUD.prototype.gauge.call(hud, 0, 0, 100, 20, {
    fraction: 1,
    text: "texte-inconnu",
    tone: "pas-une-teinte-connue",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "texte-inconnu");
});

// --- 3. RainellesStatus.status(...) : les sept états portent tous un message non vide ---
// Rejoue les sept branches déjà exercées individuellement par tests/campaign-rainelles-status.cjs
// (C2.8/C2.8v-a) — même espace d'états, aucun nouveau, seulement la garantie d'accessibilité
// consolidée en un seul endroit.

const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const Status = require("../public/game/rainelles-status.js");
const Movement = require("../public/game/rainelle-movement.js");

function freshRainelle(g) {
  const cultivar = Cultivars.createCultivar(g.s, { name: "Test", traits: {} });
  return Rainelles.createRainelle(g.s, { cultivarId: cultivar.id, name: "Statut" });
}

function teach(rainelle, fields) {
  const r = Rainelles.applyGesture(rainelle, { condition: "", ...fields });
  assert.equal(r.ok, true, r.error);
}

function assertStatus(status, label) {
  assert.equal(typeof status.kind, "string", `${label}: kind doit être une chaîne`);
  assert.equal(typeof status.message, "string", `${label}: message doit être une chaîne`);
  assert.ok(status.message.length > 0, `${label}: message ne doit jamais être vide`);
}

test("accessibilité : repos porte un message non vide", () => {
  const g = new GardenState(null, 1000);
  assertStatus(Status.status(freshRainelle(g), g.s), "repos");
});

test("accessibilité : poste-manquant porte un message non vide", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(rainelle, { verbe: "arroser", poste: zone.id, source: "b999", destination: "x" });
  assertStatus(Status.status(rainelle, g.s), "poste-manquant");
});

test("accessibilité : au-travail porte un message non vide", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  teach(rainelle, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  assertStatus(Status.status(rainelle, g.s), "au-travail");
});

test("accessibilité : source-vide porte un message non vide", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  teach(rainelle, { verbe: "recolter", poste: zone.id, source: "x", destination: panier.id });
  assertStatus(Status.status(rainelle, g.s), "source-vide");
});

test("accessibilité : sortie-pleine porte un message non vide", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  const cultivar = Cultivars.createCultivar(g.s, { name: "Autre", traits: {} });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  panier.capacity = 1;
  panier.buffer[cultivar.id] = 1;
  const specimen = Cultivars.createSpecimen(g.s, {
    cultivarId: cultivar.id,
    x: 0,
    z: 0,
    stage: Cultivars.MATURE_STAGE,
  });
  Cultivars.setReadyToProduce(g.s, specimen, true);
  teach(rainelle, { verbe: "recolter", poste: zone.id, source: "x", destination: panier.id });
  assertStatus(Status.status(rainelle, g.s), "sortie-pleine");
});

test("accessibilité : stock-cible-atteint porte un message non vide", () => {
  const g = new GardenState(null, 1000);
  const rainelle = freshRainelle(g);
  const cultivar = Cultivars.createCultivar(g.s, { name: "Autre", traits: {} });
  const from = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  const to = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
  from.buffer[cultivar.id] = 2;
  from.min = 2;
  teach(rainelle, {
    verbe: "transporter",
    poste: "x",
    source: from.id,
    destination: to.id,
    condition: cultivar.id,
  });
  assertStatus(Status.status(rainelle, g.s), "stock-cible-atteint");
});

test("accessibilité : passage-bloque porte un message non vide", () => {
  const g = new GardenState(null, 1000);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const rainelle = freshRainelle(g);
  teach(rainelle, { verbe: "arroser", poste: zone.id, source: borne.id, destination: "x" });
  const waitCounts = { [rainelle.id]: Movement.MAX_WAIT_STEPS };
  assertStatus(Status.status(rainelle, g.s, waitCounts), "passage-bloque");
});

// --- 4. Aucun mappage couleur-sans-texte dans le rendu : vérifié par lecture réelle du code ---
// Verrouille l'absence actuelle de tout mappage RainellesStatus -> couleur dans render*.js : si
// un futur epic introduisait un tel mappage sans lui donner de texte, ce test doit casser plutôt
// que laisser passer une régression d'accessibilité inaperçue (même raisonnement que l'audit
// garden-material-audit.cjs pour les normales de terrain, cf. execution-continue.md).

test("aucun fichier public/game/render*.js ne référence RainellesStatus/.status( (grep programmatique, pas seulement documenté)", () => {
  const renderDir = path.join(__dirname, "..", "public", "game");
  const renderFiles = fs
    .readdirSync(renderDir)
    .filter((f) => f.startsWith("render") && f.endsWith(".js"));
  assert.ok(renderFiles.length > 0, "au moins un fichier render*.js doit exister à auditer");
  for (const file of renderFiles) {
    const contents = fs.readFileSync(path.join(renderDir, file), "utf8");
    assert.ok(
      !contents.includes("RainellesStatus"),
      `${file} ne doit référencer RainellesStatus nulle part`,
    );
    assert.ok(
      !contents.includes(".status("),
      `${file} ne doit appeler .status( nulle part`,
    );
  }
});
