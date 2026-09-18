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
      materialCache.set(key, new T.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...extra }));
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
    geo.setAttribute("position", new T.Float32BufferAttribute([L0, L1, L2, R0, R1, R2].flat(), 3));
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
      const m = box(parent, plank, [0, WALL_H * 0.52, -d2], [doorHalf * 2 + 0.3, 0.22, 0.06]);
      m.rotation.z = rot;
    }
  }

  // A hung door leaf: wood panel plus a darker inset, the exact look every NPC house already
  // uses in render-houses.js (minus the pivot animation, which needs the player-approach check
  // that function reads off `this.position` — out of scope here, no campaign player position
  // exists in the world yet, see C2.2v).
  function closedDoor(parent, doorHalf, d2) {
    const doorW = 1.15,
      doorH = 1.62;
    box(parent, mat(BARK), [0, doorH / 2, -d2 + 0.01], [doorW, doorH, 0.08]);
    box(parent, mat(BARK_DARK), [0, doorH / 2, -d2 - 0.02], [doorW - 0.16, doorH - 0.16, 0.02]);
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
    panels.push(box(parent, mat(BARK_DARK), [0, ridgeH, 0], [w2 * 2 + 0.34, 0.1, 0.14]));
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
        box(parent, mat(i % 2 ? STONE_DARK : STONE_MID), [cx, 0.32 + i * 0.55, cz], [0.4, 0.5, 0.4]);
  }

  // house: the {spaces:{...}} shape from campaign-house.js (GardenCampaignHouse.freshHouse()) —
  // only house.spaces.accueil.status is read, per the C3.2 exit criterion's own "au minimum la
  // pièce d'accueil, seul espace jouable à ce stade".
  function buildRefugeHouseGroup(house) {
    const repaired = !!(house && house.spaces && house.spaces.accueil && house.spaces.accueil.status === "repare");
    const group = new T.Group();
    const w2 = HOUSE_W / 2,
      d2 = HOUSE_D / 2,
      doorHalf = DOOR_W / 2,
      frontW = w2 - doorHalf,
      wallMat = mat(repaired ? STONE : STONE_DARK);

    box(group, mat(CREAM), [0, 0.02, 0], [HOUSE_W - 0.1, 0.05, HOUSE_D - 0.1]);
    box(group, mat(STONE_MID), [0, 0.1, 0], [HOUSE_W + 0.08, 0.2, HOUSE_D + 0.08]);

    box(group, wallMat, [0, WALL_H / 2, d2], [HOUSE_W, WALL_H, 0.16]);
    box(group, wallMat, [-w2, WALL_H / 2, 0], [0.16, WALL_H, HOUSE_D]);
    box(group, wallMat, [w2, WALL_H / 2, 0], [0.16, WALL_H, HOUSE_D]);
    gable(group, wallMat, 0.16, d2, WALL_H, ROOF_H, -w2);
    gable(group, wallMat, 0.16, d2, WALL_H, ROOF_H, w2);
    for (const side of [-1, 1])
      box(group, wallMat, [side * (doorHalf + frontW / 2), WALL_H / 2, -d2], [frontW, WALL_H, 0.16]);

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

  const api = { buildRefugeHouseGroup, HOUSE_W, HOUSE_D, WALL_H, ROOF_H, DOOR_W };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRenderCampaignHouse = api;
})(typeof window !== "undefined" ? window : globalThis);
