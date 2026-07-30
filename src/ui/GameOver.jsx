import React, { useEffect } from 'react';
import GameButton from '../components/GameButton';

function GameOver({ score, trashCount, onRestart, onMenu }) {
  useEffect(() => {
    // Save high score to localStorage
    const saved = localStorage.getItem('ocean_cleanup_high_scores');
    let scores = saved ? JSON.parse(saved) : [];
    
    const today = new Date().toISOString().split('T')[0];
    const newEntry = { name: 'Player', score, trash: trashCount, date: today };
    
    scores.push(newEntry);
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 10);
    
    localStorage.setItem('ocean_cleanup_high_scores', JSON.stringify(scores));
  }, [score, trashCount]);

  return (
    <div
      className="w-screen h-screen bg-cover bg-center relative flex flex-col justify-between items-center p-8 select-none overflow-y-auto z-30"
      style={{
        backgroundImage: `url('/background/harbor-background_1.png')`,
      }}
    >
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-lg"></div>

      <div className="relative z-10 max-w-xl w-full flex flex-col items-center my-auto">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-4xl mb-4 animate-bounce">
          🌊
        </div>

        <h2 className="text-4xl md:text-5xl font-black text-white mb-2">
          MISSION COMPLETE!
        </h2>
        <p className="text-slate-300 text-lg mb-8 text-center">
          You made the ocean cleaner and safer for marine life.
        </p>

        <div className="w-full bg-slate-900/90 border border-slate-700/60 rounded-3xl p-8 shadow-2xl backdrop-blur-md space-y-6 mb-8 text-center">
          <div className="grid grid-cols-2 gap-4 divide-x divide-slate-800">
            <div>
              <div className="text-slate-400 text-sm font-semibold uppercase">Total Score</div>
              <div className="text-emerald-400 text-4xl font-black font-mono mt-1">{score}</div>
            </div>
            <div>
              <div className="text-slate-400 text-sm font-semibold uppercase">Trash Collected</div>
              <div className="text-cyan-300 text-4xl font-black font-mono mt-1">{trashCount}</div>
            </div>
          </div>

          <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 text-sm text-slate-300">
            <span className="text-cyan-400 font-bold">ECO RATING: </span>
            {trashCount >= 20 ? '🌟 Ocean Guardian' : trashCount >= 10 ? '⛵ Eco Sailor' : '🌊 Ocean Recruit'}
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full items-center">
          <GameButton
            text="PLAY AGAIN"
            icon="🔄"
            onClick={onRestart}
          />
          <GameButton
            text="MAIN MENU"
            icon="🏠"
            variant="ghost"
            onClick={onMenu}
          />
        </div>
      </div>
    </div>
  );
}

export default GameOver;
