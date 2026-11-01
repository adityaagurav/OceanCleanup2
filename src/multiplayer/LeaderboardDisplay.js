/**
 * LeaderboardDisplay.js — Pure section logic for the physical harbor
 * leaderboard (Top 5 + personal ranking).
 *
 * The server sends the FULL ranked list (`entries` already sorted, ranks
 * 1-based). This helper splits it into exactly what the board renders:
 *
 *   First section : the Top 5 players (highest → lowest points).
 *   Second section: the current player's own rank + points — ONLY when the
 *                   player is OUTSIDE the Top 5.
 *
 * Rules (never show the same player twice):
 *   - Player ranked 1st–5th  → personal section is null; their row inside the
 *     Top 5 is highlighted instead (isYou: true).
 *   - Player ranked 6th+     → personal section renders below the divider
 *     with their real rank (e.g. "8. YOU — 450 pts").
 *   - Player not on the board (no entries / not joined) → personal is null.
 *
 * Kept dependency-free and DOM-free so Node tests can verify every rule.
 */

/** Points awarded per garbage item successfully recycled (mirrors server value). */
export const POINTS_PER_ITEM = 10;
export const POINTS_PER_KG = POINTS_PER_ITEM; // Alias for backward compatibility

/**
 * @param {Array<{rank:number, playerId:string, username:string, points:number}>} entries
 *   Full leaderboard, already sorted by the server (points desc, stable ties).
 * @param {string|null} localPlayerId
 * @param {number} topN — size of the first section (default 5)
 * @returns {{ top5: Array<object>, personal: object|null, isEmpty: boolean }}
 *   top5: rows for section 1 (each with `isYou` flag);
 *   personal: the row for section 2, or null when it must NOT be displayed.
 */
export function computeLeaderboardSections(entries, localPlayerId = null, topN = 5) {
  const list = Array.isArray(entries) ? entries : [];
  const top5 = list.slice(0, topN).map((e) => ({
    ...e,
    isYou: !!localPlayerId && e.playerId === localPlayerId,
  }));

  let personal = null;
  if (localPlayerId) {
    const mine = list.find((e) => e.playerId === localPlayerId);
    // Only players OUTSIDE the Top 5 get the separate personal row.
    if (mine && mine.rank > topN) {
      personal = { ...mine, isYou: true };
    }
  }

  return { top5, personal, isEmpty: list.length === 0 };
}
