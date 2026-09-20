/* Rainelle body rendering (epic C5.9, docs/campagne-backlog.md): builds a Group for one
   Rainelle (rainelles.js schema) wearing the foliage of the cultivar it carries (cultivars.js),
   reusing botany-hybrids.js's own leaf-organ library and material cache rather than a second one
   (design §5: "les Rainelles partagent un corps animé commun et des points d'attache végétaux";
   execution-continue.md/direction-artistique.md: reuse the existing style, never invent a
   parallel one).

   The creature body itself — torso, head, eyes, legs — is this module's own asset, never a plant
   skeleton: a small four-legged silhouette shared, geometry AND material alike, by every
   Rainelle regardless of cultivar (design §5: "un corps animé commun... jamais recalculés par
   individu"). Only the foliage organs attached to its back are botany-hybrids.js's own
   buildLeafOrgan/organMaterial, called here exactly as botany-hybrids.js calls them on a plant's
   own skeleton — never a second leaf geometry/material cache.

   Visual seed: derived from the RAINELLE's own id (Hybrids.seedFromId/mulberry32 — the exact
   same PRNG family already used for plant organ layout, not a second one), never the cultivar id
   alone: two Rainelles sharing a cultivar would otherwise be pixel-identical, contradicting
   design chapter 6's "une marque distinctive... qui ne se perdent jamais dans un lot". That seed
   fixes only the one minor, individually-owned variation the C5.9 criterion asks for (an
   accent-coloured mark, MARK_COLORS below) — the foliage LAYOUT (which attach point gets which
   azimuth/tilt) is a fixed shape shared by every Rainelle; only the foliage's colour/geometry
   comes from the referenced cultivar and is already shared across that cultivar's own specimens
   by botany-hybrids.js's own cache, nothing here duplicates that guarantee.

   No position, no movement, no call site in the real render loop — epic C5.9's own explicit scope
   limit (see its backlog entry: "sans position ni déplacement"). buildRainelleGroup is a pure
   function returning a detached Group, exercised directly by tests/campaign-rainelle-render.cjs
   (Node, no browser), by the comparison bench in tests/campaign-rainelle-visual.cjs, and by the
   live-page block added to tests/garden-material-audit.cjs — the same two-tier pattern already
   used for botany-hybrids.js (C1.7/C1.8) and render-campaign-house.js (C3.2/C2.2v). Self-contained
   beyond botany-hybrids.js: only THREE and that one sibling module are required, so this loads
   and runs identically in a plain Node vm sandbox and in the browser (same posture documented in
   both of those files' own headers). */
