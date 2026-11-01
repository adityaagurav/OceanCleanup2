import React, { memo, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Speedometer } from '../components/Speedometer';
import { Compass } from '../components/Compass';
import { BoatConfig } from '../config/BoatConfig.js';
import {
  GameplayFactPopup,
  HarborFactCard,
  RecycleFactToast,
} from './OceanFactsUI.jsx';
import { MultiplayerStatusChip } from './MultiplayerStatusChip.jsx';

/* ──────────────────────────────────────────────────────────────
   Small memoized building blocks — a pickup or speed change only
   re-renders its own chip, never the whole HUD.

   Note: the old mission/objective UI was removed with the mission
   system. The HUD shows only real state: collected-aboard count,
   speed, compass, prompts. No goals, no score, no completions.
   ────────────────────────────────────────────────────────────── */

const IconButton = memo(function IconButton({ name, onClick, label, active }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="btn-ui focus-ring w-10 h-10 rounded-xl hud-chip flex items-center justify-center cursor-pointer pointer-events-auto"
    >
      <Icon name={name} size={18} className={active ? 'text-cyan-soft' : 'chip-text'} />
    </button>
  );
});

/** One-shot toast (pickup). Flows with the top-center stack. */
const Toast = memo(function Toast({ icon, tone, children }) {
  return (
    <div className="anim-toast hud-chip-strong px-4 py-2 flex items-center gap-2 whitespace-nowrap">
      <Icon name={icon} size={16} className={tone === 'aqua' ? 'text-aqua' : 'text-sand'} />
      <span className="chip-text text-sm font-semibold">{children}</span>
    </div>
  );
});

/** Trash aboard + coins — bottom left. Trash always visible; coins persist. */
const StatsChip = memo(function StatsChip({ boatTrashCount, coins, coinPopup, fishCount = 0 }) {
  return (
    <div className="hud-chip px-4 py-2.5 flex items-center gap-4 relative">
      <div className="flex items-center gap-2">
        <Icon name="trash" size={16} className="text-aqua" />
        <span key={boatTrashCount} className="chip-value text-xl anim-counter">
          {boatTrashCount}
        </span>
      </div>
      {fishCount > 0 && (
        <>
          <div className="w-px h-5" style={{ background: 'var(--divider)' }} />
          <div className="flex items-center gap-1.5" title={`${fishCount} fish caught in bucket`}>
            <span className="text-base leading-none">🪣</span>
            <span key={fishCount} className="chip-value text-xl anim-counter text-cyan-soft">
              {fishCount}
            </span>
          </div>
        </>
      )}
      <div className="w-px h-5" style={{ background: 'var(--divider)' }} />
      <div className="flex items-center gap-2 relative">
        <Icon name="coin" size={16} className="text-sand" />
        <span key={coins} className="chip-value text-xl anim-counter">
          {coins}
        </span>
        {/* +X coin feedback — rises and fades near the counter (≈1 s). */}
        {coinPopup && (
          <span key={coinPopup.key} className="coin-pop absolute -top-1 left-full ml-1 text-sand font-extrabold text-lg">
            +{coinPopup.amount}
          </span>
        )}
      </div>
    </div>
  );
});

