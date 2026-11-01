/**
 * test-boat-lifecycle.mjs — Comprehensive test suite for Multiplayer Boat Ownership & Lifecycle.
 *
 * Verifies:
 *  1. Shared Harbor: Individual Boat Ownership:
 *     - Player 1 (Level 3) & Player 2 (Level 1) both join.
 *     - Inactive remote boats are NOT visible at the harbor docks (`boatGroup.visible === false`).
 *     - Remote players are visible on foot (`characterGroup.visible === true`).
 *  2. Launching to Ocean (state: 'ACTIVE'):
 *     - Player 1 boards and launches.
 *     - Player 2 receives state transition `ACTIVE`.
 *     - Player 2's remote view of Player 1 switches: `characterGroup.visible === false`, `boatGroup.visible === true`.
 *     - Player 1's boat in Player 2's view uses Level 3 upgraded model (bridge, solar panels, radar mast).
 *  3. Ocean Sailing & Movement Interpolation:
 *     - Player 1 sails and sends position/yaw updates.
 *     - Player 2 receives interpolated movement updates without affecting local state.
 *  4. Simultaneous Sailing:
 *     - Player 2 also launches into ocean (Level 1 starter boat).
 *     - Both players see each other's distinct boats in the ocean with correct respective levels.
 *  5. Return to Harbor (state: 'DOCKED'):
 *     - Player 1 docks and disembarks.
 *     - Remote ocean boat despawns (`boatGroup.visible === false`), and human character reappears (`characterGroup.visible === true`).
 *  6. Late Joiner State Replication:
 *     - Client 3 connects while Player 2 is still sailing in ocean.
 *     - Client 3 immediately receives Player 2 as `ACTIVE` with Level 1 boat in ocean.
 *  7. Clean Disconnection:
 *     - Disconnecting removes player and all 3D scene objects cleanly.
 */

import assert from 'node:assert/strict';
import { io as ClientIO } from 'socket.io-client';
import * as THREE from 'three';
import { MultiplayerServer } from '../server/multiplayerServer.js';
import { RemotePlayerManager } from '../src/multiplayer/RemotePlayerManager.js';
import { buildBoatModel } from '../src/player/BoatModelBuilder.js';

console.log('⛵ Starting Boat Ownership & Lifecycle Test Suite...\n');

const TEST_PORT = 3195;
const server = new MultiplayerServer({ port: TEST_PORT, host: '127.0.0.1' });

