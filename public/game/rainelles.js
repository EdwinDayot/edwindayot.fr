/* Rainelle schema, part of the campaign layer (UMD: node module / browser GardenRainelles).
   A Rainelle is the creature born the night a frog falls into the pot during a trial (design §5,
   chapitre 4): it carries the foliage of the cultivar crossed that same night, but is its own
   entity, distinct from any cultivar/specimen — creating one never removes or alters the
   cultivar it references (see garden-state-cmd-i.js/garden-state-cmd-f.js, which wire the
   encounter into "sleep"). Only the schema and stable-id assignment live here, on the same
   "pure factory, wired by a command" pattern already used by cultivars.js's createCultivar; the
   trigger condition (one scripted encounter, only ever the first Rainelle) is a command's job,
   not this file's. No geste/automation state yet (C2.4 and later): this epic only proves a
   Rainelle can exist, be named, and keep a stable id across a reload. */
(function (root) {
  function createRainelle(s, { cultivarId, name = "" }) {
    const rainelle = {
      id: `r${s.rainelleNextId++}`,
      cultivarId,
      name,
    };
    s.rainelles.push(rainelle);
    return rainelle;
  }
  const api = { createRainelle };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRainelles = api;
})(globalThis);
