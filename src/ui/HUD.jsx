import React from 'react';

function HUD({ score, trashCount, timeLeft, boatSpeed, pickupToast, nearTrash, onPause, onQuit, missionActive, isNearBoat, missionState }) {
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
<<<<<<< HEAD
        <div className="flex gap-4">
          <div className="bg-gradient-to-b from-sky-400 to-sky-600 border-4 border-sky-900 rounded-2xl px-5 py-2 flex items-center gap-3 shadow-[0_4px_0_rgba(12,74,110,1)] text-white transform transition-transform hover:scale-105 pointer-events-auto">
            <span className="text-3xl drop-shadow-md">📦</span>
=======
        {missionActive && <div className="flex gap-4">
          <div className="bg-slate-900/80 border border-cyan-500/30 backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <span className="text-3xl">📦</span>
>>>>>>> ce7c38d (add harbour boat cleanup gameplay)
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

        {/* Timer */}
<<<<<<< HEAD
        <div className={`border-4 rounded-2xl px-6 py-2 flex items-center gap-3 transform transition-transform hover:scale-105 pointer-events-auto ${
          timeLeft <= 15 
            ? 'bg-gradient-to-b from-rose-500 to-rose-700 border-rose-950 shadow-[0_4px_0_rgba(76,5,25,1)] animate-pulse' 
            : 'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-900 shadow-[0_4px_0_rgba(120,53,15,1)]'
=======
        {missionActive && <div className={`bg-slate-900/80 border backdrop-blur-md px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 ${
          timeLeft <= 15 ? 'border-rose-500/60 bg-rose-950/40 text-rose-400 animate-pulse' : 'border-slate-700 text-cyan-300'
>>>>>>> ce7c38d (add harbour boat cleanup gameplay)
        }`}>
          <span className="text-3xl drop-shadow-md">⏳</span>
          <div>
            <div className={`text-xs font-black uppercase tracking-widest drop-shadow-sm ${timeLeft <= 15 ? 'text-rose-200' : 'text-amber-100'}`}>Time</div>
            <div className="text-white text-3xl font-black drop-shadow-md" style={{ textShadow: timeLeft <= 15 ? '2px 2px 0 #4c0519' : '2px 2px 0 #78350f' }}>
              {formatTime(timeLeft)}
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
        {/* Near Boat Prompt */}
        {isNearBoat && missionState === 'harbour' && (
          <div className="bg-blue-500 text-slate-950 px-8 py-3.5 rounded-2xl font-black text-xl shadow-2xl backdrop-blur-md border-2 border-blue-300 animate-bounce flex items-center gap-3">
            <span className="bg-slate-950 text-blue-400 px-3 py-1 rounded-xl text-lg font-mono">PRESS E</span>
            <span>TO BOARD BOAT ⛵</span>
          </div>
        )}
        {missionState === 'harbour' && !isNearBoat && (
          <div className="bg-slate-900/85 border border-amber-300/40 text-amber-100 px-6 py-3 rounded-2xl font-bold shadow-2xl">
            Explore the harbour and find your boat at the end of the pier.
          </div>
        )}
        {missionState === 'boarding' && (
          <div className="bg-cyan-400 text-slate-950 px-7 py-3 rounded-2xl font-black text-lg shadow-2xl">BOARDING BOAT…</div>
        )}
        {missionState === 'started' && (
          <div className="bg-emerald-400 text-slate-950 px-7 py-3 rounded-2xl font-black text-lg shadow-2xl">MISSION STARTED — CLEAN THE OCEAN</div>
        )}
        {missionState === 'returning' && (
          <div className="bg-blue-400 text-slate-950 px-7 py-3 rounded-2xl font-black text-lg shadow-2xl">RETURNING TO HARBOUR…</div>
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
<<<<<<< HEAD
        <div className="bg-slate-900/80 border-4 border-slate-700 backdrop-blur-md px-6 py-3 rounded-2xl text-slate-200 text-xs flex items-center gap-6 shadow-[0_4px_0_rgba(15,23,42,1)] font-bold tracking-wide">
          <div className="flex items-center gap-2"><span className="bg-cyan-500 text-slate-950 px-2 py-1 rounded-md font-black">WASD</span> Drive Boat</div>
          <div className="flex items-center gap-2 border-l-2 border-slate-700 pl-6"><span className="bg-teal-500 text-slate-950 px-2 py-1 rounded-md font-black">DRAG</span> Camera</div>
          <div className="flex items-center gap-2 border-l-2 border-slate-700 pl-6"><span className="bg-emerald-500 text-slate-950 px-2 py-1 rounded-md font-black">F</span> Pickup Trash 🎣</div>
        </div>

        <div className="bg-gradient-to-b from-indigo-500 to-indigo-700 border-4 border-indigo-900 rounded-2xl px-6 py-2 flex items-center gap-4 text-right shadow-[0_4px_0_rgba(30,27,75,1)] pointer-events-auto hover:scale-105 transition-transform cursor-default">
          <div>
            <div className="text-indigo-200 text-xs font-black uppercase tracking-widest drop-shadow-sm">Speed</div>
            <div className="text-white text-3xl font-black drop-shadow-md" style={{ textShadow: '2px 2px 0 #1e1b4b' }}>{(Math.abs(boatSpeed) * 40).toFixed(1)} kn</div>
          </div>
          <span className="text-4xl drop-shadow-md">⚓</span>
        </div>
=======
        <div className="bg-slate-900/80 border border-slate-700/60 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-5">
          {missionActive ? <>
            <div><span className="font-bold text-cyan-300">WASD / ARROWS</span> Drive Boat</div>
            <div className="border-l border-slate-700 pl-4"><span className="font-bold text-teal-300">DRAG MOUSE</span> Rotate Camera POV 360°</div>
            <div className="border-l border-slate-700 pl-4"><span className="font-bold text-emerald-300">PRESS [F]</span> Pickup Trash Near Boat 🎣</div>
          </> : <>
            <div><span className="font-bold text-cyan-300">WASD / ARROWS</span> Walk the harbour</div>
            <div className="border-l border-slate-700 pl-4"><span className="font-bold text-teal-300">DRAG MOUSE</span> Look around</div>
          </>}
        </div>

        {missionActive && <div className="bg-slate-900/80 border border-slate-700/60 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-3 text-right">
          <div>
            <div className="text-slate-400 text-xs font-semibold uppercase">Boat Speed</div>
            <div className="text-white text-2xl font-bold font-mono">{boatSpeed.toFixed(1)} kn</div>
          </div>
          <span className="text-2xl">⚓</span>
        </div>}
>>>>>>> ce7c38d (add harbour boat cleanup gameplay)
      </div>
    </div>
  );
}

export default HUD;
