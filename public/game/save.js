(function (root) {
  const R =
    typeof module !== "undefined"
      ? require("../garden-state.js")
      : root.GardenRules;
  const KEY = "edwin-garden-v3",
    BACKUP = KEY + "-backup",
    LEGACY = "edwin-garden-v2";
  class SaveStore {
    constructor(storage) {
      this.storage = storage;
      this.available = true;
      this.message = "";
    }
    read(key) {
      try {
        return this.storage.getItem(key);
      } catch {
        this.available = false;
        this.message =
          "Stockage indisponible : exporte ta partie avant de quitter.";
        return null;
      }
    }
    write(key, value) {
      try {
        this.storage.setItem(key, value);
        return true;
      } catch {
        this.available = false;
        this.message =
          "Sauvegarde impossible : exporte ta partie avant de quitter.";
        return false;
      }
    }
    load(now = Date.now()) {
      let game = null;
      const current = this.read(KEY);
      const backupRaw = this.read(BACKUP);
      for (const [key, raw] of [
        [KEY, current],
        [BACKUP, backupRaw],
      ]) {
        if (!raw) continue;
        try {
          game = new R.GardenState(JSON.parse(raw));
          if (key === BACKUP)
            this.message = "Dernière sauvegarde valide restaurée.";
          break;
        } catch {
          this.message =
            "Sauvegarde illisible. Une copie valide sera utilisée si disponible.";
        }
      }
      // Epic C7.37: a corrupted-but-present save is never a new game, so `isNew` is decided
      // from raw key presence (current/backupRaw/legacyRaw), never from whether `game` parsed.
      // `this.available` (flipped false by read()'s catch, never back to true) also gates it:
      // storage that throws on every read looks identical to "all three keys absent", but a
      // returning player whose storage just became unreadable must never be told this is their
      // first time — absent-and-unreadable are only the same case for a player who truly has no
      // prior save, so "unreadable" alone must not claim `isNew`.
      let legacyRaw = null;
      if (!game && !current) {
        legacyRaw = this.read(LEGACY);
        if (legacyRaw) {
          try {
            const data = R.migrate(JSON.parse(legacyRaw), now);
            if (this.write(LEGACY + "-backup", legacyRaw)) {
              game = new R.GardenState(data);
              this.message = "Ton ancien jardin a été conservé et agrandi.";
            } else {
              game = new R.GardenState(data);
            }
          } catch {
            this.message =
              "Ancienne sauvegarde illisible. Le fichier original est conservé.";
          }
        }
      }
      const isNew = this.available && !current && !backupRaw && !legacyRaw;
      if (!game) game = new R.GardenState(null, now);
      const summary = game.catchUp(now);
      this.save(game, now);
      return { game, summary, message: this.message, isNew };
    }
    save(game, now = Date.now()) {
      game.s.updatedAt = now;
      const raw = JSON.stringify(game.serialize());
      try {
        R.validate(JSON.parse(raw));
      } catch {
        this.message =
          "Sauvegarde refusée : état invalide. Exporte une copie pour diagnostic.";
        return false;
      }
      const previous = this.read(KEY);
      if (previous) {
        try {
          R.validate(JSON.parse(previous));
          this.write(BACKUP, previous);
        } catch {
          /* Preserve the last valid backup. */
        }
      }
      return this.write(KEY, raw);
    }
    import(raw, now = Date.now()) {
      if (typeof raw !== "string" || raw.length > 2e6)
        throw Error("Fichier trop volumineux.");
      const parsed = JSON.parse(raw),
        data =
          parsed.version === 2 ? R.migrate(parsed, now) : R.validate(parsed),
        game = new R.GardenState(data);
      // Import is a snapshot restore, never a way to claim an elapsed interval twice.
      game.s.updatedAt = now;
      this.save(game, now);
      return game;
    }
    restore(now = Date.now()) {
      const raw = this.read(BACKUP);
      if (!raw) throw Error("Aucune copie valide disponible.");
      return this.import(raw, now);
    }
  }
  const api = { SaveStore, KEY, BACKUP, LEGACY };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenSave = api;
})(globalThis);
