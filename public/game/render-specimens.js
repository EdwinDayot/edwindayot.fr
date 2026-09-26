/* Persistent rendering of cultivar specimens (s.specimens), epic C7.4 (docs/campagne-backlog.md).
   Mirrors render-rainelles.js in spirit — a module dedicated to this one rendering concern, never
   mixed into render-houses.js/render-rainelles.js — but, unlike that module, owns its own
   synchronisation function rather than leaving the registry loop inline in render-flow.js: a
   specimen's Group must be entirely rebuilt (never mutated) whenever its derived growth stage
   changes, a piece of logic specific enough to this one registry that keeping it here, tested
   directly in Node (tests/campaign-specimen-render.cjs), is clearer than duplicating it inline.

   No new geometry/material cache of its own: every Group comes from botany-hybrids.js's own
   buildSpecimenGroup(cultivar, stage), the exact function already used for the six founder
   species (C1.7/C1.8) and, until this epic, only ever built transiently for the epilogue scene
   (render-items.js's beginEpilogueScene — corrected by this same epic to read the derived stage
   too, see that file's own comment). Two specimens of the same cultivar at the same stage already
   share geometry/material objects via that function's own cache — nothing here duplicates that
   guarantee (direction-artistique.md: "un cultivar = une signature visuelle réutilisée").

   Self-contained beyond THREE and its two sibling modules (botany-hybrids.js, cultivars.js,
   terrain.js), so this loads and runs identically in a plain Node vm sandbox and in the browser —
   same posture render-rainelles.js's own header already documents for the same reason. */
(function (root) {
  const T = root.THREE;
  if (!T) return;
  const Hybrids =
    typeof module !== "undefined" ? require("./botany-hybrids.js") : root.GardenBotanyHybrids;
  const Cultivars =
    typeof module !== "undefined" ? require("./cultivars.js") : root.GardenCultivars;
  const Terrain =
    typeof module !== "undefined" ? require("./terrain.js") : root.GardenTerrain;
  if (!Hybrids || !Cultivars || !Terrain) return;

  // registry: a Map id -> { group }, owned by the caller (render.js's this.specimenModels, one
  // entry per s.specimens element) — same convention as this.rainelleModels/this.stationModels.
  // scene: the THREE.Scene (or any object exposing add/remove) Groups are added to/removed from.
  // s: the live GardenState save (s.specimens/s.cultivars).
  //
  // Each call: removes the Group of any specimen no longer in s.specimens (delivered via a
  // contract, garden-state-cmd-r.js's deliverContract — the only site that ever shortens
  // s.specimens, verified before writing this module); builds the Group of any new specimen id;
  // rebuilds ENTIRELY (never mutates in place — buildSpecimenGroup cannot change its own stage
  // after construction) the Group of any specimen whose derived stage
  // (Cultivars.specimenStage(s, specimen), never the raw specimen.stage field, stale since C7.2)
  // no longer matches the stage already recorded on group.userData by buildSpecimenGroup itself —
  // never a second, duplicated tracking field. A specimen whose cultivar cannot be resolved yet
  // is skipped, same defensive posture render-flow.js's own Rainelle sync already uses for the
  // same situation.
  function syncSpecimenModels(registry, scene, s) {
    const liveIds = new Set(s.specimens.map((sp) => sp.id));
    for (const [id, sm] of registry) {
      if (!liveIds.has(id)) {
        scene.remove(sm.group);
        registry.delete(id);
      }
    }
    for (const specimen of s.specimens) {
      const cultivar = s.cultivars.find((c) => c.id === specimen.cultivarId);
      if (!cultivar) continue;
      const stage = Cultivars.specimenStage(s, specimen);
      let sm = registry.get(specimen.id);
      if (sm && sm.group.userData.stage !== stage) {
        scene.remove(sm.group);
        registry.delete(specimen.id);
        sm = null;
      }
      if (!sm) {
        const group = Hybrids.buildSpecimenGroup(cultivar, stage);
        scene.add(group);
        sm = { group };
        registry.set(specimen.id, sm);
      }
      sm.group.position.set(
        specimen.x,
        Terrain.terrainHeight(specimen.x, specimen.z),
        specimen.z,
      );
    }
  }

  const api = { syncSpecimenModels };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderSpecimens = api;
})(typeof window !== "undefined" ? window : globalThis);
