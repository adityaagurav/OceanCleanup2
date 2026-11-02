import React, { memo, useState } from 'react';
import { computeLeaderboardSections } from '../multiplayer/LeaderboardDisplay.js';

/**
 * InBoatLeaderboard.jsx — Compact top-left in-boat leaderboard.
 *
 * Displays live multiplayer recycling rankings while sailing:
 *  - Top 3 recycling leaders with rank, username and points.
 *  - Clear divider + personal row if the player is ranked outside the Top 3.
 *  - Collapsible to a compact trophy badge so it never obstructs gameplay.
 */
export const InBoatLeaderboard = memo(function InBoatLeaderboard({
  inBoat = false,
  networkState = null,
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!inBoat) return null;

  const entries = networkState?.leaderboard?.entries || [];
  const localPlayerId = networkState?.playerId || null;

  const sections = computeLeaderboardSections(entries, localPlayerId, 3);
  if (sections.isEmpty) return null;

  const topPlayer = sections.top5[0];

  return (
    <div className="pointer-events-auto shrink-0 z-30 select-none">
      {!isExpanded ? (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="btn-ui focus-ring hud-chip px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-white/10 transition-colors"
          title="Expand Recycling Leaderboard"
          aria-label="Expand Recycling Leaderboard"
        >
          <span className="text-amber-400 text-sm">🏆</span>
          <span className="chip-text text-xs font-bold tracking-wider">
            {topPlayer ? `${topPlayer.username} (${topPlayer.points})` : 'LEADERBOARD'}
          </span>
          <span className="text-cyan-400 text-[10px]">▼</span>
        </button>
      ) : (
        <div className="anim-fade-up panel-dark px-3.5 py-2.5 rounded-2xl w-48 sm:w-56 border border-cyan-500/20 shadow-xl backdrop-blur-md">
          {/* Header */}
          <div className="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-white/10">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-amber-400 text-xs">🏆</span>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-200 truncate">
                Recycling Rank
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-white/40 hover:text-white/90 text-xs px-1 py-0.5 rounded transition-colors cursor-pointer"
              title="Minimize Leaderboard"
              aria-label="Minimize Leaderboard"
            >
              ▲
            </button>
          </div>

          {/* Top 3 List */}
          <div className="flex flex-col gap-1">
            {sections.top5.map((entry) => {
              const isYou = entry.isYou;
              const rankColor =
                entry.rank === 1
                  ? 'text-amber-400 font-extrabold'
                  : entry.rank === 2
                  ? 'text-slate-300 font-bold'
                  : 'text-amber-600 font-bold';

              return (
                <div
                  key={entry.playerId}
                  className={`flex items-center justify-between text-xs px-1.5 py-0.5 rounded-lg transition-colors ${
                    isYou
                      ? 'bg-cyan-500/20 text-cyan-200 font-bold border border-cyan-400/30'
                      : 'text-white/85'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-3.5 text-center shrink-0 ${rankColor}`}>
                      {entry.rank}
                    </span>
                    <span className="truncate max-w-[90px] sm:max-w-[110px]">
                      {entry.username} {isYou ? '(YOU)' : ''}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-cyan-300 ml-1">
                    {entry.points}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Personal section if outside top 3 */}
          {sections.personal && (
            <div className="mt-1.5 pt-1.5 border-t border-white/10">
              <div className="flex items-center justify-between text-xs px-1.5 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-200 font-bold border border-cyan-400/30">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-3.5 text-center text-cyan-300 font-extrabold shrink-0">
                    {sections.personal.rank}
                  </span>
                  <span className="truncate max-w-[90px] sm:max-w-[110px]">
                    YOU
                  </span>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-cyan-300 ml-1">
                  {sections.personal.points}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default InBoatLeaderboard;

