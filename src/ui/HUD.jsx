import React from 'react';

function HUD({ score, trashCount, boatSpeed, pickupToast, nearTrash, onPause, onQuit, missionActive, isNearBoat, isDocked, missionState }) {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-6 select-none">
      {/* Top Bar: Stats & Controls */}
      <div className="flex justify-between items-start gap-4">
        {/* Score & Trash Stats */}
        {missionActive && <div className="flex gap-4">
          <div className="bg-gradient-to-b from-sky-400 to-sky-600 border-4 border-sky-900 rounded-2xl px-5 py-2 flex items-center gap-3 shadow-[0_4px_0_rgba(12,74,110,1)] text-white transform transition-transform hover:scale-105 pointer-events-auto">
            <span className="text-3xl drop-shadow-md">📦</span>
            <div>
              <div className="text-sky-200 text-xs font-black uppercase tracking-widest drop-shadow-sm">Trash</div>
              <div className="text-white text-3xl font-black drop-shadow-md" style={{ textShadow: '2px 2px 0 #0c4a6e' }}>{trashCount}</div>
            </div>
          </div>

          <div className="bg-gradient-to-b from-emerald-400 to-emerald-600 border-4 border-emerald-900 rounded-2xl px-5 py-2 flex items-center gap-3 shadow-[0_4px_0_rgba(6,78,59,1)] text-white transform transition-transform hover:scale-105 pointer-events-auto">
            <span className="text-3xl drop-shadow-md">⭐</span>
            <div>
              <div className="text-emerald-200 text-xs font-black uppercase tracking-widest drop-shadow-sm">Score</div>
              <div className="text-white text-3xl font-black drop-shadow-md" style={{ textShadow: '2px 2px 0 #064e3b' }}>{score}</div>
            </div>
          </div>
        </div>}

        {/* Quit / Menu */}
        <button
          onClick={onQuit}
          className="pointer-events-auto bg-gradient-to-b from-slate-500 to-slate-700 hover:from-slate-400 hover:to-slate-600 active:translate-y-1 active:shadow-[0_0px_0_rgba(15,23,42,1)] border-4 border-slate-900 text-white px-6 py-3 rounded-2xl shadow-[0_4px_0_rgba(15,23,42,1)] font-black text-lg transition-all cursor-pointer uppercase tracking-widest"
          style={{ textShadow: '2px 2px 0 #0f172a' }}
        >
          ⚙️ Pause
        </button>
      </div>

      {/* Context prompts — kept near the top so gameplay stays unobstructed. */}
      <div className="absolute top-28 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
        {/* Near Trash Prompt */}
        {nearTrash && (
          <div className="bg-emerald-500 text-slate-950 px-8 py-3.5 rounded-2xl font-black text-xl shadow-2xl backdrop-blur-md border-2 border-emerald-300 animate-bounce flex items-center gap-3">
            <span className="bg-slate-950 text-emerald-400 px-3 py-1 rounded-xl text-lg font-mono">PRESS F</span>
            <span>TO PICKUP GARBAGE 🎣</span>
          </div>
        )}
        {/* Near Boat Prompt — board */}
        {isNearBoat && missionState === 'harbour' && (
          <div className="bg-blue-500 text-slate-950 px-8 py-3.5 rounded-2xl font-black text-xl shadow-2xl backdrop-blur-md border-2 border-blue-300 animate-bounce flex items-center gap-3">
            <span className="bg-slate-950 text-blue-400 px-3 py-1 rounded-xl text-lg font-mono">PRESS E</span>
            <span>TO BOARD BOAT ⛵</span>
          </div>
        )}
        {/* Docked Prompt — leave */}
        {isDocked && missionActive && (
          <div className="bg-blue-500 text-slate-950 px-8 py-3.5 rounded-2xl font-black text-xl shadow-2xl backdrop-blur-md border-2 border-blue-300 animate-bounce flex items-center gap-3">
            <span className="bg-slate-950 text-blue-400 px-3 py-1 rounded-xl text-lg font-mono">PRESS E</span>
            <span>TO LEAVE BOAT ⛵</span>
          </div>
        )}
        {missionState === 'harbour' && !isNearBoat && (
          <div className="bg-slate-900/85 border border-amber-300/40 text-amber-100 px-6 py-3 rounded-2xl font-bold shadow-2xl">
            Explore the harbour and find your boat at the end of the pier.
          </div>
        )}
        {missionState === 'started' && (
          <div className="bg-emerald-400 text-slate-950 px-7 py-3 rounded-2xl font-black text-lg shadow-2xl">MISSION STARTED — CLEAN THE OCEAN</div>
        )}
        {/* Floating Pickup Notification Toast */}
        {pickupToast && (
          <div className="bg-cyan-500/90 text-slate-950 px-6 py-2 rounded-full font-black text-lg shadow-2xl backdrop-blur-md animate-pulse">
            +50 Trash Collected! 🌊
          </div>
        )}
      </div>

      {/* Bottom Bar: Speedometer & Control Hints */}
      <div className="flex justify-between items-end">
        <div className="bg-slate-900/80 border-4 border-slate-700 backdrop-blur-md px-6 py-3 rounded-2xl text-slate-200 text-xs flex items-center gap-6 shadow-[0_4px_0_rgba(15,23,42,1)] font-bold tracking-wide">
          {missionActive ? <>
            <div className="flex items-center gap-2"><span className="bg-cyan-500 text-slate-950 px-2 py-1 rounded-md font-black">WASD / ARROWS</span> Drive Boat</div>
            <div className="flex items-center gap-2 border-l-2 border-slate-700 pl-6"><span className="bg-teal-500 text-slate-950 px-2 py-1 rounded-md font-black">DRAG MOUSE</span> Rotate Camera 360°</div>
            <div className="flex items-center gap-2 border-l-2 border-slate-700 pl-6"><span className="bg-emerald-500 text-slate-950 px-2 py-1 rounded-md font-black">F</span> Pickup Trash 🎣</div>
          </> : <>
            <div className="flex items-center gap-2"><span className="bg-cyan-500 text-slate-950 px-2 py-1 rounded-md font-black">WASD / ARROWS</span> Walk the harbour</div>
            <div className="flex items-center gap-2 border-l-2 border-slate-700 pl-6"><span className="bg-teal-500 text-slate-950 px-2 py-1 rounded-md font-black">DRAG MOUSE</span> Look around</div>
          </>}
        </div>

        {missionActive && <div className="bg-gradient-to-b from-indigo-500 to-indigo-700 border-4 border-indigo-900 rounded-2xl px-6 py-2 flex items-center gap-4 text-right shadow-[0_4px_0_rgba(30,27,75,1)] pointer-events-auto hover:scale-105 transition-transform cursor-default">
          <div>
            <div className="text-indigo-200 text-xs font-black uppercase tracking-widest drop-shadow-sm">Speed</div>
            <div className="text-white text-3xl font-black drop-shadow-md" style={{ textShadow: '2px 2px 0 #1e1b4b' }}>{boatSpeed.toFixed(1)} kn</div>
          </div>
          <span className="text-4xl drop-shadow-md">⚓</span>
        </div>}
      </div>
    </div>
  );
}

export default HUD;
