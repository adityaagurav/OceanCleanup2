import React, { useState, useEffect, useRef } from 'react';
import MainMenu      from './ui/MainMenu';
import Settings      from './ui/Settings';
import HowToPlay     from './ui/HowToPlay';
import Credits       from './ui/Credits';
import HUD           from './ui/HUD';
import { DebugOverlay } from './ui/DebugOverlay';
import { Engine }    from './engine/Engine.js';
import { soundFx }   from './audio/AudioManager';
import { PerformanceConfig } from './config/PerformanceConfig.js';
import { ProgressionConfig } from './config/ProgressionConfig.js';
import { WeeklyQuestsClass } from './config/WeeklyQuests.js';

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
  // Progression state is ONE object shaped by ProgressionConfig.createSessionState()
  // (boatTrashCount / deliveredTrashCount / coins / weeklyQuest) — the old
  // mission/score state was removed with the mission system.
  const [progression,  setProgression]  = useState(ProgressionConfig.createSessionState);
  const [boatSpeed,    setBoatSpeed]    = useState(0);
  const [pickupToast,  setPickupToast]  = useState(false);
  const [nearTrash,    setNearTrash]    = useState(false);
  const [isPaused,     setIsPaused]     = useState(false);
  const [gameMode,     setGameMode]     = useState('harbor'); // 'harbor' | 'boat'
  const [isNearBoat,   setIsNearBoat]   = useState(false);
  const [isDocked,     setIsDocked]     = useState(false);
  const [nearUnloadZone, setNearUnloadZone] = useState(false); // boat in the recycling zone
  const [isUnloading, setIsUnloading]     = useState(false);   // unload animation in flight
  // Coin reward popup: { amount, key } — rendered by the HUD near the counter.
  const [coinPopup, setCoinPopup] = useState(null);
  const coinPopupTimerRef = useRef(null);

  // ── Weekly quests (Part 4) ─────────────────────────────────────
  // Central quest authority; the UI renders plain snapshots. Progress is
  // applied ONLY from gameplay events below — zero per-frame cost.
  const [questSystem] = useState(() => new WeeklyQuestsClass());
  const [weeklyQuests, setWeeklyQuests] = useState(() => null); // snapshot for the panel
  const [questToast, setQuestToast] = useState(null); // { text, key } on claim
  const questToastTimerRef = useRef(null);
  const refreshQuests = () => setWeeklyQuests(questSystem.getSnapshot());
  useEffect(() => { refreshQuests(); /* initial snapshot once mounted */ }, []);
  const [isNight,      setIsNight]      = useState(false);
  // Compass packet from the engine: camera heading + harbour bearing/dist.
  const [compass,      setCompass]      = useState({ heading: 0, harbour: 0, dist: 0 });

  const containerRef   = useRef(null);
  const engineRef      = useRef(null);
  const toastTimerRef  = useRef(null);
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

    setProgression(ProgressionConfig.createSessionState());
    setBoatSpeed(0);
    setIsPaused(false); setNearTrash(false);
    setIsNearBoat(false); setIsDocked(false);
    setNearUnloadZone(false);
    setIsUnloading(false);
    setGameMode('harbor');
    setCompass({ heading: 0, harbour: 0, dist: 0 });

    const engine = new Engine(
      containerRef.current,
      {
        // onCollect(boatTrashCount, worldTrash): collection is tracked aboard
        // only — no goal check, no completion, no reward (unload → coins come
        // in Part 2/3; see ProgressionConfig.js).
        onCollect: (boatTrashCount) => {
          setProgression(p => ({ ...p, boatTrashCount }));
          soundFx.playCollectSound();
          questSystem.addProgress('collect_trash', 1); // weekly quest progress
          refreshQuests();
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
        // Mode handoff only ('harbor' | 'boat') — replaces onMissionState.
        onGameMode: setGameMode,
        onNearBoat: (isNear) => setIsNearBoat(isNear),
        onDockState: (docked) => setIsDocked(docked),
        // Unload-zone proximity + interaction (Part 3).
        onUnloadZone: (near) => setNearUnloadZone(near),
        // Unload action lifecycle — the prompt hides while the animation runs.
        onUnloadingChanged: (active) => setIsUnloading(active),
        // Unload finished (animation done): trash out of inventory, coins in.
        // The engine guarantees exactly one completion per unload action.
        onUnloadComplete: (amount, reward) => {
          // Consistency guard reads the LIVE state inside the functional update
          // (the engine already guarantees amount ≤ inventory; this only keeps
          // React math from ever going negative or paying on an empty haul).
          setProgression(p => {
            const moved = Math.max(0, Math.min(amount, p.boatTrashCount));
            if (moved === 0) return p;
            const coins = p.coins + reward;
            ProgressionConfig.saveCoins(coins); // basic local persistence
            return {
              ...p,
              boatTrashCount: p.boatTrashCount - moved,
              deliveredTrashCount: p.deliveredTrashCount + moved,
              coins,
            };
          });
          // Weekly quest progress from the same event (no duplicate counting):
          questSystem.addProgress('unload_trash', amount);
          questSystem.addProgress('earn_coins', reward);
          refreshQuests();
          // Lightweight +X feedback near the coin counter (~1 s, subtle).
          setCoinPopup({ amount: reward, key: Date.now() });
          if (coinPopupTimerRef.current) clearTimeout(coinPopupTimerRef.current);
          coinPopupTimerRef.current = setTimeout(() => setCoinPopup(null), 1100);
        },
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
      if (coinPopupTimerRef.current) clearTimeout(coinPopupTimerRef.current);
      if (questToastTimerRef.current) clearTimeout(questToastTimerRef.current);
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

  /** Claim a weekly quest reward (once) — coins join the normal balance. */
  const handleClaimQuest = (id) => {
    const reward = questSystem.claim(id);
    if (reward == null) return; // not claimable / already claimed
    setProgression(p => {
      const coins = p.coins + reward;
      ProgressionConfig.saveCoins(coins);
      return { ...p, coins };
    });
    refreshQuests();
    setQuestToast({ text: `+${reward} coins claimed`, key: Date.now() });
    if (questToastTimerRef.current) clearTimeout(questToastTimerRef.current);
    questToastTimerRef.current = setTimeout(() => setQuestToast(null), 2200);
  };

  const inBoat = gameMode === 'boat';

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
            progression={progression}
            boatSpeed={boatSpeed}
            pickupToast={pickupToast}
            nearTrash={nearTrash}
            isNearBoat={isNearBoat}
            isDocked={isDocked}
            nearUnloadZone={nearUnloadZone}
            isUnloading={isUnloading}
            coinPopup={coinPopup}
            weeklyQuests={weeklyQuests}
            hasClaimableQuests={questSystem.hasClaimable()}
            onClaimQuest={handleClaimQuest}
            questToast={questToast}
            gameMode={gameMode}
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
