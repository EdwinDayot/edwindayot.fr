/* Rainelle movement: pure route/priority rules, part of the campaign layer (UMD: node module /
   browser GardenRainelleMovement).

   Epic C5.10 (design §14, "les Rainelles naviguent sur un graphe ou une grille partagés,
   recalculés lors des changements de construction pertinents... les croisements de passage
   utilisent une priorité stable et un temps d'attente borné... une Rainelle bloquée se range à un
   point d'attente sans devenir un obstacle permanent"). Depends on C5.5 (deriveLocation, the only
   place "poste"/"repos"/"habitat" is decided — never a second classification here, this file only
   ever consumes that verdict as a parameter) and reuses `GardenConstruction.path(s, from, to)`
   (verified before writing a line of this file, per the backlog's own mandate: the half-unit
   BFS grid already shared by player pathfinding is directly reusable for a Rainelle — nothing
   about `walkable`/`path` is player-specific, both take an arbitrary `{x,z}` pair).

   This is deliberately engine-only, exactly the "posed, not yet wired" posture already used by
   campaign-stations.js/campaign-scenes.js before their own render/tick hookup: nothing here is
   called from garden-state.js's `tick()` (that wiring, plus the Rainelle actually having a real,
   meaningful position, is C5.11's job — see its own backlog entry). Only the pure rules a future
   caller will need are proven here, by direct unit tests.

   A Rainelle's position (`rainelle.x`/`rainelle.z`, new optional fields, rainelles.js) is `null`
   until C5.11 assigns a real one — this file treats a positionless Rainelle as having no route
   (nothing to move from), never a guessed coordinate.

   No caching, anywhere. `routeTo` recomputes the full path from scratch on every call, reading
   `s.entities`/`s.unlocked` exactly as `Construction.path` itself does — so "le chemin est
   recalculé lors d'un changement de construction pertinent" is true by construction (an object
   newly posed on the route changes what the very next call returns), not by a dedicated
   invalidation mechanism that could itself go stale. */
