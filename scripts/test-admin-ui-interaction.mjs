import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

console.log('--- Testing Admin UI & Interaction Props (via Vite SSR Loader) ---');

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});

const { AdminPanel } = await vite.ssrLoadModule('/src/ui/AdminPanel.jsx');
const { default: HUD } = await vite.ssrLoadModule('/src/ui/HUD.jsx');

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log(`  ✔ ${label}`);
}
function eq(actual, expected, label) {
  assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`);
  passed += 1;
  console.log(`  ✔ ${label}`);
}

// 1. HUD Admin Button Visibility and Pointer Events
console.log('\n1. HUD Admin button rendering & pointer events');

const mockProgression = { boatTrashCount: 0, deliveredTrashCount: 0, coins: 10, boatLevel: 1 };
const mockCompass = { heading: 0, harbour: 0, dist: 100 };

// Render HUD without admin permissions
const hudUserHtml = renderToStaticMarkup(
  React.createElement(HUD, {
    progression: mockProgression,
    boatSpeed: '0.0',
    compass: mockCompass,
    isAdmin: false,
    networkState: { hasJoined: true, isAdmin: false },
  })
);
ok(!hudUserHtml.includes('title="Open Admin Console"'), 'Admin button is NOT rendered for normal players');

// Render HUD with admin permissions
const hudAdminHtml = renderToStaticMarkup(
  React.createElement(HUD, {
    progression: mockProgression,
    boatSpeed: '0.0',
    compass: mockCompass,
    isAdmin: true,
    networkState: { hasJoined: true, isAdmin: true },
  })
);
ok(hudAdminHtml.includes('title="Open Admin Console"'), 'Admin button IS rendered for authenticated admin');
ok(hudAdminHtml.includes('pointer-events-auto'), 'Admin button explicitly contains pointer-events-auto');
ok(hudAdminHtml.includes('Admin'), 'Admin button label is visible');
ok(hudAdminHtml.includes('🛡️'), 'Admin button renders the shield icon');

// 2. AdminPanel Rendering & Section Checks
console.log('\n2. AdminPanel structure & tabs');

// Closed panel renders null
const closedHtml = renderToStaticMarkup(
  React.createElement(AdminPanel, { isOpen: false, onClose: () => {}, localPlayerId: 'p_admin' })
);
eq(closedHtml, '', 'Closed AdminPanel renders null');

// Open panel renders full overlay with 3 tabs
const openHtml = renderToStaticMarkup(
  React.createElement(AdminPanel, { isOpen: true, onClose: () => {}, localPlayerId: 'p_admin' })
);
ok(openHtml.includes('Admin Console'), 'Displays Admin Console title');
ok(openHtml.includes('Administrator'), 'Displays Administrator badge');
ok(openHtml.includes('z-[60]'), 'Overlay uses high z-index (z-[60]) above all HUD elements');
ok(openHtml.includes('pointer-events-auto'), 'Overlay explicitly enables pointer-events-auto');

// Verify all 3 required sections
ok(openHtml.includes('Player Management'), 'Section 1: Player Management tab present');
ok(openHtml.includes('Player Reports'), 'Section 2: Player Reports tab present');
ok(openHtml.includes('Player Moderation'), 'Section 3: Player Moderation tab present');

// Verify controls
ok(openHtml.includes('Search player by username or ID...'), 'Search input is rendered');
ok(openHtml.includes('Close Panel'), 'Close button in footer is rendered');
ok(openHtml.includes('aria-label="Close admin panel"'), 'Close button in header is rendered');

await vite.close();
console.log(`\nALL ADMIN UI TESTS PASSED (${passed} assertions)`);
process.exit(0);
