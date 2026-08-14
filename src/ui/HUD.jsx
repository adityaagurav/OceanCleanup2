import React, { memo, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Speedometer } from '../components/Speedometer';
import { Compass } from '../components/Compass';
import { MissionConfig } from '../config/MissionConfig';

/* ──────────────────────────────────────────────────────────────
   Small memoized building blocks — a pickup or speed change only
   re-renders its own chip, never the whole HUD.
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

/** One-shot toast (pickup, mission complete). Flows with the top-center stack. */
const Toast = memo(function Toast({ icon, tone, children }) {
  return (
    <div className="anim-toast hud-chip-strong px-4 py-2 flex items-center gap-2 whitespace-nowrap">
      <Icon name={icon} size={16} className={tone === 'aqua' ? 'text-aqua' : 'text-sand'} />
      <span className="chip-text text-sm font-semibold">{children}</span>
    </div>
  );
});

/** Objective + trash goal progress — top center, boat mode. */
const ObjectiveChip = memo(function ObjectiveChip({ trashCount, missionComplete }) {
  const pct = Math.min(100, (trashCount / MissionConfig.TRASH_GOAL) * 100);
  return (
    <div className="hud-chip px-4 py-2 flex items-center gap-3">
      <Icon
        name={missionComplete ? 'check' : 'target'}
        size={18}
        className={missionComplete ? 'text-aqua' : 'text-cyan-soft'}
      />
      <div className="flex flex-col items-start gap-0.5">
        <span className="chip-label">{missionComplete ? 'Mission complete' : 'Mission'}</span>
        <span className="chip-text text-sm font-semibold leading-none">
          {missionComplete ? 'Return to the harbour' : 'Clean the ocean'}
        </span>
      </div>
      {!missionComplete && (
        <div className="flex items-center gap-2 pl-2">
          <span className="chip-value text-lg">
            {trashCount}
            <span className="chip-sub text-sm font-semibold">/{MissionConfig.TRASH_GOAL}</span>
          </span>
          <div className="progress-track h-1 w-16 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-aqua to-cyan-soft"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

/** Trash + score — bottom left, boat mode. */
const StatsChip = memo(function StatsChip({ trashCount, score, missionComplete }) {
  return (
    <div className="hud-chip px-4 py-2.5 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Icon name="trash" size={16} className="text-aqua" />
        <span key={trashCount} className="chip-value text-xl anim-counter">
          {trashCount}
        </span>
      </div>
      <div className="w-px h-5" style={{ background: 'var(--divider)' }} />
      <div className="flex items-center gap-2">
        <Icon name="star" size={16} className="text-sand" />
        <span key={score} className="chip-value text-xl anim-counter">
          {score}
        </span>
      </div>
      {missionComplete && <Icon name="check" size={16} className="text-aqua" />}
    </div>
  );
});

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
  score,
  trashCount,
  boatSpeed,      // knots, throttled by the engine (only pushed on change)
  pickupToast,
  nearTrash,
  isNearBoat,
  isDocked,
  missionState,   // 'harbour' | 'started' | 'active'
  missionComplete,
  hasStartedMission,
  inBoat,         // true while controlling the boat
  soundMuted,
  onToggleSound,
  onPause,
  speedUnit,
  sessionId,
  completeToast,
  compass,        // { heading, harbour, dist } — throttled by the engine
}) {
  // Boat control hints: show for the first 15 s of each session, then fade.
  const [showHints, setShowHints] = useState(true);
  useEffect(() => {
    setShowHints(true);
    const t = setTimeout(() => setShowHints(false), 15000);
    return () => clearTimeout(t);
  }, [sessionId, inBoat]);

  // One-time harbour hint ("find your boat") before the first mission.
  const [showHarbourHint, setShowHarbourHint] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowHarbourHint(false), 8000);
    return () => clearTimeout(t);
  }, []);

  const showHarbourObjective =
    missionState === 'harbour' && !hasStartedMission && showHarbourHint && !isNearBoat;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between">
      {/* ── Top row: objective (center) · system buttons (right) ── */}
      <div className="flex items-start justify-between p-4 md:p-5 gap-4">
        <div className="w-24 shrink-0 hidden sm:block" aria-hidden="true" />

        <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
          {/* Compass — always visible: the harbour waypoint keeps you oriented. */}
          <Compass
            heading={compass?.heading ?? 0}
            harbour={compass?.harbour ?? 0}
            dist={compass?.dist ?? 0}
          />
          {inBoat && <ObjectiveChip trashCount={trashCount} missionComplete={missionComplete} />}
          {showHarbourObjective && (
            <div className="anim-fade-up hud-chip px-4 py-2">
              <span className="chip-text text-sm font-medium">
                Find your boat at the end of the pier.
              </span>
            </div>
          )}
          {pickupToast && <Toast icon="trash" tone="aqua">+50 Trash collected</Toast>}
          {completeToast && <Toast icon="crown" tone="sand">Mission complete — return to harbour!</Toast>}
          {missionState === 'started' && <Toast icon="ship" tone="aqua">Mission started — clean the ocean</Toast>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <IconButton
            name={soundMuted ? 'sound-off' : 'sound-on'}
            onClick={onToggleSound}
            label={soundMuted ? 'Unmute sound' : 'Mute sound'}
            active={!soundMuted}
          />
          <IconButton name="pause" onClick={onPause} label="Pause" />
        </div>
      </div>

      {/* ── Center — intentionally free for gameplay visibility ── */}
      <div className="flex-1" aria-hidden="true" />

      {/* ── Bottom row ── */}
      <div className="flex items-end justify-between p-4 md:p-5 gap-4">
        {/* Bottom left: stats */}
        <div className="flex items-center gap-2">
          {inBoat && <StatsChip trashCount={trashCount} score={score} missionComplete={missionComplete} />}
        </div>

        {/* Bottom center: prompts + control hints */}
        <div className="absolute bottom-4 md:bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 max-w-[92vw]">
          <div className="flex flex-col items-center gap-2">
            {inBoat && showHints && <HintsChip inBoat />}
            {isNearBoat && missionState === 'harbour' && (
              <InteractionPrompt action="E">Board boat</InteractionPrompt>
            )}
            {isDocked && inBoat && (
              <InteractionPrompt action="E">Leave boat</InteractionPrompt>
            )}
            {nearTrash && (
              <InteractionPrompt action="F">Pick up trash</InteractionPrompt>
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