(function (root) {
  const Construction =
    typeof module !== "undefined"
      ? require("./construction.js")
      : root.GardenConstruction;
  const Stations =
    typeof module !== "undefined"
      ? require("./campaign-stations.js")
      : root.GardenCampaignStations;
  const Scenes =
    typeof module !== "undefined"
      ? require("./campaign-scenes.js")
      : root.GardenCampaignScenes;
  const Passage =
    typeof module !== "undefined"
      ? require("./campaign-passage.js")
      : root.GardenCampaignPassage;

  const { LOCATIONS } = Scenes;

  // Design names no number for "un temps d'attente borné" — chosen and documented here, like
  // OVEREXERTION_THRESHOLD (C5.3) or MIN_HABITAT_CAPACITY (C3.3) before it: three steps is short
  // enough that a genuinely blocked Rainelle reroutes within a couple of seconds of simulated
  // time (one step per tick, garden-state.js's own one-tick-per-second cadence) rather than
  // visibly freezing in place, long enough that a single one-off crossing between two Rainelles
  // resolves the ordinary way (the lower-priority one simply waits out a couple of steps) instead
  // of immediately abandoning a route that was about to clear on its own.
  const MAX_WAIT_STEPS = 3;

  // Position de repli documentée pour "repos"/"habitat" quand aucun habitat n'est encore
  // enregistré (le tout premier Rainelle, née avant C3.4/toute pose d'habitat, peut exister sans
  // qu'aucun habitat existe — harvestBud/C3.4 est seul à conditionner une naissance à une place
  // libre, la toute première ne l'est pas, rainelles.js's own createRainelle comment). Vérifiée
  // walkable sur une sauvegarde neuve (Construction.walkable), pas devinée : {x:0,z:0} lui-même ne
  // l'est pas (trop proche du pot de départ), ce point l'est.
  const FALLBACK_POSITION = { x: 2, z: 2 };

  function resolveKind(s, id, kind) {
    const r = Stations.resolveStation(s.campaignStations, id);
    return r.ok && r.kind === kind ? r.station : null;
  }

  // Same half-unit grid key Construction.js's own private `key()` uses, redefined here rather
  // than reached into (not exported by that file) — the only shared primitive is `path`/
  // `walkable` themselves, per this file's own header comment.
  const cellKey = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`;

  function distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  }

  // Nearest registered habitat to `from`, or null when none exists yet — never the closest
  // *anything else*: habitats are the only station kind a resting/idle Rainelle is ever placed
  // at (design §5, "les Rainelles partagent... un habitat"), matching deriveLocation's own
  // REPOS/HABITAT verdicts, which never point at a borne/zone/panier.
  function nearestHabitat(s, from) {
    const habitats = s.campaignStations.habitats;
    let best = null;
    let bestD = Infinity;
    for (const h of habitats) {
      const d = distanceSquared(from, h);
      if (d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  // The geometric point a Rainelle's derived location (C5.5) designates, never a second
  // classification of its own: `location` must come from GardenCampaignScenes.deriveLocation,
  // called by the caller, not recomputed here.
  //
  // "poste" resolves to the station its geste actually stands at while working:
  //   - arroser/recolter: `geste.poste`, the zone — exactly the field deriveLocation itself reads
  //     to decide POSTE for these two verbs (see its own resolveKind call).
  //   - transporter: has no comparable "standing zone" (campaign-automation.js's own header
  //     comment: "design §5's row for transporter names only a source panier and a destination
  //     panier" — the whole gesture *is* the transit between them). The destination panier is
  //     chosen as the visible work point — the delivery a transporteuse is materially heading
  //     toward — documented here rather than left to guess since the design gives no tie-breaker
  //     of its own between source and destination.
  // "repos"/"habitat" both resolve to the nearest registered habitat from the Rainelle's current
  // position, or the documented fallback when none is registered yet (see FALLBACK_POSITION).
  // Epic C6.15 (design §10, chapitre 17, sixième temps : "une Rainelle rejoint la mare et n'en
  // revient pas"): a Rainelle already settled at the passage (rainelle.settledAt) always targets
  // that fixed point, whatever `location` the caller passes — POSTE/REPOS/HABITAT no longer have
  // any effect on her, exactly the critère de sortie's own words ("quelle que soit la location
  // transmise"). Checked before the geste/POSTE branch below since a settled Rainelle already has
  // `geste === null` (settling only ever happens to one, see selectRainelleToSettle) and would
  // otherwise fall through to the habitat branch instead.
  function targetPosition(s, rainelle, location) {
    if (rainelle.settledAt) return Passage.PASSAGE_POSITION;
    const geste = rainelle.geste;
    if (location === LOCATIONS.POSTE && geste) {
      if (geste.verbe === "arroser" || geste.verbe === "recolter") {
        const zone = resolveKind(s, geste.poste, "zone");
        if (zone) return { x: zone.x, z: zone.z };
      } else if (geste.verbe === "transporter") {
        const destination = resolveKind(s, geste.destination, "panier");
        if (destination) return { x: destination.x, z: destination.z };
      }
    }
    const from = {
      x: Number.isFinite(rainelle.x) ? rainelle.x : FALLBACK_POSITION.x,
      z: Number.isFinite(rainelle.z) ? rainelle.z : FALLBACK_POSITION.z,
    };
    const habitat = nearestHabitat(s, from);
    return habitat ? { x: habitat.x, z: habitat.z } : FALLBACK_POSITION;
  }

  // Pure itinerary toward the target `location` designates, reusing Construction.path exactly as
  // player movement does (see header comment) — `[]` for a Rainelle with no real position yet
  // (nothing to route from, never a guessed start) and `[]` once already on the target cell
  // (Construction.path's own behaviour, unit tested by tests/garden-construction.cjs already;
  // not re-proven here).
  function routeTo(s, rainelle, location) {
    if (!Number.isFinite(rainelle.x) || !Number.isFinite(rainelle.z)) return [];
    const target = targetPosition(s, rainelle, location);
    return Construction.path(s, { x: rainelle.x, z: rainelle.z }, target);
  }

  // A free half-unit neighbour of `from` — walkable and not already reserved this same step —
  // for a Rainelle that gave up waiting to step aside into (design ch. 14, "se range à un point
  // d'attente"). Checked in a fixed order (east/west/north/south) purely for deterministic tests;
  // the design does not prefer any direction.
  function freeNeighbor(s, from, reserved) {
    for (const [dx, dz] of [
      [0.5, 0],
      [-0.5, 0],
      [0, 0.5],
      [0, -0.5],
    ]) {
      const x = from.x + dx,
        z = from.z + dz;
      const k = cellKey(x, z);
      if (!reserved.has(k) && Construction.walkable(s, x, z)) return { x, z };
    }
    return null;
  }

  // Numeric ordering from a Rainelle id ("r<n>") — the "priorité stable (par exemple l'id le plus
  // petit)" the design names as an example, taken literally: the lower id always wins a contested
  // cell over a higher one, forever, so two Rainelles racing for the same crossing resolve the
  // same way every time rather than by turn order or chance.
  const priorityOf = (id) => Number(id.slice(1));

  // Resolves exactly one shared simulation step for a batch of Rainelles that each want to move
  // toward `route[0]` (their next half-unit cell) this instant — never a whole itinerary at once,
  // so a future real tick loop (C5.11) can call this once per simulated second, the same cadence
  // garden-state.js's own tick() already ticks tickRainelle at.
  //
  // `movers`: [{ rainelle, route }], route from routeTo() (possibly []). `waitCounts`: a plain
  // {id: steps} map of how many consecutive steps each Rainelle has already spent blocked — a
  // parameter, never a persisted save field, exactly like campaign-scenes.js's own
  // `workedThisNight`: nothing yet owns a real tick loop to advance it between two sessions, so
  // the eventual real caller (C5.11) is the one that will keep it across calls.
  //
  // Returns { positions, waitCounts }: `positions` is a {id: {x,z}} map of where each mover with a
  // finite starting position ends up after this one step (its own current cell if it moved
  // nowhere); `waitCounts` is the next map to pass into the following call.
  function resolveStep(s, movers, waitCounts = {}) {
    const live = movers.filter(
      (m) => Number.isFinite(m.rainelle.x) && Number.isFinite(m.rainelle.z),
    );
    // Every currently occupied cell is reserved up front — a winner may only move into a cell
    // nobody (mover or not) already stands in, and frees its own old cell only once its move is
    // actually granted, below. This is deliberately conservative: two Rainelles cannot swap
    // adjacent cells in a single step (the first mover's old cell stays reserved until it moves),
    // which never produces an illegal double-occupancy, only an extra bounded wait — exactly the
    // mechanism this epic already provides for any other contested cell.
    const reserved = new Set(
      s.rainelles
        .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.z))
        .map((r) => cellKey(r.x, r.z)),
    );
    const positions = {};
    const nextWait = {};
    const ordered = [...live].sort(
      (a, b) => priorityOf(a.rainelle.id) - priorityOf(b.rainelle.id),
    );
    for (const { rainelle, route } of ordered) {
      const current = { x: rainelle.x, z: rainelle.z };
      const dest = route && route[0];
      if (!dest) {
        // Already on target (or no route at all): nothing to contest, waiting resets.
        positions[rainelle.id] = current;
        nextWait[rainelle.id] = 0;
        continue;
      }
      const destKey = cellKey(dest.x, dest.z);
      if (!reserved.has(destKey)) {
        reserved.delete(cellKey(current.x, current.z));
        reserved.add(destKey);
        positions[rainelle.id] = dest;
        nextWait[rainelle.id] = 0;
        continue;
      }
      // Blocked this step — by a higher-priority mover that already claimed the cell, or by a
      // Rainelle not moving at all this step.
      const waited = (waitCounts[rainelle.id] || 0) + 1;
      if (waited > MAX_WAIT_STEPS) {
        const sidestep = freeNeighbor(s, current, reserved);
        if (sidestep) {
          reserved.delete(cellKey(current.x, current.z));
          reserved.add(cellKey(sidestep.x, sidestep.z));
          positions[rainelle.id] = sidestep;
          nextWait[rainelle.id] = 0;
          continue;
        }
        // No free neighbour either (fully boxed in): keep waiting rather than not moving at all
        // being treated as an error — design ch. 14 only promises it "ne devient pas un obstacle
        // permanent" for others, not that it is guaranteed a free cell to step into instantly.
      }
      positions[rainelle.id] = current;
      nextWait[rainelle.id] = waited;
    }
    return { positions, waitCounts: nextWait };
  }

  // Epic C5.11: assigns a real starting position to a Rainelle whose x/z are still null — either
  // just born (rainelles.js's createRainelle always starts null) or loaded from a save written
  // before this epic (same optional-field migration posture already used for job/bourgeon, see
  // rainelles.js's own header comment). Never touches a Rainelle that already has a position:
  // mutating one mid-route here would silently teleport her instead of letting resolveStep move
  // her one cell at a time. Deliberately reuses targetPosition(..., LOCATIONS.HABITAT) rather than
  // a second nearestHabitat/FALLBACK_POSITION lookup — with a positionless rainelle, that function
  // already falls back to FALLBACK_POSITION as its `from` (see targetPosition's own code above),
  // so it already returns exactly "the nearest registered habitat, or the vetted fallback" — the
  // backlog's own words for this epic's "position de naissance ou d'un habitat déjà enregistré".
  function ensurePosition(s, rainelle) {
    if (Number.isFinite(rainelle.x) && Number.isFinite(rainelle.z)) return;
    const { x, z } = targetPosition(s, rainelle, LOCATIONS.HABITAT);
    rainelle.x = x;
    rainelle.z = z;
  }

  // Epic C6.15: pure decision only — never mutates `s`, exactly the backlog's own words ("décide,
  // sans muter directement l'état"). The caller (garden-state-cmd-w.js's restorePassage,
  // garden-state-cmd-u.js's releaseGesture — the only two mutations that can ever complete the
  // condition below) applies `settledAt = true` to the returned id once its own mutation has
  // already succeeded, same "decide here, mutate there" split cmd-w.js/cmd-u.js already keep for
  // every other command in this file's neighbourhood.
  //
  // True (a candidate id) only the very first time the passage is open, at least one Rainelle has
  // no gesture (`geste === null`), and no Rainelle has settled yet — checked in that order so a
  // still-blocked passage or an already-settled save short-circuits without scanning `s.rainelles`
  // twice. Candidate selection is by `s.rainelles` array order, the same stable "first by array
  // order" priority campaign-scenes.js's own selectSceneRainelle already documents for a
  // simultaneous claim — never a new sort, never `priorityOf`'s numeric id ordering (that one is
  // reserved for a live movement contest between Rainelles already positioned, not this one-off
  // selection).
  function selectRainelleToSettle(s) {
    if (s.campaignPassage.blocked) return null;
    if (s.rainelles.some((r) => r.settledAt)) return null;
    const candidate = s.rainelles.find((r) => r.geste === null);
    return candidate ? candidate.id : null;
  }

  const api = {
    MAX_WAIT_STEPS,
    FALLBACK_POSITION,
    targetPosition,
    routeTo,
    resolveStep,
    ensurePosition,
    selectRainelleToSettle,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenRainelleMovement = api;
})(globalThis);
