/* Rendering of the campaign refuge house (epic C3.2, docs/campagne-backlog.md), built on the
   schema from campaign-house.js (epic C3.1: six named spaces, each `delabre`/`repare`/`locked`).

   Kept as its own standalone module rather than a new branch of render-houses.js's buildHouse():
   that function hard-requires a visitor (`b.visitorId`, then `D.visitors.find(...).name` — see
   its own lines ~295-307, verified before writing this file, not assumed) because every existing
   house in the free garden IS an NPC's home. The refuge house has no visitor — the player lives
   there — so reusing buildHouse() as-is would mean either inventing a fake visitor row (data
   corruption of a system that means something specific elsewhere) or scattering `if
   (!b.visitorId) return` guards through code whose whole point is "one row per NPC, no branch
   ever needed" (data-buildings.js's own header). A sibling module that reuses the SAME wall/roof
   *technique* (stacked-fieldstone walls, a gable end that actually follows the roof pitch, a
   two-pan roof) without the visitor/door-sign/name-label parts is the generalization the
   backlog's own C3.2 entry asks the Artisan rendu to choose and document — chosen here.

   Self-contained on purpose, exactly like botany-hybrids.js: only `THREE` is required (no
   `window.GardenModels`/`window.GardenView`), so this loads and runs identically in a plain Node
   vm sandbox (see tests/campaign-house-render.cjs) and in the browser. Colors are the literal
   hex values render.js's own `this.mat.stone`/`bark`/`cream` already use for every existing
   house (verified in render.js/render-houses.js, not re-invented) — direction-artistique.md's
   "pierre/maçonnerie" and "bois/écorce" families.

   Visual distinction required by the C3.2 exit criterion, driven by `house.spaces.accueil.status`
   (the only space playable at this stage per campaign-house.js's own header): a repaired house
   keeps the same clean stone/plain-roof/closed-door look every existing NPC house already has: a
   delabre one reads as "not lived in yet" through the same nameable, testable differences a
   silhouette should carry (direction-artistique.md: "la silhouette porte l'identité") — darker
   stone dominant instead of light stone, one collapsed roof panel instead of two intact ones (so
   the ridge beam and rafter show through, not just a re-tinted intact roof), and crossed boards
   nailed over the door gap instead of a hung door leaf. No new emissive material is introduced:
   direction-artistique.md reserves emissive strictly for flowing water and lanterns, and this
   epic does not need a light source to make the difference legible. */
