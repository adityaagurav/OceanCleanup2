import React, { useState, useEffect, useRef } from 'react';
import MainMenu      from './ui/MainMenu';
import Settings      from './ui/Settings';
import HowToPlay     from './ui/HowToPlay';
import Credits       from './ui/Credits';
import HUD           from './ui/HUD';
import { AdminPanel } from './ui/AdminPanel';
import { ReportPlayerModal } from './ui/ReportPlayerModal';
import { WarningModal } from './ui/WarningModal';
import { KickedModal } from './ui/KickedModal';
import { DebugOverlay } from './ui/DebugOverlay';
import { Engine }    from './engine/Engine.js';
import { soundFx }   from './audio/AudioManager';
import { PerformanceConfig } from './config/PerformanceConfig.js';
import { ProgressionConfig } from './config/ProgressionConfig.js';
import { WeeklyQuestsClass } from './config/WeeklyQuests.js';
import { oceanFactsManager } from './data/oceanFacts.js';
import { networkManager } from './multiplayer/NetworkManager.js';

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
  const upgradeClickLockRef = useRef(false);
  const [boatSpeed,    setBoatSpeed]    = useState(0);
  const [pickupToast,  setPickupToast]  = useState(false);
  const [nearTrash,    setNearTrash]    = useState(false);
  const [isPaused,     setIsPaused]     = useState(false);
  const [gameMode,     setGameMode]     = useState('harbor'); // 'harbor' | 'boat'
  const [isNearBoat,   setIsNearBoat]   = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false); // only open when near boat & toggled with E
  const [isDocked,     setIsDocked]     = useState(false);
  const [nearUnloadZone, setNearUnloadZone] = useState(false); // boat in the recycling zone
  const [isUnloading, setIsUnloading]     = useState(false);   // unload animation in flight
  const [upgradeMessage, setUpgradeMessage] = useState(null);
  const upgradeMessageTimerRef = useRef(null);
  // Coin reward popup: { amount, key } — rendered by the HUD near the counter.
  const [coinPopup, setCoinPopup] = useState(null);
  const coinPopupTimerRef = useRef(null);

  // ── Fishing Feature ───────────────────────────────────────────
  const [fishingData, setFishingData] = useState({
    spot: null,         // 'left' | 'right' | null
    state: 'idle',      // 'idle' | 'casting' | 'fishing' | 'fish_ready' | 'reeling' | 'caught'
    castProgress: 0,    // 0..1 hold-F progress
    reelProgress: 0,    // 0..1 hold-R progress
    fishTimer: 20,      // seconds until next fish (counts down from 20)
    fishReady: false,   // true when fish is on the line
    fishCount: 0,       // total fish caught this session
    pendingCatches: 0,  // catches waiting to be retrieved
    fishAlert: null,    // popup alert packet: { text, key, count }
  });

  // ── Multiplayer Network State (Phase 1) ───────────────────────
  const [networkState, setNetworkState] = useState(() => networkManager.state);
  useEffect(() => {
    const unsubscribe = networkManager.subscribe((state) => {
      setNetworkState(state);
    });
    // Connect to multiplayer server
    networkManager.connect();
    return () => {
      unsubscribe();
    };
  }, []);
  const handleReconnectMultiplayer = () => {
    networkManager.connect(true);
  };

  // ── Admin & Moderation System State ────────────────────────────
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [adminWarning, setAdminWarning] = useState(null); // { message, adminUsername, timestamp }
  const [kickedNotice, setKickedNotice] = useState(null); // { reason, adminUsername, timestamp }

  useEffect(() => {
    const unsubWarning = networkManager.on('playerWarning', (payload) => {
      soundFx?.playAlert?.();
      if (typeof document !== 'undefined' && document.exitPointerLock) {
        document.exitPointerLock();
      }
      setAdminWarning(payload);
    });
    const unsubKicked = networkManager.on('playerKicked', (payload) => {
      if (typeof document !== 'undefined' && document.exitPointerLock) {
        document.exitPointerLock();
      }
      setKickedNotice(payload);
    });
    return () => {
      unsubWarning();
      unsubKicked();
    };
  }, []);

  const handleOpenAdminPanel = () => {
    if (typeof document !== 'undefined' && document.exitPointerLock) {
      document.exitPointerLock();
    }
    setIsAdminPanelOpen(true);
  };

  const handleOpenReportModal = () => {
    if (typeof document !== 'undefined' && document.exitPointerLock) {
      document.exitPointerLock();
    }
    setIsReportModalOpen(true);
  };

  // Sync coins with server for admin monitoring
  useEffect(() => {
    if (networkState.hasJoined && typeof progression.coins === 'number') {
      networkManager.syncCoins(progression.coins);
    }
  }, [progression.coins, networkState.hasJoined]);

  // ── Ocean Education Facts System ──────────────────────────────
  const [gameplayFact, setGameplayFact] = useState(null);
  const [harborFact,   setHarborFact]   = useState(() => oceanFactsManager.getHarborFact());
  const [recycleFact,  setRecycleFact]  = useState(null);
  const gameplayFactTimerRef = useRef(null);

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
    setUpgradeMessage(null);
    upgradeClickLockRef.current = false;
    setIsPaused(false); setNearTrash(false);
    setIsNearBoat(false); setIsDocked(false);
    setIsUpgradeOpen(false);
    setNearUnloadZone(false);
    setIsUnloading(false);
    setGameplayFact(null);
    setRecycleFact(null);
    setFishingData({ spot: null, state: 'idle', castProgress: 0, reelProgress: 0, fishTimer: 20, fishReady: false, fishCount: 0, pendingCatches: 0, fishAlert: null });
    setHarborFact(oceanFactsManager.getHarborFact());
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
        onPickupBlocked: (message) => {
          setUpgradeMessage({ text: message, tone: 'warning', key: Date.now() });
          if (upgradeMessageTimerRef.current) clearTimeout(upgradeMessageTimerRef.current);
          upgradeMessageTimerRef.current = setTimeout(() => setUpgradeMessage(null), 2200);
        },
        onBoatUpgrade: ({ level }) => {
          setProgression(p => ({ ...p, boatLevel: level }));
        },
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
        onGameMode: (mode) => {
          setGameMode(mode);
          if (mode === 'boat') setIsUpgradeOpen(false);
        },
        onNearBoat: (isNear) => {
          setIsNearBoat(isNear);
          if (!isNear) setIsUpgradeOpen(false); // auto-close when moving away from boat
        },
        onToggleUpgrade: () => setIsUpgradeOpen(v => !v),
        onCloseUpgrade: () => setIsUpgradeOpen(false),
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

          // Ocean Education Facts System: Display a relevant pollution or recycling fact!
          if (amount > 0) {
            const relevantFact = oceanFactsManager.getRecyclingFact();
            if (relevantFact) {
              setRecycleFact({ fact: relevantFact, amount, reward, key: Date.now() });
            }
          }
        },
        // Day/night: HUD flips to the deep-navy glass variant at night.
        onNightChange: (night) => setIsNight(night),
        // Compass: throttled heading/harbour updates for the top-centre rose.
        onCompass: (data) => setCompass(data),
        // ── Fishing Feature callbacks ───────────────────────────────
        onNearFishingSpot: (spot) => setFishingData(d => ({ ...d, spot })),
        onFishingStateChange: (state) => setFishingData(d => ({ ...d, state, ...(state !== 'idle' ? { castProgress: 0 } : {}) })),
        onFishingCastProgress: (p) => setFishingData(d => ({ ...d, castProgress: p })),
        onFishingReelProgress: (p) => setFishingData(d => ({ ...d, reelProgress: p })),
        onFishingFishTimer: (t) => setFishingData(d => ({ ...d, fishTimer: t })),
        onFishingFishReady: (r) => setFishingData(d => ({ ...d, fishReady: r })),
        onFishingPendingCatches: (c) => setFishingData(d => ({ ...d, pendingCatches: c })),
        onFishingAlert: (alert) => setFishingData(d => ({ ...d, fishAlert: alert })),
        onFishCaught: ({ count, points }) => {
          setFishingData(d => ({ ...d, fishCount: count }));
          // Award fishing coins (3 per fish — less than recycling's 5)
          setProgression(p => {
            const coins = p.coins + points;
            ProgressionConfig.saveCoins(coins);
            return { ...p, coins };
          });
          setCoinPopup({ amount: points, key: Date.now() });
          if (coinPopupTimerRef.current) clearTimeout(coinPopupTimerRef.current);
          coinPopupTimerRef.current = setTimeout(() => setCoinPopup(null), 1100);
        },
      },
      { trashDensity: settings.trashDensity, quality: settings.quality }
    );

    engineRef.current = engine;
    window.game = engine;

    // ── Phase 2: Wire Multiplayer Remote Boats to Engine ─────────
    if (networkManager.state.localPlayer) {
      engine.setLocalMultiplayerPlayer(networkManager.state.localPlayer);
    }
    if (networkManager.state.players.length > 0) {
      engine.syncRemotePlayers(networkManager.state.players, networkManager.state.playerId);
    }
    // Physical harbor leaderboard: apply the latest broadcast (if any) so a
    // late-joining client that already received rankings still shows them.
    if (networkManager.state.leaderboard) {
      engine.setLeaderboard(networkManager.state.leaderboard);
    }

    const unsubJoinSuccess = networkManager.on('joinSuccess', (payload) => {
      if (payload.localPlayer) {
        engine.setLocalMultiplayerPlayer(payload.localPlayer);
      }
      if (payload.existingPlayers) {
        payload.existingPlayers.forEach((p) => engine.spawnRemotePlayer(p));
      }
    });

    const unsubPlayerJoined = networkManager.on('playerJoined', (player) => {
      engine.spawnRemotePlayer(player);
    });

    const unsubPlayerLeft = networkManager.on('playerLeft', (payload) => {
      engine.removeRemotePlayer(payload.playerId);
    });

    const unsubPlayersList = networkManager.on('playersList', (players) => {
      engine.syncRemotePlayers(players, networkManager.state.playerId);
    });

    const unsubPlayerMoved = networkManager.on('playerMoved', (data) => {
      engine.handleRemotePlayerMove(data);
    });

    const unsubPlayerStateChanged = networkManager.on('playerStateChanged', (data) => {
      engine.handleRemotePlayerState(data);
    });

    const unsubBoatCollision = networkManager.on('boatCollision', (data) => {
      engine.handleBoatCollision(data);
    });

    const unsubLeaderboard = networkManager.on('leaderboardUpdate', (data) => {
      engine.setLeaderboard(data);
    });

    return () => {
      unsubJoinSuccess();
      unsubPlayerJoined();
      unsubPlayerLeft();
      unsubPlayersList();
      unsubPlayerMoved();
      unsubPlayerStateChanged();
      unsubBoatCollision();
      unsubLeaderboard();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (coinPopupTimerRef.current) clearTimeout(coinPopupTimerRef.current);
      if (upgradeMessageTimerRef.current) clearTimeout(upgradeMessageTimerRef.current);
      if (questToastTimerRef.current) clearTimeout(questToastTimerRef.current);
      if (gameplayFactTimerRef.current) clearTimeout(gameplayFactTimerRef.current);
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

  /** Purchase one boat tier; only deduct funds after Engine confirms success. */
  // The click lock is a synchronous re-entry guard for rapid double clicks.
  // It MUST be released when the handler finishes in EVERY path — the engine
  // already blocks duplicates on its own (boatLevel advanced + balance check),
  // so a lock left engaged after a successful purchase would silently swallow
  // every later click (e.g. the Level 2 → Level 3 buy never firing).
  const handleUpgradeBoat = () => {
    if (upgradeClickLockRef.current) return;
    const engine = engineRef.current;
    if (!engine || engine.boatLevel !== progression.boatLevel) return;
    upgradeClickLockRef.current = true;
    try {
      const result = engine.tryUpgradeBoat(progression.coins);
      if (!result.ok) {
        const text = result.reason === 'max-level'
          ? 'Boat is already at maximum level'
          : result.reason === 'insufficient-coins'
            ? `Not enough coins · need ${result.cost}`
            : 'Upgrade is unavailable right now';
        setUpgradeMessage({ text, tone: 'warning', key: Date.now() });
        if (upgradeMessageTimerRef.current) clearTimeout(upgradeMessageTimerRef.current);
        upgradeMessageTimerRef.current = setTimeout(() => setUpgradeMessage(null), 2400);
        return;
      }
      setProgression(p => ({ ...p, coins: Math.max(0, p.coins - result.cost), boatLevel: result.level }));
      setUpgradeMessage({ text: `Boat upgraded to Level ${result.level}`, tone: 'success', key: Date.now() });
      if (upgradeMessageTimerRef.current) clearTimeout(upgradeMessageTimerRef.current);
      upgradeMessageTimerRef.current = setTimeout(() => setUpgradeMessage(null), 2400);
    } finally {
      // Release the lock on every path — success, failure and thrown errors —
      // so the next purchase (up to Level 3) can always fire.
      upgradeClickLockRef.current = false;
    }
  };

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

  // ── Ocean Education Facts Handlers & Gameplay Timer ─────────────
  const handleNextHarborFact = () => {
    soundFx.playButtonClick();
    setHarborFact(oceanFactsManager.getHarborFact());
  };

  const handleDismissGameplayFact = () => {
    setGameplayFact(null);
  };

  const handleDismissRecycleFact = () => {
    setRecycleFact(null);
  };

  // ── Boat Upgrade Panel & Boarding Handlers ───────────────────────
  const handleCloseUpgrade = () => {
    setIsUpgradeOpen(false);
  };

  const handleBoardBoat = () => {
    setIsUpgradeOpen(false);
    engineRef.current?.boardBoat();
  };

  /** Stop fishing — called from the HUD stop button. */
  const handleStopFishing = () => {
    engineRef.current?.stopFishing();
  };

  /** Start game with specified guest username, adminCode and join multiplayer */
  const handleStartGame = async (username, adminCode = '') => {
    if (username) {
      const res = await networkManager.joinGame(
        username,
        progression.boatLevel || 1,
        adminCode,
        progression.coins || 0
      );
      if (res && res.success === false) {
        return res;
      }
    }
    navigate('GAME');
    return { success: true };
  };

  const handleReturnToMenuFromKick = () => {
    setKickedNotice(null);
    networkManager.disconnect();
    setTimeout(() => networkManager.connect(), 400);
    navigate('MENU');
  };

  // Automatically join multiplayer when in active game session if not already joined
  useEffect(() => {
    if (scene === 'GAME' && !networkState.hasJoined && networkState.connected) {
      networkManager.joinGame(networkState.username || networkState.tempUsername || '', progression.boatLevel || 1);
    }
  }, [scene, networkState.hasJoined, networkState.connected]);

  // Periodic random fact popups every 60–90 seconds during active gameplay
  useEffect(() => {
    if (scene !== 'GAME' || isPaused) return;

    let timer = null;
    const scheduleNextFact = () => {
      // Random delay between 60,000 and 90,000 ms (60–90s)
      const delay = 60000 + Math.random() * 30000;
      timer = setTimeout(() => {
        const fact = oceanFactsManager.getGameplayFact();
        if (fact) {
          setGameplayFact({ fact, key: Date.now() });
        }
        scheduleNextFact();
      }, delay);
      gameplayFactTimerRef.current = timer;
    };

    scheduleNextFact();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [scene, isPaused, sessionId]);

  // Expose test controls on window for direct verification & debugging
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__oceanFacts = {
      manager: oceanFactsManager,
      triggerGameplayFact: (factId) => {
        const fact = factId ? oceanFactsManager.getFactById(factId) : oceanFactsManager.getGameplayFact();
        if (fact) setGameplayFact({ fact, key: Date.now() });
        return fact;
      },
      triggerRecycleFact: (amount = 3, reward = 30, factId) => {
        const fact = factId ? oceanFactsManager.getFactById(factId) : oceanFactsManager.getRecyclingFact();
        if (fact) setRecycleFact({ fact, amount, reward, key: Date.now() });
        return fact;
      },
      rotateHarborFact: (factId) => {
        const fact = factId ? oceanFactsManager.getFactById(factId) : oceanFactsManager.getHarborFact();
        if (fact) setHarborFact(fact);
        return fact;
      },
      dismissGameplayFact: () => setGameplayFact(null),
      dismissRecycleFact: () => setRecycleFact(null),
      getState: () => ({ gameplayFact, harborFact, recycleFact }),
    };
    return () => {
      delete window.__oceanFacts;
    };
  }, [gameplayFact, harborFact, recycleFact]);

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
          onStartGame={handleStartGame}
          soundMuted={settings.soundMuted}
          onToggleSound={handleToggleSound}
          networkState={networkState}
          onReconnectMultiplayer={handleReconnectMultiplayer}
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
        <div
          className="w-full h-full relative cursor-grab active:cursor-grabbing"
          onClick={() => {
            if (isAdminPanelOpen || isReportModalOpen || adminWarning || kickedNotice || isPaused) return;
            if (typeof window !== 'undefined' && window.focus) window.focus();
            engineRef.current?.camera_ctrl?.requestLock?.();
          }}
        >
          <div ref={containerRef} className="w-full h-full absolute inset-0" />

          <DebugOverlay engineRef={engineRef} />

          <HUD
            progression={progression}
            boatSpeed={boatSpeed}
            upgradeMessage={upgradeMessage}
            onUpgradeBoat={handleUpgradeBoat}
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
            gameplayFact={gameplayFact}
            onDismissGameplayFact={handleDismissGameplayFact}
            harborFact={harborFact}
            onNextHarborFact={handleNextHarborFact}
            recycleFact={recycleFact}
            onDismissRecycleFact={handleDismissRecycleFact}
            isUpgradeOpen={isUpgradeOpen}
            onCloseUpgrade={handleCloseUpgrade}
            onBoardBoat={handleBoardBoat}
            fishingData={fishingData}
            onStopFishing={handleStopFishing}
            networkState={networkState}
            onReconnectMultiplayer={handleReconnectMultiplayer}
            isAdmin={networkState?.isAdmin}
            onOpenAdminPanel={handleOpenAdminPanel}
            onOpenReportModal={handleOpenReportModal}
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

      {/* Admin Console Overlay (Admin only) */}
      <AdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
        localPlayerId={networkState?.playerId}
      />

      {/* Report Player Modal (All players) */}
      <ReportPlayerModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        players={networkState?.players || []}
        localPlayerId={networkState?.playerId}
      />

      {/* In-game warning notification */}
      <WarningModal
        warning={adminWarning}
        onDismiss={() => setAdminWarning(null)}
      />

      {/* Disconnect kick notice */}
      <KickedModal
        kickedNotice={kickedNotice}
        onReturnToMenu={handleReturnToMenuFromKick}
      />

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
