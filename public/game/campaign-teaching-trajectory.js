/* Campaign teaching trajectory: pure resolution of a taught gesture's planned trajectory into
   real world points and a continuous path, part of the campaign layer (UMD: node module /
   browser GardenCampaignTeachingTrajectory).

   Epic C2.5v-a, first volet of C2.5v's reformulation (see campagne-backlog.md's journal des
   décisions, 2026-09-20): C2.5's `draft.trajectory` (`Rainelles.plannedTrajectory`,
   garden-state-cmd-k.js) is only ever a list of station ids (source/poste/destination, filtered
   of consecutive duplicates) — nothing resolves those ids to real `{x,z}` points or a real path
   between them yet. This file is that resolution, and only that: showing it to a player (a HUD
   screen, a world overlay, a scripted camera) is deferred to C2.5v-b, on the same "rules before
   rendering" split already applied to C2.2/C2.2v, C2.5/C2.5v, C5.9/C5.10/C5.11 and C2.6/C2.6a-c —
   orchestration.md forbids proving a resolution rule and building the screen that displays it in
   the same epic.

   Never a second pathfinding algorithm: each leg between two consecutive trajectory points reuses
   `GardenConstruction.path(s, from, to)` directly — the exact same half-unit BFS grid already
   shared by player movement, Rainelle movement (`rainelle-movement.js`'s own `routeTo`) and
   `campaign-observation.js`'s `observedPaths` before it. `routeTo` itself is not called here
   because it resolves a *Rainelle's own current location target* (poste/habitat, via
   `targetPosition`) from her live position — this file instead resolves an arbitrary list of
   station ids from `draft.trajectory`, which may not even belong to the Rainelle who will
   eventually walk it (a lesson can be previewed before any Rainelle is assigned to it). Both
   ultimately bottom out in the same `Construction.path`, never a duplicate.

   Read-only: never mutates `s`, same guarantee as `campaign-observation.js`. */
(function (root) {
  const Construction =
    typeof module !== "undefined"
      ? require("./construction.js")
      : root.GardenConstruction;
  const Stations =
    typeof module !== "undefined"
      ? require("./campaign-stations.js")
      : root.GardenCampaignStations;

  // Resolves every id in `trajectory` (a `draft.trajectory` array, `Rainelles.plannedTrajectory`)
  // against the real station registry, then chains a continuous path of adjacent half-unit cells
  // between each consecutive pair of resolved points — never a single point-to-point path that
  // skips an intermediate step, and never a second pathfinding algorithm (see header comment).
  //
  // An id that resolves to no known borne/zone/panier/habitat (never registered, or removed since
  // the trajectory was planned) fails explicitly — `{ ok: false, error }` — rather than producing
  // a path with a silent gap or an `undefined` point. Two identical consecutive ids (a case
  // `plannedTrajectory` already filters before this function ever sees it, but never assumed here)
  // never produce a degenerate segment: `Construction.path(s, p, p)` already returns `[]` for a
  // "from" that is already "to" (its own documented behaviour, reused as-is, never special-cased
  // here) — the chain simply grows by nothing for that leg, not by a broken point.
  function resolveTrajectory(s, trajectory) {
    const points = [];
    for (const id of trajectory) {
      const resolved = Stations.resolveStation(s.campaignStations, id);
      if (!resolved.ok) {
        return {
          ok: false,
          error: `Étape de trajectoire inconnue : "${id}".`,
        };
      }
      points.push({ id, x: resolved.station.x, z: resolved.station.z });
    }
    const path = [];
    for (let i = 0; i < points.length - 1; i++) {
      const from = { x: points[i].x, z: points[i].z };
      const to = { x: points[i + 1].x, z: points[i + 1].z };
      path.push(...Construction.path(s, from, to));
    }
    return { ok: true, points, path };
  }

  const api = { resolveTrajectory };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignTeachingTrajectory = api;
})(globalThis);
