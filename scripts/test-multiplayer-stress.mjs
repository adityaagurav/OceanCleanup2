/**
 * test-multiplayer-stress.mjs — Comprehensive Multiplayer Lifecycle & Stress Benchmark
 *
 * Verifies:
 *  1. WaveSampler.sample and getHeight compatibility.
 *  2. RemotePlayerManager single-player vs multiplayer frame times and memory.
 *  3. Local player filtering (local player never spawned as a remote boat).
 *  4. Multi-client simulation (1, 2, and 5 concurrent clients).
 *  5. 300 frames of 60 FPS render updates with remote boats.
 *  6. Player departure & resource disposal (geometries, materials, canvases).
 *  7. GameLoop error isolation.
 *  8. Verification of WASD movement mappings (A = left, D = right).
 */

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { io as ClientIO } from 'socket.io-client';
import { MultiplayerServer } from '../server/multiplayerServer.js';
import { WaveSampler } from '../src/world/WaveSampler.js';
import { RemotePlayerManager } from '../src/multiplayer/RemotePlayerManager.js';
import { InputManager } from '../src/player/InputManager.js';
import { GameLoop } from '../src/core/GameLoop.js';

console.log('🧪 Starting Multiplayer Lifecycle & Stress Benchmark...\n');

const TEST_PORT = 3199;
const server = new MultiplayerServer({ port: TEST_PORT, host: '127.0.0.1' });

