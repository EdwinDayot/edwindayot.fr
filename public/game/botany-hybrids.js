/* Modular hybrid rendering (campaign botany, epic C1.7 — docs/campagne-backlog.md). Given a
   cultivar-like object {id, traits} matching the six-axis shape produced by
   public/game/botany-genetics.js / botany-pot.js / cultivars.js (port, feuilles, fleurs,
   palette, humidite, fonction), builds a Three.js Group: a port skeleton with declared attach
   points, leaf/flower organs from a compatible library, arranged by a visual seed derived
   deterministically from the cultivar id alone (never Math.random/Date.now) — same id always
   yields the same organ layout, across sessions, per docs/campagne-backlog.md's C1.7 criterion.

   Kept apart from botany.js/garden-models*.js on purpose: those render the free garden's real
   houseplant catalogue (data-species.js), unrelated to the campaign's fictional Rivebrume flora
   — the same separation botany-genetics.js already documents in its own header for the data
   side of this split.

   Sharing: two buildSpecimenGroup() calls for the SAME cultivar id return distinct Group
   instances (so each specimen can be positioned independently in the world later) whose organ
   meshes reference the IDENTICAL geometry/material objects, cached by trait/color, never
   recomputed per specimen — "un cultivar = une signature visuelle réutilisée" (direction-
   artistique.md). No canvas/texture dependency anywhere in this file: colors only, so it loads
   and runs identically in a plain Node vm sandbox against public/vendor/three.min.js (see
   tests/campaign-hybrids-render.cjs) without stubbing `document`, unlike garden-models-leaf.js.

   Epic C1.8 (docs/campagne-backlog.md) adds growth stages: `stage` is an optional second
   argument to buildSpecimenGroup, 0..STAGE_COUNT-1, matching the integer already stored on a
   persisted specimen (public/game/cultivars.js: "stage 0 is a freshly planted cutting/seedling
   ... later epics (C1.7/C1.8) attach a rendered form per stage"). Default stays the last stage
   (mature) so every existing call site/test written against C1.7 -- none of which pass a stage
   -- is byte-for-byte unaffected: same organs, same attach points, group.scale left at 1.
   Younger stages scale the whole group down (STAGE_SCALE) and thin the canopy (sparser leaves,
   no flowers before maturity) rather than inventing a second geometry set per stage. */
