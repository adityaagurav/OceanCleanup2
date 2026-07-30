import React from 'react';
import Minimap from './Minimap';
import { BOAT_LEVELS } from '../player/BoatManager.js';

function HUD({ score, trashCount, fishCount, money, energy, boatSpeed, boatLevel = 1, gameTime = { timeOfDay: 8, day: 1 }, pickupToast, nearTrash, nearTreasure, nearBoat, activeVehicle, playerPos, playerYaw, onPause, onQuit, onOpenPokedex }) {

  // Format time
  const hours = Math.floor(gameTime.timeOfDay);
  const minutes = Math.floor((gameTime.timeOfDay - hours) * 60);
  const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  
  // Fake season calculation based on day
  const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const season = seasons[Math.floor((gameTime.day - 1) / 30) % 4];
  const year = Math.floor((gameTime.day - 1) / 120) + 1;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-2 select-none font-sans">
      
      {/* Top Section */}
      <div className="flex justify-between items-start">
        
        {/* Top Left: Controls/Prompts */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full pr-3 pl-1 py-1 shadow-sm border border-white/10 opacity-70 hover:opacity-100 transition-opacity">
            <div className="bg-white/80 text-slate-900 font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-md">W</div>
            <span className="text-white/90 text-[10px] font-medium drop-shadow-md uppercase tracking-wider">Move</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full pr-3 pl-1 py-1 shadow-sm border border-white/10 opacity-70 hover:opacity-100 transition-opacity">
            <div className="bg-white/80 text-slate-900 font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-md">E</div>
            <span className="text-white/90 text-[10px] font-medium drop-shadow-md uppercase tracking-wider">Interact</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full pr-3 pl-1 py-1 shadow-sm border border-white/10 opacity-70 hover:opacity-100 transition-opacity">
            <div className="bg-white/80 text-slate-900 font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-md">F</div>
            <span className="text-white/90 text-[10px] font-medium drop-shadow-md uppercase tracking-wider">Pickup</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full pr-3 pl-1 py-1 shadow-sm border border-white/10 opacity-70 hover:opacity-100 transition-opacity">
            <div className="bg-rose-500/80 text-white font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-md border border-rose-400">C</div>
            <span className="text-white/90 text-[10px] font-medium drop-shadow-md uppercase tracking-wider">Throw Net</span>
          </div>
        </div>

        {/* Top Center: Energy Bar */}
        <div className="absolute left-1/2 -translate-x-1/2 top-4 w-64">
          <div className="flex justify-between text-[10px] font-black uppercase text-white/80 mb-1 px-1 drop-shadow-md">
            <span>Energy</span>
            <span>{Math.floor(energy)}%</span>
          </div>
          <div className="h-3 bg-black/40 backdrop-blur-md rounded-full border border-white/20 p-0.5 shadow-lg overflow-hidden relative">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${energy > 50 ? 'bg-emerald-400' : energy > 20 ? 'bg-amber-400' : 'bg-rose-500 animate-pulse'}`}
              style={{ width: `${Math.max(0, Math.min(100, energy))}%` }}
            />
          </div>
        </div>

        {/* Top Right: Quests */}
        <div className="w-48 bg-black/20 backdrop-blur-md rounded-2xl p-4 shadow-lg border border-white/10 pointer-events-auto opacity-70 hover:opacity-100 transition-opacity">
          <h2 className="text-amber-400 font-bold text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1">
            <span className="text-amber-300">❖</span> Cleanup Initiative
          </h2>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={trashCount > 0} readOnly className="mt-0.5 accent-amber-500 scale-75" />
              <div>
                <div className="text-white/80 font-semibold text-[9px] uppercase">Clean archipelago</div>
                <div className="text-amber-300 text-[10px] font-bold">Trash {trashCount} / 500</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={fishCount > 0} readOnly className="mt-0.5 accent-amber-500 scale-75" />
              <div>
                <div className="text-white/80 font-semibold text-[9px] uppercase">Fish Collection</div>
                <div className="text-amber-300 text-[10px] font-bold">Fish caught: {fishCount}</div>
              </div>
            </div>

            {/* Boat Progression Tracker */}
            {(() => {
              const currentLevel = BOAT_LEVELS[boatLevel - 1] || BOAT_LEVELS[0];
              const nextLevel = BOAT_LEVELS[boatLevel];
              
              if (!nextLevel) {
                return (
                  <div className="flex items-start gap-2 mt-2 pt-2 border-t border-white/10">
                    <div className="text-amber-400">★</div>
                    <div>
                      <div className="text-white/80 font-semibold text-[9px] uppercase">Vessel Maxed</div>
                      <div className="text-emerald-400 text-[10px] font-bold">{currentLevel.name}</div>
                    </div>
                  </div>
                );
              }
              
              const prevNeeded = currentLevel.trashNeeded;
              const nextNeeded = nextLevel.trashNeeded;
              const progress = Math.max(0, trashCount - prevNeeded);
              const target = nextNeeded - prevNeeded;
              
              // Build blocks string (e.g. ■■■□□)
              const numBlocks = 5;
              const filledBlocks = Math.floor((progress / target) * numBlocks);
              let blocksStr = '';
              for(let i=0; i<numBlocks; i++) {
                blocksStr += i < filledBlocks ? '■' : '□';
              }
              
              return (
                <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-white/10">
                  <div className="text-white/80 font-semibold text-[9px] uppercase flex justify-between">
                    <span>Boat Upgrade</span>
                    <span>Lvl {boatLevel} → {boatLevel + 1}</span>
                  </div>
                  <div className="text-amber-300 text-[10px] font-bold font-mono tracking-widest">{blocksStr}</div>
                  <div className="text-white/60 text-[9px]">Collect {Math.max(0, nextNeeded - trashCount)} more trash</div>
                </div>
              );
            })()}
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={score > 0} readOnly className="mt-0.5 accent-amber-500 scale-75" />
              <div>
                <div className="text-white/80 font-semibold text-[9px] uppercase">Earn Reputation</div>
                <div className="text-amber-300 text-[10px] font-bold">Score: {score}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={money > 0} readOnly className="mt-0.5 accent-yellow-400 scale-75" />
              <div>
                <div className="text-white/80 font-semibold text-[9px] uppercase">Available Funds</div>
                <div className="text-emerald-400 text-[10px] font-black">Money: ${money}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Prompts */}
      <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-30">
        {nearTrash && (
           <div className="bg-white/90 backdrop-blur text-slate-900 px-4 py-1.5 rounded-full font-semibold shadow-lg border border-white flex items-center gap-2 transition-transform animate-pulse text-sm">
             <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md text-xs border border-amber-200 font-bold">F</span>
             Pick up Trash
           </div>
        )}
        {nearTreasure && (
           <div className="bg-gradient-to-r from-amber-400 to-yellow-500 backdrop-blur text-white px-4 py-1.5 rounded-full font-semibold shadow-[0_0_10px_rgba(251,191,36,0.5)] border border-white flex items-center gap-2 transition-transform animate-bounce text-sm">
             <span className="bg-white text-amber-700 px-1.5 py-0.5 rounded-md text-xs border border-amber-200 font-black">F</span>
             Open Treasure!
           </div>
        )}
        {nearBoat && activeVehicle === 'CHARACTER' && (
           <div className="bg-white/90 backdrop-blur text-slate-900 px-4 py-1.5 rounded-full font-semibold shadow-lg border border-white flex items-center gap-2 transition-transform animate-bounce text-sm">
             <span className="bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-md text-xs border border-sky-200 font-bold">E</span>
             Board Boat
           </div>
        )}
        {activeVehicle === 'BOAT' && (
           <div className="bg-white/90 backdrop-blur text-slate-900 px-4 py-1.5 rounded-full font-semibold shadow-lg border border-white flex items-center gap-2 transition-transform text-sm">
             <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-md text-xs border border-rose-200 font-bold">E</span>
             Disembark
           </div>
        )}
        {pickupToast && (
          <div className="bg-emerald-500/90 text-white px-4 py-1.5 rounded-full font-semibold shadow-lg mt-2 animate-bounce border border-white text-sm">
            {typeof pickupToast === 'string' ? pickupToast : '+ Trash Collected!'}
          </div>
        )}
      </div>

      {/* Bottom Section */}
      <div className="flex justify-between items-end relative">
        
        {/* Bottom Left: Minimap & Time */}
        <div className="relative pointer-events-auto">
          <Minimap playerPos={playerPos} playerYaw={playerYaw} />
          
          {/* Time & Date display next to minimap */}
          <div className="absolute -bottom-1 -right-20 bg-black/20 backdrop-blur-md rounded-xl py-1 px-3 shadow-lg border border-white/10 min-w-[100px] opacity-70 hover:opacity-100 transition-opacity">
            <div className="flex justify-between items-end border-b border-white/20 pb-0.5 mb-0.5">
              <span className="font-black text-white/90 text-sm">{timeStr}</span>
              <span className="text-amber-300 font-bold text-[9px] leading-5 uppercase">{season}</span>
            </div>
            <div className="flex justify-between items-center text-[9px] font-semibold text-white/70 uppercase">
              <span>Day {gameTime.day}</span>
              <span>Year {year}</span>
            </div>
          </div>
        </div>

        {/* Bottom Right: Pause & Speed */}
        <div className="flex flex-col items-end gap-2 pointer-events-auto opacity-70 hover:opacity-100 transition-opacity">
           {activeVehicle === 'BOAT' && (
             <div className="bg-black/20 backdrop-blur-md rounded-xl px-4 py-2 shadow-lg border border-white/10 flex flex-col items-end">
               <div className="text-white/70 text-[9px] font-bold uppercase tracking-wider">KNOTS</div>
               <div className="text-sky-400 text-xl font-black">{(Math.abs(boatSpeed) * 40).toFixed(1)}</div>
             </div>
           )}
           <div className="flex gap-2">
             <button
               onClick={onOpenPokedex}
               className="bg-rose-500/50 hover:bg-rose-500/80 backdrop-blur-md text-white/90 px-4 py-1.5 rounded-full font-bold shadow-md border border-white/10 transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer text-xs"
             >
               <span>📱</span> OceanDex
             </button>
             <button
               onClick={onPause}
               className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white/90 px-4 py-1.5 rounded-full font-bold shadow-md border border-white/10 transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer text-xs"
             >
               <span>⚙️</span> Options
             </button>
           </div>
        </div>
      </div>
      
    </div>
  );
}

export default HUD;
