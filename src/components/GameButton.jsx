import React from 'react';
import { soundFx } from '../audio/AudioManager';
import Icon, { ICONS } from './Icon';

/**
 * GameButton.jsx — Unified menu button.
 * Variants: primary (ocean blue), secondary (translucent light), ghost (navy),
 *           danger (rose). All hover states are cheap 150 ms tint/translate
 *           transitions on the compositor.
 */
function GameButton({
  text,
  onClick,
  icon,
  variant = 'primary',
  className = '',
  size = 'md',
}) {
  const handleClick = (e) => {
    soundFx.playButtonClick();
    if (onClick) onClick(e);
  };

  const baseStyles =
    'btn-ui focus-ring rounded-2xl border font-semibold tracking-wide flex items-center justify-center gap-3 cursor-pointer';

  const variants = {
    primary:
      'bg-ocean hover:bg-[#1799dc] text-white border-white/25 shadow-[0_12px_30px_-14px_rgba(15,134,196,0.9)]',
    secondary:
      'bg-white/10 hover:bg-white/20 text-foam border-white/25 backdrop-blur-md',
    ghost:
      'bg-ink-deep/60 hover:bg-ink-deep/90 text-foam/90 border-cyan-soft/20 hover:border-cyan-soft/40',
    danger:
      'bg-rose-600/70 hover:bg-rose-500/90 text-white border-rose-400/40 shadow-[0_12px_30px_-14px_rgba(225,29,72,0.8)]',
  };

  const sizes = {
    auto: 'px-5 py-3 text-base',
    md:   'w-64 py-3 px-6 text-base',
    lg:   'w-72 py-4 px-6 text-lg',
  };

  return (
    <button
      onClick={handleClick}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
    >
      {icon && (ICONS[icon] ? <Icon name={icon} size={20} /> : <span className="text-2xl leading-none">{icon}</span>)}
      <span>{text}</span>
    </button>
  );
}

export default GameButton;
