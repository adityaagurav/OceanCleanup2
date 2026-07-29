import React, { useState } from 'react';
import GameButton from '../components/GameButton';

function Settings({ onNavigate, soundMuted, onToggleSound, settings, onUpdateSettings }) {
  return (
    <div
      className="w-screen h-screen bg-cover bg-center relative flex flex-col justify-between items-center p-8 select-none overflow-y-auto"
      style={{
        backgroundImage: `url('/background/harbor-background_1.png')`,
      }}
    >
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"></div>

      <div className="relative z-10 max-w-2xl w-full flex flex-col items-center my-auto">
        <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-2 flex items-center gap-3">
          <span>⚙️</span> Game Settings
        </h2>
        <p className="text-slate-400 mb-8">Customize your ocean cleaning experience</p>

        <div className="w-full bg-slate-900/80 border border-slate-700/60 rounded-3xl p-8 shadow-2xl backdrop-blur-lg space-y-6">
          {/* Sound Toggle */}
          <div className="flex justify-between items-center pb-6 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-semibold text-white">Audio & Sound Effects</h3>
              <p className="text-slate-400 text-sm">Toggle in-game sound effects & synthesized ocean audio</p>
            </div>
            <button
              onClick={onToggleSound}
              className={`px-5 py-2.5 rounded-full font-bold transition-all cursor-pointer ${
                !soundMuted
                  ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {!soundMuted ? 'ENABLED 🔊' : 'MUTED 🔇'}
            </button>
          </div>

          {/* Game Duration */}
          <div className="flex justify-between items-center pb-6 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-semibold text-white">Cleaner Mission Time limit</h3>
              <p className="text-slate-400 text-sm">Select round length for cleanup missions</p>
            </div>
            <select
              value={settings.timeLimit}
              onChange={(e) => onUpdateSettings({ ...settings, timeLimit: Number(e.target.value) })}
              className="bg-slate-800 border border-slate-700 text-cyan-300 font-semibold px-4 py-2 rounded-xl focus:outline-none focus:border-cyan-400"
            >
              <option value={60}>60 Seconds</option>
              <option value={120}>120 Seconds</option>
              <option value={180}>180 Seconds</option>
            </select>
          </div>

          {/* Difficulty */}
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-white">Trash Spawn Density</h3>
              <p className="text-slate-400 text-sm">Control how much debris floats in the ocean</p>
            </div>
            <select
              value={settings.trashDensity}
              onChange={(e) => onUpdateSettings({ ...settings, trashDensity: e.target.value })}
              className="bg-slate-800 border border-slate-700 text-cyan-300 font-semibold px-4 py-2 rounded-xl focus:outline-none focus:border-cyan-400"
            >
              <option value="normal">Standard (500 items)</option>
              <option value="high">High Density (800 items)</option>
              <option value="mega">Great Pacific Garbage Patch (1200 items)</option>
            </select>
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

export default Settings;