(function (root) {
  const T = root.THREE;
  if (!T) return;
  const Hybrids =
    typeof module !== "undefined" ? require("./botany-hybrids.js") : root.GardenBotanyHybrids;
  if (!Hybrids) return;

  // Skin/eye: literal hex values already documented in direction-artistique.md — "peau" 0xe1b08a
  // from the "accents chauds" family row, 0x493323 from the "terre/argile/graine" row. This
  // module's own small material cache, kept separate from Hybrids.organMaterial (reserved below
  // strictly for the reused foliage organs, whose colours come from a cultivar's trait *labels*,
  // not a literal hex) — same separation render-campaign-house.js already uses for its own walls
  // rather than calling into botany-hybrids.js for an unrelated asset.
  const SKIN = 0xe1b08a,
    EYE = 0x493323;

  // Individual accent mark: five hues, all already documented in direction-artistique.md's
  // "accents chauds" family, none of them tagged there for an already-reserved use (unlike
  // "joueur" 0xedc08b or the two lantern tones, deliberately excluded) — a Rainelle's own mark is
  // an incidental new use of an existing family, not an invented colour.
  const MARK_COLORS = [0xe8bd53, 0xd7a3ac, 0xe1b153, 0xcb9f97, 0xeac987];

  const materialCache = new Map();
  function bodyMaterial(hex, roughness) {
    const key = hex + ":" + roughness;
    if (!materialCache.has(key))
      materialCache.set(
        key,
        new T.MeshStandardMaterial({ color: hex, roughness, metalness: 0 }),
      );
    return materialCache.get(key);
  }

  const geometryCache = new Map();
  function sharedGeometry(key, create) {
    if (!geometryCache.has(key)) geometryCache.set(key, create());
    return geometryCache.get(key);
  }

  function mesh(geometry, mat, parent, x, y, z) {
    const m = new T.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // Fixed positions in the body's own local space — shared, never derived from any id or
  // cultivar, since only the accent mark (below) is meant to vary per individual.
  const BACK_ATTACH_POINTS = [
    { point: new T.Vector3(-0.07, 0.2, 0.02), azimuth: -0.5, tilt: 0.55 },
    { point: new T.Vector3(0, 0.23, -0.03), azimuth: 0, tilt: 0.5 },
    { point: new T.Vector3(0.07, 0.2, 0.02), azimuth: 0.5, tilt: 0.55 },
  ];
  // Botany-hybrids.js's own leaf organs are sized for a plant; scaled down here so they read as
  // foliage on a small creature's back rather than dwarfing it.
  const FOLIAGE_SCALE = 0.42;

  const LEG_POSITIONS = [
    [-0.08, 0.063, 0.07],
    [0.08, 0.063, 0.07],
    [-0.08, 0.063, -0.06],
    [0.08, 0.063, -0.06],
  ];

  // The shared body: torso capsule, rounded head, two eyes, four leg stubs — simple primitives
  // only (direction-artistique.md: "formes composées de primitives simples, jamais de maillage
  // sculpté à la main"). A fresh Group per call (so each Rainelle can be positioned/removed
  // independently later), but every mesh inside references the SAME cached geometry/material
  // objects regardless of which Rainelle or cultivar called it — design §5's "corps animé
  // commun... jamais recalculés par individu".
  function buildBody() {
    const structure = new T.Group();
    const skinMat = bodyMaterial(SKIN, 0.4);
    const eyeMat = bodyMaterial(EYE, 0.25);

    const torsoGeo = sharedGeometry("torso", () => {
      const g = new T.CapsuleGeometry(0.1, 0.12, 4, 10);
      g.rotateX(Math.PI / 2); // capsule's default long axis (Y) -> Z, front-to-back body
      return g;
    });
    mesh(torsoGeo, skinMat, structure, 0, 0.13, 0);

    const headGeo = sharedGeometry("head", () => new T.SphereGeometry(0.085, 10, 8));
    mesh(headGeo, skinMat, structure, 0, 0.15, -0.14);

    const eyeGeo = sharedGeometry("eye", () => new T.SphereGeometry(0.018, 6, 6));
    mesh(eyeGeo, eyeMat, structure, -0.045, 0.2, -0.19);
    mesh(eyeGeo, eyeMat, structure, 0.045, 0.2, -0.19);

    const legGeo = sharedGeometry("leg", () => new T.CapsuleGeometry(0.028, 0.07, 3, 6));
    for (const [x, y, z] of LEG_POSITIONS) mesh(legGeo, skinMat, structure, x, y, z);

    return structure;
  }

  // Foliage: reuses Hybrids.buildLeafOrgan/organMaterial verbatim (see header) — never a second
  // leaf library. Only feuilles are attached (a Rainelle carries "le feuillage du cultivar
  // croisé cette nuit-là", design §5 — not its parent cultivar's flowers, which never bloom on a
  // creature; a cultivar with no feuilles trait simply grows no foliage here either).
  function attachFoliage(structure, traits) {
    if (!traits.feuilles) return [];
    const isEclairer = !!(traits.fonction && traits.fonction.type === "eclairer");
    const leafMat = Hybrids.organMaterial(traits.palette.dominante1, 0.46, isEclairer);
    const organs = [];
    for (const ap of BACK_ATTACH_POINTS) {
      const branch = Hybrids.buildLeafOrgan(traits.feuilles, leafMat, ap.azimuth, ap.tilt);
      branch.position.copy(ap.point);
      branch.scale.setScalar(FOLIAGE_SCALE);
      structure.add(branch);
      organs.push({ kind: "leaf", branch, attach: ap });
    }
    return organs;
  }

  // Individual mark: a small flattened patch, colour + side picked by a seed derived from the
  // RAINELLE's own id (never the cultivar's) — see header. Placed on the flank rather than the
  // back (kept clear of BACK_ATTACH_POINTS above, whose foliage otherwise hides a mark placed
  // among it — found during this epic's own multimodal review, see campagne.md) so it stays
  // legible instead of buried under the foliage crown. Geometry is shared (one flattened sphere,
  // cached); only its material/placement differs per individual, and even those materials are
  // cached/shared across every Rainelle that happens to draw the same hue.
  function attachMark(structure, rainelleId) {
    const rng = Hybrids.mulberry32(Hybrids.seedFromId(rainelleId));
    const hex = MARK_COLORS[Math.floor(rng() * MARK_COLORS.length)];
    const side = rng() < 0.5 ? -1 : 1;
    const geo = sharedGeometry("mark", () => {
      const g = new T.SphereGeometry(0.028, 8, 6);
      g.scale(1, 0.7, 0.5);
      return g;
    });
    const mat = bodyMaterial(hex, 0.35);
    const m = mesh(geo, mat, structure, side * 0.097, 0.13, -0.02);
    m.rotation.y = side * (Math.PI / 2);
    return { hex, side, mesh: m };
  }

  // Builds one Rainelle's Group. `rainelle` needs only `.id` (rainelles.js schema); `cultivar`
  // needs only `.traits`, matching the exact shape botany-hybrids.js itself accepts (a
  // cultivars.js entry `{id, name, parentIds, traits}`, or a plain founder/hybrid trait object
  // with `{id, traits}`) — resolving the real cultivar object from a Rainelle's cultivarId is the
  // caller's job (e.g. `s.cultivars.find(c => c.id === rainelle.cultivarId)`, the same lookup
  // cultivars.js's own specimenTraits() already does), never duplicated here.
  function buildRainelleGroup(rainelle, cultivar) {
    if (!rainelle || !rainelle.id) throw new Error("rainelle id required");
    if (!cultivar || !cultivar.traits) throw new Error("cultivar (with traits) required");
    const group = new T.Group();
    const structure = buildBody();
    group.add(structure);
    const organs = attachFoliage(structure, cultivar.traits);
    const mark = attachMark(structure, rainelle.id);
    group.userData = { rainelleId: rainelle.id, cultivarId: cultivar.id, organs, mark };
    return group;
  }

  const api = { SKIN, EYE, MARK_COLORS, FOLIAGE_SCALE, buildRainelleGroup };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderRainelles = api;
})(typeof window !== "undefined" ? window : globalThis);
