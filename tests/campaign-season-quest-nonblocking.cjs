const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const CampaignAutomation = require("../public/game/campaign-automation.js");
const Seasons = require("../public/game/campaign-seasons.js");

// Epic C7.34 (design §16, scénarios de validation à conserver): "Le coucher à 23 h, une saison
// différente ou un manque d'argent ne condamnent pas une quête principale." Le volet "coucher à
// 23 h" est déjà verrouillé depuis C2.2 (bilan de nuit atomique) — non re-testé ici. Les deux
// autres volets n'avaient jamais été mis à l'épreuve par aucun test existant : les actes I-VI
// (phases 3 à 6) ont tous été écrits et testés avant que campaign-seasons.js (C7.1) n'existe.
//
// Ce fichier verrouille, par exécution réelle plutôt que par lecture seule :
// 1. qu'aucun fichier de commande gatant la progression d'un chapitre (campaignFlags.includes)
//    ne référence jamais une saison ;
// 2. que s.inventory.coins n'est jamais lu comme une condition de progression, seulement crédité
//    aux deux sites déjà connus (récompense de quête, paiement de contrat) ;
// 3. que la durée du stade 0 -> 1 d'un spécimen (cultivars.js, C7.3) n'est jamais plus longue que
//    la durée ordinaire, quelle que soit la saison de plantation, et seulement plus courte au
//    printemps ;
// 4. que la durée d'un cycle de récolte (campaign-automation.js, C7.7) n'est jamais plus longue
//    que CYCLE_SECONDS, quelle que soit la saison, et seulement plus courte en automne.

const DURATION = Cultivars.STAGE_DURATION_ELAPSED_SECONDS;
const SPRING_DURATION = Cultivars.SPRING_YOUNG_STAGE_DURATION_ELAPSED_SECONDS;
const CYCLE = CampaignAutomation.CYCLE_SECONDS;
const FAST = CampaignAutomation.FAST_CYCLE_SECONDS;

const CMD_DIR = path.join(__dirname, "..", "public");

function cmdFileNames() {
  return fs
    .readdirSync(CMD_DIR)
    .filter((f) => /^garden-state-cmd-[a-z]\.js$/.test(f))
    .sort();
}

// The files that actually gate chapter progression — derived from the real code (whichever
// garden-state-cmd-*.js files call campaignFlags.includes), never a hand-copied list that could
// silently go stale as the backlog's own "15 sites, 14 fichiers" count already shows happened.
function chapterGatingFiles() {
  return cmdFileNames().filter((f) =>
    fs.readFileSync(path.join(CMD_DIR, f), "utf8").includes("campaignFlags"),
  );
}

// Only ever a day actually inside the named season, derived from Seasons' own constants — never
// a hardcoded day number that could silently drift if DAYS_PER_SEASON ever changed.
function dayInSeason(season) {
  const day = Seasons.SEASONS.indexOf(season) * Seasons.DAYS_PER_SEASON + 1;
  assert.equal(Seasons.seasonForDay(day), season, `sanity: day ${day} must really be ${season}`);
  return day;
}

// Discovered while writing this epic: C7.34's own backlog entry claims
// `grep -rni "season" public/garden-state-cmd-*.js` returns empty — rerunning that exact grep for
// real shows it does not (recorded as an anomaly in docs/campagne.md for this epic, not silently
// corrected away). The one real hit, "jeanneReconstitutionSeason" (garden-state-cmd-f.js), is a
// chapitre-15 narrative reveal flag *name* (Narrative.pendingReveal), never a reference to the
// seasonal clock API — confirmed, not assumed, by the dedicated test just below this one, which
// re-reads its actual gating condition and fails if that condition ever starts mentioning season
// itself. Allowlisted by exact string, so a second, unrelated "season" mention anywhere in the
// same file still breaks the test above.
const KNOWN_NON_SEASON_MENTIONS = ["jeanneReconstitutionSeason"];

test("no chapter-gating command file ever references a season to condition progression", () => {
  const files = chapterGatingFiles();
  // Sanity floor, not a hardcoded exact count: the real set must stay substantial, or this test
  // would pass vacuously over an empty list.
  assert.ok(
    files.length >= 10,
    `expected a real set of chapter-gating files, found ${files.length}`,
  );
  for (const file of files) {
    let content = fs.readFileSync(path.join(CMD_DIR, file), "utf8");
    for (const allowed of KNOWN_NON_SEASON_MENTIONS) content = content.split(allowed).join("");
    assert.ok(
      !/season/i.test(content),
      `${file} must never mention a season near chapter-progression logic (beyond the documented non-mechanic narrative flag name)`,
    );
  }
});

