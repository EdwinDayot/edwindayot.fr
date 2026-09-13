/* The make() silhouette builder for every species. */
(() => {
  const T = window.THREE,
    M = window.GardenModels,
    P = window.GardenBotanyParts;
  if (!T || !M || !P) return;
  const { ball, stem, colors, green, dark, shape } = P;
  function make(type) {
    const ball = new T.SphereGeometry(1, 12, 8);
    if (["pilea", "monstera", "calathea"].includes(type)) return M.plant(type);
    const g = new T.Group(),
      mat = M.mat(colors[type]);
    if (type === "cactus") {
      shape(g, ball, mat, 0, 0.65, 0, 0.38, 0.7, 0.36);
      shape(g, ball, mat, 0.42, 0.45, 0, 0.18, 0.32, 0.18);
      shape(g, ball, mat, -0.36, 0.68, 0, 0.15, 0.28, 0.16);
      for (let i = 0; i < 7; i++) {
        const a = (i * Math.PI * 2) / 7;
        const rib = shape(
          g,
          ball,
          M.mat(0xb8c39c),
          Math.cos(a) * 0.355,
          0.66,
          Math.sin(a) * 0.355,
          0.018,
          0.56,
          0.018,
        );
        rib.name = "rib";
      }
      const flower = M.mat(0xd7a3ac);
      for (let i = 0; i < 6; i++)
        shape(
          g,
          ball,
          flower,
          Math.sin(i) * 0.09,
          1.32,
          Math.cos(i) * 0.09,
          0.08,
          0.04,
          0.065,
        );
    } else if (type === "aloe" || type === "echeveria") {
      for (let i = 0; i < (type === "aloe" ? 11 : 24); i++) {
        const a = i * 2.39996,
          inner = i / (type === "aloe" ? 11 : 24),
          h = type === "aloe" ? 1.2 : 0.55;
        const leaf = shape(
          g,
          type === "aloe"
            ? new T.ConeGeometry(0.11, 1, 5).translate(0, 0.5, 0)
            : ball,
          mat,
          Math.sin(a) * (0.3 - inner * 0.17),
          0.16 + inner * 0.15,
          Math.cos(a) * (0.3 - inner * 0.17),
          type === "aloe" ? 1 : 0.18,
          type === "aloe" ? h : 0.4,
          type === "aloe" ? 1 : 0.075,
        );
        leaf.rotation.set(
          Math.sin(a) * (1 - inner * 0.7),
          a,
          Math.cos(a) * (1 - inner * 0.7),
        );
      }
    } else if (["lavender", "sunflower", "daisy"].includes(type)) {
      const count = type === "sunflower" ? 1 : type === "daisy" ? 5 : 9;
      for (let i = 0; i < count; i++) {
        const a = i * 2.4,
          x = Math.sin(a) * 0.28,
          z = Math.cos(a) * 0.28,
          h = type === "sunflower" ? 1.8 : 0.65 + (i % 3) * 0.18;
        shape(g, stem, green, x, h / 2, z, 1, h, 1);
        for (const sign of [-1, 1]) {
          const l = shape(
            g,
            ball,
            green,
            x + sign * 0.12,
            h * 0.45,
            z,
            0.18,
            0.04,
            0.085,
          );
          l.rotation.z = sign * 0.5;
        }
        if (type === "lavender") {
          for (let n = 0; n < 5; n++)
            shape(
              g,
              ball,
              mat,
              x,
              h + n * 0.065,
              z,
              0.065 - n * 0.007,
              0.07,
              0.065 - n * 0.007,
            );
        } else {
          const petals = type === "sunflower" ? 12 : 9,
            r = type === "sunflower" ? 0.29 : 0.15;
          for (let n = 0; n < petals; n++) {
            const b = (n * Math.PI * 2) / petals;
            const p = shape(
              g,
              ball,
              mat,
              x + Math.cos(b) * r,
              h + Math.sin(b) * r,
              z,
              0.12,
              type === "sunflower" ? 0.055 : 0.035,
              0.04,
            );
            p.rotation.z = b;
          }
          shape(
            g,
            ball,
            type === "sunflower" ? dark : M.mat(0xe1b153),
            x,
            h,
            z + 0.045,
            r * 0.53,
            r * 0.53,
            0.065,
          );
        }
      }
    } else if (type === "fern") {
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const tip = [
          Math.sin(a) * 0.72,
          0.65 + (i % 3) * 0.13,
          Math.cos(a) * 0.72,
        ];
        M.tube(
          [[0, 0, 0], [tip[0] * 0.45, 0.75, tip[2] * 0.45], tip],
          0.015,
          green,
          g,
        );
        for (let n = 1; n < 9; n++)
          for (const sign of [-1, 1]) {
            const t = n / 9,
              l = shape(
                g,
                ball,
                mat,
                tip[0] * t + Math.cos(a) * sign * 0.12 * (1 - t * 0.5),
                0.7 * Math.sin(t * 1.5) + 0.08,
                tip[2] * t - Math.sin(a) * sign * 0.12 * (1 - t * 0.5),
                0.16 * (1 - t * 0.65),
                0.026,
                0.048,
              );
            l.rotation.y = -a + sign * 0.6;
          }
      }
    } else if (type === "pothos") {
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1;
        M.tube(
          [
            [0, 0, 0],
            [Math.sin(a) * 0.3, 0.4, Math.cos(a) * 0.3],
            [Math.sin(a) * 0.65, -0.45, Math.cos(a) * 0.65],
          ],
          0.025,
          green,
          g,
        );
        for (let n = 0; n < 6; n++) {
          const t = n / 5,
            l = shape(
              g,
              ball,
              mat,
              Math.sin(a) * (0.15 + t * 0.5),
              0.3 - t * 0.65,
              Math.cos(a) * (0.15 + t * 0.5),
              0.19,
              0.045,
              0.24,
            );
          l.rotation.set(0.2, a + n * 0.5, 0.2);
          shape(
            g,
            ball,
            M.mat(0xb4bd72),
            l.position.x,
            l.position.y + 0.025,
            l.position.z,
            0.055,
            0.02,
            0.18,
          ).rotation.y = a + n * 0.5;
        }
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const a = i * 2.4,
          x = Math.sin(a) * 0.4,
          z = Math.cos(a) * 0.4,
          h = 0.35 + (i % 3) * 0.18;
        M.tube(
          [
            [0, 0, 0],
            [x * 0.4, h, z * 0.4],
            [x, h, z],
          ],
          0.02,
          green,
          g,
        );
        const leaf = shape(g, ball, mat, x, h, z, 0.18, 0.045, 0.38);
        leaf.rotation.y = a;
        for (let n = -2; n <= 2; n++) {
          const vein = shape(
            g,
            ball,
            M.mat(0xcb9f97),
            x + Math.sin(a) * n * 0.1,
            h + 0.042,
            z + Math.cos(a) * n * 0.1,
            0.14,
            0.008,
            0.018,
          );
          vein.rotation.y = a;
        }
      }
    }
    return g;
  }
  P.make = make;
})();
