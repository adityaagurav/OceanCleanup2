import React, { useState, useEffect, useMemo } from 'react';
import Icon from '../components/Icon';
import { networkManager } from '../multiplayer/NetworkManager';

/**
 * AdminPanel.jsx — In-game overlay for multiplayer administrators.
 *
 * Three clearly separated sections:
 *  1. Player Management (all connected players, ID, status, boat level, coins, points, search)
 *  2. Player Reports (view reports, reporter, reason, time, mark Pending/Reviewed/Resolved)
 *  3. Player Moderation (issue in-game warnings, kick players)
 */
export function AdminPanel({ isOpen, onClose, localPlayerId }) {
  const [activeTab, setActiveTab] = useState('players'); // 'players' | 'reports' | 'moderation'
  const [players, setPlayers] = useState([]);
  const [reports, setReports] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [reportFilter, setReportFilter] = useState('All'); // 'All' | 'Pending' | 'Reviewed' | 'Resolved'

  // Moderation form state
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [warnMessage, setWarnMessage] = useState('Please respect other players and adhere to the harbor code of conduct.');
  const [kickReason, setKickReason] = useState('Disruptive behavior in multiplayer session.');
  const [feedback, setFeedback] = useState(null);

  // Load and subscribe to real-time admin data
  useEffect(() => {
    if (!isOpen) return;

    // Initial fetch
    networkManager.getAdminData().then((res) => {
      if (res?.success) {
        setPlayers(res.players || []);
        setReports(res.reports || []);
      }
    });

    // Real-time updates from server
    const unsubPlayers = networkManager.on('adminPlayersUpdate', (updatedPlayers) => {
      if (Array.isArray(updatedPlayers)) {
        setPlayers(updatedPlayers);
      }
    });

    const unsubReports = networkManager.on('adminReportsUpdate', (updatedReports) => {
      if (Array.isArray(updatedReports)) {
        setReports(updatedReports);
      }
    });

    return () => {
      unsubPlayers();
      unsubReports();
    };
  }, [isOpen]);

  // Handle escape key to close & ensure mouse cursor is unlocked
  useEffect(() => {
    if (!isOpen) return;

    const releasePointerLock = () => {
      if (typeof document !== 'undefined' && document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
    releasePointerLock();
    const lockWatcher = setInterval(releasePointerLock, 300);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearInterval(lockWatcher);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Set default target when players change
  useEffect(() => {
    const candidates = players.filter((p) => p.playerId !== localPlayerId);
    if (!selectedTargetId && candidates.length > 0) {
      setSelectedTargetId(candidates[0].playerId);
    }
  }, [players, localPlayerId, selectedTargetId]);

  const showFeedback = (text, type = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Filtered players list
  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        (p.username && p.username.toLowerCase().includes(q)) ||
        (p.playerId && p.playerId.toLowerCase().includes(q))
    );
  }, [players, searchQuery]);

  // Filtered reports list
  const filteredReports = useMemo(() => {
    if (reportFilter === 'All') return reports;
    return reports.filter((r) => r.status === reportFilter);
  }, [reports, reportFilter]);

  const pendingReportsCount = reports.filter((r) => r.status === 'Pending').length;

  // Actions
  const handleUpdateReportStatus = async (reportId, newStatus) => {
    const res = await networkManager.updateReportStatus(reportId, newStatus);
    if (res?.success) {
      showFeedback(`Report marked as ${newStatus}.`);
    } else {
      showFeedback(res?.message || 'Failed to update report status.', 'error');
    }
  };

  const handleSendWarning = async () => {
    if (!selectedTargetId) {
      showFeedback('Please select a target player.', 'error');
      return;
    }
    const target = players.find((p) => p.playerId === selectedTargetId);
    const res = await networkManager.warnPlayer(selectedTargetId, warnMessage);
    if (res?.success) {
      showFeedback(`Warning delivered to "${target?.username || selectedTargetId}".`);
    } else {
      showFeedback(res?.message || 'Failed to send warning.', 'error');
    }
  };

  const handleKickPlayer = async () => {
    if (!selectedTargetId) {
      showFeedback('Please select a target player.', 'error');
      return;
    }
    const target = players.find((p) => p.playerId === selectedTargetId);
    const targetName = target?.username || selectedTargetId;
    if (!window.confirm(`Are you sure you want to kick "${targetName}" from the multiplayer session?`)) {
      return;
    }
    const res = await networkManager.kickPlayer(selectedTargetId, kickReason);
    if (res?.success) {
      showFeedback(`Player "${targetName}" was kicked from the session.`);
      // Clear selection
      setSelectedTargetId('');
    } else {
      showFeedback(res?.message || 'Failed to kick player.', 'error');
    }
  };

  const jumpToModeration = (playerId) => {
    setSelectedTargetId(playerId);
    setActiveTab('moderation');
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Admin Console"
      className="fixed inset-0 z-[60] pointer-events-auto flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md anim-fade-in select-text"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-4xl max-h-[86vh] flex flex-col rounded-3xl bg-[#061c2f]/95 border border-cyan-soft/30 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.9)] overflow-hidden anim-pop text-foam pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-xl shadow-inner">
              🛡️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-white">Admin Console</h2>
                <span className="text-[0.62rem] px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 font-mono font-bold uppercase tracking-wider">
                  Administrator
                </span>
              </div>
              <p className="text-xs text-foam/60 font-medium">
                {players.length} player{players.length === 1 ? '' : 's'} connected
                {pendingReportsCount > 0 && (
                  <span className="ml-2 text-amber-300 font-bold">· {pendingReportsCount} pending report{pendingReportsCount === 1 ? '' : 's'}</span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close admin panel"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-foam/80 hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-black/20 px-6 gap-2">
          <button
            onClick={() => setActiveTab('players')}
            className={`py-3.5 px-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'players'
                ? 'border-aqua text-aqua bg-white/5'
                : 'border-transparent text-foam/70 hover:text-foam hover:bg-white/5'
            }`}
          >
            <span>👥</span>
            <span>Player Management</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 font-mono">
              {players.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`py-3.5 px-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'reports'
                ? 'border-aqua text-aqua bg-white/5'
                : 'border-transparent text-foam/70 hover:text-foam hover:bg-white/5'
            }`}
          >
            <span>📋</span>
            <span>Player Reports</span>
            {pendingReportsCount > 0 ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 border border-amber-400/40 font-mono font-bold animate-pulse">
                {pendingReportsCount}
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 font-mono">
                {reports.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('moderation')}
            className={`py-3.5 px-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'moderation'
                ? 'border-aqua text-aqua bg-white/5'
                : 'border-transparent text-foam/70 hover:text-foam hover:bg-white/5'
            }`}
          >
            <span>⚡</span>
            <span>Player Moderation</span>
          </button>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl border text-xs font-bold flex items-center gap-2 anim-pop ${
              feedback.type === 'error'
                ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
            }`}
          >
            <span>{feedback.type === 'error' ? '⚠️' : '✔'}</span>
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Tab Body — vertically scrollable with clean scroll containment and wheel support */}
        <div
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 overscroll-contain select-text"
          onWheel={(e) => e.stopPropagation()}
        >
          {/* TAB 1: PLAYER MANAGEMENT */}
          {activeTab === 'players' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foam/40 pointer-events-none text-sm">
                    🔍
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search player by username or ID..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-ink-deep/80 border border-cyan-soft/30 focus:border-aqua focus:outline-none text-foam placeholder-foam/40 text-xs font-semibold"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foam/40 hover:text-foam text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="text-xs text-foam/60 font-medium">
                  Showing {filteredPlayers.length} of {players.length} players
                </div>
              </div>

              {filteredPlayers.length === 0 ? (
                <div className="py-16 text-center text-foam/50 text-sm">
                  No players found matching "{searchQuery}".
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-foam/60 uppercase font-mono text-[0.65rem] tracking-wider">
                        <th className="py-3 px-4">Player</th>
                        <th className="py-3 px-4">Player ID</th>
                        <th className="py-3 px-3 text-center">Status</th>
                        <th className="py-3 px-3 text-center">Boat</th>
                        <th className="py-3 px-4 text-right">Coins</th>
                        <th className="py-3 px-4 text-right">Points</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium">
                      {filteredPlayers.map((p) => {
                        const isSelf = p.playerId === localPlayerId;
                        return (
                          <tr
                            key={p.playerId}
                            className={`hover:bg-white/5 transition-colors ${
                              isSelf ? 'bg-cyan-500/10' : ''
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-foam text-sm">
                                  {p.username}
                                </span>
                                {p.isAdmin && (
                                  <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 font-bold border border-amber-300/30">
                                    ADMIN
                                  </span>
                                )}
                                {isSelf && (
                                  <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-200 font-bold border border-cyan-300/30">
                                    YOU
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-foam/60 text-[0.7rem]">
                              {p.playerId}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[0.68rem] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {p.status || 'Online'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-foam/90">
                              <span className="px-2 py-0.5 rounded-lg bg-white/10">
                                Level {p.boatLevel || 1}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-amber-300 font-mono">
                              🪙 {p.coins ?? 0}
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-aqua font-mono">
                              ♻️ {p.points ?? 0}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {!isSelf ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => jumpToModeration(p.playerId)}
                                    title={`Issue warning to ${p.username}`}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/30 text-amber-200 text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Warn
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedTargetId(p.playerId);
                                      jumpToModeration(p.playerId);
                                    }}
                                    title={`Kick ${p.username}`}
                                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/30 text-rose-200 text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Kick
                                  </button>
                                </div>
                              ) : (
                                <span className="text-foam/30 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PLAYER REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10 text-xs">
                  {['All', 'Pending', 'Reviewed', 'Resolved'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setReportFilter(tab)}
                      className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                        reportFilter === tab
                          ? 'bg-aqua/20 text-aqua border border-aqua/30'
                          : 'text-foam/60 hover:text-foam'
                      }`}
                    >
                      {tab}
                      {tab === 'Pending' && pendingReportsCount > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[0.6rem] font-bold">
                          {pendingReportsCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-foam/60 font-medium">
                  {filteredReports.length} report{filteredReports.length === 1 ? '' : 's'} shown
                </div>
              </div>

              {filteredReports.length === 0 ? (
                <div className="py-16 text-center text-foam/50 text-sm">
                  {reportFilter === 'All'
                    ? 'No reports have been submitted yet.'
                    : `No reports in "${reportFilter}" status.`}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredReports.map((report) => {
                    const statusColor =
                      report.status === 'Resolved'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                        : report.status === 'Reviewed'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-400/40';

                    return (
                      <div
                        key={report.id}
                        className="p-4 rounded-2xl bg-black/25 border border-white/10 hover:border-white/20 transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-extrabold text-foam">
                                Reported: <span className="text-rose-300">{report.reportedUsername}</span>
                              </span>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200">
                                {report.reason}
                              </span>
                              <span className={`text-[0.68rem] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${statusColor}`}>
                                {report.status}
                              </span>
                            </div>
                            <p className="text-xs text-foam/60 mt-1">
                              Filed by <strong className="text-foam/85">{report.reporterUsername}</strong> ·{' '}
                              {new Date(report.createdAt).toLocaleString()}
                            </p>
                          </div>

                          {/* Quick Moderation Button for reported player */}
                          {report.reportedPlayerId && (
                            <button
                              onClick={() => jumpToModeration(report.reportedPlayerId)}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-foam cursor-pointer transition-colors"
                            >
                              Moderate Player ➜
                            </button>
                          )}
                        </div>

                        {report.description && (
                          <div className="p-3 rounded-xl bg-ink-deep/60 border border-white/5 text-xs text-foam/85 leading-relaxed font-sans">
                            "{report.description}"
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                          <span className="text-foam/50 font-mono text-[0.68rem]">ID: {report.id}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-foam/50 mr-1">Set status:</span>
                            {['Pending', 'Reviewed', 'Resolved'].map((st) => (
                              <button
                                key={st}
                                disabled={report.status === st}
                                onClick={() => handleUpdateReportStatus(report.id, st)}
                                className={`px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-all cursor-pointer ${
                                  report.status === st
                                    ? 'bg-white/20 text-white opacity-40 cursor-default'
                                    : 'bg-white/10 hover:bg-white/20 text-foam/80'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PLAYER MODERATION */}
          {activeTab === 'moderation' && (
            <div className="space-y-6 max-w-2xl mx-auto pb-8">
              {/* Target Player Selector */}
              <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-2">
                <label htmlFor="target-player" className="block text-xs font-bold text-foam/80">
                  Select Target Player
                </label>
                <select
                  id="target-player"
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-ink-deep border border-cyan-soft/30 text-foam font-bold text-sm focus:border-aqua focus:outline-none cursor-pointer"
                >
                  <option value="" disabled>
                    -- Select a connected player --
                  </option>
                  {players
                    .filter((p) => p.playerId !== localPlayerId)
                    .map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        {p.username} ({p.playerId}) · Level {p.boatLevel || 1}
                      </option>
                    ))}
                </select>
                {players.filter((p) => p.playerId !== localPlayerId).length === 0 && (
                  <p className="text-xs text-foam/50 italic">
                    No other players currently connected.
                  </p>
                )}
              </div>

              {/* Action 1: Issue Warning */}
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-400/30 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <h3 className="font-extrabold text-amber-200 text-sm">Issue In-Game Warning</h3>
                </div>
                <p className="text-xs text-foam/70">
                  Presents an immediate, non-dismissible notification to the player's screen with your warning message.
                </p>

                <div className="flex flex-wrap gap-1.5 text-[0.7rem]">
                  {[
                    'Please avoid ramming or disrupting other boats.',
                    'Please keep player names and interactions courteous.',
                    'Warning: Fair play violation detected.',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setWarnMessage(preset)}
                      className="px-2.5 py-1 rounded-lg bg-black/30 hover:bg-black/50 border border-amber-400/20 text-amber-200/80 cursor-pointer transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={warnMessage}
                  onChange={(e) => setWarnMessage(e.target.value)}
                  placeholder="Enter warning text..."
                  className="w-full p-3 rounded-xl bg-ink-deep/90 border border-amber-400/30 text-foam text-xs font-medium focus:border-amber-300 focus:outline-none"
                />

                <button
                  onClick={handleSendWarning}
                  disabled={!selectedTargetId}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-extrabold text-xs cursor-pointer transition-colors shadow-lg"
                >
                  Send In-Game Warning
                </button>
              </div>

              {/* Action 2: Kick Player */}
              <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-400/30 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👢</span>
                  <h3 className="font-extrabold text-rose-200 text-sm">Kick From Multiplayer Session</h3>
                </div>
                <p className="text-xs text-foam/70">
                  Instantly disconnects the target player from the game session and returns them to the main menu with the specified reason.
                </p>

                <div className="flex flex-wrap gap-1.5 text-[0.7rem]">
                  {[
                    'Disruptive behavior in multiplayer session.',
                    'Harassment or unsportsmanlike conduct.',
                    'Repeated collision / griefing.',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setKickReason(preset)}
                      className="px-2.5 py-1 rounded-lg bg-black/30 hover:bg-black/50 border border-rose-400/20 text-rose-200/80 cursor-pointer transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={kickReason}
                  onChange={(e) => setKickReason(e.target.value)}
                  placeholder="Reason for kick..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-ink-deep/90 border border-rose-400/30 text-foam text-xs font-medium focus:border-rose-300 focus:outline-none"
                />

                <div className="pt-1">
                  <button
                    onClick={handleKickPlayer}
                    disabled={!selectedTargetId}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-extrabold text-xs cursor-pointer transition-colors shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>👢</span>
                    <span>Kick Player Now</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-black/20 flex items-center justify-between text-xs text-foam/50">
          <span>OceanCleanup Moderation & Compliance · Server-Authoritative</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-foam font-bold cursor-pointer transition-colors"
          >
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;