/** One weekly quest row: label, clamped progress bar, reward, claim state. */
const QuestRow = memo(function QuestRow({ quest, onClaim }) {
  const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100));
  const done = quest.completed;
  return (
    <div className="px-3 py-2.5 rounded-xl bg-white/5 border border-cyan-soft/10">
      <div className="flex items-center justify-between gap-2">
        <span className="chip-text text-sm font-semibold">{quest.label}</span>
        <span className="chip-sub text-xs font-bold whitespace-nowrap">
          {quest.progress} / {quest.target}
        </span>
      </div>
      <div className="progress-track h-1 w-full rounded-full overflow-hidden mt-2">
        <div
          className={`h-full rounded-full ${done ? 'bg-aqua' : 'bg-gradient-to-r from-aqua to-cyan-soft'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="flex items-center gap-1 chip-sub text-xs font-semibold">
          <Icon name="coin" size={12} className="text-sand" /> {quest.reward}
        </span>
        {done && !quest.claimed ? (
          <button
            onClick={() => onClaim(quest.id)}
            className="btn-ui focus-ring px-3 py-1 rounded-lg bg-ocean hover:bg-[#1799dc] text-white text-xs font-extrabold tracking-wide border border-white/25 cursor-pointer"
          >
            CLAIM
          </button>
        ) : (
          <span className={`text-xs font-bold tracking-wide ${quest.claimed ? 'text-aqua' : 'chip-sub'}`}>
            {quest.claimed ? 'CLAIMED' : 'IN PROGRESS'}
          </span>
        )}
      </div>
    </div>
  );
});

/** Slide-in weekly quest panel — compact, right side, never covers gameplay. */
function QuestPanel({ quests, onClaim, onClose }) {
  return (
    <div className="anim-fade-up panel-dark p-4 w-[19rem] max-w-[86vw] pointer-events-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="chip-label text-[0.7rem]!">Weekly quests</h3>
        <button
          onClick={onClose}
          aria-label="Close weekly quests"
          className="btn-ui focus-ring w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 chip-text flex items-center justify-center cursor-pointer text-sm"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {quests.map(q => <QuestRow key={q.id} quest={q} onClaim={onClaim} />)}
      </div>
      <p className="chip-sub text-[0.66rem] mt-2.5 text-center">Resets Monday · progress saves automatically</p>
    </div>
  );
}

/** [KEY] ACTION interaction prompt — fades in/out, never permanent. */
const InteractionPrompt = memo(function InteractionPrompt({ action, children, tone = 'aqua' }) {
  return (
    <div className="anim-fade-up hud-chip px-4 py-2.5 flex items-center gap-2.5">
      <span className="keycap">{action}</span>
      <span className="chip-text text-sm font-semibold tracking-wide">{children}</span>
    </div>
  );
});

/** Boat control hints — teach once, then vanish. Reopen via "?". */
const HintsChip = memo(function HintsChip({ inBoat }) {
  return (
    <div className="anim-fade-up hud-chip px-4 py-2 flex items-center gap-3 flex-wrap justify-center max-w-[92vw]">
      {inBoat ? (
        <>
          <span className="flex items-center gap-1.5"><span className="keycap">WASD</span><span className="chip-text text-xs font-medium">Drive</span></span>
          <span className="w-px h-4" style={{ background: 'var(--divider)' }} />
          <span className="flex items-center gap-1.5"><span className="keycap">MOUSE</span><span className="chip-text text-xs font-medium">Look</span></span>
          <span className="w-px h-4" style={{ background: 'var(--divider)' }} />
          <span className="flex items-center gap-1.5"><span className="keycap">F</span><span className="chip-text text-xs font-medium">Reel trash</span></span>
          <span className="w-px h-4" style={{ background: 'var(--divider)' }} />
          <span className="flex items-center gap-1.5"><span className="keycap">E</span><span className="chip-text text-xs font-medium">Dock</span></span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5"><span className="keycap">WASD</span><span className="chip-text text-xs font-medium">Walk</span></span>
          <span className="w-px h-4" style={{ background: 'var(--divider)' }} />
          <span className="flex items-center gap-1.5"><span className="keycap">MOUSE</span><span className="chip-text text-xs font-medium">Look</span></span>
          <span className="w-px h-4" style={{ background: 'var(--divider)' }} />
          <span className="flex items-center gap-1.5"><span className="keycap">E</span><span className="chip-text text-xs font-medium">Board boat</span></span>
        </>
      )}
    </div>
  );
});

/** Hold-key circular progress indicator — small, non-intrusive. */
const HoldProgress = memo(function HoldProgress({ progress, label, keyLabel, color = 'aqua' }) {
  const pct = Math.round(progress * 100);
  const colorClass = color === 'sand' ? 'text-sand' : 'text-aqua';
  return (
    <div className="anim-fade-up hud-chip px-4 py-2.5 flex items-center gap-3">
      <span className="keycap">{keyLabel}</span>
      <div className="flex items-center gap-2.5 flex-1">
        <span className="chip-text text-sm font-semibold">{label}</span>
        <div className="progress-track h-1.5 w-20 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${color === 'sand' ? 'bg-sand' : 'bg-gradient-to-r from-aqua to-cyan-soft'}`}
            style={{ width: `${pct}%`, transition: 'width 0.08s linear' }}
          />
        </div>
        <span className={`${colorClass} text-xs font-bold`}>{pct}%</span>
      </div>
    </div>
  );
});

