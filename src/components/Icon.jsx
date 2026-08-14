import React from 'react';

/**
 * Icon.jsx — Tiny inline-SVG icon set (thin 1.8px strokes).
 * Emoji-free so rendering is identical on every OS/DPI, and far lighter
 * than an icon font or a sprite sheet.
 *
 * Usage: <Icon name="play" size={20} className="text-ocean" />
 */
export const ICONS = {
  play: <path d="M8 5v14l11-7z" />,
  trophy: (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 4H4v2a3 3 0 0 0 3 3" />
      <path d="M17 4h3v2a3 3 0 0 1-3 3" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-7" /><path d="M4 10V3" />
      <path d="M12 21v-9" /><path d="M12 8V3" />
      <path d="M20 21v-5" /><path d="M20 12V3" />
      <path d="M1 14h6" /><path d="M9 8h6" /><path d="M17 16h6" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </>
  ),
  home: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </>
  ),
  refresh: (
    <>
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
    </>
  ),
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  pause: (
    <>
      <path d="M10 4H6v16h4z" />
      <path d="M18 4h-4v16h4z" />
    </>
  ),
  'sound-on': (
    <>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </>
  ),
  'sound-off': (
    <>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M23 9l-6 6" />
      <path d="M17 9l6 6" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </>
  ),
  ship: (
    <>
      <path d="M2 21h20" />
      <path d="M3 16c2.6-1.6 5.4-1.6 8 0s5.4 1.6 8 0" />
      <path d="M5 16V8h14v8" />
      <path d="M12 8V4" />
      <path d="M8 4h8" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  crown: (
    <>
      <path d="M3 18h18" />
      <path d="M5 6l4 4 3-6 3 6 4-4-1 12H6L5 6z" />
    </>
  ),
  wave: (
    <>
      <path d="M2 12c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" />
      <path d="M2 18c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" />
    </>
  ),
};

export function Icon({ name, size = 20, className = '', strokeWidth = 1.8 }) {
  const glyph = ICONS[name] || ICONS.wave;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}

export default Icon;
