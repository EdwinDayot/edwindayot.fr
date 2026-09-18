// Phase 2 exit gate (docs/campagne-backlog.md "Portes de phase", docs/orchestration.md):
// "un joueur enseigne un geste à une Rainelle sans guide externe ; une chaîne fonctionne, sature
// proprement puis redémarre."
//
// The second half of that criterion — a chain works, saturates cleanly, then restarts on its
// own — is already the entire subject of tests/campaign-rainelles-chain.cjs (epic C2.11, whose
// own backlog entry names it explicitly as this phase's exit gate), run through the real
// GardenState command layer (teachGesture) over a span of several simulated days. Not repeated
// here, on the same "not a restatement of those unit tests" posture tests/campaign-phase1-gate.cjs
// already used for its own epics.
//
// This file covers the other half — "un joueur enseigne un geste... sans guide externe" — and
// the one docs/game-design.md §16 validation scenario about the Rainelle/gesture relationship
// that applies to phase 2's own scope and had not yet been run as a single end-to-end narrative:
//   "Chaque Rainelle conserve un seul geste ; le réenseignement le remplace et les refus de
//   multiplication couvrent elle-même comme ses congénères."
// (campaign-refusal.cjs already covers the multiply-refusal message and the single-gesture
// replacement in isolation; this narrative additionally proves the refusal covers a *second*,
// distinct Rainelle — "ses congénères", plural — not only the one Rainelle every other test in
// that file happens to use.)
//
// Two other §16 rows name mechanisms phase 2 deliberately does not build yet — "passage coupé"
// (no Rainelle movement model exists, C2.8v, chantier de la phase 3) and "déplacer un poste ou
// [...] rangement" (no command moves/stores a borne/zone/panier yet) — correctly out of scope
// here, the same way C1.5/pinning was out of scope for the phase 1 gate: the gate criterion above
// never names them, and docs/campagne-backlog.md's own C2.8v/C2.2v/C2.5v/C2.9 entries defer them
// to phase 3's rendering/movement work without pretending they are already proven.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GardenState } = require("./garden-rules-helpers.cjs");
const Rainelles = require("../public/game/rainelles.js");

function bornRainelle(g) {
  assert.equal(g.command({ type: "triggerFrogEncounter" }).ok, true);
  assert.equal(
    g.command({ type: "sowPot", a: "ronce-a-rubans", b: "fraise-timide" }).ok,
    true,
  );
  assert.equal(g.command({ type: "sleep" }).ok, true);
  return g.s.rainelles[0];
}

test("gate scenario 1/2 — a player teaches a gesture with only the five fields the game itself asks for, no external guide", () => {
  // "Sans guide externe" is proven by the direct teachGesture path needing nothing beyond what
  // the command itself carries (verbe/poste/source/destination/condition, all player-supplied)
  // and returning a self-explanatory result — no lookup table, wiki, or out-of-band knowledge a
  // real player would need to consult first.
  const g = new GardenState(null, 1000);
  const rainelle = bornRainelle(g);
  const result = g.command({
    type: "teachGesture",
    id: rainelle.id,
    verbe: "arroser",
    poste: "carre-nord",
    source: "borne-nord",
    destination: "peu-importe",
  });
  assert.equal(result.ok, true);
  assert.match(result.message, /^Geste appris/);
  assert.deepEqual(g.s.rainelles[0].geste, {
    verbe: "arroser",
    poste: "carre-nord",
    source: "borne-nord",
    destination: "peu-importe",
    condition: "",
  });

  // The game also proposes a phrase and a trajectory preview from that same taught gesture,
  // without any further input — the "explanation" a guide would otherwise have to supply.
  const phrase = Rainelles.defaultPhrase(g.s.rainelles[0].geste);
  assert.match(phrase, /carre-nord/);
  assert.match(phrase, /borne-nord/);
});

test("gate scenario 2/2 — a Rainelle keeps exactly one gesture, re-teaching replaces it wholesale, and the multiplication refusal covers both itself and a distinct second Rainelle", () => {
  const g = new GardenState(null, 1000);
  const first = bornRainelle(g);
  const second = Rainelles.createRainelle(g.s, {
    cultivarId: first.cultivarId,
    name: "Deuxième",
  });

  assert.equal(
    g.command({
      type: "teachGesture",
      id: first.id,
      verbe: "arroser",
      poste: "carre-1",
      source: "borne-1",
      destination: "peu-importe",
    }).ok,
    true,
  );
  // Réenseigner remplace intégralement l'ancien geste — jamais un ajout, jamais une fusion.
  assert.equal(
    g.command({
      type: "teachGesture",
      id: first.id,
      verbe: "recolter",
      poste: "carre-1",
      source: "peu-importe",
      destination: "panier-1",
    }).ok,
    true,
  );
  assert.deepEqual(g.s.rainelles.find((r) => r.id === first.id).geste, {
    verbe: "recolter",
    poste: "carre-1",
    source: "peu-importe",
    destination: "panier-1",
    condition: "",
  });

  // The refusal covers "elle-même" — an attempt to multiply the first Rainelle...
  const refuseSelf = g.command({
    type: "teachGesture",
    id: first.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(refuseSelf.ok, false);
  assert.equal(refuseSelf.message, Rainelles.MULTIPLY_REFUSAL);
  // ...never overwrites the gesture the refused attempt targeted...
  assert.equal(g.s.rainelles.find((r) => r.id === first.id).geste.verbe, "recolter");

  // ...and "ses congénères" — the exact same refusal, on a genuinely distinct second Rainelle
  // that has never been taught anything yet, proving the refusal is not special-cased to
  // whichever single Rainelle every other refusal test in this codebase happens to reuse.
  const refuseSecond = g.command({
    type: "teachGesture",
    id: second.id,
    verbe: "multiplier",
    poste: "atelier-1",
    source: "boutures",
    destination: "sortie",
  });
  assert.equal(refuseSecond.ok, false);
  assert.equal(refuseSecond.message, Rainelles.MULTIPLY_REFUSAL);
  assert.equal(g.s.rainelles.find((r) => r.id === second.id).geste, null);

  // multiplySpecimen (the other command capable of "multiplying" something) refuses either
  // Rainelle's id explicitly too — same disjoint-id-space refusal already proven for a single
  // Rainelle by campaign-refusal.cjs, exercised here against the second Rainelle specifically.
  const specimensBefore = g.s.specimens.length;
  const refuseSpecimen = g.command({
    type: "multiplySpecimen",
    specimenId: second.id,
    x: 1,
    z: 1,
  });
  assert.equal(refuseSpecimen.ok, false);
  assert.equal(g.s.specimens.length, specimensBefore);
});
