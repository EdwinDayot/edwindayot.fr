/* Baked geometry cache and the public GardenBotany export. */
(() => {
  const T = window.THREE,
    M = window.GardenModels,
    P = window.GardenBotanyParts;
  if (!T || !M || !P) return;
  const { cache } = P;
  function bake(group) {
    group.updateMatrixWorld(true);
    const batches = new Map();
    group.traverse((o) => {
      if (!o.isMesh) return;
      const key = o.material.uuid;
      if (!batches.has(key))
        batches.set(key, {
          material: o.material,
          position: [],
          normal: [],
          uv: [],
        });
      const b = batches.get(key),
        geo = (
          o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
        ).applyMatrix4(o.matrixWorld);
      for (const attr of ["position", "normal", "uv"]) {
        const src = geo.attributes[attr]?.array;
        if (src) {
          for (let i = 0; i < src.length; i++) b[attr].push(src[i]);
        } else if (attr === "uv")
          for (let i = 0; i < geo.attributes.position.count * 2; i++)
            b.uv.push(0);
      }
      geo.dispose();
    });
    const result = new T.Group();
    for (const b of batches.values()) {
      const geo = new T.BufferGeometry();
      for (const name of ["position", "normal", "uv"])
        geo.setAttribute(
          name,
          new T.Float32BufferAttribute(b[name], name === "uv" ? 2 : 3),
        );
      geo.computeBoundingSphere();
      M.mesh(geo, b.material, result);
    }
    return result;
  }
  P.bake = bake;
  window.GardenBotany = {
    create(type) {
      if (!cache.has(type)) cache.set(type, bake(P.make(type)));
      return cache.get(type).clone();
    },
    make: P.make,
    bake,
  };
})();
