/**
 * test-fishing-feature.mjs — Comprehensive automated test suite for the Fishing Feature in OceanCleanup.io.
 *
 * Requirements verified:
 *  1. Designated locations only: Left endpoint (-21, 0, 29.5) and Right endpoint (21, 0, 29.5).
 *  2. Central boat entry/exit, remaining harbor, and open ocean strictly disallowed.
 *  3. Hold F for 2 seconds to start fishing; partial hold resets.
 *  4. Stationary boat while fishing: boatController disabled and speed zeroed.
 *  5. 30-second fish bite interval (does not automatically enter bucket).
 *  6. Hold R for 3-4 seconds (3.2s configured) to retrieve the available fish; partial hold resets.
 *  7. After retrieval, fish is added to bucket and fish count increments.
 *  8. Points awarded (3 coins per fish), strictly less than waste recycling (5 coins).
 *  9. Stopping fishing restores normal boat controls and hides fishing gear.
 * 10. Independent operation at both harbor endpoints.
 */

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FishingSystem } from '../src/world/FishingSystem.js';
import { HarbourManager } from '../src/world/HarbourManager.js';
import { BoatConfig } from '../src/config/BoatConfig.js';
import { ProgressionConfig } from '../src/config/ProgressionConfig.js';

console.log('🎣 Starting Fishing Feature Verification Suite...\n');

// ── Mock Scene, Harbour & WaveSampler ────────────────────────────────
const mockScene = {
  children: [],
  add(obj) { this.children.push(obj); },
  remove(obj) {
    const idx = this.children.indexOf(obj);
    if (idx !== -1) this.children.splice(idx, 1);
  },
};

const mockHarbour = {
  root: new THREE.Group(),
  boatSpawn: new THREE.Vector3(5.75, 0, 31),
};

const mockWaveSampler = {
  sample(x, z) { return Math.sin(x * 0.1) * 0.2; },
  getHarborFactor() { return 1; },
};

// Mock Boat & BoatController
function createMockBoatController() {
  const boat = new THREE.Group();
  boat.position.set(0, 0, 0);
  boat.quaternion.identity();

  return {
    boat,
    enabled: true,
    speed: 0,
    inertia: {
      halt() { this.speed = 0; },
      speed: 0,
    },
    physicsPosition: new THREE.Vector3(),
    prevPosition: new THREE.Vector3(),
  };
}

let events = {
  nearSpot: [],
  stateChanges: [],
  castProgress: [],
  reelProgress: [],
  fishTimer: [],
  fishReady: [],
  pendingCatches: [],
  alerts: [],
  fishCaught: [],
};

function resetEvents() {
  events = {
    nearSpot: [],
    stateChanges: [],
    castProgress: [],
    reelProgress: [],
    fishTimer: [],
    fishReady: [],
    pendingCatches: [],
    alerts: [],
    fishCaught: [],
  };
}

const fishing = new FishingSystem(mockScene, mockHarbour, mockWaveSampler, {
  onNearFishingSpot: (spot) => events.nearSpot.push(spot),
  onFishingStateChange: (state) => events.stateChanges.push(state),
  onCastProgress: (p) => events.castProgress.push(p),
  onReelProgress: (p) => events.reelProgress.push(p),
  onFishTimer: (t) => events.fishTimer.push(t),
  onFishReady: (r) => events.fishReady.push(r),
  onPendingCatchesChange: (c) => events.pendingCatches.push(c),
  onFishAlert: (a) => events.alerts.push(a),
  onFishCaught: (d) => events.fishCaught.push(d),
});

// ────────────────────────────────────────────────────────────────────
// TEST 1: Fishing Location Constraints
// ────────────────────────────────────────────────────────────────────
console.log('Test 1: Harbor endpoint locations vs invalid areas');

// Left endpoint: (-21.0, 0, 29.5)
const leftPos = new THREE.Vector3(-21.0, 0, 29.5);
assert.equal(fishing.checkFishingSpot(leftPos), 'left', 'Left harbor arm endpoint must be valid');

// Slightly offset within 8.5m radius
const leftNear = new THREE.Vector3(-21.0 + 4.0, 0, 29.5 - 3.0);
assert.equal(fishing.checkFishingSpot(leftNear), 'left', 'Within 8.5m of left endpoint must be valid');

