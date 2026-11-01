import fs from 'node:fs';
import path from 'node:path';

/**
 * LeaderboardStore.js — Server-side lifetime recycling points.
 *
 * Points are ALWAYS calculated and stored on the server (never trusted from
 * clients). Each player's lifetime balance is keyed by their lowercased
 * username so points survive disconnects/rejoins — and, when a file is
 * configured, server restarts too.
 *
 * Two backends:
 *  - File-backed (`new LeaderboardStore({ file })`): read on load(), written
 *    through on every award. Used by the production launcher.
 *  - In-memory (no file): used by tests and as a safe default so test runs
 *    never touch the disk.
 *
 * Format on disk: { "<lowercased username>": <lifetime points>, ... }
 */
export class LeaderboardStore {
  constructor({ file } = {}) {
    this.file = file || null;
    /** @type {Map<string, number>} lowercase username → lifetime points */
    this.points = new Map();
    if (this.file) this.load();
  }

  /** Load persisted points from disk (missing file = empty store). */
  load() {
    if (!this.file) return this;
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
          const n = Number(value);
          if (Number.isFinite(n) && n >= 0) this.points.set(String(key).toLowerCase(), Math.floor(n));
        }
      }
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        console.warn(`[LeaderboardStore] Could not read ${this.file}: ${err.message} — starting empty`);
      }
    }
    return this;
  }

  /** Write the full store to disk (no-op for the in-memory backend). */
  flush() {
    if (!this.file) return false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.points), null, 2));
      fs.renameSync(tmp, this.file); // atomic-ish: readers never see a half file
      return true;
    } catch (err) {
      console.warn(`[LeaderboardStore] Could not write ${this.file}: ${err.message}`);
      return false;
    }
  }

  /** Lifetime points for a player (0 when unknown). */
  getPoints(username) {
    if (typeof username !== 'string' || !username) return 0;
    return this.points.get(username.toLowerCase()) || 0;
  }

  /** Set (and persist) a player's lifetime total. */
  setPoints(username, total) {
    if (typeof username !== 'string' || !username) return 0;
    const value = Math.max(0, Math.floor(Number(total) || 0));
    this.points.set(username.toLowerCase(), value);
    this.flush();
    return value;
  }

  /** Add delta to a player's lifetime total and persist. Returns new total. */
  addPoints(username, delta) {
    return this.setPoints(username, this.getPoints(username) + (Number(delta) || 0));
  }
}
