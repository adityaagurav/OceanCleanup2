import React, { useState, useEffect, useRef } from 'react';
import MainMenu    from './ui/MainMenu';
import Leaderboard from './ui/Leaderboard';
import Settings    from './ui/Settings';
import HowToPlay   from './ui/HowToPlay';
import HUD         from './ui/HUD';
import GameOver    from './ui/GameOver';
import { DebugOverlay } from './ui/DebugOverlay';
import { Engine }  from './engine/Engine.js';
import { soundFx } from './audio/AudioManager';

function App() {
  const [scene, setScene]           = useState('MENU');
  const [soundMuted, setSoundMuted] = useState(false);
  const [settings, setSettings]     = useState({ timeLimit: 120, trashDensity: 'normal' });

  const [score,       setScore]       = useState(0);
  const [trashCount,  setTrashCount]  = useState(0);
  const [timeLeft,    setTimeLeft]    = useState(120);
  const [boatSpeed,   setBoatSpeed]   = useState(0);
  const [pickupToast, setPickupToast] = useState(false);
  const [nearTrash,   setNearTrash]   = useState(false);
  const [isPaused,    setIsPaused]    = useState(false);
  const [missionState, setMissionState] = useState('harbour');
  const [isNearBoat, setIsNearBoat] = useState(false);

  const containerRef  = useRef(null);
  const engineRef     = useRef(null);
  const toastTimerRef = useRef(null);
  const missionToastTimerRef = useRef(null);

  const handleToggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    soundFx.setMuted(next);
  };

  // ── Start / stop Engine ──────────────────────────────────────────
  useEffect(() => {
    if (scene === 'GAME' && containerRef.current) {
      setScore(0);
      setTrashCount(0);
      setTimeLeft(settings.timeLimit);
      setBoatSpeed(0);
      setIsPaused(false);
      setNearTrash(false);
      setIsNearBoat(false);
      setMissionState('harbour');

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
          onNearTrash: (isNear) => setNearTrash(isNear),
          onTick:      (speed)  => setBoatSpeed(speed),
          onMissionState: (state) => {
            setMissionState(state);
            if (state === 'started') {
              if (missionToastTimerRef.current) clearTimeout(missionToastTimerRef.current);
              missionToastTimerRef.current = setTimeout(() => setMissionState('active'), 5000);
            }
          },
          onMissionComplete: () => setScene('GAMEOVER'),
          onNearBoat: (isNear) => setIsNearBoat(isNear),
        },
        settings
      );

      engineRef.current = engine;
      return () => {
        if (missionToastTimerRef.current) clearTimeout(missionToastTimerRef.current);
        engine.destroy();
        engineRef.current = null;
      };
    }
  }, [scene, settings]);

  // ── Pause / resume Engine ────────────────────────────────────────
  useEffect(() => {
    if (!engineRef.current) return;
    if (isPaused) engineRef.current.pause();
    else          engineRef.current.resume();
  }, [isPaused]);

  // ── Game timer ───────────────────────────────────────────────────
   useEffect(() => {
     let timer = null;
     if (scene === 'GAME' && !isPaused) {
       timer = setInterval(() => {
         // Only decrement time if mission is active
         if (engineRef.current?.missionActive) {
           setTimeLeft(prev => {
            if (prev <= 1) { clearInterval(timer); engineRef.current?.completeMission(); return 0; }
             return prev - 1;
           });
         }
       }, 1000);
     }
     return () => { if (timer) clearInterval(timer); };
   }, [scene, isPaused]);

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
             timeLeft={timeLeft}
             boatSpeed={boatSpeed}
             pickupToast={pickupToast}
             nearTrash={nearTrash}
             missionActive={engineRef.current ? engineRef.current.missionActive : false}
             isNearBoat={isNearBoat}
             missionState={missionState}
             onPause={() => setIsPaused(true)}
             onQuit={() => setIsPaused(true)}
           />

          {isPaused && (
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
