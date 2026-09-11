/* Original, articulated botanical meshes. No downloaded product models or textures. */
(() => {
  const T = window.THREE;
  const materialCache = new Map();
  const mat = (color, extra = {}) => {
    const key = color + ':' + Object.keys(extra).sort().map(k => k + '=' + (extra[k]?.uuid || extra[k])).join(',');
    if (!materialCache.has(key)) materialCache.set(key, new T.MeshStandardMaterial({ color, roughness: .72, ...extra }));
    return materialCache.get(key);
  };
  const materials = { stem: mat(0x47784a), soil: mat(0x493323), seed: mat(0xa37a45), vein: mat(0xa6bf76) };
  function mesh(g, m, parent, x = 0, y = 0, z = 0) {
    const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  function tube(points, radius, material, parent) {
    const path = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    return mesh(new T.TubeGeometry(path, 14, radius, 6, false), material, parent);
  }
  const textureCache = {};
  function leafTexture(type, back) {
    const key = type + back;
    if (textureCache[key]) return textureCache[key];
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const ctx = c.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    const colors = type === 'calathea' ? (back ? ['#945665', '#5e334e'] : ['#bed1a0', '#5e9b65']) : type === 'monstera' ? ['#4a965c', '#1e6543'] : ['#82b46c', '#397b50'];
    gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512);
    if (type === 'calathea' && !back) {
      for (let i = 0; i < 8; i++) for (const side of [-1, 1]) {
        const y = 65 + i * 50, w = 65 * Math.sin((i + 1) / 9 * Math.PI);
        ctx.save(); ctx.translate(256 + side * 80, y); ctx.rotate(side * -.55);
        ctx.fillStyle = i % 2 ? '#386d4b' : '#2e6045'; ctx.beginPath(); ctx.ellipse(0, 0, w, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    ctx.strokeStyle = type === 'calathea' && back ? '#bf8991' : '#b6ce86'; ctx.lineWidth = 3; ctx.globalAlpha = .55;
    if (type === 'pilea') {
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        ctx.beginPath(); ctx.moveTo(256, 256); ctx.quadraticCurveTo(256 + Math.cos(a + .12) * 130, 256 + Math.sin(a + .12) * 130, 256 + Math.cos(a) * 244, 256 + Math.sin(a) * 244); ctx.stroke();
      }
      ctx.fillStyle = '#dbdea2'; ctx.beginPath(); ctx.arc(256, 256, 10, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(256, 512); ctx.lineTo(256, 0); ctx.stroke();
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 14; i++) for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(256, 42 + i * 32); ctx.quadraticCurveTo(256 + side * 100, i * 32, 256 + side * 246, i * 32 - 36); ctx.stroke();
      }
    }
    const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
    textureCache[key] = texture; return texture;
  }
  const leafCache = {};
  function leafGeometry(type) {
    if (leafCache[type]) return leafCache[type];
    const shape = new T.Shape();
    if (type === 'pilea') {
      shape.absellipse(0, .44, .43, .42, 0, Math.PI * 2, false, 0);
    } else if (type === 'calathea') {
      shape.moveTo(0, 0); shape.bezierCurveTo(-.55, .28, -.44, .85, 0, 1.35); shape.bezierCurveTo(.44, .85, .55, .28, 0, 0);
    } else {
      // Sinus cuts enter from the margin; fenestrations remain actual holes.
      shape.moveTo(0, .3);
      const side = sign => {
        const pts = [];
        for (let i = 0; i <= 80; i++) {
          const t = i / 80;
          let w = .88 * Math.pow(Math.sin(Math.PI * (.15 + t * .85)), .7);
          for (const center of [.37, .55, .71]) w *= 1 - .70 * Math.exp(-Math.pow((t - center) / .016, 2));
          pts.push([sign * w, .06 + t * 1.56]);
        }
        return pts;
      };
      [...side(-1), ...side(1).reverse()].forEach(([x, y]) => shape.lineTo(x, y)); shape.closePath();
      for (const sign of [-1, 1]) for (const y of [.43, .7, .95]) {
        const hole = new T.Path(); hole.absellipse(sign * .17, y, .045, .085, 0, Math.PI * 2, true, sign * -.25); shape.holes.push(hole);
      }
    }
    let g = new T.ShapeGeometry(shape, 32).toNonIndexed();
    // Subdivide before bending: curved leaves must not fold along a few large triangles.
    for (let pass = 0; pass < 2; pass++) {
      const input = g.attributes.position.array, points = [];
      for (let i = 0; i < input.length; i += 9) {
        const a = Array.from(input.slice(i, i + 3)), b = Array.from(input.slice(i + 3, i + 6)), c = Array.from(input.slice(i + 6, i + 9));
        const ab = a.map((v, n) => (v + b[n]) / 2), bc = b.map((v, n) => (v + c[n]) / 2), ca = c.map((v, n) => (v + a[n]) / 2);
        for (const triangle of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) points.push(...triangle.flat());
      }
      g.dispose(); g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    }
    g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.computeBoundingBox(); const box = g.boundingBox, size = new T.Vector3(); box.getSize(size);
    const pos = g.attributes.position, uv = g.attributes.uv;
    const normals = new Float32Array(pos.count * 3), normal = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), t = (y - box.min.y) / size.y;
      const camber = type === 'pilea' ? .18 * (x * x + (y - .44) ** 2) : .12 * Math.sin(t * Math.PI) - .12 * t * t + .13 * x * x;
      // The articulation is the actual attachment point, including while scaling.
      const attachmentY = type === 'pilea' ? .44 : box.min.y;
      pos.setXYZ(i, x, y - attachmentY, camber); uv.setXY(i, (x - box.min.x) / size.x, t);
      const slopeX = type === 'pilea' ? .36 * x : .26 * x;
      const slopeY = type === 'pilea' ? .36 * (y - .44) : (.12 * Math.PI * Math.cos(t * Math.PI) - .24 * t) / size.y;
      normal.set(-slopeX, -slopeY, 1).normalize().toArray(normals, i * 3);
    }
    g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    g.computeBoundingBox(); g.computeBoundingSphere(); leafCache[type] = g; return g;
  }
  const leafMats = {};
  function leaf(type) {
    // The blade opens radially outward; its local back faces the sky.
    if (!leafMats[type]) leafMats[type] = [mat(0xffffff, { map: leafTexture(type, true), side: T.FrontSide }), mat(0xffffff, { map: leafTexture(type, false), side: T.BackSide, roughness: .5 })];
    const pivot = new T.Group();
    mesh(leafGeometry(type), leafMats[type][0], pivot);
    mesh(leafGeometry(type), leafMats[type][1], pivot);
    return pivot;
  }
  function plant(type) {
    const group = new T.Group(), leaves = [], structure = new T.Group(); group.add(structure);
    const count = type === 'pilea' ? 11 : type === 'monstera' ? 7 : 9;
    const stem = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0), new T.Vector3(.035, .45, 0),
      new T.Vector3(-.035, .95, .015), new T.Vector3(.015, type === 'pilea' ? 1.42 : 1.16, 0)
    ]);
    if (type !== 'calathea') mesh(new T.TubeGeometry(stem, 32, .03, 8, false), materials.stem, structure);
    for (let i = 0; i < count; i++) {
      const age = i / (count - 1), a = i * 2.39996;
      const inner = type === 'calathea' && i >= 6;
      const reach = type === 'pilea' ? .66 - age * .31 : type === 'monstera' ? .66 - age * .23 : inner ? .17 : .46;
      const base = type === 'calathea'
        ? new T.Vector3(Math.sin(a) * .085, 0, Math.cos(a) * .085)
        : stem.getPoint(.18 + age * .82);
      const h = type === 'calathea' ? (inner ? .75 + (i - 6) * .12 : .38 + i % 3 * .075) : base.y + .2 + (1 - age) * .08;
      const end = new T.Vector3(Math.sin(a) * reach, h, Math.cos(a) * reach);
      const branch = new T.Group(); structure.add(branch);
      const blade = leaf(type); blade.position.copy(end);
      const tilt = type === 'pilea' ? 1.48 - age * .4 : type === 'monstera' ? 1.17 - age * .38 : inner ? .42 + (i - 6) * .1 : 1.15 + i % 3 * .045;
      blade.rotation.set(tilt, a, 0, 'YXZ');
      // Meet the disc from underneath; meet elongated blades along their midrib.
      const tangent = new T.Vector3(0, type === 'pilea' ? 0 : 1, type === 'pilea' ? 1 : 0).applyEuler(blade.rotation);
      const control = end.clone().addScaledVector(tangent, type === 'pilea' ? .14 : -.18);
      const middle = base.clone().lerp(end, .48); middle.y += .06;
      const petiole = tube([base.toArray(), middle.toArray(), control.toArray(), end.toArray()], .016, materials.stem, branch);
      petiole.userData.attachment = end.toArray();
      const scale = type === 'pilea' ? .96 - age * .3 : type === 'monstera' ? .84 - age * .16 : inner ? .69 : .84 + i % 3 * .035;
      blade.scale.setScalar(scale); branch.add(blade);
      leaves.push({ blade, branch, base: blade.rotation.x, scale, phase: a });
    }
    group.userData = { leaves, structure, type };
    return group;
  }
  const potGeometries = {};
  const sharedPot = (key, create) => potGeometries[key] || (potGeometries[key] = create());
  function pot(color) {
    const group = new T.Group();
    const points = [[.34, .03], [.4, .04], [.43, .1], [.54, .58], [.56, .66], [.55, .71], [.5, .73], [.46, .69], [.46, .62], [.37, .13], [.34, .1]].map(([x, y]) => new T.Vector2(x, y));
    const body = mesh(sharedPot('body', () => new T.LatheGeometry(points, 20)), mat(color, { roughness: .48 }), group);
    mesh(sharedPot('soil', () => new T.CylinderGeometry(.46, .46, .04, 16)), materials.soil, group, 0, .62);
    const saucer = mesh(sharedPot('saucer', () => new T.CylinderGeometry(.48, .5, .07, 20)), body.material, group, 0, .035);
    const rim = mesh(sharedPot('rim', () => new T.TorusGeometry(.49, .025, 6, 20)), mat(0xf4ddac), group, 0, .51); rim.rotation.x = Math.PI / 2; rim.visible = false;
    const seed = mesh(sharedPot('seed', () => new T.SphereGeometry(.08, 8, 6)), materials.seed, group, 0, .68); seed.scale.set(.65, .6, 1);
    group.userData = { body, saucer, rim, seed };
    return group;
  }
  window.GardenModels = { plant, pot, mesh, tube, mat };
})();
