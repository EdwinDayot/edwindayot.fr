module.exports = async function atlas(p) {
  for (let group = 0; group < 4; group++) {
    await p.evaluate((group) => {
      const T = THREE,
        scene = new T.Scene();
      scene.background = new T.Color(0xe5eadc);
      scene.add(new T.HemisphereLight(0xfff6e0, 0x718d76, 2.3));
      const sun = new T.DirectionalLight(0xffeaca, 2.4);
      sun.position.set(-5, 10, 8);
      scene.add(sun);
      const camera = new T.OrthographicCamera(-8.9, 8.9, 5, -5, 0.1, 100);
      camera.position.set(0, 10, 20);
      camera.lookAt(0, 0, 0);
      let count = 0;
      for (let row = 0; row < 3; row++)
        for (let stage = 0; stage < 4; stage++) {
          const sp = GardenData.species[group * 3 + row],
            root = new T.Group();
          root.position.set(-6 + stage * 4, 0, -7 + row * 7);
          scene.add(root);
          const pot = GardenModels.pot(0xc99476);
          root.add(pot);
          pot.userData.seed.visible = stage === 0;
          if (stage) {
            const plant = GardenBotany.create(sp.id);
            plant.position.y = 0.66;
            plant.scale.setScalar([0, 0.17, 0.45, 0.85][stage]);
            root.add(plant);
          }
          const c = document.createElement("canvas");
          c.width = 512;
          c.height = 96;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#304f40";
          ctx.font = "36px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(
            sp.name + " · " + ["graine", "germe", "jeune", "adulte"][stage],
            256,
            60,
          );
          const map = new T.CanvasTexture(c);
          map.colorSpace = T.SRGBColorSpace;
          const label = new T.Sprite(new T.SpriteMaterial({ map }));
          label.scale.set(2.8, 0.525, 1);
          label.position.set(0, 0.1, 1.1);
          root.add(label);
          count++;
        }
      atlasRenderer.render(scene, camera);
      return count;
    }, group);
    await p
      .locator("#atlas")
      .screenshot({ path: `/tmp/garden-botany-${group + 1}.png` });
  }
};
