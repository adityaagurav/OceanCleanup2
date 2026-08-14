import React from 'react';
import GameButton from '../components/GameButton';
import Icon from '../components/Icon';
import { MissionConfig } from '../config/MissionConfig';

function ratingFor(trashCount) {
  const r = MissionConfig.RATINGS.find(r => trashCount >= r.min) || MissionConfig.RATINGS[2];
  return r;
}

/**
 * MissionSummary.jsx — Shown when the mission goal is met and the player
 * returns to the harbour. Reveals stats that were already being tracked.
 * Replaces the old dead GameOver screen.
 */
function MissionSummary({ score, trashCount, onRestart, onMenu }) {
  const rating = ratingFor(trashCount);

  return (
    <div className="absolute inset-0 z-40 bg-[rgba(4,20,35,0.6)] backdrop-blur-sm flex items-center justify-center p-6">
      <div className="panel-dark anim-pop w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-aqua/15 border border-aqua/40 flex items-center justify-center mb-4">
          <Icon name="check" size={28} className="text-aqua" />
        </div>

        <h2 className="text-3xl md:text-4xl font-extrabold text-foam leading-tight">
          MISSION COMPLETE
        </h2>
        <p className="text-foam/60 mt-2">
          The ocean is a little cleaner — nice work, captain.
        </p>

        <div className="grid grid-cols-2 gap-4 my-7">
          <div className="rounded-2xl bg-white/5 border border-white/10 py-4">
            <div className="chip-label mb-1">Total score</div>
            <div className="chip-value text-4xl text-cyan-soft">{score}</div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 py-4">
            <div className="chip-label mb-1">Trash collected</div>
            <div className="chip-value text-4xl text-aqua">{trashCount}</div>
          </div>
        </div>

        <div className="rounded-2xl bg-cyan-soft/10 border border-cyan-soft/25 py-3 px-4 flex items-center justify-center gap-2.5 mb-2">
          <Icon name={rating.icon} size={18} className="text-cyan-soft" />
          <span className="text-cyan-soft font-semibold">
            ECO RATING: {rating.label}
          </span>
        </div>

        <div className="flex flex-col gap-3 mt-7">
          <GameButton text="PLAY AGAIN" icon="refresh" onClick={onRestart} />
          <GameButton text="MAIN MENU" icon="home" variant="ghost" onClick={onMenu} />
        </div>
      </div>
    </div>
  );
}

export default MissionSummary;
