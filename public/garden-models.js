/* Original, articulated botanical meshes. No downloaded product models or textures. */
(() => {
  const T = window.THREE;
  const materialCache = new Map();
  const mat = (color, extra = {}) => {
    const key =
      color +
      ":" +
      Object.keys(extra)
        .sort()
        .map((k) => k + "=" + (extra[k]?.uuid || extra[k]))
        .join(",");
    if (!materialCache.has(key))
      materialCache.set(
        key,
        new T.MeshStandardMaterial({ color, roughness: 0.72, ...extra }),
      );
    return materialCache.get(key);
  };
  const materials = {
    stem: mat(0x47784a),
    soil: mat(0x493323),
    seed: mat(0xa37a45),
    vein: mat(0xa6bf76),
  };
  function mesh(g, m, parent, x = 0, y = 0, z = 0) {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function tube(points, radius, material, parent) {
    const path = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
    return mesh(
      new T.TubeGeometry(path, 14, radius, 6, false),
      material,
      parent,
    );
  }
  const textureCache = {};
  const leafMats = {};
  const potGeometries = {};
  const sharedPot = (key, create) =>
    potGeometries[key] || (potGeometries[key] = create());
  const M = (window.GardenModels = {
    mesh,
    tube,
    mat,
    materials,
    textureCache,
    leafMats,
    sharedPot,
  });
})();
