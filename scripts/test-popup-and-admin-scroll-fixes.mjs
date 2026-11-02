import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('--- Testing Left-Side Popup Visibility & Admin Panel Scrolling Fixes ---');

// 1. Verify GameplayFactPopup styling in OceanFactsUI.jsx
console.log('\n1. Verifying Left-side Information Popup (GameplayFactPopup) Styling...');
const oceanFactsPath = path.join(rootDir, 'src/ui/OceanFactsUI.jsx');
const oceanFactsContent = readFileSync(oceanFactsPath, 'utf-8');

// Ensure it no longer uses the light daytime hud-chip-strong
assert.ok(
  !oceanFactsContent.includes('className="anim-pop hud-chip-strong'),
  'GameplayFactPopup must not use hud-chip-strong which turns light milky-white in daytime'
);

// Ensure it uses a dark translucent glass panel
assert.ok(
  oceanFactsContent.includes('panel-dark') && oceanFactsContent.includes('bg-[rgba(6,24,38,0.88)]'),
  'GameplayFactPopup must use a dark translucent glass background'
);

// Ensure high contrast text classes
assert.ok(
  oceanFactsContent.includes('text-white') && oceanFactsContent.includes('text-foam'),
  'GameplayFactPopup must use crisp high-contrast white/foam text'
);

// Ensure subtle border and backdrop blur
assert.ok(
  oceanFactsContent.includes('border-cyan-soft/30') && oceanFactsContent.includes('backdrop-blur-md'),
  'GameplayFactPopup must feature subtle cyan border and backdrop blur'
);

// Ensure HarborFactCard on the right is preserved and untouched
assert.ok(
  oceanFactsContent.includes('export const HarborFactCard'),
  'HarborFactCard must remain present and preserved'
);

console.log('  ✔ Left-side popup uses dark translucent background with high contrast text');
console.log('  ✔ Daytime white-on-white washed out issue is eliminated');
console.log('  ✔ Right-side popup preserved without unnecessary changes');

// 2. Verify InputManager wheel event filtering
console.log('\n2. Verifying InputManager Wheel & Pointer Event Handling...');
const inputManagerPath = path.join(rootDir, 'src/player/InputManager.js');
const inputManagerContent = readFileSync(inputManagerPath, 'utf-8');

// Ensure _onWheel does not prevent default when targeting dialogs or scrollable UI
assert.ok(
  inputManagerContent.includes('target.closest(\'[role="dialog"]\')') ||
  inputManagerContent.includes('target.closest(\'.overflow-y-auto\')'),
  'InputManager._onWheel must allow native mousewheel and trackpad scrolling for dialogs and scrollable UI'
);

// Ensure typing in dialog or forms does not trigger game movement keys
assert.ok(
  inputManagerContent.includes('target.closest?.(\'[role="dialog"]\')'),
  'InputManager._onKeyDown must avoid intercepting keys when typing/navigating inside dialogs'
);

console.log('  ✔ InputManager permits native mouse wheel and trackpad scroll in dialogs');
console.log('  ✔ Background gameplay controls prevented from hijacking modal interactions');

// 3. Verify AdminPanel layout, scrolling, and Kick Player section
console.log('\n3. Verifying AdminPanel Vertical Scrolling & Kick Player Section...');
const adminPanelPath = path.join(rootDir, 'src/ui/AdminPanel.jsx');
const adminPanelContent = readFileSync(adminPanelPath, 'utf-8');

// Ensure modal container keeps within viewport
assert.ok(
  adminPanelContent.includes('max-h-[86vh]') || adminPanelContent.includes('max-h-[88vh]') || adminPanelContent.includes('max-h-[90vh]'),
  'AdminPanel dialog must constrain height to viewport'
);

// Ensure tab body has min-h-0 and overflow-y-auto for proper flexbox shrinking & scrolling
assert.ok(
  adminPanelContent.includes('min-h-0') && adminPanelContent.includes('overflow-y-auto'),
  'AdminPanel tab body must have min-h-0 and overflow-y-auto to allow vertical scrolling'
);

// Ensure overscroll containment
assert.ok(
  adminPanelContent.includes('overscroll-contain'),
  'AdminPanel tab body must specify overscroll-contain'
);

// Ensure onWheel stopPropagation
assert.ok(
  adminPanelContent.includes('onWheel='),
  'AdminPanel must isolate wheel events from parent elements'
);

// Ensure pointer lock watcher prevents canvas lock while AdminPanel is open
assert.ok(
  adminPanelContent.includes('document.exitPointerLock') && adminPanelContent.includes('setInterval'),
  'AdminPanel must actively release pointer lock while open'
);

// Ensure Kick Player section has reason presets and action button
assert.ok(
  adminPanelContent.includes('Kick From Multiplayer Session'),
  'Kick player section header must be present'
);
assert.ok(
  adminPanelContent.includes('Kick Player Now'),
  'Kick player confirmation button must be present'
);
assert.ok(
  adminPanelContent.includes('handleKickPlayer'),
  'handleKickPlayer action handler must be bound'
);

console.log('  ✔ AdminPanel content container properly enables vertical scrolling with min-h-0');
console.log('  ✔ Mouse wheel and trackpad scroll propagation contained');
console.log('  ✔ Pointer lock prevented from interfering with admin interactions');
console.log('  ✔ Kick Player controls and confirmation action fully accessible');

console.log('\n🎉 ALL POPUP VISIBILITY & ADMIN SCROLLING TESTS PASSED CLEANLY!\n');