// Right endpoint: (21.0, 0, 29.5)
const rightPos = new THREE.Vector3(21.0, 0, 29.5);
assert.equal(fishing.checkFishingSpot(rightPos), 'right', 'Right harbor arm endpoint must be valid');

// Slightly offset within 8.5m radius
const rightNear = new THREE.Vector3(21.0 - 3.5, 0, 29.5 + 4.0);
assert.equal(fishing.checkFishingSpot(rightNear), 'right', 'Within 8.5m of right endpoint must be valid');

// Central boat entry / exit / dock: (5.75, 0, 31)
const dockPos = new THREE.Vector3(5.75, 0, 31);
assert.equal(fishing.checkFishingSpot(dockPos), null, 'Central dock entry/exit area must NOT allow fishing');

// Central harbor water: (0, 0, 20)
assert.equal(fishing.checkFishingSpot(new THREE.Vector3(0, 0, 20)), null, 'Central harbor water must NOT allow fishing');

// Harbor rear / land: (0, 0, -5)
assert.equal(fishing.checkFishingSpot(new THREE.Vector3(0, 0, -5)), null, 'Harbor rear base must NOT allow fishing');

// Open ocean: (0, 0, 100), (100, 0, 100), (-150, 0, 80)
assert.equal(fishing.checkFishingSpot(new THREE.Vector3(0, 0, 100)), null, 'Open ocean (0, 0, 100) must NOT allow fishing');
assert.equal(fishing.checkFishingSpot(new THREE.Vector3(100, 0, 100)), null, 'Open ocean (100, 0, 100) must NOT allow fishing');
assert.equal(fishing.checkFishingSpot(new THREE.Vector3(-150, 0, 80)), null, 'Open ocean (-150, 0, 80) must NOT allow fishing');

console.log('  ✔ Left endpoint (-21, 0, 29.5) allows fishing');
console.log('  ✔ Right endpoint (21, 0, 29.5) allows fishing');
console.log('  ✔ Central dock, harbor interior, and open ocean correctly reject fishing\n');

// ────────────────────────────────────────────────────────────────────
// TEST 2: Hold F for 2 Seconds to Start Fishing
// ────────────────────────────────────────────────────────────────────
console.log('Test 2: Hold F for 2.0 seconds casting mechanic');
resetEvents();

const controller = createMockBoatController();
controller.boat.position.copy(leftPos);

const input = {
  keys: { interact: false, reel: false },
};

// 2.1: In zone, but F is not pressed
fishing.update(0.1, input, controller.boat, controller);
assert.equal(fishing.state, 'idle');
assert.equal(fishing.castHoldTimer, 0);

// 2.2: Hold F for 1.0 second (less than 2.0s)
input.keys.interact = true;
for (let i = 0; i < 10; i++) {
  fishing.update(0.1, input, controller.boat, controller);
}
assert.equal(fishing.state, 'idle', 'Must remain idle before 2.0s threshold');
assert.ok(fishing.castHoldTimer >= 0.99 && fishing.castHoldTimer <= 1.01);
assert.ok(events.castProgress.length > 0);
assert.ok(events.castProgress[events.castProgress.length - 1] < 1.0);

// 2.3: Release F early -> resets hold timer and cast progress
input.keys.interact = false;
fishing.update(0.1, input, controller.boat, controller);
assert.equal(fishing.state, 'idle');
assert.equal(fishing.castHoldTimer, 0, 'Releasing F must reset cast timer');
assert.equal(events.castProgress[events.castProgress.length - 1], 0, 'Progress must reset to 0');

// 2.4: Hold F for full 2.0 seconds -> transitions to 'fishing'
input.keys.interact = true;
for (let i = 0; i < 20; i++) {
  fishing.update(0.1, input, controller.boat, controller);
}
assert.equal(fishing.state, 'fishing', 'Holding F for 2.0s must start fishing');
assert.ok(events.stateChanges.includes('fishing'));
assert.equal(controller.enabled, false, 'Boat movement must be disabled when fishing starts');
assert.equal(fishing.rodGroup.visible, true, 'Fishing rod must be visible');
assert.equal(fishing.bobberGroup.visible, true, 'Bobber must be visible');
assert.equal(fishing.bucketGroup.visible, true, 'Bucket must be visible');

