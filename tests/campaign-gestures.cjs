const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState, validate } = require("./garden-rules-helpers.cjs");

// Epic C2.4: the "geste unique" contract (design §5). A Rainelle remembers at most one
// {verbe, poste, source, destination, condition} at a time; teachGesture always replaces the
// whole gesture, never merges onto it or keeps a second one alongside. No execution wiring yet
// (automation.js, C2.6+) — this is the memory slot only, same posture as C1.1/C2.3 before their
// own wiring epics.

function bornRainelle(g) {
  g.command({ type: "triggerFrogEncounter" });
  g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" });
  g.command({ type: "sleep" });
  return g.s.rainelles[0].id;
}

test("A fresh Rainelle starts with no gesture", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  assert.equal(g.s.rainelles.find((r) => r.id === id).geste, null);
});

test("teachGesture assigns the exact gesture taught", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const r = g.command({
    type: "teachGesture",
    id,
    verbe: "arroser",
    poste: "borne-1",
    source: "borne-1",
    destination: "zone-fraisiers",
    condition: "humidite < 65",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(g.s.rainelles[0].geste, {
    verbe: "arroser",
    poste: "borne-1",
    source: "borne-1",
    destination: "zone-fraisiers",
    condition: "humidite < 65",
  });
});

test("condition defaults to an empty string when omitted", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const r = g.command({
    type: "teachGesture",
    id,
    verbe: "recolter",
    poste: "carre-1",
    source: "carre-1",
    destination: "panier-1",
  });
  assert.equal(r.ok, true);
  assert.equal(g.s.rainelles[0].geste.condition, "");
});

test("Teaching a second gesture replaces the first wholesale, never merges or keeps both", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const first = g.command({
    type: "teachGesture",
    id,
    verbe: "arroser",
    poste: "borne-1",
    source: "borne-1",
    destination: "zone-fraisiers",
    condition: "humidite < 65",
  });
  assert.equal(first.ok, true);
  assert.match(first.message, /appris/);

  const second = g.command({
    type: "teachGesture",
    id,
    verbe: "recolter",
    poste: "carre-1",
    source: "carre-1",
    destination: "panier-1",
    condition: "",
  });
  assert.equal(second.ok, true, "re-teaching is an explicit replacement, not a refusal");
  assert.match(
    second.message,
    /remplac/,
    "the replacement is announced explicitly, never a silent overwrite",
  );

  // Exactly the second gesture survives — no trace of the first, no second slot alongside it.
  assert.deepEqual(g.s.rainelles[0].geste, {
    verbe: "recolter",
    poste: "carre-1",
    source: "carre-1",
    destination: "panier-1",
    condition: "",
  });
  assert.equal(
    Object.keys(g.s.rainelles[0].geste).length,
    5,
    "still exactly one gesture, five fields, never an accumulated set",
  );
});

test("teachGesture refuses an unknown Rainelle id without creating a gesture anywhere", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const r = g.command({
    type: "teachGesture",
    id: "r999",
    verbe: "arroser",
    poste: "borne-1",
    source: "borne-1",
    destination: "zone-1",
  });
  assert.equal(r.ok, false);
  assert.equal(g.s.rainelles[0].geste, null);
});

test("teachGesture refuses an unknown verb, including the excluded 'multiplier'", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  for (const verbe of ["multiplier", "voler", "", undefined, 7]) {
    const r = g.command({
      type: "teachGesture",
      id,
      verbe,
      poste: "borne-1",
      source: "borne-1",
      destination: "zone-1",
    });
    assert.equal(r.ok, false, `verbe ${JSON.stringify(verbe)} should be refused`);
    assert.equal(g.s.rainelles[0].geste, null);
  }
});

test("teachGesture refuses an empty poste, source or destination without mutating the gesture", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  const base = {
    type: "teachGesture",
    id,
    verbe: "trier",
    poste: "poste-1",
    source: "arrivee",
    destination: "bac-1",
  };
  assert.equal(g.command({ ...base, poste: "" }).ok, false);
  assert.equal(g.command({ ...base, poste: "   " }).ok, false);
  assert.equal(g.command({ ...base, source: "" }).ok, false);
  assert.equal(g.command({ ...base, destination: "" }).ok, false);
  assert.equal(g.s.rainelles[0].geste, null, "no partial gesture from a refused command");
});

test("poste, source, destination and condition are trimmed before saving", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({
    type: "teachGesture",
    id,
    verbe: "transporter",
    poste: "  quai-1  ",
    source: "  panier-a  ",
    destination: "  panier-b  ",
    condition: "  stock > 0  ",
  });
  assert.deepEqual(g.s.rainelles[0].geste, {
    verbe: "transporter",
    poste: "quai-1",
    source: "panier-a",
    destination: "panier-b",
    condition: "stock > 0",
  });
});

test("A real JSON reload keeps the taught gesture identical", () => {
  const g = new GardenState(null, 1000);
  const id = bornRainelle(g);
  g.command({
    type: "teachGesture",
    id,
    verbe: "preparer",
    poste: "atelier-1",
    source: "ingredients",
    destination: "sortie",
    condition: "recette connue",
  });
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  const reloaded = new GardenState(saved);
  assert.deepEqual(reloaded.s.rainelles, g.s.rainelles);
});

test("A save from before this epic (rainelle entries without a geste field) still validates", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const saved = g.serialize();
  delete saved.rainelles[0].geste;
  assert.doesNotThrow(() => validate(saved));
});

test("Malformed geste shapes are rejected", () => {
  const g = new GardenState(null, 1000);
  bornRainelle(g);
  const validGeste = {
    verbe: "arroser",
    poste: "borne-1",
    source: "borne-1",
    destination: "zone-1",
    condition: "",
  };
  const bad = [
    { ...validGeste, verbe: "multiplier" },
    { ...validGeste, verbe: "vole" },
    { ...validGeste, poste: "" },
    { ...validGeste, poste: 7 },
    { ...validGeste, source: "" },
    { ...validGeste, destination: "" },
    { ...validGeste, condition: 7 },
    "arroser",
    7,
  ];
  for (const geste of bad) {
    const saved = g.serialize();
    saved.rainelles[0].geste = geste;
    assert.throws(() => validate(saved), /Rainelle invalide/);
  }
  // A well-formed gesture and an explicit null both remain accepted.
  const savedOk = g.serialize();
  savedOk.rainelles[0].geste = validGeste;
  assert.doesNotThrow(() => validate(savedOk));
  const savedNull = g.serialize();
  savedNull.rainelles[0].geste = null;
  assert.doesNotThrow(() => validate(savedNull));
});
