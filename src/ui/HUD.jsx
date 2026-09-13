import React, { memo, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Speedometer } from '../components/Speedometer';
import { Compass } from '../components/Compass';

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
const StatsChip = memo(function StatsChip({ boatTrashCount, coins, coinPopup }) {
  return (
    <div className="hud-chip px-4 py-2.5 flex items-center gap-4 relative">
      <div className="flex items-center gap-2">
        <Icon name="trash" size={16} className="text-aqua" />
        <span key={boatTrashCount} className="chip-value text-xl anim-counter">
          {boatTrashCount}
        </span>
      </div>
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

/* ──────────────────────────────────────────────────────────────
   HUD
   ────────────────────────────────────────────────────────────── */

function HUD({
  progression,    // { boatTrashCount, deliveredTrashCount, coins, weeklyQuest }
  boatSpeed,      // knots, throttled by the engine (only pushed on change)
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

  const showHarbourObjective =
    gameMode === 'harbor' && showHarbourHint && !isNearBoat;

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
          {questToast && <Toast icon="coin" tone="sand">{questToast.text}</Toast>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
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

      {/* ── Center — intentionally free for gameplay visibility ── */}
      <div className="flex-1" aria-hidden="true" />

      {/* ── Bottom row ── */}
      <div className="flex items-end justify-between p-4 md:p-5 gap-4">
        {/* Bottom left: stats */}
        <div className="flex items-center gap-2">
          <StatsChip
            boatTrashCount={progression.boatTrashCount}
            coins={progression.coins}
            coinPopup={coinPopup}
          />
        </div>

        {/* Bottom center: prompts + control hints */}
        <div className="absolute bottom-4 md:bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 max-w-[92vw]">
          <div className="flex flex-col items-center gap-2">
            {inBoat && showHints && <HintsChip inBoat />}
            {isNearBoat && gameMode === 'harbor' && (
              <InteractionPrompt action="E">Board boat</InteractionPrompt>
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

        {/* Bottom right: speed */}
        {inBoat && <Speedometer speedKnots={boatSpeed} unit={speedUnit} />}
      </div>
    </div>
  );
}

export default HUD;
