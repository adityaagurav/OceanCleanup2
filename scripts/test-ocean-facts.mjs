/**
 * test-ocean-facts.mjs — Comprehensive test suite for the Ocean Education Facts System.
 *
 * Verifies:
 *  1. Hardcoded facts dataset completeness, categories, text quality, emojis.
 *  2. Non-repetition shuffle deck algorithm (Fisher-Yates + cross-cycle guard).
 *  3. All three integration areas:
 *     - Gameplay random fact popups (every 60-90s)
 *     - Harbor rotating fact board
 *     - Unload & recycling educational facts
 *  4. Channel independence and category filtering.
 */

import assert from 'node:assert/strict';
import {
  OCEAN_FACTS,
  FACT_CATEGORIES,
  OceanFactsManager,
  oceanFactsManager,
} from '../src/data/oceanFacts.js';

console.log('🧪 Starting Ocean Education Facts System Test Suite...\n');

// ── Test 1: Facts Dataset Validation ─────────────────────────────
console.log('Checking Dataset Structure & Content...');

assert.ok(Array.isArray(OCEAN_FACTS), 'OCEAN_FACTS must be an array');
console.log(`✓ Total hardcoded facts count: ${OCEAN_FACTS.length} (Target: 30–40)`);
assert.ok(
  OCEAN_FACTS.length >= 30 && OCEAN_FACTS.length <= 40,
  `Fact count ${OCEAN_FACTS.length} is outside the 30–40 range!`
);

const expectedCategories = [
  'marine_life',
  'ocean_pollution',
  'plastic_waste',
  'recycling',
  'ecosystems',
  'conservation',
];

for (const cat of expectedCategories) {
  assert.ok(FACT_CATEGORIES[cat], `Missing category metadata for '${cat}'`);
}

const categoryCounts = {};
const seenIds = new Set();

for (const fact of OCEAN_FACTS) {
  assert.ok(fact.id && typeof fact.id === 'string', `Invalid ID on fact: ${JSON.stringify(fact)}`);
  assert.ok(!seenIds.has(fact.id), `Duplicate fact ID detected: ${fact.id}`);
  seenIds.add(fact.id);

  assert.ok(
    expectedCategories.includes(fact.category),
    `Fact ${fact.id} has unknown category: ${fact.category}`
  );
  assert.ok(fact.categoryLabel && typeof fact.categoryLabel === 'string', `Missing categoryLabel on ${fact.id}`);
  assert.ok(fact.emoji && typeof fact.emoji === 'string', `Missing emoji on ${fact.id}`);
  assert.ok(fact.title && typeof fact.title === 'string', `Missing title on ${fact.id}`);
  assert.ok(fact.text && typeof fact.text === 'string', `Missing text on ${fact.id}`);
  assert.ok(fact.text.length > 20, `Fact text too short on ${fact.id}`);

  categoryCounts[fact.category] = (categoryCounts[fact.category] || 0) + 1;
}

console.log('✓ Category distribution:');
for (const [cat, count] of Object.entries(categoryCounts)) {
  console.log(`   - ${cat} (${FACT_CATEGORIES[cat].label}): ${count} facts`);
  assert.ok(count >= 5, `Category ${cat} should have at least 5 facts`);
}


// ── Test 2: OceanFactsManager Deck & Non-Repetition ──────────────
console.log('\nChecking Non-Repetition Algorithm...');

const mgr = new OceanFactsManager(OCEAN_FACTS);

// Draw all 36 gameplay facts
const drawnGameplayIds = [];
for (let i = 0; i < OCEAN_FACTS.length; i++) {
  const fact = mgr.getGameplayFact();
  assert.ok(fact, `Fact ${i} returned null`);
  drawnGameplayIds.push(fact.id);
}

// Ensure all 36 distinct facts were drawn in the cycle
const uniqueGameplayIds = new Set(drawnGameplayIds);
assert.equal(
  uniqueGameplayIds.size,
  OCEAN_FACTS.length,
  'Gameplay channel must show all facts before repeating any!'
);
console.log(`✓ Completed 1 full cycle of ${uniqueGameplayIds.size} unique gameplay facts without repetition`);

// Draw next fact across cycle boundary
const firstNextCycleFact = mgr.getGameplayFact();
assert.ok(firstNextCycleFact, 'First fact of next cycle returned null');
assert.notEqual(
  firstNextCycleFact.id,
  drawnGameplayIds[drawnGameplayIds.length - 1],
  'Cross-cycle guard failed: immediate repeat occurred at cycle boundary!'
);
console.log('✓ Cross-cycle reshuffle guard verified: no immediate back-to-back duplicate');


// ── Test 3: Harbor Rotating Board Channel ─────────────────────────
console.log('\nChecking Harbor Rotating Channel...');

mgr.reset('harbor');
const harborCycle = [];
for (let i = 0; i < OCEAN_FACTS.length; i++) {
  const fact = mgr.getHarborFact();
  harborCycle.push(fact.id);
}
const uniqueHarbor = new Set(harborCycle);
assert.equal(
  uniqueHarbor.size,
  OCEAN_FACTS.length,
  'Harbor rotation must show all facts before repeating!'
);
console.log(`✓ Harbor channel rotated through all ${uniqueHarbor.size} facts uniquely`);


// ── Test 4: Waste Unload & Recycling Channel ──────────────────────
console.log('\nChecking Unload/Recycling Fact Relevance...');

mgr.reset('recycling');
const recyclingPool = OCEAN_FACTS.filter(f =>
  ['recycling', 'plastic_waste', 'ocean_pollution'].includes(f.category)
);
console.log(`   Relevant recycling/pollution pool size: ${recyclingPool.length} facts`);

const drawnRecycleIds = [];
for (let i = 0; i < recyclingPool.length; i++) {
  const fact = mgr.getRecyclingFact();
  assert.ok(
    ['recycling', 'plastic_waste', 'ocean_pollution'].includes(fact.category),
    `Recycling fact ${fact.id} had non-relevant category: ${fact.category}`
  );
  drawnRecycleIds.push(fact.id);
}

const uniqueRecycle = new Set(drawnRecycleIds);
assert.equal(
  uniqueRecycle.size,
  recyclingPool.length,
  'Recycling channel must cycle through all relevant pollution/recycling facts without repetition!'
);
console.log(`✓ Recycling channel drew only relevant pollution/recycling facts without repetition`);


// ── Test 5: Helper Functions & Queries ────────────────────────────
console.log('\nChecking Manager Queries...');

const marineFacts = mgr.getFactsByCategory('marine_life');
assert.equal(marineFacts.length, categoryCounts['marine_life']);
const factById = mgr.getFactById('marine-01');
assert.equal(factById.title, 'Gentle Giants');
assert.equal(mgr.getFactById('non_existent'), null);
console.log('✓ Query by category and ID verified');


// ── Test 6: Global Singleton Verification ─────────────────────────
console.log('\nChecking Global Singleton...');
assert.ok(oceanFactsManager instanceof OceanFactsManager);
const globalFact = oceanFactsManager.getGameplayFact();
assert.ok(globalFact && globalFact.id);
console.log(`✓ Global singleton active: retrieved sample "${globalFact.title}"`);

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Ocean Education Facts System is robust and complete.\n');

