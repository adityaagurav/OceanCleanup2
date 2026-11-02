import React, { memo, useState } from 'react';

/**
 * MultiplayerStatusChip.jsx — Phase 1 & 2: Multiplayer Status Indicator & Player List
 *
 * Displays:
 *  - Active connected-player count (e.g. "👥 2 Online")
 *  - Connection state (connected, connecting, offline)
 *  - Phase 2: Active harbour player list with custom guest names, colored dots, and (You) badge
 *  - Expandable popover with latency, socket ID, and server endpoint
 */
export const MultiplayerStatusChip = memo(function MultiplayerStatusChip({ networkState, onReconnect }) {
  const [showDetails, setShowDetails] = useState(false);
  const {
    status,
    connected,
    playerCount,
    latency,
    socketId,
    playerId,
    serverUrl,
    error,
    players = [],
  } = networkState || {};

  // Status visual attributes
  const isOnline = connected && status === 'connected';
  const isConnecting = status === 'connecting' || status === 'reconnecting';

  const dotColor = isOnline
    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
    : isConnecting
    ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]'
    : 'bg-rose-400/80';

  const label = isOnline
    ? `${playerCount} ${playerCount === 1 ? 'Player' : 'Players'}`
    : isConnecting
    ? (status === 'reconnecting' ? 'Reconnecting...' : 'Connecting...')
    : 'Offline';

  return (
    <div className="relative pointer-events-auto">
      <button
        onClick={() => setShowDetails((v) => !v)}
        title="Multiplayer Status & Player List (Click to open)"
        aria-label="Multiplayer status indicator"
        className="hud-chip px-2.5 py-1.5 rounded-xl border border-white/10 hover:border-white/25 flex items-center gap-2 cursor-pointer transition-colors backdrop-blur-md text-xs font-semibold select-none"
      >
        <span className={`w-2 h-2 rounded-full transition-colors ${dotColor}`} />
        <span className="text-white/90 font-medium flex items-center gap-1">
          <span className="opacity-75">👥</span>
          <span>{label}</span>
        </span>
        {isOnline && latency > 0 && (
          <span className="text-[0.65rem] text-white/50 font-mono hidden sm:inline">
            {latency}ms
          </span>
        )}
      </button>

      {/* Details & Player List popover */}
      {showDetails && (
        <div
          className="anim-pop absolute top-full mt-2 right-0 z-50 panel-dark p-3.5 rounded-xl border border-white/15 shadow-2xl w-64 text-xs backdrop-blur-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
            <span className="font-extrabold text-white flex items-center gap-1.5">
              <span>🌐</span> Multiplayer Server
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[0.65rem] font-bold uppercase tracking-wider ${
                isOnline
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : isConnecting
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              {status}
            </span>
          </div>

          <div className="space-y-1.5 text-white/80 font-mono text-[0.7rem]">
            <div className="flex justify-between">
              <span className="text-white/50 font-sans">Connected Devices:</span>
              <span className="font-bold text-white">{playerCount || 1}</span>
            </div>
            {isOnline && (
              <>
                <div className="flex justify-between">
                  <span className="text-white/50 font-sans">Socket ID:</span>
                  <span className="text-cyan-soft font-bold truncate max-w-[110px]" title={socketId}>
                    {socketId ? `${socketId.slice(0, 8)}...` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50 font-sans">Ping Latency:</span>
                  <span className="text-sand font-bold">{latency} ms</span>
                </div>
              </>
            )}
            <div className="flex flex-col pt-1 border-t border-white/10">
              <span className="text-white/50 font-sans text-[0.65rem]">Server Endpoint:</span>
              <span className="text-white/70 text-[0.65rem] truncate" title={serverUrl}>
                {serverUrl}
              </span>
            </div>
            {error && (
              <div className="p-1.5 mt-1 bg-rose-900/30 border border-rose-500/30 rounded text-rose-300 text-[0.65rem]">
                {error}
              </div>
            )}
          </div>

          {/* Phase 2: Active Connected Players List */}
          {players && players.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white/70 font-sans text-[0.7rem] font-bold">
                  Active Players ({players.length})
                </span>
                <span className="text-[0.6rem] text-cyan-soft font-medium">Harbor Fleet</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                {players.map((p) => {
                  const isSelf = p.playerId === playerId || p.socketId === socketId;
                  const dotColor = p.color?.primary || '#38bdf8';
                  return (
                    <div
                      key={p.playerId || p.socketId}
                      className={`flex items-center justify-between px-2 py-1 rounded-lg text-[0.75rem] ${
                        isSelf
                          ? 'bg-cyan-500/20 border border-cyan-400/40'
                          : 'bg-white/5 border border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: dotColor }}
                          title={`Color: ${p.color?.name || 'Standard'}`}
                        />
                        <span
                          className={`truncate max-w-[120px] font-medium ${
                            isSelf ? 'text-cyan-200 font-bold' : 'text-white/90'
                          }`}
                          title={p.username}
                        >
                          {p.username}
                        </span>
                      </div>
                      {isSelf && (
                        <span className="text-[0.6rem] font-extrabold text-cyan-300 bg-cyan-400/20 px-1.5 py-0.5 rounded shrink-0">
                          YOU
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isOnline && onReconnect && (
            <button
              onClick={() => {
                onReconnect();
              }}
              className="mt-2.5 w-full py-1.5 rounded-lg bg-aqua/20 hover:bg-aqua/30 border border-aqua/40 text-aqua text-xs font-bold transition-colors cursor-pointer"
            >
              Reconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default MultiplayerStatusChip;
