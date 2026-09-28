/* Campaign stations registry rendering sync loop, epic C5.13 (docs/campagne-backlog.md), moved
   into its own module by epic C7.22 for the exact reason render-rainelles.js's own
   syncRainelleModels/render-specimens.js's own syncSpecimenModels already give in their headers:
   a registry-sync loop specific enough to be exercised directly in Node
   (tests/campaign-station-relocate-render.cjs) rather than only through a live page.

   Group built once per station id and cached by the caller (render.js's `this.stationModels`) —
   the exact "build once, reposition/update on real change, never rebuild every frame" pattern
   render-rainelles.js/render-specimens.js already use. `Stations.relocateStation` (C7.18) can
   change a borne/zone/panier's x/z after registration (a habitat is never relocatable, see that
   function's own header), so this compares the cached position against the current one on every
   call and repositions the existing Group in place — never rebuilds it, since no shape/material
   change is ever implied by a plain move, unlike a specimen's stage change — when it actually
   changed. `updateStationGroup` below still runs every call but is a no-op unless a borne's
   `priseFortDebit`/a zone's `veilleuse` actually flipped since the group was last built (already
   true before this epic, unchanged here).

   Returns { batchDirty }, since render-flow.js's `this.batchDirty = true` on a newly built/removed
   Group is a caller-owned field this module has no access to — same convention syncRainelleModels
   already uses for the same reason. A plain reposition never sets batchDirty (byte-for-byte the
   pre-epic behaviour, which never repositioned at all and so never touched it either). */
(function (root) {
  const T = root.THREE;
  if (!T) return;
  const RenderStations =
    typeof module !== "undefined" ? require("./render-campaign-stations.js") : root.GardenRenderCampaignStations;
  const Terrain = typeof module !== "undefined" ? require("./terrain.js") : root.GardenTerrain;
  if (!RenderStations || !Terrain) return;

  const COLLECTION_OF = { borne: "bornes", zone: "zones", panier: "paniers", habitat: "habitats" };

  function syncStationModels(stationModels, scene, s) {
    let batchDirty = false;
    if (!s.campaignStations) return { batchDirty };
    const liveIds = new Set();
    for (const kind of Object.keys(COLLECTION_OF)) {
      for (const station of s.campaignStations[COLLECTION_OF[kind]] || []) {
        liveIds.add(station.id);
        let sm = stationModels.get(station.id);
        if (!sm) {
          const group = RenderStations.buildStationGroup(kind, station);
          group.position.set(station.x, Terrain.terrainHeight(station.x, station.z), station.z);
          scene.add(group);
          sm = { kind, group, x: station.x, z: station.z };
          stationModels.set(station.id, sm);
          batchDirty = true;
        } else if (sm.x !== station.x || sm.z !== station.z) {
          sm.group.position.set(station.x, Terrain.terrainHeight(station.x, station.z), station.z);
          sm.x = station.x;
          sm.z = station.z;
        }
        RenderStations.updateStationGroup(kind, station, sm.group);
      }
    }
    for (const [id, sm] of stationModels) {
      if (!liveIds.has(id)) {
        scene.remove(sm.group);
        stationModels.delete(id);
        batchDirty = true;
      }
    }
    return { batchDirty };
  }

  const api = { syncStationModels };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderStationsSync = api;
})(typeof window !== "undefined" ? window : globalThis);