test('the one allowlisted "season"-containing narrative flag name is confirmed to gate on campaignFlags/rainelles only, never on the seasonal clock', () => {
  const content = fs.readFileSync(path.join(CMD_DIR, "garden-state-cmd-f.js"), "utf8");
  const idx = content.indexOf("jeanneReconstitutionSeason");
  assert.ok(idx >= 0, "the allowlisted flag name must still exist, or this allowlist entry is stale");
  const before = content.slice(Math.max(0, idx - 600), idx);
  assert.ok(
    /campaignFlags\.(some|includes)/.test(before),
    "its reveal must be gated by campaignFlags, as already documented",
  );
  assert.ok(
    !/season/i.test(before.replace(/jeanneReconstitutionSeason/g, "")),
    "its own gating condition must never mention season itself, or the allowlist above is no longer safe",
  );
});

test("inventory.coins is credited only at its two known sites, as plain assignments, never read as a chapter-gating condition", () => {
  const files = chapterGatingFiles();
  const referencing = files.filter((f) =>
    fs.readFileSync(path.join(CMD_DIR, f), "utf8").includes("inventory.coins"),
  );
  assert.deepEqual(
    referencing.sort(),
    ["garden-state-cmd-e.js", "garden-state-cmd-r.js"],
    "a third chapter-gating file referencing inventory.coins needs explicit review, never a silent pass",
  );
  const conditionShapes = [
    /if\s*\([^)]*inventory\.coins/,
    /inventory\.coins[^=\n]*[<>]/,
    /inventory\.coins\s*===?/,
    /inventory\.coins\s*!==?/,
    /\?[^:\n]*inventory\.coins/,
  ];
  for (const file of referencing) {
    const content = fs.readFileSync(path.join(CMD_DIR, file), "utf8");
    for (const shape of conditionShapes) {
      assert.ok(
        !shape.test(content),
        `${file}: inventory.coins must never be read as a condition (matched ${shape})`,
      );
    }
  }
  assert.ok(
    fs
      .readFileSync(path.join(CMD_DIR, "garden-state-cmd-e.js"), "utf8")
      .includes("s.inventory.coins = (s.inventory.coins || 0) + reward.coins;"),
    "the known quest-reward credit site must still exist verbatim",
  );
  assert.ok(
    fs
      .readFileSync(path.join(CMD_DIR, "garden-state-cmd-r.js"), "utf8")
      .includes(
        "s.inventory.coins =\n          (s.inventory.coins || 0) + accepted * contract.pricePerUnit;",
      ),
    "the known contract-payment credit site must still exist verbatim",
  );
});

test("a specimen's stage 0 -> 1 growth is never slower than the ordinary duration in any season, and only faster in spring", () => {
  for (const season of Seasons.SEASONS) {
    const day = dayInSeason(season);
    const g = new GardenState(null, 1000);
    g.s.campaignDay = day;
    const cv = Cultivars.createCultivar(g.s, { name: "Test", traits: {} });
    const sp = Cultivars.createSpecimen(g.s, { cultivarId: cv.id, x: 0, z: 0 });
    assert.equal(sp.plantedSeason, season);
    const expected = season === "printemps" ? SPRING_DURATION : DURATION;
    assert.ok(expected <= DURATION, `${season}: never slower than the ordinary duration`);
    g.s.elapsed = sp.plantedAt + expected - 1;
    assert.equal(
      Cultivars.specimenStage(g.s, sp),
      0,
      `${season}: still stage 0 one second before its real duration`,
    );
    g.s.elapsed = sp.plantedAt + expected;
    assert.equal(
      Cultivars.specimenStage(g.s, sp),
      1,
      `${season}: reaches stage 1 exactly at its real duration, never later`,
    );
  }
});

function bornRainelle(g) {
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0];
}

function teach(rainelle, fields) {
  const r = Rainelles.applyGesture(rainelle, { condition: "", ...fields });
  assert.equal(r.ok, true, r.error);
}

test("a récolter cycle is never slower than CYCLE_SECONDS in any season, and only faster in autumn", () => {
  for (const season of Seasons.SEASONS) {
    const day = dayInSeason(season);
    const g = new GardenState(null, 1000);
    const rainelle = bornRainelle(g);
    const cultivarId = g.s.cultivars[0].id;
    g.s.campaignDay = day;
    const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
    const panier = Stations.registerStation(g.s.campaignStations, "panier", { x: 0, z: 0 });
    const specimen = Cultivars.createSpecimen(g.s, {
      cultivarId,
      x: 0,
      z: 0,
      stage: Cultivars.MATURE_STAGE,
    });
    Cultivars.setReadyToProduce(g.s, specimen, true);
    teach(rainelle, {
      verbe: "recolter",
      poste: zone.id,
      source: "peu-importe",
      destination: panier.id,
    });
    const expected = season === "automne" ? FAST : CYCLE;
    assert.ok(expected <= CYCLE, `${season}: never slower than the ordinary cycle`);
    g.step(expected - 1);
    assert.deepEqual(panier.buffer, {}, `${season}: cycle not yet complete one tick early`);
    g.step(1);
    assert.equal(
      panier.buffer[cultivarId],
      1,
      `${season}: cycle completes exactly at its real duration, never later`,
    );
  }
});
