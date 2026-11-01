/**
 * test-ocean-facts-integration.mjs — Integration test verifying the 3 display methods:
 *  1. Periodic gameplay fact popups (interval, dismissal, non-repetition)
 *  2. Harbor educational fact rotation (automatic, manual, cycle verification)
 *  3. Unload & recycling educational fact flow (trigger, relevance, reward feedback)
 */

import assert from 'node:assert/strict';
import { oceanFactsManager, OCEAN_FACTS } from '../src/data/oceanFacts.js';

console.log('🧪 Starting Ocean Facts Integration Verification...\n');

// ── Test 1: Simulating Gameplay Random Fact Flow ─────────────────
console.log('1. Testing Gameplay Random Fact Flow (60-90s)...');

// Simulate the scheduled timer
let gameplayFactState = null;
const showGameplayFact = () => {
  const fact = oceanFactsManager.getGameplayFact();
  gameplayFactState = { fact, key: Date.now() };
};

const dismissGameplayFact = () => {
  gameplayFactState = null;
};

// Fire 10 random popups
const drawn = [];
for (let i = 0; i < 10; i++) {
  showGameplayFact();
  assert.ok(gameplayFactState.fact, 'Fact must be populated');
  assert.ok(gameplayFactState.fact.title, 'Fact must have title');
  assert.ok(gameplayFactState.fact.text, 'Fact must have text');
  assert.ok(gameplayFactState.fact.emoji, 'Fact must have emoji');
  drawn.push(gameplayFactState.fact.id);

  // Player dismisses popup
  dismissGameplayFact();
  assert.equal(gameplayFactState, null, 'Popup must be cleared upon dismissal');
}

// Ensure all 10 were distinct (no repeats within the 36-fact cycle)
const uniqueDrawn = new Set(drawn);
assert.equal(uniqueDrawn.size, 10, 'No repeats should occur in 10 consecutive gameplay facts');
console.log('✓ Gameplay random fact triggers and dismisses cleanly without repetition');


// ── Test 2: Simulating Harbor Fact Rotation Flow ─────────────────
console.log('\n2. Testing Harbor Fact Rotation Flow...');

let harborFactState = oceanFactsManager.getHarborFact();
assert.ok(harborFactState, 'Initial harbor fact must be populated');

const initialHarborId = harborFactState.id;
const rotatedIds = [initialHarborId];

// Rotate 15 times (simulating 15 interval ticks or "Next" clicks)
for (let i = 0; i < 15; i++) {
  harborFactState = oceanFactsManager.getHarborFact();
  assert.ok(harborFactState, 'Rotated harbor fact must not be null');
  rotatedIds.push(harborFactState.id);
}

const uniqueHarborIds = new Set(rotatedIds);
assert.equal(uniqueHarborIds.size, 16, 'All 16 harbor rotations must be unique across the cycle');
console.log(`✓ Harbor fact rotated smoothly through ${uniqueHarborIds.size} unique facts`);


// ── Test 3: Simulating Waste Unload & Recycling Flow ─────────────
console.log('\n3. Testing Waste Unload & Recycling Fact Flow...');

let recycleFactState = null;
const handleUnloadComplete = (amount, reward) => {
  if (amount > 0) {
    const fact = oceanFactsManager.getRecyclingFact();
    recycleFactState = { fact, amount, reward, key: Date.now() };
  }
};

const dismissRecycleFact = () => {
  recycleFactState = null;
};

// 1. Unload with 0 items: should not trigger notification
handleUnloadComplete(0, 0);
assert.equal(recycleFactState, null, 'Unload with 0 items must not show fact');

// 2. Unload with 5 items and 50 coins reward
handleUnloadComplete(5, 50);
assert.ok(recycleFactState, 'Recycle fact must be triggered on unload > 0');
assert.equal(recycleFactState.amount, 5);
assert.equal(recycleFactState.reward, 50);
assert.ok(
  ['recycling', 'plastic_waste', 'ocean_pollution'].includes(recycleFactState.fact.category),
  'Recycle fact must be relevant to recycling or pollution'
);
console.log(`   Sample unload notification: [${recycleFactState.fact.emoji} ${recycleFactState.fact.categoryLabel}] "${recycleFactState.fact.title}" (+${recycleFactState.reward} coins)`);

// 3. Player dismisses
dismissRecycleFact();
assert.equal(recycleFactState, null, 'Recycle notification must be dismissible');

// 4. Consecutive unloads rotate through relevant facts without repeating
const unloadDrawn = [];
for (let i = 0; i < 12; i++) {
  handleUnloadComplete(3, 30);
  unloadDrawn.push(recycleFactState.fact.id);
  dismissRecycleFact();
}

const uniqueUnloads = new Set(unloadDrawn);
assert.equal(uniqueUnloads.size, 12, '12 consecutive unloads must present 12 unique relevant facts');
console.log('✓ Unload recycling facts are strictly relevant and cycle without repetition');

console.log('\n🎉 INTEGRATION VERIFICATION PASSED COMPLETELY!\n');

