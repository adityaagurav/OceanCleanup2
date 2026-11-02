import React from 'react';

/**
 * WarningModal.jsx — In-game notification displayed to a player when warned by an admin.
 */
export function WarningModal({ warning, onDismiss }) {
  React.useEffect(() => {
    if (warning && typeof document !== 'undefined' && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }, [warning]);

  if (!warning) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Administrative Warning"
      className="fixed inset-0 z-[60] pointer-events-auto flex items-center justify-center p-4 bg-black/80 backdrop-blur-md anim-fade-in select-text"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-[#1c1206]/95 border-2 border-amber-400 shadow-[0_20px_60px_-15px_rgba(245,158,11,0.5)] p-6 anim-pop text-amber-50 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 pb-3 border-b border-amber-400/30">
          <span className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-2xl animate-bounce">
            ⚠️
          </span>
          <div>
            <h3 className="text-lg font-black tracking-tight text-amber-200">
              Notice from Administrator
            </h3>
            <span className="text-[0.65rem] text-amber-300/70 font-mono">
              OceanCleanup Moderation Team
            </span>
          </div>
        </div>

        <div className="my-5 p-4 rounded-2xl bg-black/40 border border-amber-400/20">
          <p className="text-xs sm:text-sm font-semibold text-amber-100 leading-relaxed">
            "{warning.message || 'Please adhere to the community guidelines.'}"
          </p>
        </div>

        <p className="text-[0.72rem] text-amber-200/60 leading-normal mb-5">
          Continued violations may result in immediate removal from the active multiplayer session.
        </p>

        <button
          onClick={onDismiss}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110 text-black font-extrabold text-sm tracking-wide shadow-lg cursor-pointer transition-all active:scale-[0.98]"
        >
          I UNDERSTAND
        </button>
      </div>
    </div>
  );
}

export default WarningModal;

