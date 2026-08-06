import React, { useState, useEffect, useRef } from 'react';
import MainMenu    from './ui/MainMenu';
import Leaderboard from './ui/Leaderboard';
import Settings    from './ui/Settings';
import HowToPlay   from './ui/HowToPlay';
import HUD         from './ui/HUD';
import { DebugOverlay } from './ui/DebugOverlay';
import { Engine }  from './engine/Engine.js';
import { soundFx } from './audio/AudioManager';
import { PerformanceConfig } from './config/PerformanceConfig.js';

function App() {
  const [scene, setScene]           = useState('MENU');
  const [soundMuted, setSoundMuted] = useState(false);
  const [settings, setSettings]     = useState({ trashDensity: 'normal' });

  const [score,       setScore]       = useState(0);
  const [trashCount,  setTrashCount]  = useState(0);
  const [boatSpeed,   setBoatSpeed]   = useState(0);
  const [pickupToast, setPickupToast] = useState(false);
  const [nearTrash,   setNearTrash]   = useState(false);
  const [isPaused,    setIsPaused]    = useState(false);
  const [missionState, setMissionState] = useState('harbour');
  const [isNearBoat, setIsNearBoat] = useState(false);
  const [isDocked, setIsDocked] = useState(false);

  const containerRef  = useRef(null);
  const engineRef     = useRef(null);
  const toastTimerRef = useRef(null);
  const missionToastTimerRef = useRef(null);
  // Last speed string pushed to the HUD — lets us skip React renders when the
  // displayed value hasn't changed (the engine reports speed every frame).
  const lastSpeedRef   = useRef('0.0');
  const speedDecimals  = PerformanceConfig.UI_SPEED_DECIMALS;

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
      setBoatSpeed(0);
      setIsPaused(false);
      setNearTrash(false);
      setIsNearBoat(false);
      setIsDocked(false);
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
          // Perf: only re-render the HUD when the shown knots value changes
          // (the engine pushes speed every frame; ~10 real updates/sec instead
          // of ~60 whole-tree React re-renders/sec).
          onTick: (speed) => {
            const display = speed.toFixed(speedDecimals);
            if (display === lastSpeedRef.current) return;
            lastSpeedRef.current = display;
            setBoatSpeed(speed);
          },
          onMissionState: (state) => {
            setMissionState(state);
            if (state === 'started') {
              if (missionToastTimerRef.current) clearTimeout(missionToastTimerRef.current);
              missionToastTimerRef.current = setTimeout(() => setMissionState('active'), 5000);
            } else if (state === 'harbour') {
              // Mission over (left the boat / returned) — cancel any pending toast timer
              if (missionToastTimerRef.current) clearTimeout(missionToastTimerRef.current);
            }
          },
          onNearBoat: (isNear) => setIsNearBoat(isNear),
          onDockState: (docked) => setIsDocked(docked),
        },
        settings
      );

      engineRef.current = engine;
      window.game = engine;
      return () => {
        if (missionToastTimerRef.current) clearTimeout(missionToastTimerRef.current);
        engine.destroy();
        engineRef.current = null;
        if (window.game === engine) window.game = null;
      };
    }
  }, [scene, settings]);

  // ── Pause / resume Engine ────────────────────────────────────────
  useEffect(() => {
    if (!engineRef.current) return;
    if (isPaused) engineRef.current.pause();
    else          engineRef.current.resume();
  }, [isPaused]);

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
             boatSpeed={boatSpeed}
             pickupToast={pickupToast}
             nearTrash={nearTrash}
             missionActive={engineRef.current ? engineRef.current.missionActive : false}
             isNearBoat={isNearBoat}
             isDocked={isDocked}
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

    </div>
  );
}

export default App;
