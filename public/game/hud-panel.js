(() => {
  const D = GardenData,
    G = window.GardenHUD;
  if (!D || !G) return;
  Object.assign(G.prototype, {
    buildPanelRows(m, w, x, y, pw, ph, p) {
      const rows = [];
      if (m.panel === "nursery") {
        for (const sp of D.species) {
          const n = m.s.inventory["cutting:" + sp.id] || 0;
          if (n)
            rows.push({
              title: sp.name + " · " + n + " boutures",
              detail:
                m.cutting === sp.id
                  ? "Une bouture sera consommée · 3 minutes"
                  : "Choisir cette espèce",
              action:
                m.cutting === sp.id ? "confirm-cutting" : "choose-cutting",
              data: { species: sp.id },
            });
        }
        if (!rows.length)
          rows.push({
            title: "Aucune bouture dans le sac",
            detail: "Récolte une plante qui produit des boutures.",
          });
      } else if (m.panel === "shop") {
        const building = D.buildings.find(
          (b) => b.visitorId === m.selected?.id,
        );
        for (const ware of building?.roleData?.wares || []) {
          const recipe = D.recipes[ware.item],
            affordable = Object.entries(ware.cost).every(
              ([k, n]) => (m.s.inventory[k] || 0) >= n,
            );
          rows.push({
            title: recipe.name,
            detail: Object.entries(ware.cost)
              .map(([k, n]) => `${n} ${D.itemName(k)}`)
              .join(", "),
            action: "buy",
            data: { vendor: building.visitorId, item: ware.item },
            disabled: !affordable,
          });
        }
        if (!rows.length)
          rows.push({
            title: "Rien en vitrine",
            detail: "Repasse une prochaine fois.",
          });
      } else if (m.panel === "quest") {
        const npcId = m.selected?.id;
        for (const [id, quest] of Object.entries(D.quests)) {
          if (
            quest.npcId !== npcId ||
            m.s.quests.completed.includes(id) ||
            !quest.requires.every((r) => m.s.quests.completed.includes(r))
          )
            continue;
          const active = m.s.quests.active.find((q) => q.questId === id);
          if (!active) {
            rows.push({
              title: quest.title,
              detail: "Disponible",
              action: "quest-accept",
              data: { questId: id },
            });
            continue;
          }
          const { progress, complete } = GardenQuests.evaluateObjective(
            quest.objective,
            m.s,
            active,
          );
          rows.push({
            title: quest.title,
            detail: complete
              ? "Objectif atteint !"
              : `En cours · ${Math.round(progress * 100)}%`,
            action: "quest-complete",
            data: { questId: id },
            disabled: !complete,
          });
        }
        if (!rows.length)
          rows.push({
            title: "Rien pour l’instant",
            detail: "Repasse plus tard.",
          });
      } else if (m.panel === "map") {
        rows.push({
          title: "Le ponton",
          detail: "Eau gratuite · remplir l’arrosoir",
          action: "go",
          data: { id: "river" },
        });
        for (const v of D.visitors)
          rows.push({
            title: "Rendez-vous · " + v.name.split(" · ")[0],
            detail: `${Math.round(GardenConstruction.distance(v, this.view.position))} unités`,
            action: "go",
            data: { id: v.id },
          });
        for (const z of D.zones) {
          if (!m.s.unlocked.includes(z.id))
            rows.push({
              title: z.name,
              detail:
                "Passage à ouvrir · " +
                Object.entries(z.cost)
                  .map(([k, n]) => `${n} ${D.itemName(k)}`)
                  .join(", "),
              action: "go",
              data: { id: "zone-" + z.id },
            });
          else {
            for (const r of m.s.resources.filter(
              (r) =>
                r.zone === z.id && GardenConstruction.resourceClear(m.s, r),
            ))
              rows.push({
                title: D.mining[r.type].name + " · " + z.name,
                detail:
                  r.ready > m.s.elapsed
                    ? "Renouvellement · " +
                      Math.ceil(r.ready - m.s.elapsed) +
                      " s"
                    : D.tools[D.mining[r.type].tool] +
                      " · 3 " +
                      D.itemName(r.type),
                action: "go",
                data: { id: r.id },
              });
            for (const cache of D.caches.filter(
              (q) => q.zone === z.id && !m.s.discovered.includes(q.species),
            ))
              rows.push({
                title: "Cache botanique · " + z.name,
                detail: "Une nouvelle espèce",
                action: "go",
                data: { id: cache.id },
              });
          }
        }
      } else if (m.panel === "notebook") {
        // Epic C1.4: pending campaign cultivars (a "disposition" not yet chosen) come first, each
        // spread over three rows since a generic row only carries two buttons (action +
        // alternate) — see the commit message for this epic for why five actions (keep, store,
        // give, compost, rename) don't fit two rows here, unlike C1.3's own two-button panels.
        const Genetics = window.GardenGenetics;
        const AXIS_LABELS = {
          port: "port",
          feuilles: "feuillage",
          fleurs: "floraison",
          palette: "palette",
          humidite: "humidité",
          fonction: "fonction",
        };
        const founderName = (id) =>
          Genetics?.founders.find((f) => f.id === id)?.name || id;
        const differingAxes = (traits, parentId) => {
          const parent = Genetics?.founders.find((f) => f.id === parentId);
          if (!parent) return [];
          return Object.keys(AXIS_LABELS)
            .filter(
              (axis) =>
                JSON.stringify(traits[axis]) !==
                JSON.stringify(parent.traits[axis]),
            )
            .map((axis) => AXIS_LABELS[axis]);
        };
        for (const cv of m.s.cultivars.filter(
          (c) => c.disposition === undefined,
        )) {
          const [a, b] = cv.parentIds,
            title = cv.name || "Nouveau résultat (sans nom)",
            diffA = differingAxes(cv.traits, a),
            diffB = differingAxes(cv.traits, b);
          rows.push({
            title,
            detail:
              `Issu de ${founderName(a)} × ${founderName(b)}. ` +
              `Diffère de ${founderName(a)} sur ${diffA.length ? diffA.join(", ") : "rien"} ; ` +
              `de ${founderName(b)} sur ${diffB.length ? diffB.join(", ") : "rien"}.`,
            action: "keep-cultivar",
            alternate: { action: "store-cultivar", data: { id: cv.id } },
            data: { id: cv.id },
          });
          rows.push({
            title,
            detail:
              "Donner ou composter : le carnet garde la découverte dans tous les cas.",
            action: "give-cultivar",
            alternate: { action: "compost-cultivar", data: { id: cv.id } },
            data: { id: cv.id },
          });
          rows.push({
            title,
            detail: "Choisir un nom pour ce résultat.",
            action: "rename-cultivar",
            data: { id: cv.id },
          });
        }
        for (const sp of D.species) {
          const known = m.s.discovered.includes(sp.id);
          rows.push({
            title: known ? sp.name : "Espèce inconnue",
            detail: known
              ? `${sp.light} · ${D.zones[sp.zone].name} · adulte en ${Math.round(sp.grow / 60)} min`
              : "Une cache dans " + D.zones[sp.zone].name,
            action: known ? "inspect" : null,
            data: { species: sp.id },
          });
        }
        // Epic C4.1: once-only narrative texts already revealed (data-narrative.js), listed
        // read-only — no action, same "no button" posture as an unknown species row above.
        const Narrative = window.GardenNarrative;
        for (const flag of m.s.campaignFlags || []) {
          const entry = Narrative?.TEXTS[flag];
          if (entry)
            rows.push({ title: entry.title, detail: entry.text, action: null });
        }
      } else if (m.panel === "nightfall") {
        // Epic C2.2v (design §3: "le jeu propose de préparer ou de confirmer le pot dans un
        // écran suspendu... il reste possible de ne rien croiser"). Shows whatever sowPot
        // (C1.3) already put in s.campaignPot.pending, informationally, then offers the one
        // real action this epic's own mandate scopes for this screen: confirm and sleep.
        // sowPot itself has no HUD panel/dispatch call site anywhere in the game yet (a
        // species-picker to *change* the pot from here is a separate, larger feature, not
        // built by this epic) — "leave it empty" is already true whenever nothing was sown,
        // which confirming here simply accepts rather than blocking on.
        const Genetics = window.GardenGenetics,
          founderName = (id) =>
            Genetics?.founders.find((f) => f.id === id)?.name || id;
        if (m.s.campaignPot.pending.length)
          for (const pair of m.s.campaignPot.pending)
            rows.push({
              title: founderName(pair.a) + " × " + founderName(pair.b),
              detail: "Résultat au réveil, dans le pot.",
            });
        else
          rows.push({
            title: "Le pot est vide",
            detail: "Il reste possible de ne rien croiser cette nuit.",
          });
        rows.push({
          title: "La nuit tombe",
          detail: "Le personnage rejoint la maison refuge.",
          action: "confirm-night",
        });
      } else if (m.panel === "gesture-scene") {
        // Epic C5.14 (design §11/ch.14, mise en scène observable de la persistance et de la
        // réparation). Read-only: this panel exists to hold the exact narrative text already
        // revealed this same night by garden-state-cmd-f.js (C5.6/C5.7, data-narrative.js) on
        // screen while render-items.js's beginGestureScene() (started by garden-dispatch.js's
        // "confirm-night", right before this panel opens) keeps the camera framing the Rainelle
        // concerned — never a second, independent text. No bespoke "skip" button: Échap already
        // closes any panel (garden-structure.md) and ends the scene the same way
        // (garden-cmd.js's closePanel calling endGestureScene).
        const Narrative = window.GardenNarrative;
        const entry =
          Narrative?.TEXTS[
            m.gestureScene?.kind === "reparation"
              ? "geste-qui-sarrete"
              : "persistance-geste-vide"
          ];
        if (entry) rows.push({ title: entry.title, detail: entry.text });
      } else if (m.panel === "teaching") {
        // Epic C2.5v-b (design §5's own "quatre moments" screen, deferred from C2.5 — see
        // garden-state-cmd-k.js's header comment): the three literal rendering clauses C2.5v's
        // status names — phrase display/correction, real-world trajectory preview, camera scene —
        // all read straight from the real command state (s.campaignTeaching), never a duplicate.
        // The camera scene itself (beginGestureScene/endGestureScene, C5.14) and the trajectory
        // overlay (render-flow.js's sync()) are wired at their own call sites, not from here — this
        // function only ever builds rows, same separation every other panel branch keeps.
        const teaching = m.s.campaignTeaching;
        if (!teaching)
          rows.push({
            title: "Aucune leçon en cours",
            detail: "Reviens depuis le panneau d'observation, ligne d'une Rainelle.",
          });
        else {
          const rainelle = m.s.rainelles.find((r) => r.id === teaching.rainelleId);
          rows.push({
            title: `« Regarde-moi » — ${rainelle?.name || teaching.rainelleId}`,
            detail: "Le temps s'arrête le temps de la leçon.",
          });
          if (teaching.step === "watching") {
            const Rainelles = window.GardenRainelles,
              draft = m.teachingDraft || {};
            rows.push({
              title: "Verbe",
              detail: draft.verbe || "(à choisir)",
              action: "teaching-cycle-verb",
            });
            for (const [field, label] of [
              ["poste", "Poste"],
              ["source", "Source"],
              ["destination", "Destination"],
              ["condition", "Condition (optionnelle)"],
            ])
              rows.push({
                title: label,
                detail: draft[field] || "(vide)",
                action: "teaching-edit-field",
                data: { field },
              });
            // Epic C2.6a's own gap (still true today, see its header comment): poste/source/
            // destination/condition are free text, never validated against the real station
            // registry — this read-only reference row is the cheapest way to give a player
            // something correct to type without building a new in-world selection mechanism the
            // criterion doesn't ask for.
            const St = m.s.campaignStations,
              ids = (arr) => (arr.length ? arr.map((x) => x.id).join(", ") : "aucune");
            rows.push({
              title: "Stations connues",
              detail: `Bornes : ${ids(St.bornes)}. Zones : ${ids(St.zones)}. Paniers : ${ids(St.paniers)}.`,
            });
            rows.push({
              title: "Démontrer le geste",
              detail: "Propose une phrase et un essai de trajectoire, à corriger ensuite.",
              action: "demonstrate-teaching",
              disabled:
                !Rainelles.VERBS.includes(draft.verbe) ||
                !draft.poste ||
                !draft.source ||
                !draft.destination,
            });
          } else {
            const Trajectory = window.GardenCampaignTeachingTrajectory,
              resolved = Trajectory
                ? Trajectory.resolveTrajectory(m.s, teaching.draft.trajectory)
                : { ok: false, error: "" };
            rows.push({
              title: "Phrase proposée",
              detail: teaching.draft.phrase,
              action: "revise-phrase-edit",
            });
            rows.push({
              title: "Trajectoire dans le monde",
              detail: resolved.ok
                ? `Visible au sol, en surbrillance (${resolved.points.length} étape(s)).`
                : `Non localisable pour l'instant : ${resolved.error}`,
            });
            rows.push({
              title: "Confirmer l'enseignement",
              detail: "Applique le geste à la Rainelle et reprend le temps.",
              action: "confirm-teaching",
            });
          }
          rows.push({
            title: "Annuler la leçon",
            detail: "Reprend le temps sans rien enseigner.",
            action: "cancel-teaching",
          });
        }
      } else if (m.panel === "visitor")
        for (const r of m.s.requests)
          rows.push({
            title: `${r.quantity} ${D.itemName(r.item)}`,
            detail: `En réserve : ${m.s.inventory[r.item] || 0} · 18 feuilles + une graine`,
            action: "trade",
            data: { request: r.id },
            alternate: {
              action: "replace",
              label: "Remplacer",
              data: { request: r.id },
            },
            disabled: (m.s.inventory[r.item] || 0) < r.quantity,
          });
      else if (m.panel === "observation") {
        // Epic C2.9 (design §5, "Le mode d'observation montre chemins, transferts et cadence par
        // journée. Il permet de suivre un objet du plant au présentoir et de lancer un cycle pas
        // à pas."). See campaign-observation.js's own header comment for the documented scope
        // gap (no présentoir/point-of-sale station kind exists yet — "sa dernière station réelle"
        // stands in for "le présentoir"). Every row here is read-only: building this list, even
        // repeatedly across draws, never mutates m.s (proven in tests/campaign-observation.cjs),
        // and opening this panel is already paused like any other panel (garden-frame.js's own
        // generic `!!A.panel` gate) — nothing below advances the simulation itself.
        //
        // Memoized on `s.elapsed` (garden-state.js's own per-tick counter, incremented exactly
        // once per real simulation tick, never touched by drawing): draw() runs every animation
        // frame regardless of pause state (garden-frame.js), but observedPaths recomputes a real
        // grid BFS per positioned Rainelle (RainelleMovement.routeTo -> GardenConstruction.path) —
        // routeTo's own "no caching" design assumes a caller on the tick itself, not one redrawn
        // at 60Hz. `s.elapsed` is unchanged between two frames of the same tick (in particular the
        // whole time this panel sits open while the game is paused, its main use case for
        // stepping), so recomputing only when it actually moves loses no accuracy and matches
        // rainelle-movement.js's own recomputation cadence instead of outpacing it.
        //
        // Epic C2.5v-b: the real trigger the mandate requires ("un vrai point de déclenchement...
        // probablement une action depuis la ligne d'une Rainelle dans le panneau d'observation") —
        // one row per Rainelle, never memoized with the rest of this panel below (its `disabled`
        // state depends on m.s.campaignTeaching, which can flip without s.elapsed moving, exactly
        // the same reason the step button below stays outside the elapsed-memoized cache too).
        for (const r of m.s.rainelles)
          rows.push({
            title: `Rainelle ${r.name || r.id}`,
            detail: r.geste
              ? `Geste appris : ${r.geste.verbe}. « Regarde-moi » pour lui en enseigner un autre.`
              : "Aucun geste appris pour l'instant. « Regarde-moi » pour lui en enseigner un.",
            action: "begin-teaching",
            data: { id: r.id },
            disabled: !!m.s.campaignTeaching,
          });
        // Epic C6.2: the transfer rows built into the cache below already display veilleuse/
        // priseFortDebit (design §5's "un mode d'observation en lecture seule" — C2.9), but no
        // command ever reached them (verified: no setVeilleuse/setPriseFortDebit call site in
        // this file before this epic) — the exact same "moteur posé avant l'écran qui l'atteint"
        // gap C2.5v-b already closed for teaching. Kept out of the elapsed-memoized cache below
        // for the same reason as the Rainelle rows just above: setVeilleuse/setPriseFortDebit
        // (garden-state-cmd-p.js/-q.js) never advance s.elapsed themselves (only a real tick
        // does), so a row cached on s.elapsed would keep showing the pre-click label until the
        // next tick landed instead of reflecting the click immediately.
        for (const zone of m.s.campaignStations.zones)
          rows.push({
            title: `Zone ${zone.id} — veilleuse`,
            detail: zone.veilleuse
              ? "Allumée : la zone continue de travailler la nuit."
              : "Éteinte : la zone se repose la nuit.",
            action: "toggle-veilleuse",
            data: { zoneId: zone.id, active: !zone.veilleuse },
            buttonLabel: zone.veilleuse ? "Éteindre" : "Allumer",
          });
        for (const borne of m.s.campaignStations.bornes)
          rows.push({
            title: `Borne ${borne.id} — prise à fort débit`,
            detail: borne.priseFortDebit
              ? "Activée : le débit augmente au prix du bassin commun."
              : "Désactivée : débit normal, le bassin commun ne baisse pas pour cette borne.",
            action: "toggle-prise-fort-debit",
            data: { borneId: borne.id, active: !borne.priseFortDebit },
            buttonLabel: borne.priseFortDebit ? "Éteindre" : "Allumer",
          });
        if (!this._observationCache || this._observationCache.elapsed !== m.s.elapsed) {
          const Observation = window.GardenCampaignObservation;
          const KIND_LABELS = { borne: "Borne", zone: "Zone", panier: "Panier" };
          const obsRows = [];
          for (const path of Observation.observedPaths(m.s))
            obsRows.push({
              title: `${path.rainelleId} — ${path.location === "poste" ? "en route vers son poste" : "en route vers l'habitat"}`,
              detail: `${path.statusMessage} Prochaine cellule : ${
                path.route.length
                  ? `(${path.route[0].x}, ${path.route[0].z}) · ${path.route.length} pas restants`
                  : "déjà arrivée."
              }`,
            });
          for (const transfer of Observation.observedTransfers(m.s)) {
            const who = transfer.rainelles.length
              ? transfer.rainelles
                  .map((r) => `${r.rainelleId} (${r.role} · ${r.status})`)
                  .join(", ")
              : "Aucune Rainelle assignée.";
            const state =
              transfer.kind === "panier"
                ? `Stock : ${transfer.total}/${transfer.capacity} (seuil ${transfer.min}).`
                : transfer.kind === "zone"
                  ? `Veilleuse : ${transfer.veilleuse ? "allumée" : "éteinte"}.`
                  : `Prise à fort débit : ${transfer.priseFortDebit ? "activée" : "désactivée"}.`;
            obsRows.push({
              title: `${KIND_LABELS[transfer.kind]} ${transfer.id}`,
              detail: `${state} ${who}`,
            });
          }
          for (const cadence of Observation.observedCadence(m.s))
            obsRows.push({
              title: `${cadence.rainelleId} — cadence`,
              detail: `${cadence.nightlyActivity} nuit(s) de travail réel sur ${cadence.campaignDay} jour(s) · ${cadence.perDay.toFixed(2)} nuit(s)/jour.`,
            });
          for (const zone of m.s.campaignStations.zones) {
            const chain = Observation.resolveChainEnd(m.s, zone.id);
            if (chain.ok && chain.chain.length)
              obsRows.push({
                title: `Chaîne depuis la zone ${zone.id}`,
                detail: `${[zone.id, ...chain.chain].join(" → ")} · dernière station réelle : ${chain.endId}.`,
              });
          }
          if (!obsRows.length)
            obsRows.push({
              title: "Rien à observer pour l'instant",
              detail: "Enseigne un geste ou pose une station pour voir apparaître des chemins.",
            });
          this._observationCache = { elapsed: m.s.elapsed, rows: obsRows };
        }
        // The step button's own enabled state depends on `m.paused`, which can change without
        // `s.elapsed` moving (pausing itself never ticks) — kept out of the cached rows so toggling
        // pause updates it immediately rather than waiting for the next tick's cache miss.
        rows.push(...this._observationCache.rows, {
          title: `Cycle pas à pas (${window.GardenCampaignObservation.CYCLE_SECONDS} s)`,
          detail: m.paused
            ? "Avance la simulation d'exactement un cycle."
            : "Mets le jeu en pause pour avancer pas à pas.",
          action: "observation-step",
          disabled: !m.paused,
        });
      } else if (m.panel === "reserve") {
        for (const e of m.s.entities.filter((e) => e.stored))
          rows.push({
            title: D.recipes[e.type].name,
            detail: e.job
              ? D.species.find((sp) => sp.id === e.job.species).name +
                (e.job.remaining === 0
                  ? " · prêt à récupérer"
                  : " · en pause, " + Math.ceil(e.job.remaining) + " s")
              : e.plant
                ? D.species.find((sp) => sp.id === e.plant.species).name +
                  " · conservée intacte"
                : "Prêt à replacer",
            action: "restore",
            data: { id: e.id },
          });
      } else if (m.panel === "settings") {
        for (const [key, label] of [
          ["sound", "Sons et ambiance"],
          ["hints", "Indications"],
          ["reduced", "Réduire les mouvements"],
        ])
          rows.push({
            title: label,
            detail: m.s.settings[key] ? "Activé" : "Désactivé",
            action: "setting",
            data: { key },
          });
        rows.push(
          {
            title: m.paused ? "Reprendre" : "Mettre en pause",
            detail: "Les plantes ne meurent jamais",
            action: "pause",
          },
          ...["export", "import", "backup", "rescue"].map((id) => ({
            title: {
              export: "Exporter la partie",
              import: "Importer une partie",
              backup: "Restaurer la copie précédente",
              rescue: "Paquet de secours",
            }[id],
            detail: {
              export: "Conserver un fichier JSON",
              import: m.importReady
                ? "Fichier valide · cliquer pour confirmer"
                : "Choisir un fichier JSON",
              backup: "La dernière sauvegarde valide",
              rescue: "Gratuit si aucune plante ou graine ne reste",
            }[id],
            action: id,
          })),
        );
      }
      return rows;
    },
  });
})();