(function (root) {
  const T = root.THREE;
  if (!T) return;

  // Epic C2.2v (docs/campagne-backlog.md): the world position this module's own header used to
  // say did not exist yet. The backlog's own mandate for this epic pre-decided {x:-1, z:-2} —
  // verified here, not assumed, against public/game/construction.js/geometry.js/terrain.js, and
  // found to genuinely conflict with real, already-placed content that decision's own reasoning
  // never checked: at {-1,-2} this footprint (4.2×3.6) overlaps a fresh save's own starting "pot"
  // entity at (0,-3) by 0.55 units and the zone0 clay resource at (-2,-3) by 0.35 units (both
  // real solid-geometry intersections, not a tight-but-legal margin — confirmed with the same
  // rect/circle gap math construction.js's own placement() uses). The whole area immediately
  // around spawn (-1,3) turned out to be tightly packed on every side: south is the starting-pot
  // cluster and two resource nodes just measured, west is zone0's own hill (terrain.js's
  // `{x:-6.5,z:2.5,r:3.5,h:3.6}`, whose disk reaches within ~2 units of spawn itself — every
  // existing house sits on genuinely flat ground, confirmed by sampling Léa's own footprint
  // (max 0.039) as the precedent to match), and east runs straight into the river's west bank
  // within about a house-width. A systematic scan of the whole of zone0 (0.25-unit steps,
  // requiring: inside zone0 with a real polygon-edge margin, flat ground matching the ≤0.05
  // precedent above, no overlap with any fresh-save entity/resource/cache, ≥1.2 units from the
  // river, ≥0.3 units from any visitor house, ≥1.6 units from any other zone's gate, and the
  // spawn point itself kept outside the footprint) found exactly one genuinely clear pocket in
  // zone0, near its northwest edge toward the sous-bois gate — this position. Distance from
  // spawn is no longer a hard constraint once the transition itself turned out to be camera-only
  // (see render-items.js's beginNightfallTransition, a sibling of inspect()/endInspection() —
  // never moves the player entity, exactly the C2.2v mandate's own instruction: build this as a
  // sibling of that existing mechanism rather than fork it) and repairHouseSpace/sleep
  // (garden-state-cmd-l.js/-f.js) never check proximity to this position either — verified, not
  // assumed, before accepting a location farther than the mandate's original guess.
  const CAMPAIGN_HOUSE_X = -13,
    CAMPAIGN_HOUSE_Z = 6,
    // Door faces -Z by default (see closedDoor/boardedDoor below); rotated so it faces
    // approximately toward spawn (-1,3), which sits mostly +X and slightly -Z from this
    // position, matching every NPC house's own convention of a door facing the direction a
    // player actually approaches from (see data-buildings.js's own door-placement comment).
    CAMPAIGN_HOUSE_ROTATION_Y = -Math.PI / 2;

  const HOUSE_W = 4.2,
    HOUSE_D = 3.6,
    WALL_H = 1.9,
    ROOF_H = 2.85,
    DOOR_W = 1.3;

  // Same three tones every existing house wall/roof already uses (render.js's `this.mat`,
  // render-houses.js's local `stoneDark`) — direction-artistique.md's pierre/maçonnerie and
  // bois/écorce families, not new colors invented for this epic.
  const STONE = 0xc5c5b2,
    STONE_DARK = 0x8f8a76,
    STONE_MID = 0xa9afa2,
    BARK = 0x8a7156,
    BARK_DARK = 0x6b5540,
    ROOF_WOOD = 0x5c4632,
    CREAM = 0xeedeb9;

  const materialCache = new Map();
  function mat(color, extra) {
    const key = color + ":" + (extra ? JSON.stringify(extra) : "");
    if (!materialCache.has(key))
      materialCache.set(
        key,
        new T.MeshStandardMaterial({
          color,
          roughness: 0.72,
          metalness: 0,
          ...extra,
        }),
      );
    return materialCache.get(key);
  }

  function box(parent, material, pos, size) {
    const m = new T.Mesh(new T.BoxGeometry(...size), material);
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // Identical technique to render-houses.js's gableGeometry: a gable end (rectangle up to eave
  // height, triangle up to the ridge) so the wall actually follows the roof pitch instead of a
  // rectangular block the sloped roof panel has to cut through. Winding of each triangle is
  // hand-picked (matches the cross product) so every face's computed normal points outward.
  function gableGeometry(thickness, d2, wallH, ridgeH) {
    const half = thickness / 2,
      L0 = [-half, wallH, -d2],
      L1 = [-half, wallH, d2],
      L2 = [-half, ridgeH, 0],
      R0 = [half, wallH, -d2],
      R1 = [half, wallH, d2],
      R2 = [half, ridgeH, 0],
      geo = new T.BufferGeometry();
    geo.setAttribute(
      "position",
      new T.Float32BufferAttribute([L0, L1, L2, R0, R1, R2].flat(), 3),
    );
    geo.setIndex([0, 1, 2, 3, 5, 4, 0, 5, 3, 0, 2, 5, 1, 4, 5, 1, 5, 2]);
    geo.computeVertexNormals();
    return geo;
  }

  function gable(parent, material, thickness, d2, wallH, ridgeH, x) {
    const m = new T.Mesh(gableGeometry(thickness, d2, wallH, ridgeH), material);
    m.position.set(x, 0, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // Boarded-up door: two crossed planks nailed across the opening, the standard silhouette for
  // "not lived in yet" — distinct at a glance from a hung door leaf, no shared geometry needed.
  function boardedDoor(parent, doorHalf, d2) {
    const plank = mat(BARK_DARK);
    for (const rot of [Math.PI / 5, -Math.PI / 5]) {
      const m = box(
        parent,
        plank,
        [0, WALL_H * 0.52, -d2],
        [doorHalf * 2 + 0.3, 0.22, 0.06],
      );
      m.rotation.z = rot;
    }
  }

  // A hung door leaf: wood panel plus a darker inset, the exact look every NPC house already
  // uses in render-houses.js (minus the pivot animation, which needs the player-approach check
  // that function reads off `this.position` — still out of scope here: a world position exists
  // now (C2.2v, see CAMPAIGN_HOUSE_X/Z above), but this house is not added to render-houses.js's
  // own `this.doors`/updateDoors bookkeeping, so its door stays static; a future epic can wire
  // that in the same way once it actually matters for a playable interior).
  function closedDoor(parent, doorHalf, d2) {
    const doorW = 1.15,
      doorH = 1.62;
    box(parent, mat(BARK), [0, doorH / 2, -d2 + 0.01], [doorW, doorH, 0.08]);
    box(
      parent,
      mat(BARK_DARK),
      [0, doorH / 2, -d2 - 0.02],
      [doorW - 0.16, doorH - 0.16, 0.02],
    );
  }

  // Two intact roof panels (repaired) versus one collapsed panel (delabre): a missing panel
  // leaves the ridge board exposed with nothing under it on that side, reading as storm/rot
  // damage rather than a re-tinted intact roof — the kind of nameable difference a programmatic
  // audit (and a second look) can both confirm, not just a darker shade of the same shape.
  function roof(parent, w2, d2, wallH, ridgeH, repaired) {
    const roofMat = mat(repaired ? ROOF_WOOD : STONE_DARK),
      dy = ridgeH - wallH,
      len = Math.hypot(dy, d2),
      angle = Math.atan2(dy, d2),
      panels = [];
    const sides = repaired ? [-1, 1] : [1]; // delabre: only the +z panel survives
    for (const side of sides) {
      const panel = box(
        parent,
        roofMat,
        [0, (wallH + ridgeH) / 2, (side * d2) / 2],
        [w2 * 2 + 0.3, 0.1, len],
      );
      panel.rotation.x = side * angle;
      panels.push(panel);
    }
    panels.push(
      box(parent, mat(BARK_DARK), [0, ridgeH, 0], [w2 * 2 + 0.34, 0.1, 0.14]),
    );
    return panels;
  }

  function quoins(parent, w2, d2) {
    for (const [cx, cz] of [
      [-w2, d2],
      [w2, d2],
      [-w2, -d2],
      [w2, -d2],
    ])
      for (let i = 0; i < 3; i++)
        box(
          parent,
          mat(i % 2 ? STONE_DARK : STONE_MID),
          [cx, 0.32 + i * 0.55, cz],
          [0.4, 0.5, 0.4],
        );
  }

  // house: the {spaces:{...}} shape from campaign-house.js (GardenCampaignHouse.freshHouse()) —
  // only house.spaces.accueil.status is read, per the C3.2 exit criterion's own "au minimum la
  // pièce d'accueil, seul espace jouable à ce stade".
  function buildRefugeHouseGroup(house) {
    const repaired = !!(
      house &&
      house.spaces &&
      house.spaces.accueil &&
      house.spaces.accueil.status === "repare"
    );
    const group = new T.Group();
    const w2 = HOUSE_W / 2,
      d2 = HOUSE_D / 2,
      doorHalf = DOOR_W / 2,
      frontW = w2 - doorHalf,
      wallMat = mat(repaired ? STONE : STONE_DARK);

    box(group, mat(CREAM), [0, 0.02, 0], [HOUSE_W - 0.1, 0.05, HOUSE_D - 0.1]);
    box(
      group,
      mat(STONE_MID),
      [0, 0.1, 0],
      [HOUSE_W + 0.08, 0.2, HOUSE_D + 0.08],
    );

    box(group, wallMat, [0, WALL_H / 2, d2], [HOUSE_W, WALL_H, 0.16]);
    box(group, wallMat, [-w2, WALL_H / 2, 0], [0.16, WALL_H, HOUSE_D]);
    box(group, wallMat, [w2, WALL_H / 2, 0], [0.16, WALL_H, HOUSE_D]);
    gable(group, wallMat, 0.16, d2, WALL_H, ROOF_H, -w2);
    gable(group, wallMat, 0.16, d2, WALL_H, ROOF_H, w2);
    for (const side of [-1, 1])
      box(
        group,
        wallMat,
        [side * (doorHalf + frontW / 2), WALL_H / 2, -d2],
        [frontW, WALL_H, 0.16],
      );

    quoins(group, w2, d2);
    const roofPanels = roof(group, w2, d2, WALL_H, ROOF_H, repaired);
    if (repaired) closedDoor(group, doorHalf, d2);
    else boardedDoor(group, doorHalf, d2);

    group.userData = {
      repaired,
      roofPanelCount: roofPanels.length - 1, // minus the ridge board
      doorStyle: repaired ? "closed" : "boarded",
    };
    return group;
  }

  const api = {
    buildRefugeHouseGroup,
    HOUSE_W,
    HOUSE_D,
    WALL_H,
    ROOF_H,
    DOOR_W,
    CAMPAIGN_HOUSE_X,
    CAMPAIGN_HOUSE_Z,
    CAMPAIGN_HOUSE_ROTATION_Y,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderCampaignHouse = api;
})(typeof window !== "undefined" ? window : globalThis);
