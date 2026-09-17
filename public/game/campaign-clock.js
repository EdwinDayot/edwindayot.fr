/* Campaign daily clock (UMD: node module / browser GardenCampaignClock). Distinct from
   public/game/lighting.js (the free-garden's purely visual 1200-second sun cycle, untouched
   here) and from public/game/save.js (the free-garden's offline catch-up, also untouched):
   design §3 gives the campaign its own day, 7h-23h in roughly 24 real minutes, that pauses on
   menus and does not catch up when the tab was hidden — "le joueur retrouve le jardin au moment
   où il l'a quitté" is a campaign rule, not the free-garden's rule, so this is a new module
   rather than a generalisation of either existing one.

   Pure and DOM-free on purpose (see lighting.js's own header for the same reasoning): the
   "tab hidden" behaviour is expressed as "a real-world gap between two tick() calls larger than
   a threshold is discarded, not applied", so a visibilitychange listener can drive this from the
   browser later without this module ever touching document/window itself. */
(function (root) {
  const DAY_START_HOUR = 7,
    DAY_END_HOUR = 23,
    DAY_HOURS = DAY_END_HOUR - DAY_START_HOUR, // 16
    DAY_SECONDS = DAY_HOURS * 3600, // 57 600 in-game seconds from 7h to 23h
    DEFAULT_ACTIVE_SECONDS = 24 * 60, // design §3: "environ 24 minutes actives", reglable
    // A gap between two tick() calls longer than this is treated as the tab having been
    // hidden/suspended: none of that real time is credited to the game clock. Comfortably
    // above any normal per-frame or per-second polling interval, well below "the player looked
    // away for a minute".
    SUSPEND_GAP_MS = 5000,
    EVENING_REMINDER_HOUR = 22.5;

  function rate(activeSeconds) {
    return DAY_SECONDS / activeSeconds; // in-game seconds per real second, while unpaused
  }

  class CampaignClock {
    // activeSeconds: real seconds for a full 7h-23h day while unpaused and ticking normally.
    constructor({ activeSeconds = DEFAULT_ACTIVE_SECONDS, gameSeconds = 0, paused = false } = {}) {
      this.activeSeconds = activeSeconds;
      this.gameSeconds = gameSeconds; // elapsed since 7h; clamped to [0, DAY_SECONDS]
      this.paused = paused;
      this._lastWall = null; // ms, null until the first tick() establishes a reference point
    }
    isPaused() {
      return this.paused;
    }
    pause() {
      this.paused = true;
    }
    // Resuming does not itself advance the clock; it only re-arms ticking from "now".
    resume(nowWallMs) {
      this.paused = false;
      this._lastWall = nowWallMs;
    }
    // Advances the game clock from wall-clock time. Call every frame/second with Date.now() (or
    // a fake clock in tests). Returns the elapsed in-game seconds actually credited (0 while
    // paused, 0 across a suspended gap).
    tick(nowWallMs) {
      if (this._lastWall === null) {
        this._lastWall = nowWallMs;
        return 0;
      }
      const gapMs = nowWallMs - this._lastWall;
      this._lastWall = nowWallMs;
      if (this.paused || gapMs <= 0) return 0;
      if (gapMs > SUSPEND_GAP_MS) return 0; // suspension: discarded, never caught up
      const advanced = Math.min(
        DAY_SECONDS - this.gameSeconds,
        (gapMs / 1000) * rate(this.activeSeconds),
      );
      this.gameSeconds += advanced;
      return advanced;
    }
    hour() {
      return DAY_START_HOUR + this.gameSeconds / 3600;
    }
    isEveningReminderTime() {
      return this.hour() >= EVENING_REMINDER_HOUR && this.hour() < DAY_END_HOUR;
    }
    isNightfall() {
      return this.hour() >= DAY_END_HOUR;
    }
  }

  const api = {
    CampaignClock,
    DAY_START_HOUR,
    DAY_END_HOUR,
    DAY_SECONDS,
    DEFAULT_ACTIVE_SECONDS,
    SUSPEND_GAP_MS,
    EVENING_REMINDER_HOUR,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenCampaignClock = api;
})(globalThis);
