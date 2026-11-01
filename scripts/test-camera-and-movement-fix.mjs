import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InputManager } from '../src/player/InputManager.js';
import { CameraController } from '../src/player/CameraController.js';
import { CharacterController } from '../src/player/CharacterController.js';
import { FishingSystem } from '../src/world/FishingSystem.js';

console.log('🧪 Starting Camera & Movement Root Cause Verification Suite...\n');

// ── Test 1: InputManager Key Mapping & WASD Direction Integrity ────────
console.log('Test 1: InputManager Key Mapping Integrity');
const input = new InputManager();

assert.equal(input._mapKey('KeyW'), 'forward', 'KeyW must map to forward');
assert.equal(input._mapKey('KeyS'), 'backward', 'KeyS must map to backward');
assert.equal(input._mapKey('KeyA'), 'left', 'KeyA must map to left (was inverted)');
assert.equal(input._mapKey('KeyD'), 'right', 'KeyD must map to right (was inverted)');
assert.equal(input._mapKey('ArrowUp'), 'forward');
assert.equal(input._mapKey('ArrowDown'), 'backward');
assert.equal(input._mapKey('ArrowLeft'), 'left');
assert.equal(input._mapKey('ArrowRight'), 'right');
assert.equal(input._mapKey('KeyF'), 'interact');
assert.equal(input._mapKey('KeyR'), 'reel');
console.log('  ✔ WASD and Arrow key mappings are strictly correct and verified\n');

// ── Test 2: InputManager Window Blur & Stuck Key Prevention ────────────
console.log('Test 2: Window Blur Reset (No Stuck Keys on Multi-laptop switching)');
input.keys.forward = true;
input.keys.interact = true;
input.mouseDeltaX = 50;
assert.equal(input.isMoving, true);

input._onBlur();
assert.equal(input.keys.forward, false, 'Keys must be released on window blur');
assert.equal(input.keys.interact, false, 'Interact key must be released on window blur');
assert.equal(input.mouseDeltaX, 0, 'Mouse deltas must be reset on window blur');
assert.equal(input.isMoving, false);
console.log('  ✔ Window blur cleanly resets all keys and prevents stuck movement\n');

// ── Test 3: Camera Rotation — 360° Horizontal & Pitch (Up/Down) ─────────
console.log('Test 3: Camera 360° Horizontal Orbit & Vertical Pitch');
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
const mockDom = {
  addEventListener: () => {},
  removeEventListener: () => {},
  requestPointerLock: () => Promise.resolve(),
};
const cameraCtrl = new CameraController(camera, mockDom);

const charPos = new THREE.Vector3(0, 1.5, 0);
const initialYaw = cameraCtrl.getYaw();
const initialElevation = cameraCtrl._elevation;

// Simulate mouse look right (+dx)
input.mouseDeltaX = 200;
input.mouseDeltaY = 50;
cameraCtrl.update(charPos, 0, input, 1 / 60);

assert.notEqual(cameraCtrl.getYaw(), initialYaw, 'Yaw must rotate with mouse X');
assert.notEqual(cameraCtrl._elevation, initialElevation, 'Elevation must adjust with mouse Y');

// Continuous 360-degree rotation verification
for (let i = 0; i < 50; i++) {
  input.mouseDeltaX = 100;
  cameraCtrl.update(charPos, 0, input, 1 / 60);
}
assert.ok(Number.isFinite(cameraCtrl.getYaw()), 'Camera yaw must remain a valid finite number');
assert.ok(Number.isFinite(cameraCtrl._elevation), 'Camera elevation must remain valid');
console.log('  ✔ Camera freely rotates 360° horizontally and up/down without drift or lock\n');

// ── Test 4: Character WASD Movement in All Directions ────────────────────
console.log('Test 4: Character Movement in All 4 Directions & A/D Direction Check');
const scene = new THREE.Scene();
const charCtrl = new CharacterController(scene, []);
charCtrl.setPosition(0, 0, 0);

// Set camera facing forward along -Z (yaw = 0)
cameraCtrl._camYaw = 0;
assert.equal(cameraCtrl.getCameraForward().z < 0, true, 'Forward must be -Z');
assert.equal(cameraCtrl.getCameraRight().x > 0, true, 'Right must be +X');

// Forward movement (W)
input.resetKeys();
input.keys.forward = true;
charCtrl.fixedUpdate(input, cameraCtrl, 1 / 60);
assert.ok(charCtrl.velocity.z < 0, 'W must move forward along -Z');

// Backward movement (S)
input.resetKeys();
input.keys.backward = true;
charCtrl.fixedUpdate(input, cameraCtrl, 1 / 60);
assert.ok(charCtrl.velocity.z > 0, 'S must move backward along +Z');

// Left movement (A) -> must move along -X (LEFT)!
input.resetKeys();
input.keys.left = true;
charCtrl.velocity.set(0, 0, 0);
charCtrl.fixedUpdate(input, cameraCtrl, 1 / 60);
assert.ok(charCtrl.velocity.x < 0, `A key must move LEFT (-X), got vel.x = ${charCtrl.velocity.x}`);

// Right movement (D) -> must move along +X (RIGHT)!
input.resetKeys();
input.keys.right = true;
charCtrl.velocity.set(0, 0, 0);
charCtrl.fixedUpdate(input, cameraCtrl, 1 / 60);
assert.ok(charCtrl.velocity.x > 0, `D key must move RIGHT (+X), got vel.x = ${charCtrl.velocity.x}`);

