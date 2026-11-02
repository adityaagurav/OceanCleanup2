import React from 'react';
import GameButton from '../components/GameButton';
import Icon from '../components/Icon';
import HeroScene from '../landing/HeroScene';
import { MultiplayerStatusChip } from './MultiplayerStatusChip.jsx';

/**
 * MainMenu.jsx — The game's front door.
 *
 * A single-scroll landing page that opens straight into the game world:
 * a lightweight procedural 3D hero (HeroScene) built from the same harbour
 * palette as the actual game, followed by compact info + world showcase
 * sections. Every action routes through the existing scene router
 * (onNavigate) — no new game systems, no fake features.
 */

// Real numbers from the game's config — rendered, never invented.
// (Trash densities come from WorldConfig: 250 / 400 / 600 by setting.)

function Nav({ onNavigate, soundMuted, onToggleSound, networkState, onReconnectMultiplayer }) {
  return (
    <nav
      aria-label="Main menu"
      className="absolute top-0 inset-x-0 z-20 flex items-center justify-between gap-3 px-5 sm:px-8 py-4"
    >
      {/* Wordmark */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="focus-ring flex items-center gap-2.5 rounded-xl cursor-pointer"
        aria-label="Ocean Cleanup — back to top"
      >
        <span className="w-9 h-9 rounded-xl bg-ocean border border-white/25 shadow-[0_8px_20px_-10px_rgba(15,134,196,0.9)] flex items-center justify-center text-white">
          <Icon name="wave" size={20} />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-foam font-extrabold tracking-tight text-base sm:text-lg">
            Ocean<span className="text-cyan-soft">Cleanup</span>
          </span>
          <span className="block text-foam/50 text-[0.6rem] font-bold tracking-[0.22em] uppercase">
            Eco Simulator
          </span>
        </span>
      </button>

      {/* Links */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <MultiplayerStatusChip
          networkState={networkState}
          onReconnect={onReconnectMultiplayer}
        />
        <GameButton text="How to Play" icon="book" variant="ghost" size="auto"
          className="hidden md:flex py-2! px-4! text-sm" onClick={() => onNavigate('HOW_TO_PLAY')} />
        <GameButton text="Settings" icon="sliders" variant="ghost" size="auto"
          className="hidden md:flex py-2! px-4! text-sm" onClick={() => onNavigate('SETTINGS')} />

        <button
          onClick={onToggleSound}
          className="btn-ui focus-ring w-10 h-10 rounded-xl bg-ink-deep/60 border border-cyan-soft/20 text-foam/90 flex items-center justify-center cursor-pointer hover:bg-ink-deep/90"
          aria-label={soundMuted ? 'Unmute sound' : 'Mute sound'}
          title={soundMuted ? 'Unmute sound' : 'Mute sound'}
        >
          <Icon name={soundMuted ? 'sound-off' : 'sound-on'} size={18} />
        </button>

        <GameButton text="Play" icon="play" size="auto"
          className="py-2.5! px-5! text-sm sm:text-base"
          onClick={() => onNavigate('GAME')} />
      </div>
    </nav>
  );
}

function Hero({ onNavigate, soundMuted, onToggleSound, networkState, onReconnectMultiplayer, onStartGame }) {
  const [customName, setCustomName] = React.useState(() => {
    return networkState?.username || networkState?.tempUsername || (typeof localStorage !== 'undefined' ? localStorage.getItem('ocean_cleanup_username') : '') || '';
  });
  const [adminCode, setAdminCode] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [isJoining, setIsJoining] = React.useState(false);

  const isAdminCallsign = customName.trim().toLowerCase() === 'admin';

  React.useEffect(() => {
    if (!customName && (networkState?.username || networkState?.tempUsername)) {
      setCustomName(networkState.username || networkState.tempUsername);
    }
  }, [networkState?.username, networkState?.tempUsername]);

  // Clear admin code and error message when callsign changes
  React.useEffect(() => {
    setErrorMessage('');
    if (!isAdminCallsign) {
      setAdminCode('');
    }
  }, [customName, isAdminCallsign]);

  const handleRandomizeName = () => {
    const adjectives = ['Eco', 'Swift', 'Ocean', 'Tidal', 'Coral', 'Solar', 'Aqua', 'Wave', 'Brave', 'Clean'];
    const nouns = ['Sailor', 'Captain', 'Skipper', 'Navigator', 'Ranger', 'Voyager', 'Pilot', 'Keeper', 'Hero', 'Rover'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(100 + Math.random() * 900);
    setCustomName(`${adj}${noun}${num}`);
  };

  const handlePlay = async () => {
    if (isJoining) return;
    setErrorMessage('');

    if (typeof document !== 'undefined' && document.activeElement?.blur) {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined' && window.focus) {
      window.focus();
    }

    const finalName = customName.trim() || networkState?.tempUsername || 'EcoSailor';
    const isTryingAdmin = finalName.toLowerCase() === 'admin';

    if (isTryingAdmin && !adminCode.trim()) {
      setErrorMessage('Admin Access Code is required to log in as administrator.');
      return;
    }

    setIsJoining(true);
    try {
      if (onStartGame) {
        const res = await onStartGame(finalName, isTryingAdmin ? adminCode.trim() : '');
        if (res && res.success === false) {
          setErrorMessage(res.message || res.error || 'Failed to join multiplayer.');
          setIsJoining(false);
          return;
        }
      } else {
        onNavigate('GAME');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error joining multiplayer session.');
      setIsJoining(false);
      return;
    }

    setIsJoining(false);

    if (typeof localStorage !== 'undefined' && !isTryingAdmin) {
      try {
        localStorage.setItem('ocean_cleanup_username', finalName);
      } catch (e) {}
    }
  };

  return (
    <section className="relative min-h-screen flex flex-col" aria-label="Welcome">
      {/* Lightweight 3D game world — the hero's backdrop */}
      <HeroScene />

      {/* Readability vignette behind the copy (left-weighted) */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(120%_120%_at_22%_30%,rgba(6,28,47,0.6)_0%,rgba(6,28,47,0.28)_45%,transparent_80%)]" />

      <Nav
        onNavigate={onNavigate}
        soundMuted={soundMuted}
        onToggleSound={onToggleSound}
        networkState={networkState}
        onReconnectMultiplayer={onReconnectMultiplayer}
      />

      {/* Copy block */}
      <div className="relative z-10 flex-1 flex items-center px-6 sm:px-10 md:px-20 pt-24 pb-16">
        <div className="max-w-2xl">
          <div className="anim-hero-rise inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-soft/30 text-cyan-soft text-xs sm:text-sm font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-aqua animate-pulse" />
            Low-poly ocean cleanup · free browser .io
          </div>

          <h1 className="anim-hero-rise anim-rise-1 mt-4 text-6xl sm:text-7xl md:text-8xl font-black text-foam tracking-tight leading-[0.95] drop-shadow-2xl">
            Ocean
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-soft via-aqua to-emerald-300">
              Cleanup
            </span>
          </h1>

          <p className="anim-hero-rise anim-rise-2 mt-5 text-lg sm:text-2xl text-foam/85 font-light leading-relaxed max-w-xl">
            Pilot your boat through a living harbour, reel in floating waste,
            and leave the water cleaner than you found it.
          </p>

          {/* Phase 2: Guest username input */}
          <div className="anim-hero-rise anim-rise-3 mt-7 max-w-sm w-full">
            <label
              htmlFor="guest-callsign"
              className="text-foam/75 text-xs font-bold tracking-wide flex items-center justify-between mb-1.5"
            >
              <span>Captain's Call Sign</span>
              <button
                type="button"
                onClick={handleRandomizeName}
                title="Generate new guest name"
                className="text-cyan-soft hover:text-aqua text-[0.72rem] font-bold cursor-pointer transition-colors"
              >
                🎲 Randomize
              </button>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-base pointer-events-none opacity-80">
                {isAdminCallsign ? '🛡️' : '⛵'}
              </span>
              <input
                id="guest-callsign"
                type="text"
                maxLength={16}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
                placeholder={networkState?.tempUsername || 'Enter call sign...'}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-ink-deep/80 border text-foam placeholder-foam/30 text-sm font-semibold tracking-wide backdrop-blur-md transition-all shadow-inner ${
                  isAdminCallsign
                    ? 'border-amber-400/60 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30'
                    : 'border-cyan-soft/30 hover:border-cyan-soft/50 focus:border-aqua focus:outline-none focus:ring-2 focus:ring-aqua/30'
                }`}
              />
            </div>

            {/* Requirement 2: Admin Access Code field shown when username is "admin" */}
            {isAdminCallsign && (
              <div className="mt-3 anim-pop">
                <label
                  htmlFor="admin-access-code"
                  className="text-amber-300 text-xs font-bold tracking-wide flex items-center justify-between mb-1.5"
                >
                  <span className="flex items-center gap-1.5">
                    <span>🔐</span>
                    <span>Admin Access Code</span>
                  </span>
                  <span className="text-[0.65rem] px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/40 uppercase font-mono font-bold tracking-widest">
                    Server Verified
                  </span>
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-base pointer-events-none opacity-80">🔑</span>
                  <input
                    id="admin-access-code"
                    type="password"
                    value={adminCode}
                    onChange={(e) => {
                      setAdminCode(e.target.value);
                      setErrorMessage('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
                    placeholder="Enter admin code..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-ink-deep/95 border border-amber-400/50 hover:border-amber-400/80 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/40 text-amber-100 placeholder-amber-200/30 text-sm font-semibold tracking-wide backdrop-blur-md transition-all shadow-inner"
                  />
                </div>
              </div>
            )}

            {/* Error display (e.g. Duplicate username, invalid admin code, reserved name) */}
            {errorMessage && (
              <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-200 text-xs font-semibold flex items-start gap-2 anim-shake">
                <span className="text-sm">⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* CTA row */}
          <div className="anim-hero-rise anim-rise-3 mt-5 flex flex-wrap items-center gap-4">
            <button
              onClick={handlePlay}
              disabled={isJoining}
              className={`btn-ui focus-ring group flex items-center gap-3 px-9 py-4 rounded-2xl text-white text-xl font-extrabold tracking-wide border shadow-[0_18px_44px_-16px_rgba(15,134,196,1)] cursor-pointer transition-all ${
                isAdminCallsign
                  ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:brightness-110 border-amber-300/40'
                  : 'bg-ocean hover:bg-[#1799dc] border-white/30'
              } ${isJoining ? 'opacity-70 cursor-wait' : ''}`}
            >
              <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center transition-transform duration-150 group-hover:scale-110">
                <Icon name={isAdminCallsign ? 'shield' : 'play'} size={18} />
              </span>
              {isJoining ? 'CONNECTING...' : isAdminCallsign ? 'ADMIN LOGIN' : 'PLAY NOW'}
            </button>

            <GameButton text="How to Play" icon="book" variant="secondary" size="auto"
              className="py-4! md:hidden" onClick={() => onNavigate('HOW_TO_PLAY')} />
            <GameButton text="How to Play" icon="book" variant="ghost" size="auto"
              className="hidden md:flex py-4! px-6!" onClick={() => onNavigate('HOW_TO_PLAY')} />
          </div>

          {/* Real, current game facts — nothing invented */}
          <div className="anim-hero-rise anim-rise-4 mt-10 flex flex-wrap gap-2.5">
            {[
              { label: 'Floating waste', value: 'up to 600' },
              { label: 'World', value: 'harbour + open sea' },
              { label: 'Day / night', value: 'dynamic' },
            ].map((s) => (
              <div
                key={s.label}
                className="px-3.5 py-2 rounded-xl bg-ink-deep/55 border border-cyan-soft/15 backdrop-blur-md"
              >
                <span className="block text-[0.58rem] font-bold tracking-[0.18em] uppercase text-cyan-soft/80">
                  {s.label}
                </span>
                <span className="block text-foam font-bold text-sm mt-0.5">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="relative z-10 pb-6 flex justify-center">
        <span className="text-foam/40 text-xs font-bold tracking-[0.3em] uppercase animate-bounce">
          ▼ more below
        </span>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: 'ship',
    title: 'BOAT',
    color: 'text-cyan-soft',
    text: 'Take the wheel of a sturdy utility boat. Heavy hull, real momentum.',
  },
  {
    icon: 'trash',
    title: 'CLEAN',
    color: 'text-aqua',
    text: 'Spot the aqua ring, cast your line with F, and reel the waste in.',
  },
  {
    icon: 'star',
    title: 'HAUL',
    color: 'text-sand',
    text: 'Every item you reel in is counted aboard your boat.',
  },
];

function InfoSection() {
  return (
    <section className="relative bg-[#071c30] border-t border-cyan-soft/10" aria-label="About the game">
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-16 sm:py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-black text-foam tracking-tight">
          Clean the ocean
        </h2>
        <p className="mt-3 text-foam/60 text-base sm:text-lg max-w-xl mx-auto">
          Pilot your boat, collect floating waste, and restore the harbour —
          one haul at a time.
        </p>

        <div className="mt-10 grid sm:grid-cols-3 gap-4 text-left">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="panel-dark p-6 transition-transform duration-150 hover:-translate-y-1"
            >
              <span className={`w-11 h-11 rounded-xl bg-white/5 border border-cyan-soft/20 flex items-center justify-center ${f.color}`}>
                <Icon name={f.icon} size={22} />
              </span>
              <h3 className="mt-4 text-foam font-extrabold tracking-[0.14em] text-sm">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm text-foam/60 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Stylized SVG diorama of the actual harbour layout — zero downloads. */
function HarbourDiorama() {
  return (
    <svg
      viewBox="0 0 1200 430"
      className="w-full h-auto block"
      role="img"
      aria-label="Stylized view of the harbour: quay, cranes, dock and boat on the water"
    >
      {/* Sky */}
      <defs>
        <linearGradient id="dio-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a2f4e" />
          <stop offset="100%" stopColor="#7cc4de" />
        </linearGradient>
        <linearGradient id="dio-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1587a8" />
          <stop offset="100%" stopColor="#0b4d74" />
        </linearGradient>
      </defs>
      <rect width="1200" height="260" fill="url(#dio-sky)" />
      <circle cx="985" cy="86" r="42" fill="#ffe6a8" opacity="0.9" />
      <circle cx="985" cy="86" r="66" fill="#ffe6a8" opacity="0.18" />

      {/* Gulls */}
      <path d="M180 84 q10 -9 20 0 q10 -9 20 0" stroke="#eaf6fd" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M258 116 q8 -7 16 0 q8 -7 16 0" stroke="#eaf6fd" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.55" />

      {/* Harbour (rear) */}
      <g>
        {/* Rear quay */}
        <rect x="320" y="168" width="560" height="42" fill="#b9bdc2" />
        <rect x="320" y="210" width="560" height="10" fill="#8b8d92" />
        {/* Wings */}
        <rect x="300" y="176" width="96" height="88" fill="#a3a8ad" />
        <rect x="804" y="176" width="96" height="88" fill="#a3a8ad" />
        {/* Central pier */}
        <rect x="576" y="212" width="48" height="84" fill="#a06a3c" />
        <rect x="576" y="212" width="48" height="7" fill="#7a4e28" />
        {/* Building */}
        <rect x="520" y="120" width="160" height="50" fill="#e8e4da" />
        <rect x="514" y="112" width="172" height="10" rx="2" fill="#8a4a30" />
        <rect x="528" y="136" width="144" height="12" fill="#7fa8b8" />
        {/* Cranes */}
        <g fill="#c1492f">
          <rect x="368" y="96" width="16" height="74" />
          <rect x="330" y="104" width="110" height="8" />
          <rect x="816" y="96" width="16" height="74" />
          <rect x="760" y="104" width="110" height="8" />
        </g>
        <g fill="#3c4043">
          <rect x="420" y="112" width="4" height="34" />
          <rect x="868" y="112" width="4" height="34" />
        </g>
        {/* Palms */}
        <g stroke="#5d3a1e" strokeWidth="5" strokeLinecap="round">
          <line x1="272" y1="236" x2="268" y2="206" />
          <line x1="928" y1="236" x2="932" y2="206" />
        </g>
        <g fill="#2e9d6f">
          <ellipse cx="264" cy="200" rx="16" ry="8" transform="rotate(-24 264 200)" />
          <ellipse cx="278" cy="198" rx="16" ry="8" transform="rotate(22 278 198)" />
          <ellipse cx="936" cy="200" rx="16" ry="8" transform="rotate(24 936 200)" />
          <ellipse cx="922" cy="198" rx="16" ry="8" transform="rotate(-22 922 198)" />
        </g>
      </g>

      {/* Sea */}
      <rect x="0" y="264" width="1200" height="166" fill="url(#dio-sea)" />
      {/* Wave lines */}
      <g stroke="#9fd9ef" strokeWidth="3" strokeLinecap="round" opacity="0.35">
        <line x1="90" y1="300" x2="190" y2="300" />
        <line x1="1020" y1="316" x2="1130" y2="316" />
        <line x1="640" y1="352" x2="760" y2="352" />
        <line x1="150" y1="386" x2="270" y2="386" />
      </g>

      {/* Boat — the focal point (CSS bob) */}
      <g className="dio-boat">
        <ellipse cx="600" cy="322" rx="86" ry="9" fill="#062c46" opacity="0.35" />
        <path d="M522 296 h140 l-16 22 h-108 z" fill="#e9f4f7" />
        <path d="M522 296 h140 l-4 6 h-132 z" fill="#0f86c4" />
        <rect x="576" y="266" width="52" height="32" rx="3" fill="#ffffff" />
        <rect x="576" y="276" width="52" height="10" fill="#2e6e96" />
        <rect x="570" y="258" width="64" height="9" rx="2" fill="#0f86c4" />
        <line x1="622" y1="258" x2="622" y2="228" stroke="#3c4043" strokeWidth="4" strokeLinecap="round" />
        <circle cx="622" cy="225" r="5" fill="#f2a33c" />
        <line x1="662" y1="296" x2="662" y2="268" stroke="#3c4043" strokeWidth="3" />
        <line x1="662" y1="268" x2="690" y2="276" stroke="#3c4043" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* Floating trash (staggered bob) */}
      <g className="dio-trash" style={{ animationDelay: '0.6s' }}>
        <rect x="420" y="316" width="22" height="9" rx="2" fill="#d93a2f" />
        <circle cx="472" cy="330" r="8" fill="none" stroke="#f2a33c" strokeWidth="5" />
        <rect x="760" y="322" width="20" height="8" rx="2" fill="#4a6072" />
      </g>
      <g className="dio-trash" style={{ animationDelay: '1.4s' }}>
        <circle cx="330" cy="356" r="7" fill="none" stroke="#19b89a" strokeWidth="5" />
        <rect x="856" y="362" width="18" height="8" rx="2" fill="#d93a2f" />
      </g>

      {/* Foreground dock corner (left) */}
      <g>
        <rect x="-20" y="368" width="230" height="62" fill="#a06a3c" />
        <rect x="-20" y="368" width="230" height="9" fill="#7a4e28" />
        <g fill="#5d3a1e">
          <rect x="30" y="398" width="14" height="34" />
          <rect x="130" y="398" width="14" height="34" />
        </g>
        <rect x="96" y="352" width="20" height="18" fill="#d8b377" />
        <rect x="122" y="358" width="20" height="12" fill="#4a6072" />
      </g>
    </svg>
  );
}

function ShowcaseSection({ onNavigate }) {
  return (
    <section className="relative bg-[#04121f] border-t border-cyan-soft/10" aria-label="Game world">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black text-foam tracking-tight">
              One harbour. One boat. One ocean to clean.
            </h2>
            <p className="mt-2 text-foam/60 text-base sm:text-lg">
              Every corner of the world is built for the cleanup — the quay, the
              cranes, the pier, and the waste drifting between them.
            </p>
          </div>
          <GameButton text="Start cleaning" icon="play" size="auto"
            onClick={() => onNavigate('GAME')} />
        </div>

        <div className="panel-dark overflow-hidden rounded-3xl!">
          <HarbourDiorama />
          <div className="flex flex-wrap gap-2 px-5 py-4 border-t border-cyan-soft/10 bg-ink-deep/40">
            {['Harbour', 'Central pier', 'Utility boat', 'Cranes', 'Floating waste', 'Day / night cycle'].map((c) => (
              <span
                key={c}
                className="px-3 py-1 rounded-full bg-white/5 border border-cyan-soft/15 text-foam/70 text-xs font-semibold tracking-wide"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ onNavigate }) {
  return (
    <footer className="bg-[#020b14] border-t border-cyan-soft/10">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-cyan-soft font-semibold text-sm">Together for a cleaner ocean.</p>
          <p className="text-foam/40 text-xs mt-0.5">
            Save marine life · Reduce plastic pollution · Built with Three.js &amp; React
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GameButton text="Credits" icon="book" variant="ghost" size="auto"
            className="py-2! px-4! text-sm" onClick={() => onNavigate('CREDITS')} />
          <GameButton text="Play now" icon="play" size="auto"
            className="py-2! px-4! text-sm" onClick={() => onNavigate('GAME')} />
        </div>
      </div>
    </footer>
  );
}

function MainMenu({ onNavigate, soundMuted, onToggleSound, networkState, onReconnectMultiplayer, onStartGame }) {
  return (
    <div className="w-screen h-screen bg-[#04233b] overflow-hidden">
      <div className="h-full overflow-y-auto menu-scroll">
        <Hero
          onNavigate={onNavigate}
          soundMuted={soundMuted}
          onToggleSound={onToggleSound}
          networkState={networkState}
          onReconnectMultiplayer={onReconnectMultiplayer}
          onStartGame={onStartGame}
        />
        <InfoSection />
        <ShowcaseSection onNavigate={onNavigate} />
        <Footer onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export default MainMenu;
