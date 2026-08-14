import React, { memo } from 'react';

/**
 * Speedometer.jsx — Compact boat speed indicator (bottom-right, boat mode
 * only). Big tabular number + small unit + a thin progress bar against the
 * boat's top speed.
 *
 * The engine already throttles React updates to when the rounded value
 * changes (~5-10/s), so acceleration feels smooth with zero per-frame work.
 * The `anim-tick` flash (opacity only) makes each change feel alive.
 *
 * @param {{ speedKnots: number, unit: 'kmh'|'kn' }} props
 */
export const Speedometer = memo(function Speedometer({ speedKnots, unit }) {
  const kmh = speedKnots * 1.852;              // knots → km/h
  const MAX_KMH = 8 * 3.6;                     // boat top speed 8 m/s ≈ 28.8 km/h

  const value = unit === 'kmh' ? Math.round(kmh) : speedKnots.toFixed(1);
  const unitLabel = unit === 'kmh' ? 'KM/H' : 'KN';
  const frac = Math.min(1, Math.max(0, kmh / MAX_KMH));

  return (
    <div className="hud-chip px-4 py-2.5 min-w-[8.5rem] pointer-events-auto">
      <div className="chip-label mb-1">Speed</div>
      <div className="flex items-baseline gap-1.5">
        <span
          key={value}
          className="chip-value anim-tick text-[clamp(1.85rem,4.2vmin,2.6rem)]"
        >
          {value}
        </span>
        <span className="chip-label">{unitLabel}</span>
      </div>
      <div className="progress-track mt-2 h-1 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ocean-deep to-cyan-soft transition-[width] duration-200 ease-out"
          style={{ width: `${frac * 100}%` }}
        />
      </div>
    </div>
  );
});

export default Speedometer;
