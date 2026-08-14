import React from 'react';
import GameButton from '../components/GameButton';
import Icon from '../components/Icon';
import { OceanBackdrop } from '../components/OceanBackdrop';

const SECTIONS = [
  {
    title: 'Game',
    icon: 'ship',
    items: ['Built with Three.js, React, Vite & Tailwind CSS', 'Procedural ocean, harbour & boat systems', 'All audio synthesized live with the Web Audio API'],
  },
  {
    title: '3D Assets',
    icon: 'star',
    items: [
      'Quaternius — low-poly nature & survival kits',
      'J-Toastie — Rigged FPS Arms',
      'Fishing boat & trash models (CC / royalty-free)',
      'three.js Water shader',
    ],
  },
  {
    title: 'Typography',
    icon: 'book',
    items: ['Outfit — Google Fonts (modern geometric sans-serif)'],
  },
];

function Credits({ onNavigate }) {
  return (
    <OceanBackdrop>
      <div className="h-full flex flex-col items-center menu-scroll overflow-y-auto px-6 py-8">
        <div className="w-full max-w-xl my-auto py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-foam flex items-center gap-3">
                <Icon name="wave" size={28} className="text-cyan-soft" />
                Credits
              </h2>
              <p className="text-foam/60 mt-1">Thanks to the people & tools that made this possible</p>
            </div>
            <GameButton text="Back" icon="arrow-left" variant="ghost" size="auto"
              onClick={() => onNavigate('MENU')} />
          </div>

          <div className="space-y-5">
            {SECTIONS.map(section => (
              <div key={section.title} className="panel-dark p-6">
                <h3 className="text-lg font-bold text-cyan-soft mb-3 flex items-center gap-2">
                  <Icon name={section.icon} size={18} />
                  {section.title}
                </h3>
                <ul className="space-y-2">
                  {section.items.map(item => (
                    <li key={item} className="flex gap-2.5 chip-text text-sm">
                      <Icon name="wave" size={14} className="text-cyan-soft/60 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </OceanBackdrop>
  );
}

export default Credits;
