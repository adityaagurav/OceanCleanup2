import React from 'react';

/**
 * OceanBackdrop.jsx — Lightweight procedural ocean backdrop used by every
 * menu screen. Pure CSS/SVG: a gradient sky, a slow glowing sun, and two
 * drifting SVG wave layers. Everything animates via transform/opacity so the
 * GPU cost stays negligible (no GIFs, no JS rAF, no per-frame work).
 */
export function OceanBackdrop({ children, className = '' }) {
  return (
    <div className={`relative w-screen h-screen overflow-hidden bg-[#0a2f4e] ${className}`}>
      {/* Sky gradient */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0a2f4e_0%,#0e4a73_45%,#16789e_100%)]" />

      {/* Soft sun glow */}
      <div className="absolute -top-24 right-[6%] w-[36vmin] h-[36vmin] rounded-full bg-[radial-gradient(circle,rgba(255,225,160,0.45),transparent_70%)] anim-glow" />

      {/* Drifting wave layer 1 (slow, deep cyan) */}
      <div className="absolute inset-x-0 bottom-0 h-[32%] overflow-hidden pointer-events-none">
        <svg
          className="absolute left-0 top-0 h-full w-[200%] anim-wave opacity-70"
          viewBox="0 0 2400 120"
          preserveAspectRatio="none"
        >
          <path
            fill="rgba(87,199,232,0.16)"
            d="M0 80 C200 40 380 100 600 70 C820 40 980 90 1200 60 C1420 30 1600 90 1800 60 C2020 30 2180 80 2400 55 L2400 120 L0 120 Z"
          />
          <path
            fill="rgba(87,199,232,0.14)"
            transform="translate(1200,0)"
            d="M0 80 C200 40 380 100 600 70 C820 40 980 90 1200 60 C1420 30 1600 90 1800 60 C2020 30 2180 80 2400 55 L2400 120 L0 120 Z"
          />
        </svg>
      </div>

      {/* Drifting wave layer 2 (faster, foam white) */}
      <div className="absolute inset-x-0 -bottom-2 h-[22%] overflow-hidden pointer-events-none">
        <svg
          className="absolute left-0 top-0 h-full w-[200%] anim-wave-fast opacity-60"
          viewBox="0 0 2400 120"
          preserveAspectRatio="none"
        >
          <path
            fill="rgba(244,250,253,0.10)"
            d="M0 85 C260 45 460 105 700 75 C940 45 1160 95 1400 65 C1640 35 1880 85 2100 60 C2280 40 2360 70 2400 60 L2400 120 L0 120 Z"
          />
          <path
            fill="rgba(244,250,253,0.08)"
            transform="translate(1200,0)"
            d="M0 85 C260 45 460 105 700 75 C940 45 1160 95 1400 65 C1640 35 1880 85 2100 60 C2280 40 2360 70 2400 60 L2400 120 L0 120 Z"
          />
        </svg>
      </div>

      {/* Readability vignette behind text (left-weighted) */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_18%_22%,rgba(6,28,47,0.55)_0%,rgba(6,28,47,0.25)_45%,transparent_78%)]" />

      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

export default OceanBackdrop;
