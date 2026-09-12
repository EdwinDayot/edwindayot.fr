(() => {
  const A = window.GardenApp;
  if (!A || !A.view) {
    return;
  }
  const D = GardenData,
    C = GardenConstruction,
    I = GardenIrrigation,
    R = GardenRules,
    S = GardenSave,
    $ = (id) => document.getElementById(id);
  A.keyMap = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    a: "left",
    q: "left",
    w: "up",
    z: "up",
    s: "down",
    d: "right",
  };
})();
