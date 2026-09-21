/* Rendering of the chapter-17 passage-to-the-pond point (campaign-passage.js, epics C6.12/C6.13:
   docs/campagne-backlog.md's C6.14, "rendu du passage").

   Self-contained on purpose, exactly like render-campaign-house.js/render-campaign-stations.js:
   only `THREE` is required (no `window.GardenModels`/`window.GardenView`), so this loads and runs
   identically in a plain Node vm sandbox (see tests/campaign-passage-render.cjs and the extended
   block in tests/garden-material-audit.cjs) and in the browser. This module never reads
   campaign-passage.js itself (no PASSAGE_POSITION/PASSAGE_OBSTACLE_RADIUS import) — the caller
   (render-houses.js's buildCampaignPassage, mirroring buildCampaignHouse) positions the built
   Group using that module's own exported position; the visual bank radius here is a rendering
   choice, not required to equal the (invisible) navigation-collision radius.

   Two states only, driven by the single boolean `s.campaignPassage.blocked` (C6.12/C6.13), never
   a texture that would "tell" why it's blocked — the chapter's own narrative reveal, once the
   crossing scene exists, is explicitly out of scope for this epic (see campaigne-backlog.md's own
   "limites honnêtes, reconduites" on C6.14): a nameable silhouette only, bois/terre families
   (design's own wording: "végétation envahissante/amas") when blocked, eau family when open.

   Colors are literal hex values already documented in direction-artistique.md's palette table —
   terre (0xb99875), bois/écorce (0xb99670/0x785a3e), eau (0x80c3c3/0x9acfd3) — verified against
   that table before writing this file, never invented. The pond's water material is a VERBATIM
   reuse of render.js's own `this.mat.water` recipe (color 0x80c3c3, roughness 0.25, metalness 0
   implied) rather than a new tint or roughness value — the same "borrow verbatim, do not invent a
   sibling constant" discipline render-campaign-stations.js's own header already documents for its
   borne bead (irrigation-flow bead) and zone lamp (lantern tones). No emissive material is
   introduced in either state: direction-artistique.md reserves emissive strictly for flowing
   water and lanterns (a genuine "something is working" signal); this point is static — nothing
   flows through it, no local light source is added, so no light-source budget entry is spent
   here. Both materials stay fully opaque (`transparent` never set), like the game's existing
   cisterns already are (docs/campagne-backlog.md's own Cartographe note: "une eau opaque, comme
   la citerne existante, n'a pas besoin de figurer [dans TRANSPARENT_ALLOWLIST]") — so this module
   needs no new TRANSPARENT_ALLOWLIST entry in tests/garden-material-audit.cjs.

   Roughness for the bank/obstruction follows the same 0.72 "solid, mat" convention every other
   campaign rendering module already uses (render-campaign-house.js, render-campaign-stations.js),
   not the illustrative "0.15 to 0.48" range direction-artistique.md quotes as merely observed —
   consistent with existing precedent rather than that range, exactly as render-campaign-stations.js's
   own header already notes for the same reason.

   Both the bank cylinder and the pond's water disc/rim stay well under the 3×3-unit bounding-box
   floor tests/garden-material-audit.cjs's "ground-like mesh" normal check applies (their footprint
   is close to 1.5 units across) — the same size class as campaign-stations.js's own zone bed
   (ZONE_SIZE 1.3), never flagged by that check either. THREE's own CylinderGeometry/
   SphereGeometry/TorusGeometry already compute correct outward-facing normals by construction, so
   no manual computeVertexNormals()/normal-flip fix is needed here (never the class of bug that
   made the terrain's own hills read wrong for days). */
(function (root) {
  const T = root.THREE;
  if (!T) return;

  const TERRE = 0xb99875;
  const BARK = 0xb99670,
    BARK_DARK = 0x785a3e;
  // Verbatim reuse of render.js's own `this.mat.water` recipe (color + roughness).
  const WATER = 0x80c3c3,
    WATER_SHALLOW = 0x9acfd3,
    WATER_ROUGHNESS = 0.25;

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

  const BANK_RADIUS = 0.75,
    BANK_HEIGHT = 0.07;

  // The bank/berge itself sits under both states — the point stays the same clearing either way,
  // only what fills it (branches vs. water) differs, so a player recognizes it as one place.
  function buildBank(group) {
    mesh(
      sharedGeometry(
        "passage-bank",
        () => new T.CylinderGeometry(BANK_RADIUS, BANK_RADIUS + 0.1, BANK_HEIGHT, 16),
      ),
      mat(TERRE),
      group,
      0,
      BANK_HEIGHT / 2,
      0,
    );
  }

  // Obstruction: a low terre mound plus a crossed tangle of branches — a nameable silhouette
  // ("amas"), never a texture claiming to explain the cause (see header). Fixed, deterministic
  // angles (no randomness): two tones alternated (bark/bark_dark) purely for silhouette
  // readability against the mound, same reasoning render-campaign-house.js's own quoins() already
  // uses two stone tones for the same purpose.
  const BRANCH_DEFS = [
    { rz: 1.05, ry: 0.4, y: 0.17, tone: BARK },
    { rz: 1.35, ry: -0.6, y: 0.21, tone: BARK_DARK },
    { rz: 1.0, ry: 1.1, y: 0.15, tone: BARK },
    { rz: 1.2, ry: -1.3, y: 0.2, tone: BARK_DARK },
  ];
  function buildObstruction(group) {
    mesh(
      sharedGeometry("passage-mound", () => new T.SphereGeometry(0.38, 10, 8)),
      mat(TERRE),
      group,
      0,
      0.14,
      0,
    );
    const branchGeo = sharedGeometry(
      "passage-branch",
      () => new T.CylinderGeometry(0.03, 0.045, 0.75, 6),
    );
    for (const b of BRANCH_DEFS) {
      const m = mesh(branchGeo, mat(b.tone), group, 0, b.y, 0);
      m.rotation.z = b.rz;
      m.rotation.y = b.ry;
    }
  }

  // Franchissable: a low, flat water disc recessed just under the bank crest, plus a shallow-tone
  // rim ring for depth readability at a glance — both eau family, both fully opaque (see header).
  function buildPond(group) {
    mesh(
      sharedGeometry(
        "passage-water",
        () => new T.CylinderGeometry(BANK_RADIUS - 0.12, BANK_RADIUS - 0.2, 0.05, 20),
      ),
      mat(WATER, { roughness: WATER_ROUGHNESS }),
      group,
      0,
      BANK_HEIGHT - 0.03,
      0,
    );
    const rim = mesh(
      sharedGeometry("passage-water-rim", () => new T.TorusGeometry(BANK_RADIUS - 0.14, 0.025, 6, 20)),
      mat(WATER_SHALLOW, { roughness: WATER_ROUGHNESS }),
      group,
      0,
      BANK_HEIGHT - 0.01,
      0,
    );
    rim.rotation.x = Math.PI / 2;
  }

  function buildPassageGroup(blocked) {
    const group = new T.Group();
    buildBank(group);
    if (blocked) buildObstruction(group);
    else buildPond(group);
    group.userData = { kind: "passage", blocked: !!blocked };
    return group;
  }

  const api = {
    buildPassageGroup,
    TERRE,
    BARK,
    BARK_DARK,
    WATER,
    WATER_SHALLOW,
    WATER_ROUGHNESS,
    BANK_RADIUS,
    BANK_HEIGHT,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderCampaignPassage = api;
})(typeof window !== "undefined" ? window : globalThis);
