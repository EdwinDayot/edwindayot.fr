/* Rainelle schema, part of the campaign layer (UMD: node module / browser GardenRainelles).
   A Rainelle is the creature born the night a frog falls into the pot during a trial (design §5,
   chapitre 4): it carries the foliage of the cultivar crossed that same night, but is its own
   entity, distinct from any cultivar/specimen — creating one never removes or alters the
   cultivar it references (see garden-state-cmd-i.js/garden-state-cmd-f.js, which wire the
   encounter into "sleep"). Only the schema and stable-id assignment live here, on the same
   "pure factory, wired by a command" pattern already used by cultivars.js's createCultivar; the
   trigger condition (one scripted encounter, only ever the first Rainelle) is a command's job,
   not this file's.

   Epic C2.4 adds the "geste unique" contract (design §5, « Contrat du geste unique ») as a
   schema field: a Rainelle remembers at most one {verbe, poste, source, destination, condition}
   at a time, never a list. `multiplier` is deliberately excluded from VERBS: design §5 states it
   "ne s'applique jamais aux Rainelles" — a Rainelle can be taught to *use* a multiplication post
   on a plant (multiplying itself is refused elsewhere, C2.10), so the verb the design table calls
   "Multiplier une plante" is out of scope for now and left for the epic that actually wires it.
   The mutation itself (garden-state-cmd-j.js's teachGesture) always replaces `geste` wholesale —
   nothing here merges fields — which is what makes "réenseigner remplace intégralement l'ancien
   geste" true by construction. No execution yet (automation.js wiring is C2.6+): this epic only
   proves the memory slot exists, is exactly one gesture wide, and survives a reload. */
(function (root) {
  // The design's gesture table (§5) lists seven rows, but "Multiplier une plante" never applies
  // to a Rainelle (see header comment above) — six verbs remain teachable by this mechanism.
  const VERBS = [
    "arroser",
    "recolter",
    "transporter",
    "replanter",
    "preparer",
    "trier",
  ];
  function createRainelle(s, { cultivarId, name = "" }) {
    const rainelle = {
      id: `r${s.rainelleNextId++}`,
      cultivarId,
      name,
      geste: null,
    };
    s.rainelles.push(rainelle);
    return rainelle;
  }
  const api = { createRainelle, VERBS };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRainelles = api;
})(globalThis);
