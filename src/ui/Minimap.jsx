import React from 'react';

function Minimap({ playerPos, playerYaw }) {
  if (!playerPos) {
    return (
      <div className="w-40 h-40 rounded-full border-[6px] border-slate-200/80 bg-slate-900/60 backdrop-blur-md shadow-[0_0_15px_rgba(0,0,0,0.3)] relative overflow-hidden flex items-center justify-center">
        <div className="w-3 h-3 bg-white rounded-full shadow-[0_0_8px_white] animate-pulse"></div>
      </div>
    );
  }

  const mapScale = 0.25; // Scale world units to minimap pixels (e.g. 100 units = 25px)
  
  // Three.js rotation around Y axis.
  // We want the map to rotate such that the player's forward direction is always UP.
  const rotationDeg = (playerYaw * 180) / Math.PI;

  return (
    <div className="w-40 h-40 rounded-full border-[6px] border-slate-200/80 bg-slate-900/60 backdrop-blur-md shadow-[0_0_15px_rgba(0,0,0,0.3)] relative overflow-hidden flex items-center justify-center pointer-events-none">
      
      {/* Map container that rotates against player yaw */}
      <div 
        className="absolute w-[300px] h-[300px] flex items-center justify-center"
        style={{ transform: `rotate(${rotationDeg}deg)` }}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-sky-900/50 to-emerald-900/50 rounded-full"></div>
        
        {/* Draw the main starting island (approx at 0,0) */}
        <div 
          className="absolute w-24 h-24 bg-emerald-500/30 rounded-full blur-md border border-emerald-400/20"
          style={{ 
            left: `calc(50% + ${(0 - playerPos.x) * mapScale}px)`, 
            top:  `calc(50% + ${(0 - playerPos.z) * mapScale}px)`,
            transform: 'translate(-50%, -50%)'
          }}
        ></div>

        {/* Draw some grid rings for radar feel */}
        <div className="absolute inset-0 rounded-full border-[1px] border-white/5 m-[50px]"></div>
        <div className="absolute inset-0 rounded-full border-[1px] border-white/5 m-[100px]"></div>

        {/* North Indicator on the map itself */}
        <div 
          className="absolute font-black text-rose-500 tracking-widest text-[10px]"
          style={{ 
            left: `calc(50% + ${(0 - playerPos.x) * mapScale}px)`, 
            top:  `calc(50% + ${( -100 - playerPos.z) * mapScale}px)`,
            transform: 'translate(-50%, -50%)'
          }}
        >N</div>
      </div>
      
      {/* Static overlay (Player is always center) */}
      <div className="absolute top-[35%] left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-rose-500 opacity-80 shadow-md"></div>
      
      {/* Player marker (Center) */}
      <div className="w-3 h-3 bg-white rounded-full shadow-[0_0_10px_white] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 border-2 border-slate-900"></div>
    </div>
  );
}

export default Minimap;
