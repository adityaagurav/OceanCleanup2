import React, { useState } from 'react';
import { networkManager } from '../multiplayer/NetworkManager';

const REPORT_REASONS = [
  'Griefing / Ramming',
  'Inappropriate Behavior',
  'Offensive Name',
  'Spam / Chat Abuse',
  'Other',
];

export function ReportPlayerModal({ isOpen, onClose, players = [], localPlayerId }) {
  const candidates = players.filter((p) => p.playerId !== localPlayerId);

  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [customUsername, setCustomUsername] = useState('');
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  React.useEffect(() => {
    if (isOpen && typeof document !== 'undefined' && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    let targetUsername = '';
    let targetPlayerId = '';

    if (selectedPlayerId) {
      const match = candidates.find((p) => p.playerId === selectedPlayerId);
      targetUsername = match?.username || '';
      targetPlayerId = selectedPlayerId;
    } else if (customUsername.trim()) {
      targetUsername = customUsername.trim();
    }

    if (!targetUsername) {
      setErrorMessage('Please select or specify the player to report.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await networkManager.reportPlayer({
        reportedUsername: targetUsername,
        reportedPlayerId: targetPlayerId,
        reason,
        description: description.trim(),
      });

      if (res?.success) {
        setSubmitted(true);
        setTimeout(() => {
          setSubmitted(false);
          onClose();
        }, 1600);
      } else {
        setErrorMessage(res?.message || res?.error || 'Failed to submit report.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error sending report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report Player"
      className="fixed inset-0 z-[60] pointer-events-auto flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm anim-fade-in select-text"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-[#061c2f]/95 border border-cyan-soft/30 p-6 shadow-2xl anim-pop text-foam pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-sm">
              🚩
            </span>
            <h3 className="text-lg font-black tracking-tight text-white">Report a Player</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-foam/80 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="py-10 text-center space-y-2 anim-pop">
            <span className="text-4xl">✔</span>
            <h4 className="text-base font-extrabold text-emerald-300">Report Submitted</h4>
            <p className="text-xs text-foam/70">
              Thank you for helping keep our ocean community welcoming and clean.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Target selection */}
            <div>
              <label htmlFor="reported-player-select" className="block text-xs font-bold text-foam/80 mb-1.5">
                Player to Report
              </label>
              {candidates.length > 0 ? (
                <select
                  id="reported-player-select"
                  value={selectedPlayerId}
                  onChange={(e) => {
                    setSelectedPlayerId(e.target.value);
                    setCustomUsername('');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-ink-deep border border-cyan-soft/30 text-foam text-xs font-semibold focus:border-aqua focus:outline-none cursor-pointer"
                >
                  <option value="">-- Choose active player --</option>
                  {candidates.map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {p.username}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={customUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  placeholder="Enter captain's callsign..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-ink-deep border border-cyan-soft/30 text-foam text-xs font-semibold focus:border-aqua focus:outline-none"
                />
              )}
            </div>

            {/* Reason selector */}
            <div>
              <label htmlFor="report-reason-select" className="block text-xs font-bold text-foam/80 mb-1.5">
                Reason
              </label>
              <select
                id="report-reason-select"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-ink-deep border border-cyan-soft/30 text-foam text-xs font-semibold focus:border-aqua focus:outline-none cursor-pointer"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="report-description" className="block text-xs font-bold text-foam/80 mb-1.5">
                Short Description (Optional)
              </label>
              <textarea
                id="report-description"
                rows={3}
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe what happened..."
                className="w-full p-3 rounded-xl bg-ink-deep border border-cyan-soft/30 text-foam text-xs font-medium focus:border-aqua focus:outline-none"
              />
              <span className="block text-right text-[0.65rem] text-foam/40">
                {description.length}/300
              </span>
            </div>

            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs font-semibold">
                ⚠️ {errorMessage}
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-foam text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer shadow-lg"
              >
                {isSubmitting ? 'Sending...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ReportPlayerModal;

