/* Articulated plant and pot meshes, built from the shared model parts. */
(() => {
  const T = window.THREE,
    M = window.GardenModels;
  if (!T || !M) return;
  const materials = M.materials,
    mesh = M.mesh,
    tube = M.tube,
    mat = M.mat,
    sharedPot = M.sharedPot,
    leaf = M.leaf;
  function plant(type) {
    const group = new T.Group(),
      leaves = [],
      structure = new T.Group();
    group.add(structure);
    const count = type === "pilea" ? 11 : type === "monstera" ? 7 : 9;
    const stem = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0),
      new T.Vector3(0.035, 0.45, 0),
      new T.Vector3(-0.035, 0.95, 0.015),
      new T.Vector3(0.015, type === "pilea" ? 1.42 : 1.16, 0),
    ]);
    if (type !== "calathea")
      mesh(
        new T.TubeGeometry(stem, 32, 0.03, 8, false),
        materials.stem,
        structure,
      );
    for (let i = 0; i < count; i++) {
      const age = i / (count - 1),
        a = i * 2.39996;
      const inner = type === "calathea" && i >= 6;
      const reach =
        type === "pilea"
          ? 0.66 - age * 0.31
          : type === "monstera"
            ? 0.66 - age * 0.23
            : inner
              ? 0.17
              : 0.46;
      const base =
        type === "calathea"
          ? new T.Vector3(Math.sin(a) * 0.085, 0, Math.cos(a) * 0.085)
          : stem.getPoint(0.18 + age * 0.82);
      const h =
        type === "calathea"
          ? inner
            ? 0.75 + (i - 6) * 0.12
            : 0.38 + (i % 3) * 0.075
          : base.y + 0.2 + (1 - age) * 0.08;
      const end = new T.Vector3(Math.sin(a) * reach, h, Math.cos(a) * reach);
      const branch = new T.Group();
      structure.add(branch);
      const blade = leaf(type);
      blade.position.copy(end);
      const tilt =
        type === "pilea"
          ? 1.48 - age * 0.4
          : type === "monstera"
            ? 1.17 - age * 0.38
            : inner
              ? 0.42 + (i - 6) * 0.1
              : 1.15 + (i % 3) * 0.045;
      blade.rotation.set(tilt, a, 0, "YXZ");
      // Meet the disc from underneath; meet elongated blades along their midrib.
      const tangent = new T.Vector3(
        0,
        type === "pilea" ? 0 : 1,
        type === "pilea" ? 1 : 0,
      ).applyEuler(blade.rotation);
      const control = end
        .clone()
        .addScaledVector(tangent, type === "pilea" ? 0.14 : -0.18);
      const middle = base.clone().lerp(end, 0.48);
      middle.y += 0.06;
      const petiole = tube(
        [base.toArray(), middle.toArray(), control.toArray(), end.toArray()],
        0.016,
        materials.stem,
        branch,
      );
      petiole.userData.attachment = end.toArray();
      const scale =
        type === "pilea"
          ? 0.96 - age * 0.3
          : type === "monstera"
            ? 0.84 - age * 0.16
            : inner
              ? 0.69
              : 0.84 + (i % 3) * 0.035;
      blade.scale.setScalar(scale);
      branch.add(blade);
      leaves.push({ blade, branch, base: blade.rotation.x, scale, phase: a });
    }
    group.userData = { leaves, structure, type };
    return group;
  }
  function pot(color) {
    const group = new T.Group();
    const points = [
      [0.34, 0.03],
      [0.4, 0.04],
      [0.43, 0.1],
      [0.54, 0.58],
      [0.56, 0.66],
      [0.55, 0.71],
      [0.5, 0.73],
      [0.46, 0.69],
      [0.46, 0.62],
      [0.37, 0.13],
      [0.34, 0.1],
    ].map(([x, y]) => new T.Vector2(x, y));
    const body = mesh(
      sharedPot("body", () => new T.LatheGeometry(points, 20)),
      mat(color, { roughness: 0.48 }),
      group,
    );
    mesh(
      sharedPot("soil", () => new T.CylinderGeometry(0.46, 0.46, 0.04, 16)),
      materials.soil,
      group,
      0,
      0.62,
    );
    const saucer = mesh(
      sharedPot("saucer", () => new T.CylinderGeometry(0.48, 0.5, 0.07, 20)),
      body.material,
      group,
      0,
      0.035,
    );
    const rim = mesh(
      sharedPot("rim", () => new T.TorusGeometry(0.49, 0.025, 6, 20)),
      mat(0xf4ddac),
      group,
      0,
      0.51,
    );
    rim.rotation.x = Math.PI / 2;
    rim.visible = false;
    const seed = mesh(
      sharedPot("seed", () => new T.SphereGeometry(0.08, 8, 6)),
      materials.seed,
      group,
      0,
      0.68,
    );
    seed.scale.set(0.65, 0.6, 1);
    group.userData = { body, saucer, rim, seed };
    return group;
  }
  M.plant = plant;
  M.pot = pot;
})();
