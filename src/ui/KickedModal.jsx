import React from 'react';

/**
 * KickedModal.jsx — Clear message displayed to a player when kicked from multiplayer.
 */
export function KickedModal({ kickedNotice, onReturnToMenu }) {
  React.useEffect(() => {
    if (kickedNotice && typeof document !== 'undefined' && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }, [kickedNotice]);

  if (!kickedNotice) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Kicked from session"
      className="fixed inset-0 z-[60] pointer-events-auto flex items-center justify-center p-4 bg-black/85 backdrop-blur-md anim-fade-in select-text"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-[#1f0808]/95 border-2 border-rose-500 shadow-[0_20px_60px_-15px_rgba(244,63,94,0.6)] p-6 anim-pop text-rose-50 text-center pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-14 h-14 mx-auto rounded-3xl bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center text-3xl mb-4 shadow-inner">
          🚨
        </div>

        <h3 className="text-xl font-black tracking-tight text-white">
          Session Disconnected
        </h3>
        <p className="text-xs text-rose-300 font-semibold mt-1">
          You were kicked from this multiplayer session by an administrator.
        </p>

        <div className="my-5 p-4 rounded-2xl bg-black/40 border border-rose-500/30 text-left">
          <span className="block text-[0.65rem] text-rose-300/70 uppercase font-mono font-bold tracking-wider mb-1">
            Reason Given:
          </span>
          <p className="text-sm font-bold text-rose-100">
            "{kickedNotice.reason || 'Kicked by administrator'}"
          </p>
        </div>

        <p className="text-[0.72rem] text-rose-200/60 leading-normal mb-5">
          Your local session has ended. You may return to the main menu and rejoin when ready.
        </p>

        <button
          onClick={onReturnToMenu}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-500 hover:brightness-110 text-white font-extrabold text-sm tracking-wide shadow-lg cursor-pointer transition-all active:scale-[0.98]"
        >
          RETURN TO MAIN MENU
        </button>
      </div>
    </div>
  );
}

export default KickedModal;

