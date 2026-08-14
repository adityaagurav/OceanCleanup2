import React, { useState } from 'react';
import GameButton from '../components/GameButton';
import Icon from '../components/Icon';
import { OceanBackdrop } from '../components/OceanBackdrop';

const TABS = [
  { id: 'audio',    label: 'Audio',    icon: 'sound-on'  },
  { id: 'graphics', label: 'Graphics', icon: 'star'      },
  { id: 'controls', label: 'Controls', icon: 'sliders'   },
  { id: 'gameplay', label: 'Gameplay', icon: 'target'    },
];

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-5 border-b last:border-0" style={{ borderColor: 'var(--divider)' }}>
      <div className="min-w-[10rem]">
        <h3 className="chip-text text-base font-semibold">{label}</h3>
        {hint && <p className="chip-sub text-sm mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({ on, onClick, onLabel, offLabel }) {
  return (
    <button
      onClick={onClick}
      className={`btn-ui focus-ring px-4 py-2 rounded-xl text-sm font-semibold border transition-colors cursor-pointer ${
        on
          ? 'bg-ocean text-white border-white/25'
          : 'bg-white/5 text-foam/60 border-white/15 hover:bg-white/10'
      }`}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

function Settings({ onNavigate, settings, onUpdateSettings }) {
  const [tab, setTab] = useState('audio');

  return (
    <OceanBackdrop>
      <div className="h-full flex flex-col items-center menu-scroll overflow-y-auto px-6 py-8">
        <div className="w-full max-w-2xl my-auto py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-foam flex items-center gap-3">
                <Icon name="sliders" size={28} className="text-cyan-soft" />
                Settings
              </h2>
              <p className="text-foam/60 mt-1">Tune your ocean cleaning experience</p>
            </div>
            <GameButton text="Back" icon="arrow-left" variant="ghost" size="auto"
              onClick={() => onNavigate('MENU')} />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-2xl border border-cyan-soft/15 bg-ink-deep/60 backdrop-blur-md mb-6 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`btn-ui focus-ring flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap cursor-pointer ${
                  tab === t.id
                    ? 'bg-ocean text-white shadow-[0_8px_20px_-10px_rgba(15,134,196,0.9)]'
                    : 'text-foam/60 hover:text-foam hover:bg-white/5'
                }`}
              >
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div className="panel-dark px-6 py-2">
            {tab === 'audio' && (
              <>
                <Row label="Sound" hint="In-game effects & synthesized ocean audio">
                  <Toggle
                    on={!settings.soundMuted}
                    onLabel="Enabled"
                    offLabel="Muted"
                    onClick={() => onUpdateSettings({ soundMuted: !settings.soundMuted })}
                  />
                </Row>
                <Row label="Master volume" hint="Applies to every sound at once">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(settings.volume * 100)}
                    onChange={e => onUpdateSettings({ volume: e.target.value / 100 })}
                    className="w-40 cursor-pointer"
                    aria-label="Master volume"
                  />
                  <span className="chip-value w-10 text-right">{Math.round(settings.volume * 100)}%</span>
                </Row>
              </>
            )}

            {tab === 'graphics' && (
              <Row label="Quality preset" hint="Applies when a new game starts">
                <select
                  value={settings.quality}
                  onChange={e => onUpdateSettings({ quality: e.target.value })}
                  className="bg-ink-deep border border-cyan-soft/25 text-cyan-soft font-semibold px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-soft cursor-pointer"
                >
                  <option value="low">Performance</option>
                  <option value="balanced">Balanced</option>
                  <option value="high">Quality</option>
                </select>
              </Row>
            )}

            {tab === 'controls' && (
              <div className="py-2 space-y-4">
                <p className="chip-sub text-sm">Fixed controls — the boat handles like a heavy hull, so steer early.</p>
                {[
                  { keys: 'W / ↑', desc: 'Throttle forward' },
                  { keys: 'S / ↓', desc: 'Reverse / brake' },
                  { keys: 'A / D', desc: 'Steer left / right' },
                  { keys: 'MOUSE', desc: 'Drag to look around (click to lock cursor)' },
                  { keys: 'F',     desc: 'Reel in nearest trash' },
                  { keys: 'E',     desc: 'Board / leave the boat (near it, or at the dock)' },
                  { keys: 'F3',    desc: 'Debug overlay' },
                ].map(({ keys, desc }) => (
                  <div key={desc} className="flex items-center justify-between gap-4">
                    <span className="keycap">{keys}</span>
                    <span className="chip-text text-sm">{desc}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'gameplay' && (
              <>
                <Row label="Trash density" hint="How much debris floats in the ocean">
                  <select
                    value={settings.trashDensity}
                    onChange={e => onUpdateSettings({ trashDensity: e.target.value })}
                    className="bg-ink-deep border border-cyan-soft/25 text-cyan-soft font-semibold px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-soft cursor-pointer"
                  >
                    <option value="normal">Standard (250 items)</option>
                    <option value="high">High density (400 items)</option>
                    <option value="mega">Garbage patch (600 items)</option>
                  </select>
                </Row>
                <Row label="Speed unit" hint="How boat speed is shown in the HUD">
                  <div className="flex gap-1 p-1 rounded-xl border border-cyan-soft/15 bg-ink-deep/60">
                    {[['kmh', 'KM/H'], ['kn', 'KNOTS']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => onUpdateSettings({ speedUnit: val })}
                        className={`btn-ui focus-ring px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide cursor-pointer ${
                          settings.speedUnit === val
                            ? 'bg-ocean text-white'
                            : 'text-foam/60 hover:text-foam'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label="Mission goal" hint="Items to collect before the mission completes">
                  <span className="chip-value text-lg">20</span>
                </Row>
              </>
            )}
          </div>
        </div>
      </div>
    </OceanBackdrop>
  );
}

export default Settings;