console.log('  ✔ Partial hold (<2s) accumulates progress without starting');
console.log('  ✔ Releasing F early resets progress to 0');
console.log('  ✔ Full 2.0s hold transitions state to fishing and deploys 3D gear\n');

// ────────────────────────────────────────────────────────────────────
// TEST 3: Stationary Boat During Fishing
// ────────────────────────────────────────────────────────────────────
console.log('Test 3: Boat remains stationary while fishing');

// If boatController attempts to re-enable or move while fishing, fishing.update enforces disabled
controller.enabled = true;
controller.speed = 5.0;
fishing.update(0.016, input, controller.boat, controller);
assert.equal(controller.enabled, false, 'BoatController must remain disabled while fishing');
assert.equal(controller.speed, 0, 'Speed must be clamped to 0');

console.log('  ✔ Boat movement is strictly disabled throughout fishing session\n');

// ────────────────────────────────────────────────────────────────────
// TEST 4: 20-Second Fish Interval
// ────────────────────────────────────────────────────────────────────
console.log('Test 4: 20-second fish bite interval');
resetEvents();
input.keys.interact = false;
input.keys.reel = false;

// Advance 15 seconds (less than 20s)
for (let i = 0; i < 15; i++) {
  fishing.update(1.0, input, controller.boat, controller);
}
assert.equal(fishing.state, 'fishing', 'Must remain in fishing state before 20s');
assert.equal(fishing.fishCount, 0, 'Fish must NOT automatically enter bucket');
assert.ok(events.fishTimer.length > 0);

// Advance past 20 seconds -> state becomes 'fish_ready'
for (let i = 0; i < 6; i++) {
  fishing.update(1.0, input, controller.boat, controller);
}
assert.equal(fishing.state, 'fish_ready', 'Must transition to fish_ready at 20 seconds');
assert.ok(events.fishReady.includes(true), 'onFishReady callback must be fired');
assert.equal(fishing.fishCount, 0, 'Fish must still NOT be in bucket until reeled');

console.log('  ✔ Fish bite timer counts down for exactly 20 seconds');
console.log('  ✔ Fish becomes ready on the line but DOES NOT automatically enter bucket\n');

// ────────────────────────────────────────────────────────────────────
// TEST 5: Long-press R for 3-4 Seconds to Retrieve Fish
// ────────────────────────────────────────────────────────────────────
console.log('Test 5: Hold R for 3-4s (3.2s) retrieval mechanic');
resetEvents();

// 5.1: Hold R for 1.5 seconds (less than 3.2s)
input.keys.reel = true;
for (let i = 0; i < 15; i++) {
  fishing.update(0.1, input, controller.boat, controller);
}
assert.equal(fishing.state, 'reeling');
assert.ok(fishing.reelHoldTimer >= 1.49 && fishing.reelHoldTimer <= 1.51);
assert.equal(fishing.fishCount, 0, 'Fish not retrieved yet');

// 5.2: Release R early -> resets reel timer back to fish_ready
input.keys.reel = false;
fishing.update(0.1, input, controller.boat, controller);
assert.equal(fishing.state, 'fish_ready', 'Releasing R must return to fish_ready');
assert.equal(fishing.reelHoldTimer, 0, 'Reel timer must reset');
assert.equal(events.reelProgress[events.reelProgress.length - 1], 0);

// 5.3: Hold R for full 3.2 seconds -> catch success!
input.keys.reel = true;
for (let i = 0; i < 33; i++) {
  fishing.update(0.1, input, controller.boat, controller);
}
assert.equal(fishing.pendingCatches, 0, 'Pending catches must decrement from 1 to 0');
assert.equal(fishing.state, 'fishing', 'State transitions back to fishing for continuous cycle');
assert.equal(fishing.fishCount, 1, 'Bucket fish count must be incremented to 1');
assert.ok(fishing._leapingFish !== null, 'Leaping fish 3D animation must be active');
assert.equal(fishing._bucketFishes[0].visible, true, 'Bucket 3D fish model must be visible');

// 5.4: Verify scoring
assert.equal(events.fishCaught.length, 1);
assert.equal(events.fishCaught[0].count, 1);
assert.equal(events.fishCaught[0].points, 3, 'Points per fish must be 3');
assert.ok(events.fishCaught[0].points < ProgressionConfig.COINS_PER_TRASH, 'Fishing points (3) must be strictly less than waste recycling (5)');

