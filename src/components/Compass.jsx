import React, { memo } from 'react';
import Icon from './Icon';

/**
 * Compass.jsx — Top-centre heading ribbon (always visible in-game).
 *
 * A classic horizontal game compass: the world's compass rose slides beneath a
 * fixed centre needle as the camera turns, with cardinal + intercardinal
 * labels and degree ticks. A harbour waypoint pin shows the bearing back to
 * base — with a live distance readout when it's in view, and a chevron at the
 * rim when it's behind you, so the player always knows which way to turn.
 *
 * Perf: the engine throttles updates to whole degrees / 50 m buckets and this
 * component is memoized, so turning the camera never re-renders the HUD.
 *
 * Azimuth convention (matches the 3D world): 0° = +Z ("north", toward the
 * harbour), +90° = +X ("east"). Positive = counter-clockwise viewed from
 * above, so +90° sits on the player's LEFT when facing +Z — the pin always
 * mirrors the true world around you.
 */

const PX_PER_DEG = 2.4;  // dial pixels per degree of azimuth
const HALF_VIEW  = 78;   // waypoint clamp half-width (degrees) — the rim
const STRIP_MIN  = -110; // dial coverage — the ±78° window always has ticks
const STRIP_MAX  = 470;  // at any heading (360° + 2 × view + margin)

const ROSE  = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const MAJOR = new Set([0, 45, 90, 135, 180, 225, 270, 315]);

/** Wrap any angle (deg) to (-180, 180]. */
const wrap180 = (deg) => {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
};

const formatDist = (m) =>
  m >= 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`;

// Pre-build the tick strip once — ~117 elements, never rebuilt per render.
const TICKS = [];
for (let az = STRIP_MIN; az <= STRIP_MAX; az += 5) {
  const mod = ((az % 360) + 360) % 360;
  TICKS.push({ az, mod, major: MAJOR.has(mod), medium: mod % 15 === 0 });
}

export const Compass = memo(function Compass({ heading = 0, harbour = 0, dist = 0 }) {
  // Bearing of the harbour relative to the camera heading (+ = left side).
  const rel     = wrap180(harbour - heading);
  const clamped = rel > HALF_VIEW || rel < -HALF_VIEW;
  const markerX = Math.max(-HALF_VIEW, Math.min(HALF_VIEW, rel)) * PX_PER_DEG;

  return (
    <div className="compass" role="img" aria-label="Compass">
      {/* Rotating rose — slides under the needle as the camera turns */}
      <div className="compass-dial-wrap">
        <div
          className="compass-dial"
          style={{
            width: `${(STRIP_MAX - STRIP_MIN) * PX_PER_DEG}px`,
            transform: `translateX(${(heading - STRIP_MIN) * PX_PER_DEG}px)`,
          }}
        >
          {TICKS.map((t) => (
            <div
              key={t.az}
              className={`compass-tick${t.major ? ' is-major' : t.medium ? ' is-medium' : ''}`}
              style={{ left: `${(STRIP_MIN - t.az) * PX_PER_DEG}px` }}
            >
              <span className="compass-label">{ROSE[t.mod] || ''}</span>
              <i className="compass-line" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>

      {/* Harbour waypoint pin (clamped to the rim with a chevron off-view) */}
      <div className="compass-waypoint" style={{ left: `calc(50% - min(${markerX}px, 46%))` }}>
        {clamped ? (
          <span className="compass-waypoint-off">
            <span className="compass-waypoint-arrow">{rel > 0 ? '‹' : '›'}</span>
            <Icon name="home" size={10} />
          </span>
        ) : (
          <>
            {dist >= 25 && <span className="compass-waypoint-dist">HARBOUR · {formatDist(dist)}</span>}
            <span className="compass-waypoint-pin">
              <Icon name="home" size={12} />
            </span>
          </>
        )}
      </div>

      {/* Fixed centre needle — points at your current heading */}
      <div className="compass-needle" />
    </div>
  );
});

export default Compass;
