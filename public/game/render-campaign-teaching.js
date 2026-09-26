/* Rendering of a "reviewing" teaching draft's real-world trajectory (campaign-teaching-
   trajectory.js's resolveTrajectory, epic C2.5v-a) — epic C2.5v-b, docs/campagne-backlog.md.

   Self-contained on purpose, exactly like render-campaign-stations.js/render-campaign-house.js:
   only THREE is required, so this loads and runs identically in a plain Node vm sandbox (see
   tests/campaign-teaching-render.cjs) and in the browser (tests/garden-material-audit.cjs's own
   new block, campaign-teaching-screen-browser.cjs). It never resolves a trajectory itself and
   never touches game state — the caller (render-flow.js's sync()) already has the real
   resolveTrajectory() result and this module's only job is turning a flat list of already-
   resolved world points into a Group.

   Direction artistique (docs/direction-artistique.md, "Vérification"): this overlay is the exact
   same visual family as the "survol de portée" ground overlays already whitelisted in
   tests/garden-material-audit.cjs's TRANSPARENT_ALLOWLIST — color 0x6d9365, opacity capped at
   0.15. Deliberately the SAME hex and the SAME opacity ceiling, not merely a similar green: this
   is a reuse of that existing entry, not a new material category, so no new allowlist entry is
   added for it (the mandate's own "jamais en assouplissant une règle existante" cuts both ways —
   reusing the exact documented values is the safest way to honor it). Mat, non-metallic
   (`metalness: 0`), matching direction-artistique.md's "jamais métalliques" rule; no emissive
   component (emissive is reserved for a working signal, not a preview overlay). */
(function (root) {
  const T = root.THREE;
  if (!T) return;

  // Exact reuse of the already-whitelisted "vision-radius ground overlay" family (see header
  // comment) — never a new hue, never a higher opacity.
  const TRAJECTORY_COLOR = 0x6d9365;
  const TRAJECTORY_OPACITY = 0.12;
  // Slightly under the 0.5 half-unit grid spacing (construction.js's own navigation grid) so
  // adjacent tiles read as a continuous ribbon rather than seam-fighting at the edges.
  const CELL_SIZE = 0.42;

  let sharedGeometry = null;
  function geometry() {
    if (!sharedGeometry) sharedGeometry = new T.PlaneGeometry(CELL_SIZE, CELL_SIZE);
    return sharedGeometry;
  }
  let sharedMaterial = null;
  function material() {
    if (!sharedMaterial)
      sharedMaterial = new T.MeshStandardMaterial({
        color: TRAJECTORY_COLOR,
        roughness: 0.48, // feuillage's own documented upper bound (direction-artistique.md)
        metalness: 0,
        transparent: true,
        opacity: TRAJECTORY_OPACITY,
        depthWrite: false,
        side: T.DoubleSide,
      });
    return sharedMaterial;
  }

  // `cells`: an array of already-resolved WORLD points `{x, y, z}` (y already includes terrain
  // height plus a small lift, computed by the caller — this module has no GardenTerrain
  // dependency on purpose, same posture as render-campaign-stations.js's own header comment).
  // One flat, ground-hugging tile per cell — "overlay simple", never a sculpted ribbon mesh.
  function buildTrajectoryOverlayGroup(cells) {
    const group = new T.Group();
    group.name = "campaign-teaching-trajectory";
    const geo = geometry(),
      mat = material();
    for (const cell of cells) {
      const tile = new T.Mesh(geo, mat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(cell.x, cell.y, cell.z);
      tile.castShadow = false;
      tile.receiveShadow = false;
      group.add(tile);
    }
    return group;
  }

  const api = { buildTrajectoryOverlayGroup, TRAJECTORY_COLOR, TRAJECTORY_OPACITY };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderCampaignTeaching = api;
})(typeof window !== "undefined" ? window : globalThis);
