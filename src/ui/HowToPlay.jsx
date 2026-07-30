import React from 'react';
import GameButton from '../components/GameButton';

function HowToPlay({ onNavigate }) {
  return (
    <div
      className="w-screen h-screen bg-cover bg-center relative flex flex-col justify-between items-center p-8 select-none overflow-y-auto"
      style={{
        backgroundImage: `url('/background/harbor-background_1.png')`,
      }}
    >
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"></div>

      <div className="relative z-10 max-w-3xl w-full flex flex-col items-center my-auto">
        <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-2 flex items-center gap-3">
          <span>🎮</span> How To Play
        </h2>
        <p className="text-slate-400 mb-8">Master boat steering & 3D mouse fishing mechanics</p>

        <div className="w-full bg-slate-900/80 border border-slate-700/60 rounded-3xl p-8 shadow-2xl backdrop-blur-lg grid md:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="bg-slate-950/60 border border-slate-800 p-6 rounded-2xl">
            <h3 className="text-xl font-bold text-cyan-300 mb-4 flex items-center gap-2">
              <span>🕹️</span> Navigation & Fishing
            </h3>
            <div className="space-y-3 text-slate-300 text-sm">
              <div className="flex justify-between items-center">
                <span className="font-mono bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 font-bold">W / ↑</span>
                <span>Accelerate Forward</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 font-bold">S / ↓</span>
                <span>Reverse / Brake</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 font-bold">A / D</span>
                <span>Steer Boat Left / Right</span>
              </div>
              <div className="flex justify-between items-center bg-cyan-950/40 p-2 rounded-xl border border-cyan-500/30">
                <span className="font-mono bg-cyan-500 text-slate-950 px-3 py-1 rounded-lg font-black">CLICK MOUSE</span>
                <span className="text-cyan-300 font-semibold">Fish garbage under target ring</span>
              </div>
            </div>
          </div>

          {/* Gameplay Rules */}
          <div className="bg-slate-950/60 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
                <span>🎣</span> 3D Fishing Mechanics
              </h3>
              <ul className="space-y-3 text-slate-300 text-sm list-disc list-inside">
                <li>Touching garbage with the boat no longer auto-collects it.</li>
                <li>Aim your cursor at floating plastic waste until the <span className="text-cyan-400 font-bold">blue target ring</span> appears.</li>
                <li>Click to cast a 3D fishing line that hooks and reels the debris back to your boat deck!</li>
                <li>Earn <strong className="text-cyan-300">+50 points</strong> per fished item.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <GameButton
            text="BACK TO MENU"
            icon="⬅️"
            variant="ghost"
            onClick={() => onNavigate('MENU')}
          />
        </div>
      </div>
    </div>
  );
}

export default HowToPlay;
