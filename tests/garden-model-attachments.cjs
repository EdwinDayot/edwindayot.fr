const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const THREE = require('../public/vendor/three.min.js');

// Geometry-only test: the texture canvas is not rendered or used as visual evidence.
const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient'
  ? () => ({ addColorStop() {} }) : () => {} });
const window = { THREE };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/garden-models.js'), 'utf8'), {
  window, document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) }
});

for (const type of ['pilea', 'monstera', 'calathea']) {
  test(`${type}: petioles and blades stay connected during growth and sway`, () => {
    const plant = window.GardenModels.plant(type);
    const stem = plant.userData.structure.children.find(child => child.isMesh);
    for (const [index, leaf] of plant.userData.leaves.entries()) {
      const petiole = leaf.branch.children[0];
      const curve = petiole.geometry.parameters.path;
      assert.ok(curve.getPoint(1).distanceTo(leaf.blade.position) < 1e-7);
      if (stem) {
        const node = stem.geometry.parameters.path.getPoint(.18 + index / (plant.userData.leaves.length - 1) * .82);
        assert.ok(node.distanceTo(curve.getPoint(0)) < 1e-7, 'Petiole starts on the central stem');
      } else {
        assert.equal(curve.getPoint(0).y, 0, 'Rosette stems start at soil level');
      }
      for (const growth of [.1, .4, 1]) for (const sway of [-.028, .028, .178]) {
        leaf.blade.scale.setScalar(leaf.scale * growth);
        leaf.blade.rotation.x = leaf.base + sway;
        plant.updateMatrixWorld(true);
        const joint = leaf.blade.localToWorld(new THREE.Vector3());
        const tip = leaf.branch.localToWorld(curve.getPoint(1));
        assert.ok(joint.distanceTo(tip) < 1e-7, 'Animation must not move the attachment');
        const outward = new THREE.Vector3(0, 1, 0).applyEuler(leaf.blade.rotation);
        const radial = new THREE.Vector3(leaf.blade.position.x, 0, leaf.blade.position.z).normalize();
        assert.ok(outward.dot(radial) > 0, 'Blade opens away from the centre');
        const upper = new THREE.Vector3(0, 0, -1).applyEuler(leaf.blade.rotation);
        assert.ok(upper.y > 0, 'The upper surface faces upward');
      }
      const bounds = leaf.blade.children[0].geometry.boundingBox;
      if (type === 'pilea') assert.ok(Math.abs(bounds.min.y + bounds.max.y) < 1e-6, 'Disc centred on its petiole');
      else assert.ok(Math.abs(bounds.min.y) < 1e-6, 'Blade base begins at its petiole');
    }
  });
}
