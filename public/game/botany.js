/* One canonical, cached silhouette per species. Camera distance never changes its size. */
(() => {
  const T = window.THREE,
    M = window.GardenModels;
  if (!T || !M) return;
  const ball = new T.SphereGeometry(1, 12, 8),
    stem = new T.CylinderGeometry(0.025, 0.035, 1, 7);
  const colors = {
    pothos: 0x78a655,
    fern: 0x559064,
    maranta: 0x56885c,
    lavender: 0x9a83b5,
    sunflower: 0xe8bd53,
    daisy: 0xf4efd8,
    aloe: 0x75a99a,
    echeveria: 0x9dbbac,
    cactus: 0x709773,
  };
  const green = M.mat(0x53825c),
    dark = M.mat(0x455f3d),
    cache = new Map();
  function shape(group, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
    const m = M.mesh(geo, mat, group, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  }
  window.GardenBotanyParts = {
    ball,
    stem,
    colors,
    green,
    dark,
    cache,
    shape,
  };
})();