/** Active fishing status card — shows state, countdown, reel progress. */
const FishingCard = memo(function FishingCard({ fishingData, onStopFishing }) {
  const { state, fishTimer, reelProgress, fishReady, fishCount, spot, pendingCatches = 0 } = fishingData;
  const timerSec = Math.ceil(fishTimer);
  const timerPct = Math.round((1 - fishTimer / 20) * 100);
  const spotLabel = spot === 'left' ? 'LEFT END' : 'RIGHT END';

  return (
    <div className="anim-fade-up panel-dark p-3.5 w-[min(18rem,calc(100vw-2rem))] pointer-events-auto">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="chip-value text-sm font-extrabold flex items-center gap-1.5">
          <span>🎣</span> FISHING · {spotLabel}
        </h3>
        <button
          onClick={onStopFishing}
          aria-label="Stop fishing"
          title="Stop fishing (F / Esc)"
          className="btn-ui focus-ring px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 chip-text text-xs font-bold cursor-pointer"
        >
          ✕ Stop
        </button>
      </div>

      {/* Fish ready / reeling / pending catches */}
      {(state === 'fish_ready' || state === 'reeling' || pendingCatches > 0) ? (
        <div className="mb-2">
          <p className="text-sand text-xs font-bold mb-1 animate-pulse">
            🐟 Fish caught! Hold R to retrieve your fish!
          </p>
          {pendingCatches > 1 && (
            <p className="text-aqua text-[0.7rem] font-bold mb-1">
              {pendingCatches} fish available to retrieve!
            </p>
          )}
          <div className="progress-track h-2 w-full rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-sand"
              style={{ width: `${Math.round(reelProgress * 100)}%`, transition: 'width 0.08s linear' }}
            />
          </div>
          <p className="chip-sub text-[0.66rem] mt-1">{Math.round(reelProgress * 100)}% — keep holding R</p>
        </div>
      ) : (
        <p className="chip-text text-xs font-medium mb-1.5">Waiting for next bite...</p>
      )}

      {/* Independent 20-second repeating cycle progress */}
      <div className="pt-2 border-t border-white/10">
        <div className="flex items-center justify-between text-[0.68rem] chip-sub mb-1">
          <span>Next catch in:</span>
          <span className="font-bold text-white">~{timerSec}s</span>
        </div>
        <div className="progress-track h-1.5 w-full rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-aqua to-cyan-soft"
            style={{ width: `${timerPct}%`, transition: 'width 0.5s linear' }}
          />
        </div>
      </div>

      {/* Bucket status */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🪣</span>
          <span className="chip-value text-sm font-extrabold">{fishCount} caught</span>
        </div>
        <span className="chip-sub text-xs">+{fishCount * 3} coins</span>
      </div>
    </div>
  );
});

/* ──────────────────────────────────────────────────────────────
   HUD
   ────────────────────────────────────────────────────────────── */

function HUD({
  progression,    // { boatTrashCount, deliveredTrashCount, coins, boatLevel, weeklyQuest }
  boatSpeed,      // knots, throttled by the engine (only pushed on change)
  upgradeMessage,
  onUpgradeBoat,
  pickupToast,
  nearTrash,
  isNearBoat,
  isDocked,
  nearUnloadZone, // boat inside the recycling-zone interaction radius
  isUnloading,    // unload animation in flight — suppresses the E prompt
  coinPopup,      // { amount, key } | null — +X coin feedback after unloading
  weeklyQuests,   // { weekId, quests[] } — plain snapshot from the quest system
  hasClaimableQuests, // true when a completed quest awaits its CLAIM
  onClaimQuest,   // (id) => void — claim handler in App
  questToast,     // { text, key } | null — claim feedback toast
  gameMode,       // 'harbor' | 'boat' — mode handoff from the engine
  inBoat,         // true while controlling the boat
  soundMuted,
  onToggleSound,
  onPause,
  speedUnit,
  sessionId,
  compass,        // { heading, harbour, dist } — throttled by the engine
  gameplayFact,
  onDismissGameplayFact,
  harborFact,
  onNextHarborFact,
  recycleFact,
  onDismissRecycleFact,
  isUpgradeOpen,
  onCloseUpgrade,
  onBoardBoat,
  fishingData,
  onStopFishing,
  networkState,
  onReconnectMultiplayer,
}) {
  // Boat control hints: show for the first 15 s of each session, then fade.
  const [showHints, setShowHints] = useState(true);
  useEffect(() => {
    setShowHints(true);
    const t = setTimeout(() => setShowHints(false), 15000);
    return () => clearTimeout(t);
  }, [sessionId, inBoat]);

  // One-time harbour hint ("find your boat") at session start.
  const [showHarbourHint, setShowHarbourHint] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowHarbourHint(false), 8000);
    return () => clearTimeout(t);
  }, []);

  // Multiplayer join/leave notifications (Phase 2)
  const [activeNetworkToast, setActiveNetworkToast] = useState(null);
  useEffect(() => {
    if (networkState?.lastNotification) {
      setActiveNetworkToast(networkState.lastNotification);
      const timer = setTimeout(() => {
        setActiveNetworkToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [networkState?.lastNotification?.id]);

  const showHarbourObjective =
    gameMode === 'harbor' && showHarbourHint && !isNearBoat;
  const boatLevel = progression.boatLevel ?? 1;
  const currentBoat = BoatConfig.LEVELS[boatLevel - 1];
  const nextBoat = BoatConfig.LEVELS[boatLevel];
  const canAffordUpgrade = nextBoat && progression.coins >= nextBoat.cost;

  // Weekly quest panel — opt-in, closed by default, never blocks gameplay.
  const [questsOpen, setQuestsOpen] = useState(false);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between">
      {/* ── Top row: system buttons (right) ── */}
      <div className="flex items-start justify-between p-4 md:p-5 gap-4">
        <div className="w-24 shrink-0 hidden sm:block" aria-hidden="true" />

        <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
          {/* Compass — always visible: the harbour waypoint keeps you oriented. */}
          <Compass
            heading={compass?.heading ?? 0}
            harbour={compass?.harbour ?? 0}
            dist={compass?.dist ?? 0}
          />
          {showHarbourObjective && (
            <div className="anim-fade-up hud-chip px-4 py-2">
              <span className="chip-text text-sm font-medium">
                Find your boat at the end of the pier.
              </span>
            </div>
          )}
          {pickupToast && <Toast icon="trash" tone="aqua">Trash collected</Toast>}
          {activeNetworkToast && (
            <div key={activeNetworkToast.id} className="anim-fade-up hud-chip px-3.5 py-1.5 flex items-center gap-2 border border-cyan-400/40 bg-ink-deep/80 shadow-lg">
              <span className="chip-text text-xs md:text-sm font-bold text-cyan-200">
                {activeNetworkToast.text}
              </span>
            </div>
          )}
          {upgradeMessage && <Toast icon={upgradeMessage.tone === 'success' ? 'check' : 'coin'} tone={upgradeMessage.tone === 'success' ? 'aqua' : 'sand'}>{upgradeMessage.text}</Toast>}
          {questToast && <Toast icon="coin" tone="sand">{questToast.text}</Toast>}
          {recycleFact && (
            <RecycleFactToast
              fact={recycleFact.fact}
              amount={recycleFact.amount}
              reward={recycleFact.reward}
              onDismiss={onDismissRecycleFact}
            />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Multiplayer status indicator */}
          <MultiplayerStatusChip
            networkState={networkState}
            onReconnect={onReconnectMultiplayer}
          />

          {/* Weekly quests — small opt-in button with a claimable hint dot */}
          <div className="relative">
            <button
              onClick={() => setQuestsOpen(v => !v)}
              aria-label="Weekly quests"
              aria-expanded={questsOpen}
              title="Weekly quests"
              className={`btn-ui focus-ring h-10 px-3 rounded-xl hud-chip flex items-center gap-1.5 cursor-pointer pointer-events-auto ${questsOpen ? 'text-cyan-soft' : 'chip-text'}`}
            >
              <Icon name="target" size={16} className={questsOpen || hasClaimableQuests ? 'text-cyan-soft' : ''} />
              <span className="text-xs font-bold tracking-wide">WEEKLY</span>
            </button>
            {hasClaimableQuests && !questsOpen && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-sand border-2 border-[#0a1f33] animate-pulse" />
            )}
          </div>
          <IconButton
            name={soundMuted ? 'sound-off' : 'sound-on'}
            onClick={onToggleSound}
            label={soundMuted ? 'Unmute sound' : 'Mute sound'}
            active={!soundMuted}
          />
          <IconButton name="pause" onClick={onPause} label="Pause" />
        </div>
      </div>

      {/* Quest panel — docked under the top-right cluster when open */}
      {questsOpen && weeklyQuests && (
        <div className="absolute top-[4.5rem] right-4 md:right-5 z-30">
          <QuestPanel
            quests={weeklyQuests.quests}
            onClaim={onClaimQuest}
            onClose={() => setQuestsOpen(false)}
          />
        </div>
      )}

      {/* Harbor boat upgrade panel — visible ONLY when near own boat AND toggled open */}
      {gameMode === 'harbor' && isNearBoat && isUpgradeOpen && currentBoat && (
        <div className="absolute top-20 left-4 md:left-5 z-30 w-[min(20rem,calc(100vw-2rem))] panel-dark p-4 pointer-events-auto anim-pop">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="chip-label text-[0.66rem]!">Upgrade Boat</p>
              <h2 className="chip-value text-lg font-extrabold mt-0.5">Level {boatLevel} · {currentBoat.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">{boatLevel === 1 ? '⛵' : boatLevel === 2 ? '🛥️' : '🚤'}</span>
              <button
                onClick={onCloseUpgrade}
                tabIndex={-1}
                aria-label="Close upgrade panel"
                title="Close (E / Esc)"
                className="btn-ui focus-ring w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-foam/80 text-xs flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="chip-text text-xs mt-1">{currentBoat.appearance}</p>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div className="rounded-lg bg-white/5 border border-white/10 p-2"><span className="chip-sub block">Cargo capacity</span><strong className="chip-value">{currentBoat.capacity} trash</strong></div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-2"><span className="chip-sub block">Top speed</span><strong className="chip-value">{currentBoat.speed.toFixed(1)} m/s</strong></div>
          </div>
          {nextBoat ? (
            <>
              <div className="mt-3 text-xs chip-text">Next: <strong>Level {nextBoat.level} · {nextBoat.name}</strong></div>
              <div className="mt-1 text-[0.68rem] chip-sub">{nextBoat.capacity} trash · {nextBoat.speed.toFixed(1)} m/s · {nextBoat.appearance}</div>
              <button
                onClick={onUpgradeBoat}
                disabled={!canAffordUpgrade}
                className={`btn-ui focus-ring w-full mt-3 py-2.5 rounded-xl border text-sm font-extrabold ${canAffordUpgrade ? 'bg-ocean hover:bg-[#1799dc] text-white border-white/25 cursor-pointer' : 'bg-white/5 text-foam/40 border-white/10 cursor-not-allowed'}`}
                aria-label={`Upgrade boat for ${nextBoat.cost} coins`}
              >
                Upgrade · {nextBoat.cost} coins
              </button>
              {!canAffordUpgrade && <p className="chip-sub text-[0.66rem] mt-1.5 text-center">Need {nextBoat.cost - progression.coins} more coins</p>}
            </>
          ) : (
            <>
              <button
                disabled
                className="btn-ui w-full mt-3 py-2.5 rounded-xl border text-sm font-extrabold bg-white/5 text-foam/40 border-white/10 cursor-not-allowed"
                aria-label="Maximum boat level reached"
              >
                Maximum level reached
              </button>
            </>
          )}

          <button
            onClick={onBoardBoat}
            className="btn-ui focus-ring w-full mt-2.5 py-2.5 rounded-xl border text-sm font-extrabold bg-aqua hover:bg-[#159f84] text-white border-white/25 cursor-pointer flex items-center justify-center gap-1.5"
            aria-label="Board boat"
          >
            <span>Board Boat</span>
            <span aria-hidden="true">⛵</span>
          </button>
        </div>
      )}

      {/* ── Center — intentionally free for gameplay visibility ── */}
      <div className="flex-1" aria-hidden="true" />

      {/* ── Bottom row ── */}
      <div className="flex items-end justify-between p-4 md:p-5 gap-4">
        {/* Bottom left: stats and optional educational fact popup */}
        <div className="flex flex-col items-start gap-2.5 max-w-[min(21rem,calc(100vw-2rem))]">
          {gameplayFact && (
            <GameplayFactPopup
              fact={gameplayFact.fact}
              onDismiss={onDismissGameplayFact}
            />
          )}
          <StatsChip
            boatTrashCount={progression.boatTrashCount}
            coins={progression.coins}
            coinPopup={coinPopup}
            fishCount={fishingData?.fishCount ?? 0}
          />
        </div>

        {/* Bottom center: prompts + control hints */}
        <div className="absolute bottom-4 md:bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 max-w-[92vw]">
          <div className="flex flex-col items-center gap-2">
            {inBoat && showHints && <HintsChip inBoat />}
            {isNearBoat && gameMode === 'harbor' && (
              <>
                <InteractionPrompt action="E">
                  {isUpgradeOpen ? 'Close upgrade' : 'Upgrade boat'}
                </InteractionPrompt>
                <InteractionPrompt action="Enter">Board boat</InteractionPrompt>
              </>
            )}
            {isDocked && inBoat && (
              <InteractionPrompt action="E">Leave boat</InteractionPrompt>
            )}
            {nearTrash && (
              <InteractionPrompt action="F">Pick up trash</InteractionPrompt>
            )}
            {/* Contextual unload prompt: only in the zone WITH trash aboard,
                and not while an unload is already in progress. */}
            {inBoat && nearUnloadZone && !isUnloading && progression.boatTrashCount > 0 && (
              <InteractionPrompt action="E">Unload trash</InteractionPrompt>
            )}
            {/* ── Fishing prompts ─────────────────────────────────── */}
            {/* Hold-F to cast prompt: near a fishing spot, not already fishing */}
            {fishingData?.spot && fishingData.state === 'idle' && fishingData.castProgress === 0 && (
              <InteractionPrompt action="F" tone="aqua">Hold to fish (2s)</InteractionPrompt>
            )}
            {/* Cast progress bar while holding F */}
            {fishingData?.castProgress > 0 && fishingData.state === 'idle' && (
              <HoldProgress progress={fishingData.castProgress} label="Casting..." keyLabel="F" />
            )}
            {/* Clear Popup notification when fish is caught (screen space — visible regardless of camera direction) */}
            {(fishingData?.fishReady || (fishingData?.pendingCatches ?? 0) > 0) && (
              <div
                key={fishingData?.fishAlert?.key || 'fish-alert'}
                className="anim-pop panel-dark px-4 py-2.5 rounded-2xl border-2 border-sand/70 shadow-[0_0_24px_rgba(245,158,11,0.35)] flex items-center gap-2.5 text-sand font-black text-xs md:text-sm pointer-events-auto"
              >
                <span className="text-base">🐟</span>
                <span>Fish caught! Hold R to retrieve your fish!</span>
                {(fishingData?.pendingCatches ?? 0) > 1 && (
                  <span className="bg-sand text-navy-dark px-2 py-0.5 rounded-full text-[0.7rem] font-black">
                    {fishingData.pendingCatches} available
                  </span>
                )}
              </div>
            )}
            {/* Hold R progress bar while retrieving fish */}
            {(fishingData?.state === 'fish_ready' || fishingData?.state === 'reeling' || (fishingData?.pendingCatches ?? 0) > 0) && (
              <HoldProgress
                progress={fishingData.reelProgress}
                label={
                  (fishingData?.pendingCatches ?? 0) > 1
                    ? `Hold R to retrieve fish (${fishingData.pendingCatches} available)`
                    : "Hold R to retrieve your fish"
                }
                keyLabel="R"
                color="sand"
              />
            )}
            {/* Active fishing waiting / stop hint */}
            {fishingData?.state && fishingData.state !== 'idle' && (fishingData?.pendingCatches ?? 0) === 0 && fishingData.state !== 'reeling' && (
              <InteractionPrompt action="F">Stop fishing</InteractionPrompt>
            )}
          </div>
          {inBoat && (
            <button
              onClick={() => setShowHints(v => !v)}
              aria-label="Toggle control hints"
              title="Control hints"
              className="btn-ui focus-ring w-8 h-8 rounded-lg hud-chip flex items-center justify-center cursor-pointer pointer-events-auto"
            >
              <Icon name="question" size={14} className={showHints ? 'text-cyan-soft' : 'chip-text'} />
            </button>
          )}
        </div>

        {/* Bottom right: FishingCard when actively fishing, Speedometer in boat mode, or Harbor Eco-Board in harbor mode */}
        {fishingData?.state && fishingData.state !== 'idle' ? (
          <FishingCard fishingData={fishingData} onStopFishing={onStopFishing} />
        ) : inBoat ? (
          <Speedometer speedKnots={boatSpeed} unit={speedUnit} />
        ) : (
          harborFact && (
            <HarborFactCard
              fact={harborFact}
              onNextFact={onNextHarborFact}
            />
          )
        )}
      </div>
    </div>
  );
}

export default HUD;
