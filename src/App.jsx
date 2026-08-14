import React, { useState, useEffect, useRef } from 'react';
import MainMenu      from './ui/MainMenu';
import Settings      from './ui/Settings';
import HowToPlay     from './ui/HowToPlay';
import Credits       from './ui/Credits';
import HUD           from './ui/HUD';
import MissionSummary from './ui/MissionSummary';
import { DebugOverlay } from './ui/DebugOverlay';
import { Engine }    from './engine/Engine.js';
import { soundFx }   from './audio/AudioManager';
import { PerformanceConfig } from './config/PerformanceConfig.js';
import { MissionConfig }     from './config/MissionConfig.js';

// Screen-transition timing (ms) — shared by the navigate() timers and the
// overlay's inline transition so they can never drift apart.
const NAV_FADE_OUT = 180; // menu fades to dark
const NAV_FADE_IN  = 300; // new screen fades in

const SETTINGS_KEY = 'ocean_cleanup_settings';
const DEFAULT_SETTINGS = {
  trashDensity: 'normal',
  speedUnit: 'kmh',        // 'kmh' | 'kn'
  quality: 'balanced',     // 'low' | 'balanced' | 'high'
  volume: 0.7,
  soundMuted: false,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

function App() {
  const [scene, setScene] = useState('MENU');
  const [settings, setSettings] = useState(loadSettings);
  const [sessionId, setSessionId] = useState(0); // bump to restart the game session

  // Screen transitions: 'out' (fade to dark) → swap scene → 'in' (reveal).
  // Pure CSS opacity on one overlay div — zero JS animation cost.
  const [nav, setNav] = useState(null); // null | 'out' | 'in'
  const navTimerRef = useRef(null);

  // ── In-game state ─────────────────────────────────────────────
  const [score,        setScore]        = useState(0);
  const [trashCount,   setTrashCount]   = useState(0);
  const [boatSpeed,    setBoatSpeed]    = useState(0);
  const [pickupToast,  setPickupToast]  = useState(false);
  const [completeToast,setCompleteToast]= useState(false);
  const [nearTrash,    setNearTrash]    = useState(false);
  const [isPaused,     setIsPaused]     = useState(false);
  const [missionState, setMissionState] = useState('harbour');
  const [hasStartedMission, setHasStartedMission] = useState(false);
  const [missionComplete, setMissionComplete] = useState(false);
  const [summaryShown, setSummaryShown] = useState(false);
  const [isNearBoat,   setIsNearBoat]   = useState(false);
  const [isDocked,     setIsDocked]     = useState(false);
  const [isNight,      setIsNight]      = useState(false);
  // Compass packet from the engine: camera heading + harbour bearing/dist.
  const [compass,      setCompass]      = useState({ heading: 0, harbour: 0, dist: 0 });

  const containerRef   = useRef(null);
  const engineRef      = useRef(null);
  const toastTimerRef  = useRef(null);
  const completeToastTimerRef = useRef(null);
  const missionToastTimerRef = useRef(null);
  const missionCompleteRef = useRef(false);
  const summaryShownRef    = useRef(false);
  // Last speed string pushed to the HUD — skips React renders when the
  // displayed value hasn't changed (the engine reports speed every frame).
  const lastSpeedRef   = useRef('0.0');
  const speedDecimals  = PerformanceConfig.UI_SPEED_DECIMALS;

  // ── Settings persistence + audio wiring ───────────────────────
  const updateSettings = (patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  };
  const handleToggleSound = () => updateSettings({ soundMuted: !settings.soundMuted });
  useEffect(() => {
    soundFx.setMuted(settings.soundMuted);
    soundFx.setVolume(settings.volume);
  }, [settings.soundMuted, settings.volume]);

  /** Smooth navigation — dip to a soft dark, swap screens, fade back in. */
  const navigate = (next) => {
    if (next === scene || nav) return;
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    setNav('out');
    navTimerRef.current = setTimeout(() => {
      setScene(next);
      setNav('in');
      navTimerRef.current = setTimeout(() => setNav(null), NAV_FADE_IN);
    }, NAV_FADE_OUT);
  };

  // ── Start / stop Engine ───────────────────────────────────────
  useEffect(() => {
    if (scene !== 'GAME' || !containerRef.current) return;

    setScore(0); setTrashCount(0); setBoatSpeed(0);
    setIsPaused(false); setNearTrash(false);
    setIsNearBoat(false); setIsDocked(false);
    setMissionState('harbour'); setHasStartedMission(false);
    setMissionComplete(false); setSummaryShown(false);
    setCompass({ heading: 0, harbour: 0, dist: 0 });
    missionCompleteRef.current = false;
    summaryShownRef.current = false;

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

          // Goal reached → mark the mission complete (once per session).
          if (!missionCompleteRef.current && newCount >= MissionConfig.TRASH_GOAL) {
            missionCompleteRef.current = true;
            setMissionComplete(true);
            setCompleteToast(true);
            if (completeToastTimerRef.current) clearTimeout(completeToastTimerRef.current);
            completeToastTimerRef.current = setTimeout(() => setCompleteToast(false), 3500);
          }
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
            setHasStartedMission(true);
            // Brief "mission started" toast — fade to the stable state.
            if (missionToastTimerRef.current) clearTimeout(missionToastTimerRef.current);
            missionToastTimerRef.current = setTimeout(() => setMissionState('active'), 5000);
          } else if (state === 'harbour') {
            // Mission over (left the boat) — reveal the summary once the
            // goal was reached. Shown at most once per session.
            if (missionCompleteRef.current && !summaryShownRef.current) {
              summaryShownRef.current = true;
              setSummaryShown(true);
            }
          }
        },
        onNearBoat: (isNear) => setIsNearBoat(isNear),
        onDockState: (docked) => setIsDocked(docked),
        // Day/night: HUD flips to the deep-navy glass variant at night.
        onNightChange: (night) => setIsNight(night),
        // Compass: throttled heading/harbour updates for the top-centre rose.
        onCompass: (data) => setCompass(data),
      },
      { trashDensity: settings.trashDensity, quality: settings.quality }
    );

    engineRef.current = engine;
    window.game = engine;
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (completeToastTimerRef.current) clearTimeout(completeToastTimerRef.current);
      if (missionToastTimerRef.current) clearTimeout(missionToastTimerRef.current);
      engine.destroy();
      engineRef.current = null;
      if (window.game === engine) window.game = null;
    };
    // NOTE: depend only on the engine-relevant settings fields. Toggling
    // audio (volume/mute) must NOT rebuild the engine mid-game.
  }, [scene, sessionId, settings.trashDensity, settings.quality]);

  // ── Pause / resume Engine ─────────────────────────────────────
  useEffect(() => {
    if (!engineRef.current) return;
    if (isPaused) engineRef.current.pause();
    else          engineRef.current.resume();
  }, [isPaused]);

  const inBoat = missionState !== 'harbour';

  // ──────────────────────────────────────────────────────────────
  return (
    <div className={`w-screen h-screen relative bg-[#04233b] overflow-hidden select-none ${isNight ? 'night' : ''}`}>

      {/* key={scene} remounts the wrapper on navigation so the enter
          animation replays; the old screen is already hidden by the
          overlay at this point. */}
      <div
        key={scene}
        className={`w-full h-full ${nav === 'in' && scene !== 'GAME' ? 'anim-fade-up-lg' : ''}`}
      >

      {scene === 'MENU' && (
        <MainMenu
          onNavigate={navigate}
          soundMuted={settings.soundMuted}
          onToggleSound={handleToggleSound}
        />
      )}

      {scene === 'SETTINGS' && (
        <Settings
          onNavigate={navigate}
          settings={settings}
          onUpdateSettings={updateSettings}
        />
      )}

      {scene === 'HOW_TO_PLAY' && <HowToPlay onNavigate={navigate} />}

      {scene === 'CREDITS' && <Credits onNavigate={navigate} />}

      {scene === 'GAME' && (
        <div className="w-full h-full relative">
          <div ref={containerRef} className="w-full h-full absolute inset-0" />

          <DebugOverlay engineRef={engineRef} />

          <HUD
            score={score}
            trashCount={trashCount}
            boatSpeed={boatSpeed}
            pickupToast={pickupToast}
            completeToast={completeToast}
            nearTrash={nearTrash}
            isNearBoat={isNearBoat}
            isDocked={isDocked}
            missionState={missionState}
            missionComplete={missionComplete}
            hasStartedMission={hasStartedMission}
            inBoat={inBoat}
            soundMuted={settings.soundMuted}
            onToggleSound={handleToggleSound}
            onPause={() => setIsPaused(true)}
            speedUnit={settings.speedUnit}
            sessionId={sessionId}
            compass={compass}
          />

          {isPaused && (
            <div className="absolute inset-0 z-50 bg-[rgba(4,20,35,0.7)] backdrop-blur-sm flex items-center justify-center p-6">
              <div className="panel-dark anim-pop max-w-md w-full p-8 text-center">
                <h2 className="text-2xl md:text-3xl font-extrabold text-foam">GAME PAUSED</h2>
                <p className="text-foam/60 text-sm mt-1.5">The waves can wait.</p>
                <div className="flex flex-col gap-3 mt-6">
                  <button
                    onClick={() => setIsPaused(false)}
                    className="btn-ui focus-ring w-full py-3.5 bg-ocean hover:bg-[#1799dc] text-white font-semibold rounded-2xl border border-white/25 cursor-pointer"
                  >
                    RESUME
                  </button>
                  <button
                    onClick={() => { setIsPaused(false); navigate('MENU'); }}
                    className="btn-ui focus-ring w-full py-3.5 bg-white/5 hover:bg-white/10 text-foam/90 font-semibold rounded-2xl border border-white/15 cursor-pointer"
                  >
                    QUIT TO MENU
                  </button>
                </div>
              </div>
            </div>
          )}

          {summaryShown && (
            <MissionSummary
              score={score}
              trashCount={trashCount}
              onRestart={() => { setSummaryShown(false); setSessionId(s => s + 1); }}
              onMenu={() => { setSummaryShown(false); navigate('MENU'); }}
            />
          )}
        </div>
      )}
      </div>

      {/* Screen-transition overlay — dips to soft dark, then reveals the new
          screen. Single compositor-only opacity transition; pointer-events
          disabled so it never blocks input. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[70] pointer-events-none bg-[rgba(4,20,35,0.94)]"
        style={{
          opacity: nav === 'out' ? 1 : 0,
          transition: `opacity ${nav === 'out' ? NAV_FADE_OUT : NAV_FADE_IN}ms ease-out`,
          visibility: nav ? 'visible' : 'hidden',
        }}
      />
    </div>
  );
}

export default App;