(function (root) {
  const T = root.THREE;
  if (!T) return;

  // Palette label -> hex. Every value below is either literally a hex already documented in
  // docs/direction-artistique.md's family table, or a clearly derived tint from one of those
  // families (commented per line) — never an unrelated hue invented for this epic, per that
  // guide's rule. Convention fixed by this epic, documented here for future epics that read a
  // cultivar's palette: dominante1 -> feuillage (leaf material), dominante2 -> tige/support
  // (stem material), accent -> fleur / organe de la fonction remarquable.
  const PALETTE = {
    "vert-sauge": 0x53825c, // feuillage
    "vert-clair": 0x78a655, // feuillage
    blanc: 0xf4efd8, // accents chauds (blanc chaud déjà en usage, pas de blanc pur hors palette)
    "bleu-nuit": 0x3f4a72, // dérivé de la lune 0x9bbaff (ciel/ambiance), assombri pour un feuillage
    argent: 0xa9afa2, // pierre/maçonnerie (gris argenté)
    "jaune-pale": 0xf2da9b, // accents chauds (teinte de lanterne)
    "vert-velours": 0x709773, // feuillage
    "gris-vert": 0xbec0a1, // feuillage
    mauve: 0x9a83b5, // lavande (tons neutres additionnels déjà en service)
    "vert-fibre": 0x6d8a52, // feuillage
    "brun-clair": 0xb99670, // bois/écorce
    rose: 0xd7a3ac, // accents chauds
    "vert-mousse": 0x559064, // feuillage
    "vert-fonce": 0x455f3d, // feuillage
    "vert-tendre": 0x91ab80, // feuillage
    // Rouge : le seul rouge déjà en usage (0xb5654f/0xb65e48) est réservé aux états invalides
    // par direction-artistique.md. Fraise timide porte pourtant "rouge" comme trait de palette
    // du design (§4) — usage exceptionnel et justifié (fruit rouge, pas un signal), teinte
    // choisie visiblement distincte du rouge d'erreur pour ne jamais être confondue avec lui.
    rouge: 0xc9776a,
    // Violet : direction-artistique.md réserve cette famille à l'Aster des vents sans fixer de
    // valeur ("cohérent avec cette famille... à réserver pour l'Aster des vents, §4") — dérivé
    // de la lavande (0x9a83b5) déjà en service, assombri/saturé pour rester visuellement
    // distinct du mauve (Menthe de velours) tout en restant la même famille perceptuelle.
    violet: 0x8064a8,
    jaune: 0xe8bd53, // accents chauds
  };
  function paletteColor(label) {
    const hex = PALETTE[label];
    if (hex == null) throw new Error(`unmapped palette label: ${label}`);
    return hex;
  }

  // Mats, jamais métalliques (direction-artistique.md) : roughness dans la plage déjà observée
  // (0,15 eau .. 0,48 feuillage) ; `metalness` n'est jamais posé, laissé à son défaut (0).
  const materialCache = new Map();
  function organMaterial(colorLabel, roughness, emissive) {
    const hex = paletteColor(colorLabel);
    const key = hex + ":" + roughness + ":" + (emissive ? 1 : 0);
    if (!materialCache.has(key)) {
      const opts = { color: hex, roughness };
      if (emissive) {
        // Émissif réservé au signal, intensité 0,35 déjà en usage pour les lanternes
        // (direction-artistique.md) — jamais une valeur inventée pour cet epic.
        opts.emissive = hex;
        opts.emissiveIntensity = 0.35;
      }
      materialCache.set(key, new T.MeshStandardMaterial(opts));
    }
    return materialCache.get(key);
  }

  // Deterministic visual seed: FNV-1a hash of the cultivar id string into a 32-bit int, fed to
  // a mulberry32 PRNG (same family already used for reproducible draws in
  // tests/campaign-pot.cjs) — depends only on the id string, so it is identical across
  // sessions and never touches Math.random/Date.now.
  function seedFromId(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const geometryCache = new Map();
  function sharedGeometry(key, create) {
    if (!geometryCache.has(key)) geometryCache.set(key, create());
    return geometryCache.get(key);
  }

  function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  // One skeleton profile per port value used by the eight founding species (design §4): a stem
  // curve plus a fixed count of attach points spread along it. Shared across every cultivar of
  // the same port (a superset of the required "same cultivar shares geometry" guarantee) —
  // cultivar identity comes from organ choice/placement and colour, not stem geometry.
  const PORT_PROFILES = {
    rosette: {
      points: [
        [0, 0, 0],
        [0.02, 0.05, 0],
        [0, 0.1, 0.02],
        [0, 0.14, 0],
      ],
      attachCount: 6,
      spread: [0, 1],
    },
    "tige-dressee": {
      points: [
        [0, 0, 0],
        [0.02, 0.3, 0],
        [-0.015, 0.65, 0.01],
        [0, 1, 0],
      ],
      attachCount: 7,
      spread: [0.15, 1],
    },
    touffe: {
      points: [
        [0, 0, 0],
        [0.03, 0.2, 0],
        [-0.02, 0.42, 0.015],
        [0, 0.6, 0],
      ],
      attachCount: 8,
      spread: [0.1, 1],
    },
    grimpant: {
      points: [
        [0, 0, 0],
        [0.05, 0.4, 0.03],
        [-0.04, 0.85, -0.02],
        [0.02, 1.3, 0],
      ],
      attachCount: 9,
      spread: [0.05, 1],
    },
    retombant: {
      // Trails downward from a rim height, e.g. a hanging pot — curve runs from +y to -y.
      points: [
        [0, 0.3, 0],
        [0.03, 0.2, 0],
        [0.02, 0, 0.02],
        [-0.01, -0.25, 0],
      ],
      attachCount: 6,
      spread: [0, 1],
    },
  };

  function buildSkeleton(port, stemMaterial) {
    const profile = PORT_PROFILES[port];
    if (!profile) throw new Error(`unknown port: ${port}`);
    const curve = sharedGeometry(
      "curve:" + port,
      () => new T.CatmullRomCurve3(profile.points.map((p) => new T.Vector3(...p))),
    );
    const structure = new T.Group();
    if (port !== "rosette") {
      const geo = sharedGeometry("stem:" + port, () => new T.TubeGeometry(curve, 24, 0.022, 6, false));
      mesh(geo, stemMaterial, structure);
    }
    const [t0, t1] = profile.spread;
    const attachPoints = [];
    for (let i = 0; i < profile.attachCount; i++) {
      const t = profile.attachCount === 1 ? t0 : t0 + (i / (profile.attachCount - 1)) * (t1 - t0);
      attachPoints.push({ point: curve.getPoint(t), t, index: i });
    }
    return { structure, attachPoints };
  }

  const GOLDEN_ANGLE = 2.39996; // even angular spread around the stem, as garden-models-plant.js

  // One geometry per leaf shape (design §4 "feuilles" axis: forme). Simple primitives only, per
  // direction-artistique.md ("formes composées de primitives simples, jamais de maillage
  // sculpté à la main") — no canvas texture, unlike the free garden's leaf().
  function leafGeometry(forme) {
    return sharedGeometry("leaf:" + forme, () => {
      switch (forme) {
        case "coupe":
          // Shallow bowl: catches and holds water (Oreille-de-pluie, retenir_eau).
          return new T.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        case "fine":
          // Widened from the original 0.032 (C1.7) to 0.055 during C1.8's own multimodal review:
          // at that radius the founders using this shape (clochette-du-soir, aster-des-vents —
          // both tige-dressée) read as an almost bare stem at silhouette distance, exactly the
          // limitation C1.7's changelog flagged and asked C1.8 to check. Still narrower than
          // "ronde" (0.1) — a thin leaf, not a redesign of the shape.
          return new T.ConeGeometry(0.055, 0.3, 6);
        case "ronde":
          return new T.SphereGeometry(0.1, 10, 8);
        case "palmee":
          // A hand-shaped cluster is built as a small Group of radiating cones (see
          // buildLeafOrgan), not a single geometry — this key is unused but kept for symmetry.
          return new T.ConeGeometry(0.03, 0.16, 5);
        default:
          throw new Error(`unknown feuilles.forme: ${forme}`);
      }
    });
  }

  const TAILLE_SCALE = { petite: 0.65, moyenne: 1, grande: 1.4 };
  function leafScale(taille) {
    const s = TAILLE_SCALE[taille];
    if (s == null) throw new Error(`unknown feuilles.taille: ${taille}`);
    return s;
  }

  // A leaf organ is always a Group (uniform with the palmate case, which needs several
  // primitives) anchored at its base — the branch's own position is the attach point.
  function buildLeafOrgan(feuilles, mat, azimuth, tilt, rng) {
    const branch = new T.Group();
    const scale = leafScale(feuilles.taille);
    if (feuilles.forme === "palmee") {
      const fingers = 5;
      for (let i = 0; i < fingers; i++) {
        const spread = (i - (fingers - 1) / 2) * 0.22;
        const finger = mesh(leafGeometry("palmee"), mat, branch, 0, 0.08, 0);
        finger.rotation.z = spread;
        finger.rotation.x = 0.35;
        finger.scale.setScalar(scale);
      }
    } else {
      const m = mesh(leafGeometry(feuilles.forme), mat, branch, 0, 0.1 * scale, 0);
      m.scale.setScalar(scale);
    }
    branch.rotation.set(tilt, azimuth, 0, "YXZ");
    return branch;
  }

  // One geometry per flower shape (design §4 "fleurs" axis: forme).
  function flowerGeometry(forme) {
    return sharedGeometry("flower:" + forme, () => {
      switch (forme) {
        case "cloche":
          // Open cone pointing down, like a bell.
          return new T.ConeGeometry(0.07, 0.11, 8, 1, true);
        case "etoile":
          // Same C1.8 widening as the "fine" leaf above and for the same reason: a lone
          // (non-groupée) étoile flower, e.g. on fraise-timide, was nearly invisible at
          // silhouette distance. Still narrower than "cloche" (0.07).
          return new T.ConeGeometry(0.045, 0.1, 5);
        case "epi":
          return new T.SphereGeometry(0.035, 8, 6);
        default:
          throw new Error(`unknown fleurs.forme: ${forme}`);
      }
    });
  }

  function buildFlowerOrgan(fleurs, mat, azimuth, rng) {
    const branch = new T.Group();
    if (fleurs.forme === "epi") {
      const count = 4;
      for (let i = 0; i < count; i++) mesh(flowerGeometry("epi"), mat, branch, 0, 0.05 + i * 0.045, 0);
    } else if (fleurs.forme === "cloche") {
      const m = mesh(flowerGeometry("cloche"), mat, branch, 0, -0.05, 0);
      m.rotation.x = Math.PI;
    } else {
      mesh(flowerGeometry(fleurs.forme), mat, branch, 0, 0.05, 0);
    }
    const count = fleurs.groupement === "groupee" ? 3 : 1;
    const group = new T.Group();
    group.add(branch);
    for (let i = 1; i < count; i++) {
      const extra = branch.clone();
      const a = (i / count) * Math.PI * 2 + rng() * 0.3;
      extra.position.set(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05);
      group.add(extra);
    }
    group.rotation.y = azimuth;
    return group;
  }

  // Growth stages (epic C1.8): a uniform scale applied to the whole finished group, plus a
  // thinner canopy at the two younger stages. Index STAGE_COUNT-1 ("mature") is the default and
  // reproduces C1.7's output exactly (scale 1, full leaves, flowers if the cultivar has any).
  const STAGE_SCALE = [0.38, 0.68, 1];
  const STAGE_COUNT = STAGE_SCALE.length;
  const MATURE_STAGE = STAGE_COUNT - 1;

  // Builds one specimen's Group for a cultivar-shaped object ({id, traits}), matching the trait
  // shape produced by botany-genetics.js founders / botany-pot.js draws / cultivars.js, at the
  // given growth stage (0..STAGE_COUNT-1, defaults to mature). Two calls with the same id AND
  // stage place identical organs (deterministic seed) but return distinct Group instances,
  // sharing the underlying geometry/material objects.
  function buildSpecimenGroup(cultivar, stage = MATURE_STAGE) {
    const { id, traits } = cultivar;
    if (!id) throw new Error("cultivar id required");
    const scaleFactor = STAGE_SCALE[stage];
    if (scaleFactor == null) throw new Error(`unknown stage: ${stage}`);
    const rng = mulberry32(seedFromId(id));

    const leafMat = organMaterial(traits.palette.dominante1, 0.46);
    const stemMat = organMaterial(traits.palette.dominante2, 0.4);
    const { structure, attachPoints } = buildSkeleton(traits.port, stemMat);

    const group = new T.Group();
    group.add(structure);
    const organs = [];

    // Youngest stage: only every other attach point carries a leaf, for a visibly sparser
    // seedling canopy rather than a scaled-down copy of the mature plant.
    if (traits.feuilles) {
      attachPoints.forEach((ap, i) => {
        if (stage === 0 && i % 2 === 1) return;
        const azimuth = i * GOLDEN_ANGLE + (rng() - 0.5) * 0.6;
        const tilt = 0.9 + (rng() - 0.5) * 0.4;
        const organ = buildLeafOrgan(traits.feuilles, leafMat, azimuth, tilt, rng);
        organ.position.copy(ap.point);
        structure.add(organ);
        organs.push({ kind: "leaf", branch: organ, attach: ap });
      });
    }

    // Flowers only at maturity: a young plant that hasn't bloomed yet, per design §3's growth
    // vocabulary (seed/sprout/foliage bands already used by render-frame.js for the free
    // garden) — never a smaller flower, always simply absent before MATURE_STAGE.
    if (traits.fleurs && stage === MATURE_STAGE) {
      const accentMat = organMaterial(
        traits.palette.accent || traits.palette.dominante1,
        0.3,
        !!(traits.fonction && traits.fonction.type === "eclairer"),
      );
      const flowerPoints = traits.fleurs.groupement === "groupee" && attachPoints.length > 1
        ? attachPoints.slice(-2)
        : attachPoints.slice(-1);
      flowerPoints.forEach((ap, i) => {
        const azimuth = (attachPoints.length + i) * GOLDEN_ANGLE + (rng() - 0.5) * 0.6;
        const organ = buildFlowerOrgan(traits.fleurs, accentMat, azimuth, rng);
        organ.position.copy(ap.point);
        structure.add(organ);
        organs.push({ kind: "flower", branch: organ, attach: ap });
      });
    }

    group.scale.setScalar(scaleFactor);
    group.userData = { cultivarId: id, organs, attachPoints, stage };
    return group;
  }

  const api = {
    PALETTE,
    paletteColor,
    seedFromId,
    mulberry32,
    PORT_PROFILES,
    STAGE_COUNT,
    MATURE_STAGE,
    buildSpecimenGroup,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenBotanyHybrids = api;
})(typeof window !== "undefined" ? window : globalThis);
