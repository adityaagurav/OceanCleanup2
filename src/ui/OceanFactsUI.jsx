import React, { memo, useEffect, useRef } from 'react';
import Icon from '../components/Icon';

/**
 * GameplayFactPopup — Small, non-intrusive random fact popup during gameplay.
 * Displays every 60-90 seconds. Fades out automatically or can be dismissed by clicking ✕.
 * Never interrupts boat movement, mouse look, or keyboard controls.
 */
export const GameplayFactPopup = memo(function GameplayFactPopup({
  fact,
  onDismiss,
  duration = 12000,
}) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!fact) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onDismiss?.();
    }, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fact, onDismiss, duration]);

  if (!fact) return null;

  return (
    <aside
      key={fact.id}
      aria-label="Ocean educational fact"
      className="anim-pop hud-chip-strong p-3.5 border border-cyan-soft/30 rounded-2xl shadow-xl pointer-events-auto w-[min(21rem,calc(100vw-2rem))] relative overflow-hidden"
    >
      {/* Top row: Category tag + dismiss button */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.66rem] font-bold tracking-wide uppercase bg-ocean/20 text-cyan-soft border border-cyan-soft/20">
          <span aria-hidden="true">{fact.emoji}</span>
          <span>{fact.categoryLabel}</span>
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss?.();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          tabIndex={-1}
          aria-label="Dismiss fact"
          title="Dismiss fact"
          className="btn-ui focus-ring w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-foam/70 hover:text-foam text-xs flex items-center justify-center cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Fact Title & Text */}
      <h4 className="chip-value text-sm font-bold text-foam flex items-center gap-1.5">
        {fact.title}
      </h4>
      <p className="chip-text text-xs text-foam/90 leading-snug mt-1">
        {fact.text}
      </p>

      {/* Subtle auto-dismiss timeout bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-soft to-aqua anim-fact-timeout"
          style={{ '--timeout-dur': `${duration}ms` }}
        />
      </div>
    </aside>
  );
});

/**
 * HarborFactCard — Rotating educational fact board at the harbor.
 * Shows one rotating educational fact while on foot at the harbor.
 * Rotates automatically every interval or when clicking the Next button.
 */
export const HarborFactCard = memo(function HarborFactCard({
  fact,
  onNextFact,
  interval = 16000,
}) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      onNextFact?.();
    }, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onNextFact, interval, fact?.id]);

  if (!fact) return null;

  return (
    <section
      aria-label="Harbor Eco-Board"
      className="panel-dark p-3.5 w-[min(22rem,calc(100vw-2rem))] pointer-events-auto border border-cyan-soft/20 shadow-2xl relative overflow-hidden"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="text-base" aria-hidden="true">⚓</span>
          <div>
            <span className="chip-label text-[0.66rem]! font-black text-cyan-soft tracking-wider block">
              HARBOR ECO-BOARD
            </span>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNextFact?.();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          tabIndex={-1}
          aria-label="Show next educational fact"
          title="Next fact"
          className="btn-ui focus-ring px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-soft text-xs font-semibold flex items-center gap-1 cursor-pointer"
        >
          <span>Next</span>
          <span aria-hidden="true">↻</span>
        </button>
      </div>

      {/* Fact Body (keyed by fact.id for smooth re-animation) */}
      <div key={fact.id} className="anim-fade-up">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm" aria-hidden="true">{fact.emoji}</span>
          <span className="text-[0.68rem] font-bold text-aqua uppercase tracking-wide">
            {fact.categoryLabel}
          </span>
        </div>
        <h4 className="chip-value text-sm font-bold text-foam">
          {fact.title}
        </h4>
        <p className="chip-text text-xs text-foam/90 leading-relaxed mt-1">
          {fact.text}
        </p>
      </div>

      {/* Auto-rotation indicator line */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 overflow-hidden">
        <div
          key={fact.id}
          className="h-full bg-gradient-to-r from-aqua to-cyan-soft anim-fact-progress"
          style={{ '--progress-dur': `${interval}ms` }}
        />
      </div>
    </section>
  );
});

/**
 * RecycleFactToast — Educational celebration fact displayed after players
 * unload and recycle collected waste at the dock.
 * Highlights relevant pollution and recycling facts with trash count and coins earned.
 */
export const RecycleFactToast = memo(function RecycleFactToast({
  fact,
  amount,
  reward,
  onDismiss,
  duration = 12000,
}) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!fact) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onDismiss?.();
    }, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fact, onDismiss, duration]);

  if (!fact) return null;

  return (
    <div
      key={fact.id}
      role="status"
      aria-live="polite"
      className="anim-pop panel-dark p-4 max-w-md w-full border border-aqua/40 shadow-2xl pointer-events-auto relative overflow-hidden"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl" aria-hidden="true">♻️</span>
          <div>
            <span className="chip-label text-aqua text-[0.72rem]! font-black tracking-wide block">
              {amount > 0 ? `${amount} TRASH RECYCLED!` : 'TRASH RECYCLED!'} {reward > 0 && `(+${reward} COINS)`}
            </span>
            <h3 className="chip-value text-sm font-extrabold text-foam mt-0.5">
              {fact.title}
            </h3>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss?.();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          tabIndex={-1}
          aria-label="Dismiss recycling fact"
          title="Dismiss"
          className="btn-ui focus-ring w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-foam/80 hover:text-foam text-xs flex items-center justify-center cursor-pointer"
        >
          ✕
        </button>
      </div>

      <p className="chip-text text-xs text-foam/90 leading-relaxed mt-2.5 pl-10">
        {fact.text}
      </p>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10 text-[0.68rem] chip-sub pl-10">
        <span className="flex items-center gap-1.5 text-aqua font-semibold">
          <span aria-hidden="true">{fact.emoji}</span>
          <span>{fact.categoryLabel}</span>
        </span>
        <span className="text-foam/60">Every piece makes a difference! 🌊</span>
      </div>

      {/* Auto-dismiss timeout bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-aqua to-cyan-soft anim-fact-timeout"
          style={{ '--timeout-dur': `${duration}ms` }}
        />
      </div>
    </div>
  );
});

