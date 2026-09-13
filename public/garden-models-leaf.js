/* Leaf textures and geometry, cached per species type. */
(() => {
  const T = window.THREE,
    M = window.GardenModels;
  if (!T || !M) return;
  const mat = M.mat,
    mesh = M.mesh,
    leafMats = M.leafMats,
    textureCache = M.textureCache;
  function leafTexture(type, back) {
    const key = type + back;
    if (textureCache[key]) return textureCache[key];
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    const colors =
      type === "calathea"
        ? back
          ? ["#945665", "#5e334e"]
          : ["#bed1a0", "#5e9b65"]
        : type === "monstera"
          ? ["#4a965c", "#1e6543"]
          : ["#82b46c", "#397b50"];
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    if (type === "calathea" && !back) {
      for (let i = 0; i < 8; i++)
        for (const side of [-1, 1]) {
          const y = 65 + i * 50,
            w = 65 * Math.sin(((i + 1) / 9) * Math.PI);
          ctx.save();
          ctx.translate(256 + side * 80, y);
          ctx.rotate(side * -0.55);
          ctx.fillStyle = i % 2 ? "#386d4b" : "#2e6045";
          ctx.beginPath();
          ctx.ellipse(0, 0, w, 16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
    }
    ctx.strokeStyle = type === "calathea" && back ? "#bf8991" : "#b6ce86";
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.55;
    if (type === "pilea") {
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(256, 256);
        ctx.quadraticCurveTo(
          256 + Math.cos(a + 0.12) * 130,
          256 + Math.sin(a + 0.12) * 130,
          256 + Math.cos(a) * 244,
          256 + Math.sin(a) * 244,
        );
        ctx.stroke();
      }
      ctx.fillStyle = "#dbdea2";
      ctx.beginPath();
      ctx.arc(256, 256, 10, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(256, 512);
      ctx.lineTo(256, 0);
      ctx.stroke();
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 14; i++)
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(256, 42 + i * 32);
          ctx.quadraticCurveTo(
            256 + side * 100,
            i * 32,
            256 + side * 246,
            i * 32 - 36,
          );
          ctx.stroke();
        }
    }
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    textureCache[key] = texture;
    return texture;
  }
  const leafCache = {};
  function leafGeometry(type) {
    if (leafCache[type]) return leafCache[type];
    const shape = new T.Shape();
    if (type === "pilea") {
      shape.absellipse(0, 0.44, 0.43, 0.42, 0, Math.PI * 2, false, 0);
    } else if (type === "calathea") {
      shape.moveTo(0, 0);
      shape.bezierCurveTo(-0.55, 0.28, -0.44, 0.85, 0, 1.35);
      shape.bezierCurveTo(0.44, 0.85, 0.55, 0.28, 0, 0);
    } else {
      // Sinus cuts enter from the margin; fenestrations remain actual holes.
      shape.moveTo(0, 0.3);
      const side = (sign) => {
        const pts = [];
        for (let i = 0; i <= 80; i++) {
          const t = i / 80;
          let w = 0.88 * Math.pow(Math.sin(Math.PI * (0.15 + t * 0.85)), 0.7);
          for (const center of [0.37, 0.55, 0.71])
            w *= 1 - 0.7 * Math.exp(-Math.pow((t - center) / 0.016, 2));
          pts.push([sign * w, 0.06 + t * 1.56]);
        }
        return pts;
      };
      [...side(-1), ...side(1).reverse()].forEach(([x, y]) =>
        shape.lineTo(x, y),
      );
      shape.closePath();
      for (const sign of [-1, 1])
        for (const y of [0.43, 0.7, 0.95]) {
          const hole = new T.Path();
          hole.absellipse(
            sign * 0.17,
            y,
            0.045,
            0.085,
            0,
            Math.PI * 2,
            true,
            sign * -0.25,
          );
          shape.holes.push(hole);
        }
    }
    let g = new T.ShapeGeometry(shape, 32).toNonIndexed();
    // Subdivide before bending: curved leaves must not fold along a few large triangles.
    for (let pass = 0; pass < 2; pass++) {
      const input = g.attributes.position.array,
        points = [];
      for (let i = 0; i < input.length; i += 9) {
        const a = Array.from(input.slice(i, i + 3)),
          b = Array.from(input.slice(i + 3, i + 6)),
          c = Array.from(input.slice(i + 6, i + 9));
        const ab = a.map((v, n) => (v + b[n]) / 2),
          bc = b.map((v, n) => (v + c[n]) / 2),
          ca = c.map((v, n) => (v + a[n]) / 2);
        for (const triangle of [
          [a, ab, ca],
          [ab, b, bc],
          [ca, bc, c],
          [ab, bc, ca],
        ])
          points.push(...triangle.flat());
      }
      g.dispose();
      g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(points, 3));
    }
    g.setAttribute(
      "uv",
      new T.Float32BufferAttribute(
        new Float32Array(g.attributes.position.count * 2),
        2,
      ),
    );
    g.computeBoundingBox();
    const box = g.boundingBox,
      size = new T.Vector3();
    box.getSize(size);
    const pos = g.attributes.position,
      uv = g.attributes.uv;
    const normals = new Float32Array(pos.count * 3),
      normal = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        t = (y - box.min.y) / size.y;
      const camber =
        type === "pilea"
          ? 0.18 * (x * x + (y - 0.44) ** 2)
          : 0.12 * Math.sin(t * Math.PI) - 0.12 * t * t + 0.13 * x * x;
      // The articulation is the actual attachment point, including while scaling.
      const attachmentY = type === "pilea" ? 0.44 : box.min.y;
      pos.setXYZ(i, x, y - attachmentY, camber);
      uv.setXY(i, (x - box.min.x) / size.x, t);
      const slopeX = type === "pilea" ? 0.36 * x : 0.26 * x;
      const slopeY =
        type === "pilea"
          ? 0.36 * (y - 0.44)
          : (0.12 * Math.PI * Math.cos(t * Math.PI) - 0.24 * t) / size.y;
      normal
        .set(-slopeX, -slopeY, 1)
        .normalize()
        .toArray(normals, i * 3);
    }
    g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    leafCache[type] = g;
    return g;
  }
  function leaf(type) {
    // The blade opens radially outward; its local back faces the sky.
    if (!leafMats[type])
      leafMats[type] = [
        mat(0xffffff, { map: leafTexture(type, true), side: T.FrontSide }),
        mat(0xffffff, {
          map: leafTexture(type, false),
          side: T.BackSide,
          roughness: 0.5,
        }),
      ];
    const pivot = new T.Group();
    mesh(leafGeometry(type), leafMats[type][0], pivot);
    mesh(leafGeometry(type), leafMats[type][1], pivot);
    return pivot;
  }
  M.leaf = leaf;
  M.leafTexture = leafTexture;
})();
