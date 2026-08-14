import React from 'react';
import GameButton from '../components/GameButton';
import Icon from '../components/Icon';
import { OceanBackdrop } from '../components/OceanBackdrop';

function KeyRow({ keys, desc, highlight }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-3 py-2.5 rounded-xl ${
        highlight ? 'bg-ocean/10 border border-cyan-soft/25' : ''
      }`}
    >
      <span className="keycap">{keys}</span>
      <span className={highlight ? 'text-cyan-soft font-semibold text-sm' : 'chip-text text-sm'}>
        {desc}
      </span>
    </div>
  );
}

function HowToPlay({ onNavigate }) {
  return (
    <OceanBackdrop>
      <div className="h-full flex flex-col items-center menu-scroll overflow-y-auto px-6 py-8">
        <div className="w-full max-w-3xl my-auto py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-foam flex items-center gap-3">
                <Icon name="book" size={28} className="text-cyan-soft" />
                How to Play
              </h2>
              <p className="text-foam/60 mt-1">Master the boat and reel in the ocean's trash</p>
            </div>
            <GameButton text="Back" icon="arrow-left" variant="ghost" size="auto"
              onClick={() => onNavigate('MENU')} />
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Controls */}
            <div className="panel-dark p-6">
              <h3 className="text-lg font-bold text-cyan-soft mb-4 flex items-center gap-2">
                <Icon name="sliders" size={18} />
                Navigation
              </h3>
              <div className="space-y-2">
                <KeyRow keys="W / ↑" desc="Throttle forward" />
                <KeyRow keys="S / ↓" desc="Reverse / brake" />
                <KeyRow keys="A / D" desc="Steer left / right" />
                <KeyRow keys="MOUSE" desc="Drag to look · click to lock cursor" />
                <KeyRow keys="E" desc="Board / leave the boat" />
              </div>
            </div>

            {/* Fishing */}
            <div className="panel-dark p-6">
              <h3 className="text-lg font-bold text-aqua mb-4 flex items-center gap-2">
                <Icon name="target" size={18} />
                Cleaning the Ocean
              </h3>
              <ul className="space-y-3 chip-text text-sm list-none">
                <li className="flex gap-2.5">
                  <Icon name="check" size={16} className="text-aqua mt-0.5 shrink-0" />
                  <span>Drive close to floating plastic — an <strong className="text-cyan-soft">aqua ring</strong> marks the nearest piece.</span>
                </li>
                <li className="flex gap-2.5">
                  <Icon name="check" size={16} className="text-aqua mt-0.5 shrink-0" />
                  <span>Press <span className="keycap">F</span> to cast a line that reels the trash onto your deck.</span>
                </li>
                <li className="flex gap-2.5">
                  <Icon name="check" size={16} className="text-aqua mt-0.5 shrink-0" />
                  <span>Earn <strong className="text-cyan-soft">+50 points</strong> per item. Collect <strong className="text-cyan-soft">20</strong> to complete the mission.</span>
                </li>
                <li className="flex gap-2.5">
                  <Icon name="check" size={16} className="text-aqua mt-0.5 shrink-0" />
                  <span>Dock back at the pier and press <span className="keycap">E</span> to leave the boat and see your summary.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </OceanBackdrop>
  );
}

export default HowToPlay;
