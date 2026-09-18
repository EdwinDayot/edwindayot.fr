/* The three visitor houses: static wall-circle collision plus the visitor's position. */
(function (root) {
  const P = (root.GardenDataParts = root.GardenDataParts || {});
  // A house is a static ring of collision circles (same pattern as trees and
  // resource sites) with a gap at the door; the visitor stands just inside.
  // The two circles flanking the door use a smaller radius than the rest of
  // the wall so the continuous (non-grid-locked) passage stays wide enough
  // for the camera-angle drift that any diagonal joystick/keyboard input
  // adds to straight-line movement (see tests/garden-houses.cjs).
  const houseWalls = (cx, cz, w, d, doorW, flankR = 0.4) => {
    const w2 = w / 2,
      d2 = d / 2,
      fo = (w2 + doorW / 2) / 2;
    return [
      { x: cx - w2, z: cz - d2, r: 0.55 },
      { x: cx + w2, z: cz - d2, r: 0.55 },
      { x: cx - w2, z: cz + d2, r: 0.55 },
      { x: cx + w2, z: cz + d2, r: 0.55 },
      { x: cx, z: cz + d2, r: 0.6 },
      { x: cx - w2, z: cz, r: 0.6 },
      { x: cx + w2, z: cz, r: 0.6 },
      { x: cx - fo, z: cz - d2, r: flankR },
      { x: cx + fo, z: cz - d2, r: flankR },
    ];
  };
  const HOUSE_W = 3.2,
    HOUSE_D = 3.2,
    DOOR_W = 2,
    ROOF_H = 2.75;
  // role/roleData describe what E does at this visitor (see game/data-roles.js);
  // personColor/props are the only per-visitor knobs render-houses.js reads,
  // so a new NPC is purely a data row here, never a new branch of code.
  // roofHeight/roofColor/chimney are cosmetic-only per-house variety knobs
  // (render-houses.js falls back to sane defaults when absent) so the row
  // of houses doesn't read as one clone repeated seven times.
  const buildings = [
    {
      visitorId: "lea",
      cx: -6.5,
      cz: 7,
      accent: 0x7f9e6f,
      personColor: 0xdbaea0,
      role: "trader",
      roofColor: 0x6b4a3a,
    },
    {
      visitorId: "noe",
      cx: -2.5,
      cz: 7,
      accent: 0xb08a5a,
      personColor: 0x9fafc0,
      role: "vendor",
      roleData: { wares: [{ item: "pot", cost: { coins: 8 } }] },
      roofColor: 0x5c4632,
      roofHeight: 2.6,
      chimney: true,
    },
    {
      visitorId: "iris",
      cx: 1.5,
      cz: 7,
      accent: 0x5f8f6a,
      personColor: 0xc5c895,
      role: "botanist",
      props: ["magnifier"],
      roofColor: 0x4a5a42,
      roofHeight: 2.9,
    },
    // Quartier des artisans (wave 1): a cluster of vendor-role NPCs, purely
    // data — proves adding an NPC needs no new branch anywhere (see 0.2).
    {
      visitorId: "mira",
      cx: -9.5,
      cz: 11.5,
      accent: 0xb8763f,
      personColor: 0xe0c19a,
      role: "vendor",
      roleData: {
        wares: [
          { item: "reservoir", cost: { coins: 14 } },
          { item: "bench", cost: { coins: 10 } },
        ],
      },
      roofColor: 0x7a5540,
      roofHeight: 2.65,
      chimney: true,
    },
    {
      visitorId: "basile",
      cx: -9.5,
      cz: 20,
      accent: 0x7a8f6a,
      personColor: 0xcf9b6d,
      role: "vendor",
      roleData: { wares: [{ item: "lantern", cost: { coins: 6 } }] },
      roofColor: 0x5c4632,
      roofHeight: 2.8,
    },
    {
      visitorId: "anouk",
      cx: -3.5,
      cz: 20,
      accent: 0xb08a5a,
      personColor: 0xd8b0c0,
      role: "vendor",
      roleData: { wares: [{ item: "path", cost: { coins: 4 } }] },
      roofColor: 0x6b4a3a,
      roofHeight: 2.6,
    },
    {
      visitorId: "ines",
      cx: -3.5,
      cz: 13.5,
      accent: 0x6f8f9c,
      personColor: 0xe8d4a0,
      role: "vendor",
      roleData: { wares: [{ item: "pot", cost: { coins: 8 } }] },
      roofColor: 0x4a5a42,
      roofHeight: 2.85,
      chimney: true,
    },
    // Two neighbours who just live in the garden: no wares, no quest, no
    // sign — the user asked for houses that aren't all utilitarian NPCs.
    // Positions verified against the actual collision/pathing engine (not
    // just distances): every house's doormat/threshold/drift points stay
    // walkable, the Épic 4.1 bulge placement test still succeeds, and both
    // player spawn fallbacks (-1,3) and (0,4) in render.js stay walkable.
    // A naive distance-only check isn't enough here — a first attempt at
    // (-7.5,16) looked clear by center-to-center distance alone but its
    // wall circles still reached into basile's doormat and blocked the
    // bulge-placement path, so both failed only once run through the real
    // engine (tests/garden-construction.cjs).
    {
      visitorId: "hugo",
      cx: 3,
      cz: 13.5,
      accent: 0x9c8a6a,
      personColor: 0xd9a66c,
      role: "resident",
      roleData: { line: "lit à l'ombre du grand arbre" },
      roofColor: 0x7a5540,
      roofHeight: 2.7,
    },
    {
      visitorId: "zoe",
      cx: -12.5,
      cz: 14,
      accent: 0x8aa0b0,
      personColor: 0xb98fae,
      role: "resident",
      roleData: { line: "fait la sieste l’après-midi" },
      roofColor: 0x5c4632,
      roofHeight: 2.55,
    },
    // Épic C3.5: le coin de village (zone 4), deux habitants génériques sans
    // identité narrative (voir note de tête de la phase 3 du backlog) — le
    // rôle "resident" existant suffit à prouver la capacité mécanique d'une
    // zone habitée ; l'identité et une éventuelle quête réelle sont un
    // chantier de la phase 4 (C4.3 et suivants).
    {
      visitorId: "villageois-1",
      cx: -11,
      cz: 26,
      accent: 0x7a8f6a,
      personColor: 0xcf9b6d,
      role: "resident",
      roleData: { line: "range le bois pour l’hiver" },
      roofColor: 0x6b4a3a,
      roofHeight: 2.6,
    },
    {
      visitorId: "villageois-2",
      cx: -1,
      cz: 26,
      accent: 0x9c8a6a,
      personColor: 0xdbaea0,
      role: "resident",
      roleData: { line: "répare une clôture" },
      roofColor: 0x5c4632,
      roofHeight: 2.7,
    },
  ].map(
    ({
      visitorId,
      cx,
      cz,
      accent,
      personColor,
      role,
      roleData,
      props,
      roofColor,
      roofHeight,
      chimney,
    }) => ({
      visitorId,
      x: cx,
      z: cz,
      w: HOUSE_W,
      d: HOUSE_D,
      roofHeight: roofHeight || ROOF_H,
      roofColor,
      chimney: !!chimney,
      accent,
      personColor,
      role,
      roleData: roleData || {},
      props: props || [],
      door: { w: DOOR_W, side: "s", x: cx, z: cz - HOUSE_D / 2 },
      wallCircles: houseWalls(cx, cz, HOUSE_W, HOUSE_D, DOOR_W),
    }),
  );
  const visitorNames = {
    lea: "Léa · échanges",
    noe: "Noé · équipements",
    iris: "Iris · botaniste",
    mira: "Mira · poterie",
    basile: "Basile · luminaires",
    anouk: "Anouk · pavage",
    ines: "Ines · céramique",
    hugo: "Hugo · lecture",
    zoe: "Zoé · sieste",
    "villageois-1": "Villageois 1 · coin de village",
    "villageois-2": "Villageois 2 · coin de village",
  };
  const visitors = buildings.map((b) => ({
    id: b.visitorId,
    name: visitorNames[b.visitorId],
    x: b.x,
    z: b.z - 0.4,
  }));
  P.buildings = buildings;
  P.visitors = visitors;
  if (typeof module !== "undefined") module.exports = { buildings, visitors };
})(globalThis);
