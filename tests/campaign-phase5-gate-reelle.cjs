/* Epic C5.15 (docs/campagne-backlog.md), phase 5's REAL exit gate — design §15, "le scénario
   distingue une partie attentive d'une partie intensive", cette fois franchi par l'écran, pas
   seulement par l'état sauvegardé (limite explicitement documentée par C5.8, tests/campaign-
   phase5-gate-mecanique.cjs, comme non résolue par sa propre porte "mécanique").

   Ce fichier rejoue les deux profils que C5.8 a déjà prouvés en moteur (GardenState.command()
   direct) — une partie attentive (veilleuse et prise à fort débit jamais activées) et une partie
   intensive (les deux activées, au-delà du seuil de sursollicitation, source tarie puis
   restaurée) — mais fait résoudre CHAQUE nuit à travers le vrai vecteur d'entrée réel du jeu,
   window.GardenApp.dispatch("confirm-night") (garden-dispatch.js), exactement le même point
   d'appel que le bouton "passer la nuit" du joueur (déjà exercé, mais séparément par profil, par
   tests/campaign-gesture-scene-browser.cjs pour C5.14). C'est la différence avec C5.8 : celui-ci
   prouve que les *faits* distinguent les deux parties ; celui-ci prouve que la vraie boucle de
   rendu (panneau réel, caméra réelle sur le vrai Group construit par render-flow.js/render-
   campaign-stations.js) le fait aussi, à chaque nuit résolue, pas seulement à la fin.

   Setup identique à C5.8 : seule la création de stations/spécimens (Stations.registerStation,
   Cultivars.createSpecimen) reste hors commande, faute de toute commande de placement dans le
   monde à ce jour (même précédent que campaign-phase4-gate.cjs/campaign-phase5-gate-mecanique.cjs
   pour leurs propres bornes/zones/spécimens) — construite en Node puis chargée par localStorage
   (même technique que campaign-gesture-scene-browser.cjs's openSave()), pour que chaque nuit de
   la partie soit ensuite résolue par le vrai dispatch, jamais par un raccourci Node.

   Écart de méthode assumé, documenté ici plutôt que deviné : la classification en temps réel qui
   positionne une Rainelle (rainelles-status.js's status(...).kind, utilisée par garden-state.js's
   tickRainelleMovement, C5.11) ne distingue pas "arroser avec des spécimens" de "arroser sans
   spécimen" — statusArroser ne connaît pas de "source-vide" (contrairement à récolter/
   transporter) — donc la Rainelle reste ciblée sur son poste (la zone) aussi bien pendant la
   persistance que pendant la réparation. Le test ne prétend donc pas qu'un cadrage caméra
   différent distingue les deux mises en scène : seuls le texte du panneau réel et le
   gestureScene.kind réel le font, exactement ce que C5.14 a construit et que ce fichier vérifie
   ici en conditions de partie complète plutôt qu'en scène isolée. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { GardenState } = require("../public/garden-state.js");
const Stations = require("../public/game/campaign-stations.js");
const Cultivars = require("../public/game/cultivars.js");
const url = process.env.GARDEN_URL || "http://127.0.0.1:4174/";

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

function buildSave(intensif) {
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const borne = Stations.registerStation(g.s.campaignStations, "borne", { x: 0, z: 0 });
  const zone = Stations.registerStation(g.s.campaignStations, "zone", { x: 0, z: 0 });
  const cultivarId = g.s.cultivars[0].id;
  Cultivars.createSpecimen(g.s, { cultivarId, x: 0, z: 0 });
  teachArroser(g, rainelle.id, { poste: zone.id, source: borne.id });
  if (intensif) {
    assert.equal(
      g.command({ type: "setVeilleuse", zoneId: zone.id, active: true }).ok,
      true,
    );
    assert.equal(
      g.command({ type: "setPriseFortDebit", borneId: borne.id, active: true }).ok,
      true,
    );
  }
  return { state: g.serialize(), rainelleId: rainelle.id, zoneId: zone.id, borneId: borne.id };
}

async function openSave(b, state) {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.addInitScript((s) => {
    localStorage.setItem("edwin-garden-v3", JSON.stringify(s));
  }, state);
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => window.GardenApp && window.GardenApp.view, null, {
    timeout: 30000,
  });
  await p.waitForTimeout(300);
  return { p, errors };
}

async function waitPositioned(p, rainelleId) {
  // The real per-frame tick loop (garden-frame.js) must give this Rainelle a real position and a
  // real model on its own (C5.11's ensurePosition), with no extra call from this test — exactly
  // the same wait campaign-gesture-scene-browser.cjs already uses.
  await p.waitForFunction(
    (id) => {
      const v = window.GardenApp.view,
        r = window.GardenApp.game.s.rainelles.find((r) => r.id === id);
      return r && Number.isFinite(r.x) && v.rainelleModels.has(id);
    },
    rainelleId,
    { timeout: 5000 },
  );
}

async function confirmNight(p) {
  return p.evaluate(() => {
    window.GardenApp.dispatch("confirm-night");
    const A = window.GardenApp;
    return {
      flags: A.game.s.campaignFlags.slice(),
      panel: A.panel,
      gestureScene: A.view.gestureScene
        ? { kind: A.view.gestureScene.kind, rainelleId: A.view.gestureScene.rainelleId }
        : null,
      bassin: window.GardenCampaignMemory.bassinCommunLevel(A.game.s.campaignMemory),
    };
  });
}

async function panelRows(p) {
  return p.evaluate(() => {
    const hud = window.GardenApp.ui;
    return hud.buildPanelRows(hud.model, hud.w, 0, 0, 700, 600, hud.palette);
  });
}

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync("/opt/pw-browsers/chromium")
      ? "/opt/pw-browsers/chromium"
      : undefined,
    args:
      process.platform === "darwin"
        ? ["--use-angle=" + (process.env.GARDEN_ANGLE || "metal")]
        : [],
  });
  try {
    // ---- Partie attentive : dix nuits réelles, résolues une par une par le vrai dispatch ----
    // (design §16 "Culpabilité artificielle ou scène lue comme un bug" : jamais de mise en scène,
    // jamais de texte, jamais de baisse du bassin commun — vérifié à l'écran à CHAQUE nuit, pas
    // seulement à la fin).
    {
      const { state, rainelleId } = buildSave(false);
      const { p, errors } = await openSave(b, state);
      await waitPositioned(p, rainelleId);
      const capacity = await p.evaluate(() => window.GardenCampaignMemory.BASSIN_COMMUN_CAPACITY);

      for (let night = 0; night < 10; night++) {
        const after = await confirmNight(p);
        assert.equal(
          after.panel,
          "",
          `nuit ${night}: aucun panneau ne doit s'ouvrir sur une partie attentive`,
        );
        assert.equal(
          after.gestureScene,
          null,
          `nuit ${night}: aucune transition caméra scriptée observée`,
        );
        assert.ok(
          !after.flags.includes("persistance-geste-vide"),
          `nuit ${night}: jamais de texte de persistance`,
        );
        assert.ok(
          !after.flags.includes("geste-qui-sarrete"),
          `nuit ${night}: jamais de texte de réparation`,
        );
        assert.equal(after.bassin, capacity, `nuit ${night}: le bassin commun reste plein à l'écran`);
      }
      assert.deepEqual(errors, [], "no console/page error: " + errors.join(" | "));
      await p.close();
    }

    // ---- Partie intensive : au-delà du seuil, source tarie, puis restaurée ----
    {
      const { state, rainelleId, zoneId, borneId } = buildSave(true);
      const { p, errors } = await openSave(b, state);
      await waitPositioned(p, rainelleId);
      const capacity = await p.evaluate(() => window.GardenCampaignMemory.BASSIN_COMMUN_CAPACITY);
      const threshold = await p.evaluate(() => window.GardenCampaignMemory.OVEREXERTION_THRESHOLD);

      for (let night = 0; night <= threshold; night++) {
        const after = await confirmNight(p);
        assert.equal(
          after.panel,
          "",
          `nuit ${night}: chaque nuit ci-dessus a réellement travaillé — jamais de persistance tant que la source ne tarit pas`,
        );
        assert.equal(after.gestureScene, null);
      }
      const levelAfterWork = await p.evaluate(() =>
        window.GardenCampaignMemory.bassinCommunLevel(window.GardenApp.game.s.campaignMemory),
      );
      assert.ok(levelAfterWork < capacity, "usage intensif : le bassin commun a mesurablement baissé à l'écran");

      // La source se tarit (design §11, scène "la pause qui ne commence pas") : borne et zone
      // restent résolues, la veilleuse reste allumée, mais plus aucun spécimen à arroser.
      await p.evaluate(() => {
        window.GardenApp.game.s.specimens.length = 0;
      });
      const persisted = await confirmNight(p);
      assert.ok(
        persisted.flags.includes("persistance-geste-vide"),
        "la persistance doit se révéler à l'écran, via le vrai dispatch",
      );
      assert.equal(persisted.panel, "gesture-scene");
      assert.deepEqual(persisted.gestureScene, { kind: "persistance", rainelleId });

      const rowsPersistance = await panelRows(p);
      assert.ok(
        rowsPersistance.some(
          (r) =>
            r.title === "Le geste qui continue" &&
            r.detail === "Elle refait le geste. Le panier est vide.",
        ),
        "le panneau réel affiche le texte déjà révélé cette même nuit",
      );

      // Laisse le lerp de caméra réellement converger avant la capture (même délai que C5.14),
      // puis compare le point visé de la caméra à la position réelle de la Rainelle concernée —
      // la même vérification par distance que campaign-gesture-scene-browser.cjs (C5.14), jamais
      // seulement "une caméra a bougé". Écart de méthode découvert et documenté ici : le panneau
      // réel occupe la quasi-totalité de l'écran, comme tout panneau de ce jeu (inventaire,
      // carnet...) — une capture ne peut donc jamais montrer à la fois le texte et la Rainelle
      // cadrée derrière lui ; fermer le panneau pour "voir la scène" met aussi fin à la mise en
      // scène elle-même (endGestureScene(), garden-cmd.js's closePanel), donc au cadrage spécial —
      // la capture obtenue après fermeture montre alors la caméra déjà revenue à son suivi normal
      // du joueur, pas "la Rainelle à son poste vide". Le fait que la caméra a réellement cadré la
      // Rainelle concernée, avant toute fermeture, est donc prouvé ici par comparaison de position
      // réelle (le vrai gate), la capture du panneau ci-dessous servant de relecture multimodale du
      // style/texte réellement affiché, jamais de preuve de cadrage à elle seule.
      await p.waitForTimeout(700);
      const framing = await p.evaluate((id) => {
        const v = window.GardenApp.view,
          r = window.GardenApp.game.s.rainelles.find((r) => r.id === id);
        return {
          lookDistanceToRainelle: Math.hypot(v.look.x - r.x, v.look.z - r.z),
          lookDistanceToPlayer: Math.hypot(v.look.x - v.position.x, v.look.z - v.position.z),
        };
      }, rainelleId);
      assert.ok(
        framing.lookDistanceToRainelle < 1.5,
        "la caméra a réellement convergé sur la position réelle de la Rainelle concernée : " +
          framing.lookDistanceToRainelle,
      );
      assert.ok(
        framing.lookDistanceToPlayer > framing.lookDistanceToRainelle,
        "la caméra est réellement plus proche de la Rainelle que du joueur, pas une coïncidence",
      );
      await p.screenshot({ path: "/tmp/campaign-phase5-gate-reelle-persistance-panneau.png" });

      // Interruption (Échap / bouton ×, garden-cmd.js's closePanel) : rend la main immédiatement,
      // aucune mutation d'état supplémentaire (design §14, accessibilité : "permettre de raccourcir
      // une scène... tout en gardant les conséquences et leur sens").
      const overexertionBefore = await p.evaluate(
        (id) => window.GardenApp.game.s.campaignMemory.overexertion[id] || 0,
        rainelleId,
      );
      const afterInterrupt = await p.evaluate((id) => {
        window.GardenApp.closePanel();
        return {
          panel: window.GardenApp.panel,
          gestureScene: window.GardenApp.view.gestureScene,
          overexertion: window.GardenApp.game.s.campaignMemory.overexertion[id] || 0,
        };
      }, rainelleId);
      assert.equal(afterInterrupt.panel, "");
      assert.equal(afterInterrupt.gestureScene, null);
      assert.equal(
        afterInterrupt.overexertion,
        overexertionBefore,
        "interrompre la scène ne mute rien d'autre",
      );

      // Coupe la veilleuse et la prise à fort débit : retour au repos réel (design §11, jamais un
      // bouton pardon) — via A.execute, le même chemin de commande qu'une future UI utiliserait.
      assert.equal(
        (
          await p.evaluate(
            (zid) => window.GardenApp.execute({ type: "setVeilleuse", zoneId: zid, active: false }).ok,
            zoneId,
          )
        ),
        true,
      );
      assert.equal(
        (
          await p.evaluate(
            (bid) =>
              window.GardenApp.execute({ type: "setPriseFortDebit", borneId: bid, active: false }).ok,
            borneId,
          )
        ),
        true,
      );
      const levelAfterPersistence = await p.evaluate(() =>
        window.GardenCampaignMemory.bassinCommunLevel(window.GardenApp.game.s.campaignMemory),
      );

      let restNights = 0,
        reparation = null;
      while (true) {
        const after = await confirmNight(p);
        restNights += 1;
        assert.ok(restNights < 50, "garde-fou : la décroissance progressive doit converger");
        if (after.flags.includes("geste-qui-sarrete")) {
          reparation = after;
          break;
        }
      }
      assert.equal(reparation.panel, "gesture-scene");
      assert.deepEqual(reparation.gestureScene, { kind: "reparation", rainelleId });
      const rowsReparation = await panelRows(p);
      assert.ok(
        rowsReparation.some(
          (r) =>
            r.title === "Le geste qui s’arrête" &&
            r.detail === "Elle s’assied près de l’eau. Le geste ne reprend pas.",
        ),
        "le panneau réel affiche le texte de réparation",
      );
      const levelAfterReparation = await p.evaluate(() =>
        window.GardenCampaignMemory.bassinCommunLevel(window.GardenApp.game.s.campaignMemory),
      );
      assert.equal(
        levelAfterReparation,
        levelAfterPersistence,
        "couper la prise arrête la baisse du bassin commun sans jamais la faire remonter (réparation à coût réel, jamais une annulation gratuite)",
      );

      await p.waitForTimeout(700);
      await p.screenshot({ path: "/tmp/campaign-phase5-gate-reelle-reparation-panneau.png" });
      await p.evaluate(() => window.GardenApp.closePanel());

      // ---- Revalidation §16 ("Une commande refusée ne devient jamais un dommage fictif") ----
      const beforeRefusal = await p.evaluate(
        (id) => ({
          specimens: window.GardenApp.game.s.specimens.length,
          manualInterventions: window.GardenApp.game.s.campaignMemory.manualInterventions,
          geste: JSON.stringify(
            window.GardenApp.game.s.rainelles.find((r) => r.id === id).geste,
          ),
        }),
        rainelleId,
      );
      const refusal = await p.evaluate(
        (id) => window.GardenApp.execute({ type: "multiplySpecimen", specimenId: id, x: 1, z: 1 }),
        rainelleId,
      );
      assert.equal(refusal.ok, false);
      assert.equal(refusal.message, "Spécimen source inconnu.");
      const afterRefusal = await p.evaluate(
        (id) => ({
          specimens: window.GardenApp.game.s.specimens.length,
          manualInterventions: window.GardenApp.game.s.campaignMemory.manualInterventions,
          geste: JSON.stringify(
            window.GardenApp.game.s.rainelles.find((r) => r.id === id).geste,
          ),
        }),
        rainelleId,
      );
      assert.deepEqual(
        afterRefusal,
        beforeRefusal,
        "une commande refusée ne devient jamais un dommage fictif attribué au joueur (design §11/§16)",
      );

      // ---- Revalidation §16 ("aucune commande, récolte, nuit ou naissance ne crédite deux fois
      // ses résultats après sauvegarde et reprise") : une vraie reprise, pas seulement une
      // resérialisation Node — une page fraîche, un contexte de navigateur neuf, chargée depuis
      // exactement le dernier A.save() réussi de cette partie. Écart de méthode découvert et
      // corrigé ici, documenté plutôt que deviné : un premier essai utilisait page.reload() sur la
      // même page — cette page garde sa propre boucle de rendu réelle vivante pendant la
      // navigation (pagehide/visibilitychange déclenchent leur propre A.save() en tâche de fond,
      // C2.1/garden-boot.js), ce qui a fait courir une vraie course avec le rechargement lui-même
      // et perdu des faits déjà sauvegardés — pas un défaut du jeu, un artefact de la méthode de
      // test. Fermer `p` d'abord (arrête sa boucle) puis ouvrir une page neuve dans un contexte
      // neuf sur la même sauvegarde élimine cette course entièrement : c'est aussi un modèle plus
      // fidèle de « fermer le jeu puis le reprendre » que la navigation d'un même onglet.
      const finalRaw = await p.evaluate(() => localStorage.getItem("edwin-garden-v3"));
      const finalSaved = JSON.parse(finalRaw);
      assert.deepEqual(errors, [], "no console/page error: " + errors.join(" | "));
      await p.close();

      const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
      const p2 = await ctx.newPage();
      const errors2 = [];
      p2.on("pageerror", (e) => errors2.push(e.message));
      p2.on("console", (m) => {
        if (m.type() === "error") errors2.push(m.text());
      });
      await p2.addInitScript((s) => {
        localStorage.setItem("edwin-garden-v3", s);
      }, finalRaw);
      await p2.goto(url, { waitUntil: "domcontentloaded" });
      await p2.waitForFunction(() => window.GardenApp && window.GardenApp.view, null, {
        timeout: 30000,
      });
      await p2.waitForTimeout(300);
      const resumed = await p2.evaluate(() => ({
        flags: window.GardenApp.game.s.campaignFlags.slice().sort(),
        overexertion: window.GardenApp.game.s.campaignMemory.overexertion,
        births: window.GardenApp.game.s.campaignMemory.births.slice(),
        waterWithdrawals: window.GardenApp.game.s.campaignMemory.waterWithdrawals,
      }));
      assert.deepEqual(
        resumed.flags,
        finalSaved.campaignFlags.slice().sort(),
        "la reprise restaure exactement les faits déjà révélés, sans en perdre ni en dupliquer (design §16)",
      );
      assert.deepEqual(
        resumed.overexertion,
        finalSaved.campaignMemory.overexertion,
        "la reprise ne crédite ni ne perd la sursollicitation déjà consignée",
      );
      assert.deepEqual(
        resumed.births,
        finalSaved.campaignMemory.births,
        "la reprise ne duplique aucune naissance déjà consignée",
      );
      assert.deepEqual(
        resumed.waterWithdrawals,
        finalSaved.campaignMemory.waterWithdrawals,
        "la reprise ne crédite ni ne perd les prélèvements déjà consignés (veilleuse et prise déjà coupées, aucune dérive de fond possible)",
      );

      assert.deepEqual(errors2, [], "no console/page error: " + errors2.join(" | "));
      await p2.close();
    }

    console.log(
      "PASS campaign phase 5 gate (réelle, C5.15): une partie attentive de dix nuits réelles, résolues une par une par le vrai dispatch(\"confirm-night\"), ne déclenche jamais de panneau/scène/baisse du bassin commun ; une partie intensive déclenche la mise en scène réelle de persistance (panneau + caméra + texte, capture archivée) puis, après retour au repos réel, celle de réparation, sans jamais faire remonter le bassin commun ; interrompre une scène ne mute rien d'autre ; une commande refusée (multiplySpecimen sur une Rainelle) ne bouge aucun compteur ; un rechargement réel de page ne crédite ni ne perd rien. Zéro erreur console sur les deux parties.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error("FAIL campaign-phase5-gate-reelle:", e.message);
  process.exit(1);
});