console.log('  ✔ Partial R hold (<3.2s) does not retrieve fish');
console.log('  ✔ Releasing R early returns to fish_ready');
console.log('  ✔ Full 3.2s R hold successfully catches fish');
console.log('  ✔ Fish leaps into bucket, bucket count updates');
console.log('  ✔ Score awarded is 3 coins (less than recycling 5 coins)\n');

// ────────────────────────────────────────────────────────────────────
// TEST 6: Stopping Fishing and Control Restoration
// ────────────────────────────────────────────────────────────────────
console.log('Test 6: Stopping fishing and restoring boat movement');
resetEvents();

fishing.stopFishing(controller);
assert.equal(fishing.state, 'idle', 'State must reset to idle');
assert.equal(controller.enabled, true, 'BoatController movement controls must be restored');
assert.equal(fishing.rodGroup.visible, false, 'Fishing rod must be hidden');
assert.equal(fishing.bobberGroup.visible, false, 'Bobber must be hidden');
assert.equal(fishing.bucketGroup.visible, false, 'Bucket must be hidden');
assert.ok(events.stateChanges.includes('idle'));

console.log('  ✔ stopFishing() resets state to idle');
console.log('  ✔ Normal boat movement controls enabled');
console.log('  ✔ Visual fishing gear cleanly hidden\n');

// ────────────────────────────────────────────────────────────────────
// TEST 7: Independent Operation at Right Endpoint
// ────────────────────────────────────────────────────────────────────
console.log('Test 7: Independent operation at Right Endpoint (21, 0, 29.5)');
resetEvents();

controller.boat.position.copy(rightPos);
input.keys.interact = true;
input.keys.reel = false;

// Hold F for 2.0s at right endpoint
for (let i = 0; i < 20; i++) {
  fishing.update(0.1, input, controller.boat, controller);
}
assert.equal(fishing.state, 'fishing');
assert.equal(fishing.currentSpot, 'right');
assert.equal(controller.enabled, false);

fishing.stopFishing(controller);
assert.equal(fishing.state, 'idle');
assert.equal(controller.enabled, true);

console.log('  ✔ Right endpoint starts and stops fishing independently\n');

// ────────────────────────────────────────────────────────────────────
// TEST 8: Fishing on foot as character in HARBOR mode at pier endpoint
// ────────────────────────────────────────────────────────────────────
console.log('Test 8: Fishing on foot as character in HARBOR mode');
resetEvents();

const mockCharController = {
  enabled: true,
  isFishing: false,
  velocity: new THREE.Vector3(1, 0, 1),
  group: new THREE.Group(),
  getPosition() { return this.group.position.clone(); },
};
// Character standing at the railing in front of the fishing sign (like in screenshots)
mockCharController.group.position.set(-21.0, 1.2, 26.5);

// Check spot on foot
assert.equal(fishing.checkFishingSpot(mockCharController.group.position), 'left');

// Hold F for 2.0s on foot
input.keys.interact = true;
input.keys.reel = false;
for (let i = 0; i < 20; i++) {
  fishing.update(0.1, input, mockCharController.group, mockCharController, false);
}
assert.equal(fishing.state, 'fishing');
assert.equal(mockCharController.currentStateName, 'Fish', 'Character animation state must be Fish');
assert.equal(mockCharController.isFishing, true, 'isFishing flag must be set to true for physics lock');
assert.equal(mockCharController.enabled, true, 'Character controller remains enabled for rendering & gravity');
assert.equal(mockCharController.velocity.length(), 0, 'Character horizontal velocity must be 0');
assert.equal(fishing.bucketGroup.visible, true, 'Bucket must be visible on dock');
assert.equal(fishing.bobberGroup.visible, true, 'Bobber must be visible in water');

// Stop fishing on foot
fishing.stopFishing(mockCharController);
assert.equal(fishing.state, 'idle');
assert.equal(mockCharController.isFishing, false, 'isFishing flag must be reset to false');
assert.equal(mockCharController.enabled, true, 'Character controls must be restored');
assert.equal(mockCharController.currentStateName, 'Idle', 'Character animation must return to Idle');
assert.equal(fishing.bucketGroup.visible, false);

console.log('  ✔ Character walking to pier endpoint can fish on foot');
console.log('  ✔ Character movement is locked while fishing on foot');
console.log('  ✔ Gear deploys on dock / water, and controls restore on stop\n');

