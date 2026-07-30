import React, { useState, useEffect } from 'react';
import GameButton from '../components/GameButton';

function Leaderboard({ onNavigate }) {
  const [scores, setScores] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('ocean_cleanup_high_scores');
    if (saved) {
      try {
        setScores(JSON.parse(saved));
      } catch (e) {
        setScores([]);
      }
    } else {
      // Default high score board
      const defaultScores = [
        { name: 'EcoCaptain', score: 1450, trash: 29, date: '2026-07-28' },
        { name: 'OceanSaver', score: 1100, trash: 22, date: '2026-07-27' },
        { name: 'CleanSeaHero', score: 850, trash: 17, date: '2026-07-25' },
        { name: 'MarineGuard', score: 600, trash: 12, date: '2026-07-24' },
      ];
      setScores(defaultScores);
      localStorage.setItem('ocean_cleanup_high_scores', JSON.stringify(defaultScores));
    }
  }, []);

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
          <span>🏆</span> Leaderboard
        </h2>
        <p className="text-slate-400 mb-8">Top Ocean Cleaners around the globe</p>

        <div className="w-full bg-slate-900/80 border border-slate-700/60 rounded-3xl p-6 shadow-2xl backdrop-blur-lg">
          <div className="grid grid-cols-12 text-slate-400 font-semibold text-sm uppercase pb-4 border-b border-slate-800 px-4">
            <span className="col-span-2">Rank</span>
            <span className="col-span-5">Cleaner</span>
            <span className="col-span-3 text-center">Trash Picked</span>
            <span className="col-span-2 text-right">Score</span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {scores.map((entry, index) => (
              <div
                key={index}
                className={`grid grid-cols-12 items-center py-4 px-4 rounded-xl transition-all ${
                  index === 0
                    ? 'bg-amber-500/10 text-amber-300 font-bold border border-amber-500/20'
                    : index === 1
                    ? 'bg-slate-300/10 text-slate-200 font-semibold'
                    : index === 2
                    ? 'bg-amber-800/10 text-amber-400 font-medium'
                    : 'text-slate-300'
                }`}
              >
                <span className="col-span-2 flex items-center gap-2">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </span>
                <span className="col-span-5 truncate">{entry.name}</span>
                <span className="col-span-3 text-center">{entry.trash} items</span>
                <span className="col-span-2 text-right font-mono font-bold text-cyan-400">{entry.score} pts</span>
              </div>
            ))}
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

export default Leaderboard;
