import React, { useState, useEffect, useRef } from 'react';
import MainMenu    from './ui/MainMenu';
import Leaderboard from './ui/Leaderboard';
import Settings    from './ui/Settings';
import HowToPlay   from './ui/HowToPlay';
import HUD         from './ui/HUD';
import GameOver    from './ui/GameOver';
import Pokedex     from './ui/Pokedex';
import BuildingUI  from './ui/BuildingUI';
import { DebugOverlay } from './ui/DebugOverlay';
import { Engine }  from './engine/Engine.js';
import { soundFx } from './audio/AudioManager';

const getInitialSave = () => {
  // Save system disabled per user request: reset to 0 on refresh
  return {};
};

function App() {
  const initSave = getInitialSave();

  const [scene, setScene]           = useState('MENU');
  const [soundMuted, setSoundMuted] = useState(false);
  const [settings, setSettings]     = useState({ timeLimit: 120, trashDensity: 'normal' });

  const [score,       setScore]       = useState(initSave.score || 0);
  const [trashCount,  setTrashCount]  = useState(initSave.trashCount || 0);
  const [fishCount,   setFishCount]   = useState(initSave.fishCount || 0);
  const [gold,        setGold]        = useState(initSave.gold || 0); 
  const [energy,      setEnergy]      = useState(initSave.energy !== undefined ? initSave.energy : 100);
  const [boatLevel,   setBoatLevel]   = useState(initSave.boatLevel || 1);
  const [boatSpeed,   setBoatSpeed]   = useState(0);
  const [gameTime,    setGameTime]    = useState({ timeOfDay: 8, day: 1 });
  const [pickupToast, setPickupToast] = useState(false);
  const [nearTrash,   setNearTrash]   = useState(false);
  const [nearBoat,    setNearBoat]    = useState(false);
  const [nearTreasure, setNearTreasure] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState('CHARACTER');
  const [isPaused,    setIsPaused]    = useState(false);
  const [playerPos,   setPlayerPos]   = useState(null);
  const [playerYaw,   setPlayerYaw]   = useState(0);
  const [caughtCreatures, setCaughtCreatures] = useState([]);
  const [activeCompanion, setActiveCompanion] = useState(null);
  const [showPokedex, setShowPokedex] = useState(false);
  const [activeBuilding, setActiveBuilding] = useState(null); // 'HOUSE' | 'PLANT' | null

  const containerRef  = useRef(null);
  const engineRef     = useRef(null);
  const toastTimerRef = useRef(null);

  const handleToggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    soundFx.setMuted(next);
  };

  // ── Start / stop Engine ──────────────────────────────────────────
  useEffect(() => {
    if (scene === 'GAME' && containerRef.current) {
      
      const savedData = { score, trashCount, fishCount, gold, energy, boatLevel, playerPos, playerYaw };
      
      setIsPaused(false);
      setNearTrash(false);

      const engine = new Engine(
        containerRef.current,
        {
          onCollect: (newScore, newCount) => {
            setScore(newScore);
            setTrashCount(newCount);
            soundFx.playCollectSound();
            setPickupToast(true);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setPickupToast(false), 1200);
          },
          onFishCollect: (newCount) => {
            setFishCount(newCount);
            soundFx.playCollectSound();
            setPickupToast(true);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setPickupToast(false), 1200);
          },
          onNearTrash: (isNear) => setNearTrash(isNear),
          onNearBoat:  (isNear) => setNearBoat(isNear),
          onNearTreasure: (isNear) => setNearTreasure(isNear),
          onVehicleChange: (v)  => setActiveVehicle(v),
          onCollectTreasure: (amount) => {
            setGold(prev => prev + amount);
            setPickupToast(`+${amount} Gold!`);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setPickupToast(false), 2000);
          },
          onCatch: (config) => {
            setCaughtCreatures(prev => [...prev, config]);
            setPickupToast(`Caught a wild ${config.type.toUpperCase()}!`);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setPickupToast(false), 2000);
          },
          onBoatUpgrade: (config) => {
            setBoatLevel(config.level);
            setPickupToast(`Boat Upgraded to Level ${config.level}: ${config.name}!`);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setPickupToast(false), 4000);
          },
          onTick:      (data)  => {
            setBoatSpeed(data.speed);
            setGameTime({ timeOfDay: data.timeOfDay, day: data.day });
            setPlayerPos(data.playerPos);
            setPlayerYaw(data.playerYaw);
            
            // Energy drain: 1 energy every in-game minute roughly, but tied to real time tick
            setEnergy(prev => {
              const newEnergy = prev - 0.005; 
              if (newEnergy <= 0) {
                // If energy hits 0, maybe penalize score or force sleep
                // For now, just bottom out at 0
                return 0;
              }
              return newEnergy;
            });
          },
          onInteractHouse: () => {
            setActiveBuilding('HOUSE');
            setIsPaused(true);
          },
          onInteractPlant: () => {
            setActiveBuilding('PLANT');
            setIsPaused(true);
          }
        },
        { ...settings, initialData: savedData }
      );

      // Keep engine ref synced with current companion
      if (activeCompanion) engine.setCompanion(activeCompanion);

      engineRef.current = engine;
      return () => { engine.destroy(); engineRef.current = null; };
    }
  }, [scene, settings]);

  // ── Pause / resume Engine ────────────────────────────────────────
  useEffect(() => {
    if (!engineRef.current) return;
    if (isPaused) engineRef.current.pause();
    else          engineRef.current.resume();
  }, [isPaused]);

  // ── Update Companion ─────────────────────────────────────────────
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setCompanion(activeCompanion);
    }
  }, [activeCompanion]);

  // ── Game timer ───────────────────────────────────────────────────
  // Timer removed per user request

  // ── Save system ──────────────────────────────────────────────────
  useEffect(() => {
    if (scene === 'GAME') {
      const data = { score, trashCount, fishCount, gold, energy, boatLevel, playerPos, playerYaw };
      localStorage.setItem('ocean_save', JSON.stringify(data));
    }
  }, [score, trashCount, fishCount, gold, energy, boatLevel, playerPos, playerYaw, scene]);

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-screen h-screen relative bg-slate-950 overflow-hidden select-none">

      {scene === 'MENU' && (
        <MainMenu
          onNavigate={(t) => setScene(t)}
          soundMuted={soundMuted}
          onToggleSound={handleToggleSound}
        />
      )}

      {scene === 'LEADERBOARD' && <Leaderboard onNavigate={(t) => setScene(t)} />}

      {scene === 'SETTINGS' && (
        <Settings
          onNavigate={(t) => setScene(t)}
          soundMuted={soundMuted}
          onToggleSound={handleToggleSound}
          settings={settings}
          onUpdateSettings={setSettings}
        />
      )}

      {scene === 'HOW_TO_PLAY' && <HowToPlay onNavigate={(t) => setScene(t)} />}

      {scene === 'GAME' && (
        <div className="w-full h-full relative">
          <div ref={containerRef} className="w-full h-full absolute inset-0" />

          <DebugOverlay engineRef={engineRef} />

          <HUD
            score={score}
            trashCount={trashCount}
            fishCount={fishCount}
            money={gold}
            energy={energy}
            boatSpeed={boatSpeed}
            boatLevel={boatLevel}
            gameTime={gameTime}
            pickupToast={pickupToast}
            nearTrash={nearTrash}
            nearBoat={nearBoat}
            nearTreasure={nearTreasure}
            activeVehicle={activeVehicle}
            playerPos={playerPos}
            playerYaw={playerYaw}
            caughtCreatures={caughtCreatures}
            onOpenPokedex={() => setShowPokedex(true)}
            onPause={() => setIsPaused(true)}
            onQuit={() => setIsPaused(true)}
          />

          {showPokedex && (
            <Pokedex 
              caughtCreatures={caughtCreatures} 
              activeCompanion={activeCompanion}
              onSelectCompanion={setActiveCompanion}
              onClose={() => setShowPokedex(false)} 
            />
          )}

          <BuildingUI
            activeBuilding={activeBuilding}
            energy={energy}
            money={gold}
            trashCount={trashCount}
            onClose={() => {
              setActiveBuilding(null);
              setIsPaused(false);
            }}
            onEat={() => {
              if (gold >= 15 && energy < 100) {
                setGold(prev => prev - 15);
                setEnergy(prev => Math.min(100, prev + 50));
                soundFx.playCollectSound(); // Replace with eat sound later
              }
            }}
            onSleep={() => {
              if (energy < 100) {
                setEnergy(100);
                // We'd ideally advance the time in TimeSystem here, but for now we just restore energy
                soundFx.playCollectSound(); // Replace with sleep sound later
                setActiveBuilding(null);
                setIsPaused(false);
              }
            }}
            onRecycle={() => {
              if (trashCount > 0) {
                setGold(prev => prev + trashCount);
                setTrashCount(0);
                soundFx.playCollectSound(); // Replace with cash register sound later
              }
            }}
          />

          {isPaused && !activeBuilding && (
            <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6">
              <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl space-y-6">
                <h2 className="text-3xl font-black text-white">GAME PAUSED</h2>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setIsPaused(false)}
                    className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl transition-all cursor-pointer"
                  >
                    RESUME CLEANING ⛵
                  </button>
                  <button
                    onClick={() => { setIsPaused(false); setScene('MENU'); }}
                    className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all cursor-pointer border border-slate-700"
                  >
                    QUIT TO MENU 🏠
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {scene === 'GAMEOVER' && (
        <GameOver
          score={score}
          trashCount={trashCount}
          onRestart={() => setScene('GAME')}
          onMenu={() => setScene('MENU')}
        />
      )}
    </div>
  );
}

export default App;
