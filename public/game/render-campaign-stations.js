/* Rendering of the campaign stations registry — bornes, zones, paniers, habitats
   (campaign-stations.js, epics C2.6a/C3.3) — epic C5.13, docs/campagne-backlog.md.

   Verified before writing a single shape: `grep -rn "campaignStations\|CampaignStations"
   public/render*.js public/game/render*.js public/garden.js public/garden-frame.js` (outside
   campaign-stations.js itself) returned nothing — a borne/zone/panier/habitat has had a real
   `{x,z}` in the registry since C2.6a/C3.3, but no representation and no scene call site existed
   before this file (see the Cartographe's own fourth-lot note in campagne-backlog.md). No command
   places a station in a real save yet either (registerStation is only ever called from
   garden-state-validate.js's own migration and from tests) — this module renders whatever the
   registry holds today, and stays correct once a future epic wires real placement, exactly the
   same "posed, not yet driven by a player action" gap already documented at several other layers
   (specimens/rainelles at their own introduction).

   Self-contained on purpose, exactly like render-campaign-house.js/render-rainelles.js: only
   THREE is required, so this loads and runs identically in a plain Node vm sandbox (see the new
   block in tests/garden-material-audit.cjs) and in the browser.

   Silhouette per kind (direction-artistique.md: "la silhouette porte l'identité, pas la
   texture"), each built from simple primitives, never a sculpted mesh: a thin vertical post for a
   borne (pierre/eau families), a flat delimited plot with a low rail for a zone (terre/bois
   families), a low open vessel for a panier (bois families), a larger roofed structure for a
   habitat (pierre/bois families, coherent with the refuge house's own materials, C3.2) — four
   shapes distinct enough to read without a label, none sharing a silhouette with another kind.

   Colors are literal hex values already documented in direction-artistique.md's palette table —
   pierre (0xc5c5b2/0x8f8a76/0xa9afa2), bois/écorce (0xb99670/0x785a3e/0x5c4632), terre
   (0xb99875), eau (0x80c3c3) — plus two signal recipes reused VERBATIM from existing code rather
   than invented: the borne's "prise à fort débit" bead reuses render-flow.js's own irrigation-flow
   bead material (0xb2eff0 emissive 0x438e9b, intensity 0.35); the zone's "veilleuse" lamp reuses
   render-scene.js's own lantern tones (0xf2da9b emissive 0xffb85e, same intensity). Neither signal
   adds a real THREE.Light — both are emissive-only meshes, exactly like the irrigation bead they
   borrow from — so neither one enters the local-light-source budget direction-artistique.md
   requires an actual light source to count against ("une nouvelle source de lumière... doit
   entrer dans ce budget"): there is no new light source here, only an emissive material, the same
   distinction render-flow.js's own flowing-water bead already relies on.

   Roughness follows the values actually already in use in the codebase — garden-models.js's own
   default mat() roughness (0.72, used by every existing house/prop) for solids, render.js's own
   water material roughness (0.25) for the borne's bead — rather than the illustrative "0.15 to
   0.48" range direction-artistique.md quotes as "observed": that range is already not literally
   followed by existing code (render-campaign-house.js's own stone/wood is 0.72, verified before
   writing this comment), so this module matches the real precedent instead of the doc's
   illustrative numbers. metalness is 0 everywhere without exception, per that same guide's
   "jamais métalliques" rule.

   Only a borne's `priseFortDebit` and a zone's `veilleuse` are mutable after a station is
   registered today (campaign-stations.js's own schema); a panier's capacity/min and a habitat's
   capacity are set once at registration and never change, so buildPanierGroup/buildHabitatGroup
   take no reactive state and updateStationGroup() only ever touches a borne or a zone — a group is
   built once per station id and repositioned/updated on real state change only, never rebuilt
   every frame (same pattern as render-flow.js's own `this.rainelleModels`/`this.models`). */