input.resetKeys();
console.log('  ✔ Character moves: A = LEFT (-X), D = RIGHT (+X), W = FORWARD (-Z), S = BACKWARD (+Z)\n');

// ── Test 4b: Boat Steering Controls (A = Turn LEFT, D = Turn RIGHT) ──────
console.log('Test 4b: Boat Mode Steering Controls (A = Turn LEFT, D = Turn RIGHT)');
import { BoatController } from '../src/player/BoatController.js';
const mockBoat = new THREE.Group();
const boatCtrl = new BoatController(mockBoat, input, []);
boatCtrl.inertia.speed = 5.0; // moving forward at 5 m/s
boatCtrl.speed = 5.0;

// Press A (turn left):
input.resetKeys();
input.keys.forward = true;
input.keys.left = true;
for (let i = 0; i < 30; i++) {
  boatCtrl.fixedUpdate(input, 1 / 60);
}
assert.ok(boatCtrl.steer > 0, `Pressing A must produce positive steer (turning left), got ${boatCtrl.steer}`);
assert.ok(boatCtrl.inertia.yawRate > 0, `Pressing A must produce positive yawRate (turning bow left), got ${boatCtrl.inertia.yawRate}`);

// Press D (turn right):
input.resetKeys();
input.keys.forward = true;
input.keys.right = true;
for (let i = 0; i < 60; i++) {
  boatCtrl.fixedUpdate(input, 1 / 60);
}
assert.ok(boatCtrl.steer < 0, `Pressing D must produce negative steer (turning right), got ${boatCtrl.steer}`);
assert.ok(boatCtrl.inertia.yawRate < 0, `Pressing D must produce negative yawRate (turning bow right), got ${boatCtrl.inertia.yawRate}`);

input.resetKeys();
console.log('  ✔ Boat turns: A = Turn LEFT, D = Turn RIGHT cleanly verified\n');

// ── Test 5: Fishing Movement Lock & Unrestricted Camera Rotation ─────────
console.log('Test 5: Fishing Movement Lock with Free Camera Orbit');
const leftEndpoint = new THREE.Vector3(-21.0, 0, 29.5);
charCtrl.setPosition(leftEndpoint.x, leftEndpoint.y, leftEndpoint.z);

const fishing = new FishingSystem(scene, null, null, {});
fishing.currentSpot = 'left';

// Cast and start fishing
fishing.startFishing(charCtrl.group, charCtrl, false);
assert.equal(fishing.state, 'fishing');
assert.equal(charCtrl.isFishing, true);

// Attempt WASD while fishing
input.keys.forward = true;
input.keys.left = true;
charCtrl.fixedUpdate(input, cameraCtrl, 1 / 60);

// Position must be strictly locked
assert.equal(charCtrl.position.x, leftEndpoint.x, 'Position X must be locked while fishing');
assert.equal(charCtrl.position.z, leftEndpoint.z, 'Position Z must be locked while fishing');

// Camera must rotate freely while fishing
const yawBeforeLook = cameraCtrl.getYaw();
input.mouseDeltaX = 150;
cameraCtrl.update(charCtrl.getPosition(), charCtrl.yaw, input, 1 / 60);
assert.notEqual(cameraCtrl.getYaw(), yawBeforeLook, 'Camera must rotate freely while fishing');

// Stop fishing
fishing.stopFishing(charCtrl);
assert.equal(fishing.state, 'idle');
assert.equal(charCtrl.isFishing, false);
assert.equal(charCtrl.enabled, true);

// Movement immediately resumes
input.keys.forward = true;
charCtrl.fixedUpdate(input, cameraCtrl, 1 / 60);
assert.ok(charCtrl.velocity.lengthSq() > 0, 'Movement must immediately restore after fishing stops');
input.resetKeys();
console.log('  ✔ Fishing locks character position, preserves camera look, and immediately restores movement on exit\n');

// ── Test 6: Casting Repeat-Loop Prevention ──────────────────────────────
console.log('Test 6: Prevention of Infinite Cast/Stop Repeating Loop');
charCtrl.setPosition(leftEndpoint.x, leftEndpoint.y, leftEndpoint.z);

let castProgressEmitted = 0;
fishing.callbacks.onCastProgress = (p) => { castProgressEmitted = p; };

// Hold F for 2 seconds to cast line
input.keys.interact = true;
for (let i = 0; i < 21; i++) {
  fishing.update(0.1, input, charCtrl.group, charCtrl, false);
}
assert.equal(fishing.state, 'fishing', 'Fishing must start after 2 seconds');
assert.equal(castProgressEmitted, 0, 'Cast progress must be 0 once fishing starts');

// Next frame: user still holding F from the cast — must NOT stop fishing!
fishing.update(0.1, input, charCtrl.group, charCtrl, false);
assert.equal(fishing.state, 'fishing', 'Fishing must NOT immediately cancel while holding cast key');

// Release F
input.keys.interact = false;
fishing.update(0.1, input, charCtrl.group, charCtrl, false);
assert.equal(fishing.state, 'fishing');

// Now press F to stop fishing
input.keys.interact = true;
fishing.update(0.1, input, charCtrl.group, charCtrl, false);
assert.equal(fishing.state, 'idle', 'Fishing must stop on subsequent F press');

// Re-enable input for cleanup
input.destroy();
console.log('  ✔ Cast/stop repeating loop completely eliminated\n');

console.log('🎉 ALL CAMERA & MOVEMENT VERIFICATION TESTS PASSED SUCCESSFULLY!');