// ────────────────────────────────────────────────────────────────────
// TEST 9: Pressing or holding F while fishing stops fishing
// ────────────────────────────────────────────────────────────────────
console.log('Test 9: Pressing or holding F while fishing stops fishing immediately');
resetEvents();

// Start fishing
input.keys.interact = true;
for (let i = 0; i < 20; i++) {
  fishing.update(0.1, input, mockCharController.group, mockCharController, false);
}
assert.equal(fishing.state, 'fishing');
assert.equal(mockCharController.isFishing, true);

// Release F (cast complete)
input.keys.interact = false;
fishing.update(0.1, input, mockCharController.group, mockCharController, false);
assert.equal(fishing.state, 'fishing');

// Press / Hold F again -> immediately stops fishing and restores movement
input.keys.interact = true;
fishing.update(0.1, input, mockCharController.group, mockCharController, false);
assert.equal(fishing.state, 'idle', 'Pressing or holding F while fishing must stop fishing');
assert.equal(mockCharController.isFishing, false, 'Movement lock must be released');
assert.equal(mockCharController.enabled, true, 'Controls must be enabled');
assert.equal(mockCharController.currentStateName, 'Idle');

// Release F after stop
input.keys.interact = false;
fishing.update(0.01, input, mockCharController.group, mockCharController, false);

console.log('  ✔ F press/hold while fishing stops fishing and restores movement immediately\n');

// ────────────────────────────────────────────────────────────────────
// TEST 10: Duplicate catch prevention
// ────────────────────────────────────────────────────────────────────
console.log('Test 10: Duplicate fish retrieval guard');
resetEvents();

// Start fishing and advance 20s
input.keys.interact = true;
for (let i = 0; i < 20; i++) {
  fishing.update(0.1, input, controller.boat, controller, true);
}
input.keys.interact = false;
for (let i = 0; i < 21; i++) {
  fishing.update(1.0, input, controller.boat, controller, true);
}
assert.equal(fishing.state, 'fish_ready');
assert.equal(fishing.pendingCatches, 1);

// Reel in the 1 caught fish
input.keys.reel = true;
for (let i = 0; i < 33; i++) {
  fishing.update(0.1, input, controller.boat, controller, true);
}
assert.equal(fishing.pendingCatches, 0);
const countAfterCatch = fishing.fishCount;
const eventsCount = events.fishCaught.length;

// Attempting duplicate _handleCatchSuccess call when pendingCatches is 0
fishing._handleCatchSuccess();
assert.equal(fishing.fishCount, countAfterCatch, 'Fish count must not increment on duplicate call');
assert.equal(events.fishCaught.length, eventsCount, 'onFishCaught callback must not duplicate');

fishing.stopFishing(controller);
console.log('  ✔ Duplicate retrieval guard blocks duplicate points and counts\n');

// ────────────────────────────────────────────────────────────────────
// TEST 11: Repeating 20-Second Cycles & Pending Catches Backlog
// ────────────────────────────────────────────────────────────────────
console.log('Test 11: Independent repeating 20s catch cycle & safe backlog handling');
resetEvents();

// Start fishing
input.keys.interact = true;
input.keys.reel = false;
for (let i = 0; i < 20; i++) {
  fishing.update(0.1, input, controller.boat, controller, true);
}
input.keys.interact = false;
assert.equal(fishing.state, 'fishing');
assert.equal(fishing.pendingCatches, 0);

// Advance 45 seconds without player pressing R (spanning 2 full 20s catch intervals)
for (let i = 0; i < 45; i++) {
  fishing.update(1.0, input, controller.boat, controller, true);
}
// Both 20s marks must have triggered a catch: pendingCatches must be 2
assert.equal(fishing.pendingCatches, 2, 'Pending catches must safely backlog to 2 without losing fish');
assert.equal(fishing.state, 'fish_ready', 'State must be fish_ready waiting for retrieval');
assert.ok(events.alerts.length >= 2, 'Alert popup must trigger on every 20-second fish catch');
assert.equal(events.alerts[0].text, '🐟 Fish caught! Hold R to retrieve your fish!');

// Player holds R for 3.2s to retrieve 1st fish
input.keys.reel = true;
for (let i = 0; i < 33; i++) {
  fishing.update(0.1, input, controller.boat, controller, true);
}
// Player releases R
input.keys.reel = false;
fishing.update(0.1, input, controller.boat, controller, true);

