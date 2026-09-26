(() => {
  const T = window.THREE,
    M = window.GardenModels,
    D = window.GardenData,
    Terrain = window.GardenTerrain,
    G = window.GardenView;
  if (!T || !M || !D || !Terrain || !G) return;
  const WALL_H = 1.9;
  // Data-driven interior props, keyed by the building's `props` list
  // (data-buildings.js) instead of a per-id if-branch.
  const PROPS = {
    magnifier: (view, person) =>
      view.shape(
        person,
        "box",
        view.mat.cream,
        [0.3, 0.75, 0.15],
        [0.25, 0.3, 0.06],
      ),
  };
  Object.assign(G.prototype, {
    // Three closed houses in a row: walls, a two-pan roof, a door gap and a
    // visitor standing inside. Collision is the wall circles in data.js; this
    // is purely visual and clickable (see the userData.target traversal).
    buildHouses() {
      this.doors = [];
      this.roofs = [];
      for (const b of D.buildings) this.buildHouse(b);
    },
    // Epic C2.2v: the refuge house (render-campaign-house.js, C3.2) had a footprint and
    // materials but no world position and no live call site — this is that call site,
    // following the exact same "world-build time, called from render.js's world()" pattern as
    // buildHouses() just above. Kept as a separate method (not folded into buildHouses()) since
    // the refuge house has no D.buildings row to iterate — window.GardenRenderCampaignHouse is
    // read lazily here, not as a top-level const, since render-campaign-house.js is a sibling
    // module loaded by its own <script> tag and this file must not depend on script order (the
    // exact ordering-bug class index.html's own comments document repeatedly for other pairs).
    buildCampaignHouse() {
      const CampaignHouse = window.GardenRenderCampaignHouse;
      if (!CampaignHouse) return;
      if (this.campaignHouseGroup) this.scene.remove(this.campaignHouseGroup);
      const house = this.game.s.campaignHouse;
      this.campaignHouseGroup = CampaignHouse.buildRefugeHouseGroup(house);
      const x = CampaignHouse.CAMPAIGN_HOUSE_X,
        z = CampaignHouse.CAMPAIGN_HOUSE_Z;
      this.campaignHouseGroup.position.set(x, Terrain.terrainHeight(x, z), z);
      this.campaignHouseGroup.rotation.y =
        CampaignHouse.CAMPAIGN_HOUSE_ROTATION_Y;
      this.scene.add(this.campaignHouseGroup);
      // Cached so render-flow.js's sync() can rebuild only when this one field actually
      // changes (repairHouseSpace, garden-state-cmd-l.js) instead of every ~0.25s tick.
      this.campaignHouseAccueilStatus = house?.spaces?.accueil?.status;
    },
    // Epic C6.14: the chapter-17 passage point (campaign-passage.js, C6.12/C6.13) had a real
    // world position and an effective navigation obstacle but no representation and no scene call
    // site before this — same gap, same "world-build time, called from render.js's world()"
    // pattern buildCampaignHouse() just above already fills for the refuge house.
    // window.GardenCampaignPassage/window.GardenRenderCampaignPassage are read lazily here (not
    // top-level consts) for the same script-order-independence reason buildCampaignHouse reads
    // window.GardenRenderCampaignHouse lazily.
    buildCampaignPassage() {
      const Passage = window.GardenCampaignPassage,
        RenderPassage = window.GardenRenderCampaignPassage;
      if (!Passage || !RenderPassage) return;
      if (this.campaignPassageGroup) this.scene.remove(this.campaignPassageGroup);
      const blocked = !!this.game.s.campaignPassage?.blocked;
      this.campaignPassageGroup = RenderPassage.buildPassageGroup(blocked);
      const x = Passage.PASSAGE_POSITION.x,
        z = Passage.PASSAGE_POSITION.z;
      this.campaignPassageGroup.position.set(x, Terrain.terrainHeight(x, z), z);
      this.scene.add(this.campaignPassageGroup);
      // Cached so render-flow.js's sync() can rebuild only when this one field actually changes
      // (restorePassage, garden-state-cmd-w.js) instead of every ~0.25s tick — same pattern as
      // campaignHouseAccueilStatus just above.
      this.campaignPassageBlocked = blocked;
    },
    // A gable end: rectangle-plus-triangle profile (eave to eave, up to the
    // ridge) extruded to `thickness`, so the wall actually follows the roof
    // pitch instead of a full-height rectangular block the sloped roof
    // panels have to cut through (the "toit qui passe à travers les murs"
    // bug — a flat block reaching roofHeight along the whole depth, while
    // the roof itself is only that tall right at the ridge, z=0). Winding
    // of each triangle is hand-picked (checked against the cross product)
    // so every face's computed normal already points outward; there is no
    // bottom face since this sits flush on top of the WALL_H rectangle
    // wall built right below it and that seam is never visible.
    gableGeometry(thickness, d2, wallH, ridgeH) {
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
      // 0,1,2 left cap · 3,5,4 right cap · 0,5,3 + 0,2,5 front slope ·
      // 1,4,5 + 1,5,2 back slope.
      geo.setIndex([0, 1, 2, 3, 5, 4, 0, 5, 3, 0, 2, 5, 1, 4, 5, 1, 5, 2]);
      geo.computeVertexNormals();
      return geo;
    },
    buildHouse(b) {
      const group = new T.Group();
      group.position.set(b.x, Terrain.terrainHeight(b.x, b.z), b.z);
      this.scene.add(group);
      const d2 = b.d / 2,
        w2 = b.w / 2,
        doorHalf = b.door.w / 2,
        stone = this.mat.stone,
        stoneDark = (this.stoneDark ??= M.mat(0x8f8a76)),
        trim = M.mat(b.accent),
        roofMat = M.mat(b.roofColor || 0x5c4632),
        // Epic C6.24 (docs/campagne-backlog.md) : le seul bâtiment portant
        // b.greenhouse (Jeanne, C6.22) échange le mur plat stone contre le
        // verre déjà en usage pour l'objet « Serre » du jardin libre
        // (render-scene.js, même teinte/opacité/rugosité à l'identique,
        // déjà couvert par TRANSPARENT_ALLOWLIST/cbe8e2 dans
        // tests/garden-material-audit.cjs — élargi à ce second site).
        // wallMat ne remplace stone que sur les quatre panneaux plats
        // (arrière, deux murs latéraux, façade) ; les pignons triangulaires
        // (gableGeometry, ci-dessous) et le toit gardent stone/roofMat
        // inchangés, comme documenté dans la limite honnête de l'epic.
        wallMat = b.greenhouse
          ? (this.greenhouseWallGlass ??= M.mat(0xcbe8e2, {
              transparent: true,
              opacity: 0.4,
              roughness: 0.15,
            }))
          : stone,
        frontW = w2 - doorHalf;
      const floor = this.shape(
        group,
        "box",
        this.mat.cream,
        [0, 0.02, 0],
        [b.w - 0.1, 0.05, b.d - 0.1],
      );
      floor.castShadow = false;
      // A low stone footer around the whole base, then walls of stacked
      // fieldstone (two toned blocks per course) instead of wood planks.
      this.shape(
        group,
        "box",
        stoneDark,
        [0, 0.1, 0],
        [b.w + 0.08, 0.2, b.d + 0.08],
      );
      // Back wall, and the two gable-end walls: an eave-height rectangle
      // plus a triangular cap that actually follows the roof pitch (see
      // gableGeometry above) instead of a rectangle reaching the ridge
      // height along the whole depth.
      this.shape(group, "box", wallMat, [0, WALL_H / 2, d2], [b.w, WALL_H, 0.16]);
      this.shape(
        group,
        "box",
        wallMat,
        [-w2, WALL_H / 2, 0],
        [0.16, WALL_H, b.d],
      );
      this.shape(group, "box", wallMat, [w2, WALL_H / 2, 0], [0.16, WALL_H, b.d]);
      // The triangular gable cap always stays opaque stone, greenhouse or
      // not (see the wallMat comment above): only the eave-height wall
      // panels below it turn to glass.
      const gable = this.gableGeometry(0.16, d2, WALL_H, b.roofHeight);
      this.shape(group, gable, stone, [-w2, 0, 0]);
      this.shape(group, gable, stone, [w2, 0, 0]);
      // Front wall, split either side of the door.
      for (const side of [-1, 1])
        this.shape(
          group,
          "box",
          wallMat,
          [side * (doorHalf + frontW / 2), WALL_H / 2, -d2],
          [frontW, WALL_H, 0.16],
        );
      // Visible fieldstone blocks studding each wall face, two alternating
      // tones so the stonework reads at a glance instead of a flat slab.
      let studIndex = 0;
      const stud = (x, y, z, rot) => {
        const s = this.shape(
          group,
          "box",
          studIndex++ % 2 ? stoneDark : stone,
          [x, y, z],
          [0.34, 0.3, 0.34],
        );
        s.rotation.y = rot;
      };
      for (const y of [0.45, 0.95, 1.45]) {
        stud(-b.w * 0.28, y, d2 + 0.01, 0);
        stud(b.w * 0.28, y, d2 + 0.01, 0);
        stud(-w2 - 0.01, y, -b.d * 0.22, Math.PI / 2);
        stud(-w2 - 0.01, y, b.d * 0.22, Math.PI / 2);
        stud(w2 + 0.01, y, -b.d * 0.22, Math.PI / 2);
        stud(w2 + 0.01, y, b.d * 0.22, Math.PI / 2);
      }
      for (const side of [-1, 1])
        for (const y of [0.45, 0.95, 1.45])
          stud(side * (doorHalf + frontW * 0.5), y, -d2 - 0.01, 0);
      // Corner quoins: stacked stone blocks proud of both wall faces.
      for (const [cx, cz] of [
        [-w2, d2],
        [w2, d2],
        [-w2, -d2],
        [w2, -d2],
      ])
        for (let i = 0; i < 3; i++)
          this.shape(
            group,
            "box",
            i % 2 ? stoneDark : stone,
            [cx, 0.32 + i * 0.55, cz],
            [0.4, 0.5, 0.4],
          );
      this.shape(
        group,
        "box",
        trim,
        [0, WALL_H + 0.07, -d2],
        [b.door.w + 0.3, 0.14, 0.16],
      );
      // Two roof panels sloping down from the ridge (z=0) to each eave, plus
      // the ridge board and chimney: collected into `roofPieces` so
      // updateDoors can hide the whole roof on approach (see there) — a
      // closed roof over the whole footprint otherwise means the interior
      // (floor, visitor, lamp) is never actually visible from the game's
      // fixed elevated camera angle, door open or not.
      const roofPieces = [],
        dy = b.roofHeight - WALL_H,
        len = Math.hypot(dy, d2),
        angle = Math.atan2(dy, d2);
      for (const side of [-1, 1]) {
        const panel = this.shape(
          group,
          "box",
          roofMat,
          [0, (WALL_H + b.roofHeight) / 2, (side * d2) / 2],
          [b.w + 0.3, 0.1, len],
        );
        panel.rotation.x = side * angle;
        roofPieces.push(panel);
      }
      roofPieces.push(
        this.shape(
          group,
          "box",
          trim,
          [0, b.roofHeight, 0],
          [b.w + 0.34, 0.1, 0.14],
        ),
      );
      // A stone chimney breast on a subset of houses (data-driven, see
      // data-buildings.js), stood against the outside of the gable wall so
      // it never has to cut through the sloped roof panel above it.
      if (b.chimney) {
        const chimTop = b.roofHeight + 0.6,
          chimX = w2 + 0.22,
          chimZ = d2 * 0.1;
        roofPieces.push(
          this.shape(
            group,
            "box",
            stoneDark,
            [chimX, chimTop / 2, chimZ],
            [0.34, chimTop, 0.34],
          ),
          this.shape(
            group,
            "box",
            stoneDark,
            [chimX, chimTop + 0.08, chimZ],
            [0.46, 0.14, 0.46],
          ),
        );
      }
      this.roofs.push({ pieces: roofPieces, x: b.door.x, z: b.door.z });
      // Door leaf, visual-only: pivots open on approach (see updateDoors).
      // Sized like a real door (not the full walkable gap, which stays wide
      // for joystick/keyboard drift tolerance — see houseWalls() in
      // data-buildings.js) and built from a wood panel + frame instead of
      // one flat accent-colored slab, which read as an oversized colored
      // wall against the new stone masonry.
      const doorW = 1.3,
        doorH = 1.65,
        pivot = new T.Group();
      pivot.position.set(-doorHalf, 0, -d2);
      group.add(pivot);
      this.shape(
        pivot,
        "box",
        this.mat.bark,
        [doorHalf, doorH / 2, 0],
        [doorW, doorH, 0.08],
      );
      this.shape(
        pivot,
        "box",
        M.mat(0x6b5540),
        [doorHalf, doorH / 2, -0.03],
        [doorW - 0.16, doorH - 0.16, 0.02],
      );
      this.shape(
        pivot,
        "box",
        trim,
        [doorHalf, doorH * 0.62, -0.045],
        [0.06, 0.06, 0.09],
      );
      // Stone jambs filling the reveal between the door leaf and the
      // wall's open gap (doorHalf*2 wide) on both sides.
      for (const side of [-1, 1])
        this.shape(
          group,
          "box",
          stoneDark,
          [side * (doorHalf - 0.12), WALL_H / 2, -d2],
          [0.24, WALL_H, 0.14],
        );
      // A small hanging sign for the actual shopkeepers (role: "vendor"),
      // planted in the yard beside the door — so a vendor reads differently
      // at a glance from a resident who has nothing to sell.
      if (b.role === "vendor") {
        const signX = doorHalf + 0.55,
          signZ = -d2 - 0.5,
          postH = 1.1;
        this.shape(
          group,
          "box",
          stoneDark,
          [signX, postH / 2, signZ],
          [0.08, postH, 0.08],
        );
        this.shape(
          group,
          "box",
          trim,
          [signX, postH - 0.15, signZ],
          [0.5, 0.28, 0.04],
        );
        this.shape(
          group,
          "ball",
          M.mat(0xf3e6b8),
          [signX, postH - 0.15, signZ - 0.03],
          [0.06, 0.06, 0.02],
        );
      }
      // A ceiling lamp fixture; the light itself joins the shared local-light pool.
      this.shape(
        group,
        "ball",
        M.mat(0xf3e6b8),
        [0, WALL_H - 0.1, 0.3],
        [0.1, 0.1, 0.1],
      );
      // One interior prop per visitor, non-collidable furniture.
      this.shape(
        group,
        "box",
        M.mat(0x7a8f6a),
        [w2 - 0.55, 0.3, d2 - 0.55],
        [0.55, 0.6, 0.5],
      );
      const person = this.person(b.personColor);
      person.position.set(0, 0, -0.4);
      person.rotation.y = Math.PI;
      person.userData.can.visible = false;
      person.userData.target = b.visitorId;
      for (const prop of b.props) PROPS[prop]?.(this, person);
      group.add(person);
      group.traverse((o) => {
        if (o.isMesh) o.userData.target = b.visitorId;
      });
      this.scene.add(
        this.label(
          D.visitors.find((v) => v.id === b.visitorId).name,
          b.x,
          Terrain.terrainHeight(b.x, b.z) + b.roofHeight + 0.15,
          b.z,
          1.6,
        ),
      );
      this.nodes.set(b.visitorId, group);
      this.doors.push({ pivot, x: b.door.x, z: b.door.z });
    },
    updateDoors(reduced) {
      if (!this.doors) return;
      const open = -Math.PI / 2.3;
      for (let i = 0; i < this.doors.length; i++) {
        const door = this.doors[i];
        const near =
          Math.hypot(this.position.x - door.x, this.position.z - door.z) < 1.8;
        const target = near ? open : 0;
        door.pivot.rotation.y = reduced
          ? target
          : door.pivot.rotation.y + (target - door.pivot.rotation.y) * 0.18;
        // Lift the roof off the house you're at, otherwise the interior
        // (floor, visitor, lamp) is never actually visible: from this
        // game's fixed elevated camera angle a closed roof always covers
        // the footprint from above regardless of which way the door faces.
        // Cheap and instant (no fade) since updateBatches already checks
        // .visible on every mesh each frame (render-light.js) — no batch
        // rebuild needed.
        for (const piece of this.roofs[i].pieces) piece.visible = !near;
      }
    },
  });
})();
