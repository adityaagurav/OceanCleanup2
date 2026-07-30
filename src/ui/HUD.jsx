import React from 'react';

function HUD({ score, trashCount, timeLeft, boatSpeed, pickupToast, nearTrash, onPause, onQuit }) {
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-6 select-none">
      {/* Top Bar: Stats & Controls */}
      <div className="flex justify-between items-start gap-4">
        {/* Score & Trash Stats */}
        <div className="flex gap-4">
          <div className="bg-slate-900/80 border border-cyan-500/30 backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <span className="text-3xl">📦</span>
            <div>
              <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Trash Cleaned</div>
              <div className="text-white text-2xl font-black font-mono">{trashCount}</div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-emerald-500/30 backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <span className="text-3xl">⭐</span>
            <div>
              <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Score</div>
              <div className="text-emerald-400 text-2xl font-black font-mono">{score} pts</div>
            </div>
          </div>
        </div>

        {/* Timer */}
        <div className={`bg-slate-900/80 border backdrop-blur-md px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 ${
          timeLeft <= 15 ? 'border-rose-500/60 bg-rose-950/40 text-rose-400 animate-pulse' : 'border-slate-700 text-cyan-300'
        }`}>
          <span className="text-2xl">⏳</span>
          <div>
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Time Left</div>
            <div className="text-2xl font-black font-mono">{formatTime(timeLeft)}</div>
          </div>
        </div>

        {/* Quit / Menu */}
        <button
          onClick={onQuit}
          className="pointer-events-auto bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white px-4 py-3 rounded-2xl backdrop-blur-md font-semibold text-sm transition-all cursor-pointer"
        >
          ⚙️ Pause / Exit
        </button>
      </div>

      {/* Center Interactive Prompts */}
      <div className="self-center flex flex-col items-center gap-3">
        {/* Near Trash Prompt */}
        {nearTrash && (
          <div className="bg-emerald-500 text-slate-950 px-8 py-3.5 rounded-2xl font-black text-xl shadow-2xl backdrop-blur-md border-2 border-emerald-300 animate-bounce flex items-center gap-3">
            <span className="bg-slate-950 text-emerald-400 px-3 py-1 rounded-xl text-lg font-mono">PRESS F</span>
            <span>TO PICKUP GARBAGE 🎣</span>
          </div>
        )}

        {/* Floating Pickup Notification Toast */}
        {pickupToast && (
          <div className="bg-cyan-500/90 text-slate-950 px-6 py-2 rounded-full font-black text-lg shadow-2xl backdrop-blur-md animate-pulse">
            +50 Trash Collected! 🌊
          </div>
        )}
      </div>

      {/* Bottom Bar: Boat Speedometer & Control Hints */}
      <div className="flex justify-between items-end">
        <div className="bg-slate-900/80 border border-slate-700/60 backdrop-blur-md px-5 py-3 rounded-2xl text-slate-300 text-xs flex items-center gap-5">
          <div><span className="font-bold text-cyan-300">WASD / ARROWS</span> Drive Boat</div>
          <div className="border-l border-slate-700 pl-4"><span className="font-bold text-teal-300">DRAG MOUSE</span> Rotate Camera POV 360°</div>
          <div className="border-l border-slate-700 pl-4"><span className="font-bold text-emerald-300">PRESS [F]</span> Pickup Trash Near Boat 🎣</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/60 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-3 text-right">
          <div>
            <div className="text-slate-400 text-xs font-semibold uppercase">Boat Speed</div>
            <div className="text-white text-xl font-bold font-mono">{(Math.abs(boatSpeed) * 40).toFixed(1)} kn</div>
          </div>
          <span className="text-2xl">⚓</span>
        </div>
      </div>
    </div>
  );
}

export default HUD;
