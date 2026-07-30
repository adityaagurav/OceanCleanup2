import React from 'react';

function Pokedex({ caughtCreatures, activeCompanion, onSelectCompanion, onClose }) {
  // Group by type
  const collection = caughtCreatures.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {});

  const allTypes = ['fish', 'shark', 'dolphin', 'ray', 'whale'];
  
  return (
    <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-8 select-none">
      <div className="bg-gradient-to-br from-rose-600 to-rose-800 rounded-3xl p-2 w-full max-w-4xl shadow-[0_0_50px_rgba(225,29,72,0.4)] border-4 border-rose-900 flex flex-col h-full max-h-[80vh]">
        
        {/* Header */}
        <div className="bg-slate-900 rounded-t-2xl p-6 border-b-4 border-slate-950 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-cyan-400 border-4 border-white shadow-[0_0_20px_rgba(34,211,238,0.6)] animate-pulse"></div>
            <div className="flex gap-2">
              <div className="w-4 h-4 rounded-full bg-rose-500 border-2 border-rose-900"></div>
              <div className="w-4 h-4 rounded-full bg-amber-400 border-2 border-amber-600"></div>
              <div className="w-4 h-4 rounded-full bg-emerald-400 border-2 border-emerald-600"></div>
            </div>
          </div>
          <h1 className="text-4xl font-black text-white italic tracking-widest drop-shadow-md uppercase">OceanDex</h1>
          <button 
            onClick={onClose}
            className="w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-white font-bold text-xl border-2 border-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="bg-slate-100 flex-1 rounded-b-2xl p-6 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {allTypes.map((type, index) => {
              const count = collection[type] || 0;
              const isCaught = count > 0;
              const isCompanion = activeCompanion === type;
              
              return (
                <div 
                  key={type} 
                  onClick={() => { if (isCaught) onSelectCompanion(type); }}
                  className={`relative rounded-2xl p-4 border-4 transition-transform cursor-pointer ${isCaught ? (isCompanion ? 'bg-rose-50 border-rose-400 shadow-[0_0_15px_rgba(251,113,133,0.5)] scale-105' : 'bg-white border-slate-300 shadow-xl hover:-translate-y-1') : 'bg-slate-200 border-slate-300 opacity-60 grayscale cursor-not-allowed'}`}
                >
                  {isCompanion && (
                    <div className="absolute -top-3 -right-3 w-8 h-8 bg-rose-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md border-2 border-white z-10">★</div>
                  )}
                  <div className="absolute top-2 left-3 text-slate-400 font-bold text-sm">
                    #{index + 1}
                  </div>
                  
                  <div className="h-32 flex items-center justify-center mb-4">
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center text-5xl ${isCaught ? (isCompanion ? 'bg-rose-200 text-rose-600' : 'bg-slate-100 text-slate-700') : 'bg-slate-300 text-slate-400'}`}>
                      {type === 'fish' ? '🐟' : type === 'shark' ? '🦈' : type === 'dolphin' ? '🐬' : type === 'whale' ? '🐳' : '🪼'}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <h3 className={`font-black text-xl capitalize ${isCaught ? 'text-slate-800' : 'text-slate-400'}`}>
                      {isCaught ? type : '???'}
                    </h3>
                    <div className="mt-2 text-sm font-bold bg-slate-100 rounded-lg py-1 px-3 inline-block text-slate-500">
                      Caught: {count}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
      </div>
    </div>
  );
}

export default Pokedex;