(function (root) {
  const T = root.THREE;
  if (!T) return;

  const STONE = 0xc5c5b2,
    STONE_DARK = 0x8f8a76,
    STONE_MID = 0xa9afa2;
  const BARK = 0xb99670,
    BARK_DARK = 0x785a3e,
    ROOF_WOOD = 0x5c4632;
  const TERRE = 0xb99875;
  const WATER = 0x80c3c3;
  // Verbatim reuse of render-flow.js's own irrigation-flow bead recipe.
  const FLOW_COLOR = 0xb2eff0,
    FLOW_EMISSIVE = 0x438e9b;
  // Verbatim reuse of render-scene.js's own lantern tones.
  const VEILLEUSE_COLOR = 0xf2da9b,
    VEILLEUSE_EMISSIVE = 0xffb85e;
  const SIGNAL_INTENSITY = 0.35;

  const materialCache = new Map();
  function mat(color, extra) {
    const key = color + ":" + (extra ? JSON.stringify(extra) : "");
    if (!materialCache.has(key))
      materialCache.set(
        key,
        new T.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...extra }),
      );
    return materialCache.get(key);
  }
  function waterMat(active) {
    return active
      ? mat(FLOW_COLOR, { emissive: FLOW_EMISSIVE, emissiveIntensity: SIGNAL_INTENSITY, roughness: 0.25 })
      : mat(WATER, { roughness: 0.25 });
  }
  function veilleuseMat(active) {
    return active
      ? mat(VEILLEUSE_COLOR, { emissive: VEILLEUSE_EMISSIVE, emissiveIntensity: SIGNAL_INTENSITY })
      : mat(BARK_DARK);
  }

  const geometryCache = new Map();
  function sharedGeometry(key, create) {
    if (!geometryCache.has(key)) geometryCache.set(key, create());
    return geometryCache.get(key);
  }

  function mesh(geometry, material, parent, x, y, z) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // ---- Borne (water source): thin vertical post topped by a small basin, pierre/eau families ----
  const BORNE_POST_H = 0.5,
    BORNE_TOP_Y = 0.08 + BORNE_POST_H;
  function buildBorneGroup(active) {
    const group = new T.Group();
    mesh(sharedGeometry("borne-plinth", () => new T.BoxGeometry(0.22, 0.08, 0.22)), mat(STONE_MID), group, 0, 0.04, 0);
    mesh(
      sharedGeometry("borne-post", () => new T.CylinderGeometry(0.045, 0.055, BORNE_POST_H, 8)),
      mat(STONE_DARK),
      group,
      0,
      0.08 + BORNE_POST_H / 2,
      0,
    );
    mesh(sharedGeometry("borne-basin", () => new T.CylinderGeometry(0.1, 0.09, 0.05, 10)), mat(STONE), group, 0, BORNE_TOP_Y, 0);
    const bead = mesh(sharedGeometry("borne-bead", () => new T.SphereGeometry(0.045, 10, 8)), waterMat(active), group, 0, BORNE_TOP_Y + 0.05, 0);
    group.userData = { kind: "borne", active, bead };
    return group;
  }
  function setBorneActive(group, active) {
    if (group.userData.active === active) return;
    group.userData.active = active;
    group.userData.bead.material = waterMat(active);
  }

  // ---- Zone (culture plot): flat delimited patch with a low rail, terre/bois families ----
  const ZONE_SIZE = 1.3,
    ZONE_POST_H = 0.32;
  function buildZoneGroup(active) {
    const group = new T.Group();
    const half = ZONE_SIZE / 2;
    mesh(sharedGeometry("zone-bed", () => new T.BoxGeometry(ZONE_SIZE, 0.05, ZONE_SIZE)), mat(TERRE), group, 0, 0.025, 0);
    const railMat = mat(BARK_DARK);
    const railEnd = sharedGeometry("zone-rail-end", () => new T.BoxGeometry(ZONE_SIZE + 0.1, 0.09, 0.08));
    mesh(railEnd, railMat, group, 0, 0.045, half);
    mesh(railEnd, railMat, group, 0, 0.045, -half);
    const railSide = sharedGeometry("zone-rail-side", () => new T.BoxGeometry(0.08, 0.09, ZONE_SIZE + 0.1));
    mesh(railSide, railMat, group, half, 0.045, 0);
    mesh(railSide, railMat, group, -half, 0.045, 0);
    // Corner post + veilleuse lamp — always present, only its material toggles (setZoneActive),
    // never rebuilt: an emissive-only mesh, never a real THREE.Light (see header).
    mesh(
      sharedGeometry("zone-post", () => new T.CylinderGeometry(0.035, 0.045, ZONE_POST_H, 6)),
      mat(BARK),
      group,
      -half + 0.1,
      ZONE_POST_H / 2,
      -half + 0.1,
    );
    const lamp = mesh(
      sharedGeometry("zone-lamp", () => new T.SphereGeometry(0.06, 8, 6)),
      veilleuseMat(active),
      group,
      -half + 0.1,
      ZONE_POST_H + 0.04,
      -half + 0.1,
    );
    group.userData = { kind: "zone", active, lamp };
    return group;
  }
  function setZoneActive(group, active) {
    if (group.userData.active === active) return;
    group.userData.active = active;
    group.userData.lamp.material = veilleuseMat(active);
  }

  // ---- Panier (produce basket): low, open, bois family with a darker hollow interior ----
  function buildPanierGroup() {
    const group = new T.Group();
    mesh(sharedGeometry("panier-shell", () => new T.CylinderGeometry(0.24, 0.18, 0.22, 12)), mat(BARK), group, 0, 0.11, 0);
    mesh(sharedGeometry("panier-inner", () => new T.CylinderGeometry(0.19, 0.16, 0.16, 12)), mat(BARK_DARK), group, 0, 0.17, 0);
    const rim = mesh(sharedGeometry("panier-rim", () => new T.TorusGeometry(0.24, 0.02, 6, 14)), mat(BARK_DARK), group, 0, 0.22, 0);
    rim.rotation.x = Math.PI / 2;
    group.userData = { kind: "panier" };
    return group;
  }

  // ---- Habitat: larger roofed structure, pierre/bois families coherent with the refuge house ----
  function buildHabitatGroup() {
    const group = new T.Group();
    const w = 1.3,
      d = 1.0,
      wallH = 0.55;
    mesh(sharedGeometry("habitat-base", () => new T.BoxGeometry(w, wallH, d)), mat(STONE_MID), group, 0, wallH / 2, 0);
    mesh(
      sharedGeometry("habitat-roof", () => {
        const g = new T.ConeGeometry(0.95, 0.55, 4);
        g.rotateY(Math.PI / 4);
        return g;
      }),
      mat(ROOF_WOOD),
      group,
      0,
      wallH + 0.275,
      0,
    );
    group.userData = { kind: "habitat" };
    return group;
  }

  function buildStationGroup(kind, station) {
    if (kind === "borne") return buildBorneGroup(!!station.priseFortDebit);
    if (kind === "zone") return buildZoneGroup(!!station.veilleuse);
    if (kind === "panier") return buildPanierGroup();
    if (kind === "habitat") return buildHabitatGroup();
    throw new Error(`Type de station de rendu inconnu : "${kind}".`);
  }

  // Only a borne/zone ever carry mutable, renderable state after registration (see header) —
  // called every sync(), but a no-op unless the relevant boolean actually flipped since the
  // group was last built/updated.
  function updateStationGroup(kind, station, group) {
    if (kind === "borne") setBorneActive(group, !!station.priseFortDebit);
    else if (kind === "zone") setZoneActive(group, !!station.veilleuse);
  }

  const api = {
    buildStationGroup,
    updateStationGroup,
    STONE,
    STONE_DARK,
    STONE_MID,
    BARK,
    BARK_DARK,
    ROOF_WOOD,
    TERRE,
    WATER,
    FLOW_COLOR,
    FLOW_EMISSIVE,
    VEILLEUSE_COLOR,
    VEILLEUSE_EMISSIVE,
    SIGNAL_INTENSITY,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderCampaignStations = api;
})(typeof window !== "undefined" ? window : globalThis);
