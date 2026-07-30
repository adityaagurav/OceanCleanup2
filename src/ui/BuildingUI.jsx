import React from 'react';

/**
 * BuildingUI.jsx — Renders the interaction menus for the House and Recycle Plant.
 */
function BuildingUI({ 
  activeBuilding, 
  energy, 
  money, 
  trashCount, 
  onClose, 
  onEat, 
  onSleep, 
  onRecycle 
}) {
  if (!activeBuilding) return null;

  return (
    <div className="absolute inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-6">
      
      {/* ────────────────────────────────────────────────────────── */}
      {/* House UI */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeBuilding === 'HOUSE' && (
        <div className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white">HOME CABIN 🏠</h2>
            <p className="text-amber-200/80 text-sm font-semibold mt-1">Rest and recover your energy.</p>
          </div>
          
          <div className="flex justify-between items-center bg-black/30 rounded-xl p-4 border border-white/10">
            <div>
              <div className="text-[10px] text-white/50 uppercase font-black tracking-wider">Current Energy</div>
              <div className="text-xl font-bold text-amber-400">{Math.floor(energy)} / 100</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-white/50 uppercase font-black tracking-wider">Wallet</div>
              <div className="text-xl font-bold text-green-400">${money}</div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={onEat}
              disabled={money < 15 || energy >= 100}
              className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:grayscale text-slate-900 font-bold rounded-xl transition-all cursor-pointer flex justify-between px-6 items-center"
            >
              <span>Eat a Hearty Meal 🍲</span>
              <span className="bg-slate-900/20 px-2 py-1 rounded-md text-sm">-$15 (Stops Hunger)</span>
            </button>
            
            <button
              onClick={onSleep}
              disabled={energy >= 100}
              className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:grayscale text-white font-bold rounded-xl transition-all cursor-pointer flex justify-between px-6 items-center"
            >
              <span>Sleep till Morning 🛏️</span>
              <span className="bg-black/20 px-2 py-1 rounded-md text-sm">Free (Restores All)</span>
            </button>
          </div>

          <button onClick={onClose} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white/80 font-bold rounded-xl transition-all border border-slate-700 mt-4">
            Leave House
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* Recycle Plant UI */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeBuilding === 'PLANT' && (
        <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white">RECYCLE PLANT ♻️</h2>
            <p className="text-emerald-200/80 text-sm font-semibold mt-1">Turn ocean trash into cash.</p>
          </div>
          
          <div className="flex justify-between items-center bg-black/30 rounded-xl p-4 border border-white/10">
            <div>
              <div className="text-[10px] text-white/50 uppercase font-black tracking-wider">Collected Trash</div>
              <div className="text-2xl font-black text-amber-400">{trashCount}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-white/50 uppercase font-black tracking-wider">Exchange Rate</div>
              <div className="text-lg font-bold text-emerald-400">1 Trash = $1</div>
            </div>
          </div>

          <button
            onClick={onRecycle}
            disabled={trashCount <= 0}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:grayscale text-slate-900 font-bold rounded-xl transition-all cursor-pointer flex justify-center gap-2 items-center text-lg"
          >
            Sell All Trash for <span className="font-black">${trashCount}</span>
          </button>

          <button onClick={onClose} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white/80 font-bold rounded-xl transition-all border border-slate-700 mt-4">
            Back to Work
          </button>
        </div>
      )}

    </div>
  );
}

export default BuildingUI;