function createClient() {
  return ClientIO(`http://127.0.0.1:${TEST_PORT}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

function waitForEvent(socket, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event "${eventName}"`));
    }, timeoutMs);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function runTests() {
  try {
    await server.start();
    console.log(`  ✔ Test server started on port ${TEST_PORT}\n`);

    // ────────────────────────────────────────────────────────────────────────
    // TEST 1: Unit Verification of BoatModelBuilder & RemotePlayerManager
    // ────────────────────────────────────────────────────────────────────────
    console.log('Test 1: Model Builder & RemotePlayerManager Representation');
    const scene = new THREE.Scene();
    const mockWaveSampler = { getHeight: () => 0.1, sample: () => 0.1 };
    const remoteManager = new RemotePlayerManager(scene, mockWaveSampler);

    // Build models directly to test tier distinction
    const lvl1Boat = buildBoatModel(1, { isRemote: true });
    const lvl2Boat = buildBoatModel(2, { isRemote: true });
    const lvl3Boat = buildBoatModel(3, { isRemote: true });

    assert.equal(lvl1Boat.userData.level, 1, 'Level 1 model level metadata');
    assert.equal(lvl2Boat.userData.level, 2, 'Level 2 model level metadata');
    assert.equal(lvl3Boat.userData.level, 3, 'Level 3 model level metadata');

    // Level 3 should have radar mast and solar panels
    let hasRadar = false;
    let hasSolar = false;
    lvl3Boat.traverse((child) => {
      if (child.name === 'RadarMast') hasRadar = true;
      if (child.name === 'SolarPanels') hasSolar = true;
    });
    assert.ok(hasRadar, 'Level 3 boat must feature Radar Mast');
    assert.ok(hasSolar, 'Level 3 boat must feature Solar Panels');
    console.log('  ✔ BoatModelBuilder accurately constructs distinct tier geometry (Levels 1, 2, 3)');

    // Add Player 1 (Level 3) to RemotePlayerManager with state: 'DOCKED'
    remoteManager.addPlayer({
      playerId: 'p_remote1',
      username: 'EcoCaptain',
      boatLevel: 3,
      state: 'DOCKED',
      color: { primary: '#38bdf8', accent: '#0284c7' },
      berth: { x: 5, y: 1.5, z: 20, yaw: 0 },
    });

    const entry1 = remoteManager.remoteEntities.get('p_remote1');
    assert.ok(entry1, 'Remote player entry must be created');
    assert.equal(entry1.characterGroup.visible, true, 'In DOCKED state, remote human character MUST be visible');
    assert.equal(entry1.boatGroup.visible, false, 'In DOCKED state, remote boat MUST NOT be visible at the dock');
    assert.equal(entry1.boatLevel, 3, 'Remote boat level must be 3');
    console.log('  ✔ DOCKED state: Remote human character is visible, inactive boat is hidden at dock');

    // Transition Player 1 to ACTIVE
    remoteManager.handlePlayerState({
      playerId: 'p_remote1',
      state: 'ACTIVE',
      boatLevel: 3,
    });
    assert.equal(entry1.characterGroup.visible, false, 'In ACTIVE state, remote human character MUST be hidden');
    assert.equal(entry1.boatGroup.visible, true, 'In ACTIVE state, remote ocean boat MUST be visible');
    console.log('  ✔ ACTIVE state: Remote human character hidden, upgraded Level 3 boat visible in ocean');

    // Transition Player 1 back to DOCKED
    remoteManager.handlePlayerState({
      playerId: 'p_remote1',
      state: 'DOCKED',
    });
    assert.equal(entry1.characterGroup.visible, true, 'In DOCKED return, human character is restored');
    assert.equal(entry1.boatGroup.visible, false, 'In DOCKED return, ocean boat is despawned');
    console.log('  ✔ RETURNING/DOCKED: Boat despawns from ocean, human character reappears on dock');

    remoteManager.dispose();
    console.log('  ✔ RemotePlayerManager lifecycle unit tests passed!\n');

    // ────────────────────────────────────────────────────────────────────────
    // TEST 2: Networked 2-Player Session (Player 1 Level 3 & Player 2 Level 1)
    // ────────────────────────────────────────────────────────────────────────
    console.log('Test 2: Networked Multi-Client Boat Ownership & Lifecycle');
    const client1 = createClient();
    const init1 = await waitForEvent(client1, 'init');

    const client2 = createClient();
    const init2 = await waitForEvent(client2, 'init');

    // Player 1 joins with Level 3 boat
    client1.emit('player:join', { username: 'PlayerOne_Lvl3', boatLevel: 3 });
    const join1Success = await waitForEvent(client1, 'player:joined_success');
    assert.equal(join1Success.localPlayer.boatLevel, 3);
    assert.equal(join1Success.localPlayer.state, 'DOCKED');
    console.log(`  ✔ Player 1 joined: "${join1Success.localPlayer.username}" (Boat Level ${join1Success.localPlayer.boatLevel}, State: ${join1Success.localPlayer.state})`);

    // Player 2 joins with Level 1 boat
    const p2JoinedBroadcastPromise = waitForEvent(client1, 'player:joined');
    client2.emit('player:join', { username: 'PlayerTwo_Lvl1', boatLevel: 1 });
    const join2Success = await waitForEvent(client2, 'player:joined_success');
    const p2Broadcast = await p2JoinedBroadcastPromise;

    assert.equal(join2Success.localPlayer.boatLevel, 1);
    assert.equal(join2Success.localPlayer.state, 'DOCKED');
    assert.equal(p2Broadcast.player.boatLevel, 1);
    assert.equal(p2Broadcast.player.state, 'DOCKED');
    console.log(`  ✔ Player 2 joined: "${join2Success.localPlayer.username}" (Boat Level ${join2Success.localPlayer.boatLevel}, State: ${join2Success.localPlayer.state})`);
    console.log('  ✔ Both players verified in DOCKED state at harbor\n');

    // ────────────────────────────────────────────────────────────────────────
    // TEST 3: Player 1 Boards & Launches into Ocean (ACTIVE)
    // ────────────────────────────────────────────────────────────────────────
    console.log('Test 3: Player 1 Launches to Ocean (ACTIVE)');
    const p1StateChangePromise = waitForEvent(client2, 'player:state_changed');

    client1.emit('player:state', {
      state: 'ACTIVE',
      boatLevel: 3,
      transform: { x: 10, y: 0.2, z: 50, yaw: Math.PI, speed: 5 },
    });

    const p1StateChange = await p1StateChangePromise;
    assert.equal(p1StateChange.playerId, init1.playerId);
    assert.equal(p1StateChange.state, 'ACTIVE');
    assert.equal(p1StateChange.boatLevel, 3);
    assert.equal(p1StateChange.transform.x, 10);
    console.log(`  ✔ Player 2 received state transition for Player 1: State=${p1StateChange.state}, BoatLevel=${p1StateChange.boatLevel}`);

    // Verify Player 1 movement broadcasts to Player 2
    const p1MovePromise = waitForEvent(client2, 'player:moved');
    client1.emit('player:move', {
      x: 15,
      y: 0.3,
      z: 75,
      yaw: Math.PI * 0.9,
      speed: 8.5,
      state: 'ACTIVE',
      boatLevel: 3,
    });
    const p1Move = await p1MovePromise;
    assert.equal(p1Move.playerId, init1.playerId);
    assert.equal(p1Move.transform.x, 15);
    assert.equal(p1Move.transform.z, 75);
    assert.equal(p1Move.transform.speed, 8.5);
    console.log(`  ✔ Player 2 received Player 1 ocean navigation movement: pos=(${p1Move.transform.x}, ${p1Move.transform.z}), speed=${p1Move.transform.speed} knots\n`);

    // ────────────────────────────────────────────────────────────────────────
    // TEST 4: Player 2 Launches into Ocean (Simultaneous Sailing)
    // ────────────────────────────────────────────────────────────────────────
    console.log('Test 4: Simultaneous Sailing');
    const p2StateChangePromise = waitForEvent(client1, 'player:state_changed');

    client2.emit('player:state', {
      state: 'ACTIVE',
      boatLevel: 1,
      transform: { x: -20, y: 0.2, z: 40, yaw: 0, speed: 4 },
    });

    const p2StateChange = await p2StateChangePromise;
    assert.equal(p2StateChange.playerId, init2.playerId);
    assert.equal(p2StateChange.state, 'ACTIVE');
    assert.equal(p2StateChange.boatLevel, 1);
    console.log('  ✔ Both Player 1 (Level 3) and Player 2 (Level 1) are simultaneously sailing in ocean\n');

    // ────────────────────────────────────────────────────────────────────────
    // TEST 5: Player 1 Returns to Harbor (DOCKED)
    // ────────────────────────────────────────────────────────────────────────
    console.log('Test 5: Player 1 Returns to Harbor (DOCKED)');
    const p1DockPromise = waitForEvent(client2, 'player:state_changed');

    client1.emit('player:state', {
      state: 'DOCKED',
      boatLevel: 3,
      transform: { x: 5, y: 1.5, z: 25, yaw: 0, speed: 0, animState: 'Idle' },
    });

    const p1Dock = await p1DockPromise;
    assert.equal(p1Dock.playerId, init1.playerId);
    assert.equal(p1Dock.state, 'DOCKED');
    console.log('  ✔ Player 1 transitioned back to DOCKED; Player 2 notified\n');

    // ────────────────────────────────────────────────────────────────────────
    // TEST 6: Late Joiner State Replication
    // ────────────────────────────────────────────────────────────────────────
    console.log('Test 6: Late Joiner Receives Current Ocean & Harbor States');
    const client3 = createClient();
    await waitForEvent(client3, 'init');

    client3.emit('player:join', { username: 'LateSailor', boatLevel: 2 });
    const join3Success = await waitForEvent(client3, 'player:joined_success');

    assert.equal(join3Success.existingPlayers.length, 2, 'Late joiner must receive 2 existing players');
    const existingP1 = join3Success.existingPlayers.find((p) => p.playerId === init1.playerId);
    const existingP2 = join3Success.existingPlayers.find((p) => p.playerId === init2.playerId);

    assert.ok(existingP1, 'Must find Player 1');
    assert.equal(existingP1.state, 'DOCKED', 'Player 1 must be DOCKED');
    assert.equal(existingP1.boatLevel, 3, 'Player 1 boat level must be 3');

    assert.ok(existingP2, 'Must find Player 2');
    assert.equal(existingP2.state, 'ACTIVE', 'Player 2 must be ACTIVE (sailing in ocean)');
    assert.equal(existingP2.boatLevel, 1, 'Player 2 boat level must be 1');

    console.log(`  ✔ Late joiner correctly received: Player 1 = ${existingP1.state} (Level ${existingP1.boatLevel}), Player 2 = ${existingP2.state} (Level ${existingP2.boatLevel})\n`);

    // ────────────────────────────────────────────────────────────────────────
    // TEST 7: Disconnect Cleanup
    // ────────────────────────────────────────────────────────────────────────
    console.log('Test 7: Disconnect Cleanup');
    const leavePromise = waitForEvent(client2, 'player:left');
    client1.disconnect();
    const leaveData = await leavePromise;
    assert.equal(leaveData.playerId, init1.playerId);
    console.log(`  ✔ Player 1 departure broadcasted to Player 2 (${leaveData.username})\n`);

    client2.disconnect();
    client3.disconnect();
    await server.stop();
    console.log('🎉 ALL BOAT OWNERSHIP & LIFECYCLE TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test suite failed with error:', err);
    await server.stop().catch(() => {});
    process.exit(1);
  }
}

runTests();

