import React from 'react';
import GameButton from '../components/GameButton';

function MainMenu({ onNavigate, soundMuted, onToggleSound }) {
  return (
    <div
      className="w-screen h-screen bg-cover bg-center relative flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundImage: `url('/background/harbor-background_1.png')`,
      }}
    >
      {/* Dark Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-transparent"></div>

      {/* Top Header Controls */}
      <div className="relative z-10 p-8 flex justify-between items-center">
        <div className="flex items-center gap-3 bg-cyan-950/70 border border-cyan-500/30 px-4 py-2 rounded-full backdrop-blur-md">
          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="text-cyan-200 text-sm font-semibold tracking-wider uppercase">Ocean Cleaner v2.0</span>
        </div>

        <button
          onClick={onToggleSound}
          className="p-3 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 rounded-full text-white transition-all backdrop-blur-md cursor-pointer"
          title={soundMuted ? "Unmute Sound" : "Mute Sound"}
        >
          {soundMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex h-full items-center px-12 md:px-20">
        <div className="max-w-xl flex flex-col items-start">
          <div className="inline-block mb-3 px-3 py-1 bg-cyan-500/20 border border-cyan-400/30 rounded-lg text-cyan-300 text-sm font-medium">
            🌊 Eco Simulator Game
          </div>

          <h1 className="text-6xl md:text-8xl font-black text-white tracking-tight drop-shadow-2xl leading-none">
            Ocean<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">Cleanup</span>
          </h1>

          <p className="text-slate-200 text-xl md:text-2xl mt-4 font-light leading-relaxed">
            Steer your eco-boat, collect plastic waste from the sea, and restore marine life.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col gap-4 mt-8">
            <GameButton
              text="START CLEANING"
              icon="⛵"
              onClick={() => onNavigate('GAME')}
            />
            <GameButton
              text="LEADERBOARD"
              icon="🏆"
              variant="secondary"
              onClick={() => onNavigate('LEADERBOARD')}
            />
            <GameButton
              text="HOW TO PLAY"
              icon="🎮"
              variant="ghost"
              onClick={() => onNavigate('HOW_TO_PLAY')}
            />
            <GameButton
              text="SETTINGS"
              icon="⚙️"
              variant="ghost"
              onClick={() => onNavigate('SETTINGS')}
            />
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="relative z-10 p-8 flex justify-between items-end text-sm text-slate-300">
        <div>
          <p className="font-semibold text-cyan-300">Together for a cleaner ocean.</p>
          <p className="text-slate-400 text-xs mt-0.5">Save marine life • Reduce plastic pollution</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          Built with Three.js & React
        </div>
      </div>
    </div>
  );
}

export default MainMenu;