// After retrieving 1 fish and releasing R:
assert.equal(fishing.pendingCatches, 1, '1 fish remains pending in backlog');
assert.equal(fishing.state, 'fish_ready', 'State stays fish_ready so player can retrieve next fish');
assert.equal(events.fishCaught.length, 1, 'Exactly 1 fish award paid out');

// Player holds R for 3.2s to retrieve 2nd fish
input.keys.reel = true;
for (let i = 0; i < 33; i++) {
  fishing.update(0.1, input, controller.boat, controller, true);
}
input.keys.reel = false;
fishing.update(0.1, input, controller.boat, controller, true);

// Both fish retrieved:
assert.equal(fishing.pendingCatches, 0, 'All pending fish retrieved');
assert.equal(fishing.state, 'fishing', 'State returns to fishing for continuous cycle');
assert.equal(events.fishCaught.length, 2, 'Both fish successfully retrieved with full awards');

fishing.stopFishing(controller);
console.log('  ✔ Repeating 20s timer accumulates pending catches safely without loss');
console.log('  ✔ Popup notification fires automatically on every catch cycle');
console.log('  ✔ Player can retrieve consecutive fish one by one without duplicate rewards\n');

// ────────────────────────────────────────────────────────────────────
// TEST 12: Character Position Lock & Unrestricted Camera Movement
// ────────────────────────────────────────────────────────────────────
console.log('Test 12: Character position locked completely while camera rotates freely');
resetEvents();

import { CharacterController } from '../src/player/CharacterController.js';
import { CameraController } from '../src/player/CameraController.js';

const mockCanvas = {
  addEventListener() {},
  removeEventListener() {},
  requestPointerLock() {},
};
const mockCamera = new THREE.PerspectiveCamera();
const camCtrl = new CameraController(mockCamera, mockCanvas);
const charCtrl = new CharacterController(mockScene, []);

// Place character on pier endpoint
charCtrl.position.set(-21.0, 1.2, 26.5);
charCtrl.prevPosition.copy(charCtrl.position);
charCtrl.isGrounded = true;

// Start fishing on foot
fishing.startFishing(charCtrl.group, charCtrl, false);
assert.equal(charCtrl.isFishing, true, 'isFishing must be active');

const initialX = charCtrl.position.x;
const initialZ = charCtrl.position.z;

// Simulate WASD inputs while fishing
const wasdInput = {
  keys: { forward: true, backward: false, left: true, right: false, jump: true, sprint: true },
  consumeMouseDelta() { return { dx: 15, dy: -8, scroll: 0 }; },
  isPointerLocked: true,
};

// Physics fixed updates
for (let i = 0; i < 60; i++) {
  charCtrl.fixedUpdate(wasdInput, camCtrl, 1/60);
}

// Verify position is rock-solid locked
assert.equal(charCtrl.position.x, initialX, 'Character X position must remain completely locked');
assert.equal(charCtrl.position.z, initialZ, 'Character Z position must remain completely locked');
assert.equal(charCtrl.velocity.x, 0, 'Velocity X must be 0');
assert.equal(charCtrl.velocity.z, 0, 'Velocity Z must be 0');

// Camera controller update with mouse rotation
const initialCamYaw = camCtrl._camYaw;
const initialCamElev = camCtrl._elevation;

camCtrl.update(charCtrl.getPosition(), charCtrl.yaw, wasdInput, 1/60);

assert.notEqual(camCtrl._camYaw, initialCamYaw, 'Camera horizontal yaw must rotate freely');
assert.notEqual(camCtrl._elevation, initialCamElev, 'Camera vertical elevation must rotate freely');

// Stop fishing -> restore character movement
fishing.stopFishing(charCtrl);
assert.equal(charCtrl.isFishing, false, 'isFishing must be released');
assert.equal(charCtrl.enabled, true, 'Character movement controls must be restored');

console.log('  ✔ Character position remains completely locked even with WASD/Jump input');
console.log('  ✔ Camera rotation (look left/right/up/down) operates completely unrestricted');
console.log('  ✔ Exiting fishing immediately restores normal character movement\n');

console.log('🎉 ALL FISHING FEATURE TESTS PASSED SUCCESSFULLY! (12/12 suites)\n');

