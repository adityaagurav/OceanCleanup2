import React from 'react';
import { soundFx } from '../utils/sound';

function GameButton({ text, onClick, icon, variant = 'primary', className = '' }) {
  const handleClick = (e) => {
    soundFx.playButtonClick();
    if (onClick) onClick(e);
  };

  const baseStyles = "w-72 py-4 px-6 rounded-2xl border text-white text-xl font-bold shadow-xl transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-md cursor-pointer active:scale-95";

  const variants = {
    primary: "bg-cyan-600/70 border-cyan-400/40 hover:bg-cyan-500/90 hover:scale-105 hover:shadow-cyan-500/50 hover:border-cyan-300",
    secondary: "bg-teal-700/60 border-teal-400/30 hover:bg-teal-600/80 hover:scale-105 hover:shadow-teal-500/40",
    danger: "bg-rose-600/70 border-rose-400/40 hover:bg-rose-500/90 hover:scale-105 hover:shadow-rose-500/50",
    ghost: "bg-slate-900/60 border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-500"
  };

  return (
    <button
      onClick={handleClick}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${className}`}
    >
      {icon && <span className="text-2xl">{icon}</span>}
      <span>{text}</span>
    </button>
  );
}

export default GameButton;