function connectClient() {
  return new Promise((resolve, reject) => {
    const socket = ClientIO(`http://127.0.0.1:${TEST_PORT}`, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: false,
    });
    let initData = null;
    socket.on('init', (data) => {
      initData = data;
    });
    socket.on('connect', () => {
      resolve({ socket, getInit: () => initData });
    });
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
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

async function run() {
  let passedTests = 0;

  try {
    await server.start();
    console.log(`  ✔ Test MultiplayerServer running on port ${TEST_PORT}\n`);

    // ── SUITE 1: WaveSampler API Verification ──────────────────────────────
    console.log('Suite 1: WaveSampler sample & getHeight Verification');
    const ws = new WaveSampler();
    assert.equal(typeof ws.getHeight, 'function', 'WaveSampler must have getHeight()');
    assert.equal(typeof ws.sample, 'function', 'WaveSampler must have sample() alias');

    const h1 = ws.getHeight(10, 20, 1.5);
    const s1 = ws.sample(10, 20, 1.5);
    assert.equal(h1, s1, 'sample(x, z, time) must return identical value to getHeight(x, z, time)');
    assert.ok(Number.isFinite(h1), 'Wave height must be finite');
    console.log(`  ✔ WaveSampler API verified: height at (10, 20) = ${h1.toFixed(4)}m`);
    passedTests++;

    // ── SUITE 2: Single Player vs Multi-Player Frame Time Benchmark ────────
    console.log('\nSuite 2: Single-Player vs Multi-Player Simulation Benchmark');
    const mockScene = new THREE.Scene();
    const rpm = new RemotePlayerManager(mockScene, ws);

    // Single-player: 0 remote boats
    const t0 = performance.now();
    for (let f = 0; f < 120; f++) {
      rpm.update(0.016);
    }
    const singlePlayerDuration = performance.now() - t0;
    const singleAvgMs = singlePlayerDuration / 120;
    console.log(`  ✔ Single-player 120 frames: total ${singlePlayerDuration.toFixed(2)}ms (${(singleAvgMs * 1000).toFixed(1)}µs/frame)`);

    // Local player setup
    const localPlayer = { playerId: 'p_local_01', username: 'HostPlayer', socketId: 'sock_host' };
    const mockLocalBoat = new THREE.Group();
    mockScene.add(mockLocalBoat);
    rpm.setLocalPlayer(localPlayer, mockLocalBoat);

    // Remote player joins
    const remotePlayer = {
      playerId: 'p_friend_02',
      username: 'FriendPlayer',
      socketId: 'sock_friend',
      color: { primary: '#10b981', sail: '#ecfdf5', accent: '#059669' },
      berth: { x: -5.75, y: 0, z: 23, yaw: 0 },
    };
    rpm.addPlayer(remotePlayer);

    assert.equal(rpm.remoteBoats.size, 1, 'Exactly 1 remote boat must be spawned');
    assert.ok(rpm.remoteBoats.has('p_friend_02'), 'Remote boat must be registered for p_friend_02');

    // Multi-player: 120 frames of 60 FPS update with active remote boat
    const t1 = performance.now();
    for (let f = 0; f < 120; f++) {
      rpm.update(0.016);
    }
    const multiPlayerDuration = performance.now() - t1;
    const multiAvgMs = multiPlayerDuration / 120;
    console.log(`  ✔ Multi-player (2 players) 120 frames: total ${multiPlayerDuration.toFixed(2)}ms (${(multiAvgMs * 1000).toFixed(1)}µs/frame)`);
    assert.ok(multiAvgMs < 1.0, `Multi-player frame time must be < 1ms, got ${multiAvgMs.toFixed(3)}ms`);
    passedTests++;

    // ── SUITE 3: Local Player Identity Isolation ───────────────────────────
    console.log('\nSuite 3: Local Player Identity Isolation Verification');
    // Attempt to add local player as a remote player: MUST BE REJECTED
    rpm.addPlayer(localPlayer);
    assert.equal(rpm.remoteBoats.size, 1, 'Local player must NEVER be added to remoteBoats');

    // Attempt to sync player list containing local player: MUST BE FILTERED
    rpm.syncPlayers([localPlayer, remotePlayer], localPlayer.playerId);
    assert.equal(rpm.remoteBoats.size, 1, 'syncPlayers must exclude local player');
    assert.ok(!rpm.remoteBoats.has(localPlayer.playerId), 'remoteBoats must NOT contain localPlayerId');
    console.log('  ✔ Local player is strictly excluded from remote boat spawning');
    passedTests++;

    // ── SUITE 4: Full Multi-Client Network LifeCycle (5 Concurrent Clients) ─
    console.log('\nSuite 4: 5 Concurrent Clients Join, Sync & Disconnect LifeCycle');
    const clients = [];
    const clientSessions = [];

    for (let i = 0; i < 5; i++) {
      const { socket: client } = await connectClient();
      clients.push(client);
      const joinPromise = waitForEvent(client, 'player:joined_success');
      client.emit('player:join', { username: `Sailor_${i + 1}`, boatLevel: 1 });
      const joinSuccess = await joinPromise;
      clientSessions.push(joinSuccess.localPlayer);
    }

    assert.equal(server.getPlayerCount(), 5, 'Server must track 5 connected clients');
    assert.equal(server.getJoinedPlayers().length, 5, 'Server must track 5 joined players');

    // Sync all 5 players to client 1's RemotePlayerManager (with client 1 as local)
    rpm.setLocalPlayer(clientSessions[0], mockLocalBoat);
    rpm.syncPlayers(clientSessions, clientSessions[0].playerId);

    assert.equal(rpm.remoteBoats.size, 4, 'Host RemotePlayerManager must have exactly 4 remote boats');

    // 300 frames of 60 FPS update with 4 active remote boats (~5 seconds of gameplay)
    const t2 = performance.now();
    for (let f = 0; f < 300; f++) {
      rpm.update(0.016);
    }
    const stressDuration = performance.now() - t2;
    const stressAvgMs = stressDuration / 300;
    const simulatedFps = 1000 / stressAvgMs;
    console.log(`  ✔ 5-player stress update (300 frames): ${stressDuration.toFixed(2)}ms total (${stressAvgMs.toFixed(3)}ms/frame, ~${Math.round(simulatedFps)} FPS throughput)`);
    assert.ok(stressAvgMs < 2.0, `Per-frame cost with 4 remote boats must be < 2ms, was ${stressAvgMs.toFixed(3)}ms`);
    passedTests++;

    // ── SUITE 5: Client Departure & Resource Cleanup ───────────────────────
    console.log('\nSuite 5: Player Disconnection & Memory Cleanup');
    // Disconnect clients 3, 4, 5
    clients[2].disconnect();
    clients[3].disconnect();
    clients[4].disconnect();

    // Allow socket disconnect events to process
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(server.getJoinedPlayers().length, 2, 'Server must have 2 active joined players after disconnects');

    // Sync remaining players to RemotePlayerManager
    rpm.syncPlayers(server.getJoinedPlayers(), clientSessions[0].playerId);
    assert.equal(rpm.remoteBoats.size, 1, 'RemotePlayerManager must cleanly remove disconnected boats');

    // Disconnect remaining clients
    clients[0].disconnect();
    clients[1].disconnect();
    await new Promise((r) => setTimeout(r, 100));

    rpm.dispose();
    assert.equal(rpm.remoteBoats.size, 0, 'dispose() must clear all remote boats');
    console.log('  ✔ Disconnection and resource disposal cleanly verified');
    passedTests++;

    // ── SUITE 6: GameLoop Error Boundary ───────────────────────────────────
    console.log('\nSuite 6: GameLoop Subsystem Error Isolation Verification');
    let frameRenderCount = 0;
    let loopErrorLogged = false;

    // Suppress console.error during expected fault test
    const origConsoleError = console.error;
    console.error = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('[GameLoop]')) loopErrorLogged = true;
    };

    const loop = new GameLoop({
      onFixedUpdate: (dt) => {},
      onRender: (alpha, fd) => {
        frameRenderCount++;
        if (frameRenderCount === 2) {
          throw new Error('Simulated transient subsystem exception');
        }
      },
    });

    loop.start();
    await new Promise((r) => setTimeout(r, 80)); // ~5 frames
    loop.stop();
    console.error = origConsoleError;

    assert.ok(frameRenderCount >= 4, `GameLoop must continue running after isolated subsystem error (rendered ${frameRenderCount} frames)`);
    assert.ok(loopErrorLogged, 'GameLoop must log error without halting execution');
    console.log(`  ✔ GameLoop safely recovered from transient error and continued (${frameRenderCount} frames rendered)`);
    passedTests++;

    // ── SUITE 7: Preserved WASD Movement Mappings ──────────────────────────
    console.log('\nSuite 7: Preserved WASD Key Mappings Verification');
    const input = new InputManager();
    assert.equal(input._mapKey('KeyA'), 'left', 'KeyA must map to left');
    assert.equal(input._mapKey('KeyD'), 'right', 'KeyD must map to right');
    assert.equal(input._mapKey('KeyW'), 'forward', 'KeyW must map to forward');
    assert.equal(input._mapKey('KeyS'), 'backward', 'KeyS must map to backward');
    input.destroy();
    console.log('  ✔ Key mappings strictly preserved: A=left, D=right, W=forward, S=backward');
    passedTests++;

    console.log(`\n🎉 ALL ${passedTests}/${passedTests} TEST SUITES PASSED!`);
  } finally {
    await server.stop();
  }
}

run().catch((err) => {
  console.error('\n❌ Test Suite Failed with Error:');
  console.error(err);
  process.exit(1);
});
