import assert from 'node:assert/strict';
import { io as ClientIO } from 'socket.io-client';
import * as THREE from 'three';
import { MultiplayerServer } from '../server/multiplayerServer.js';
import { RemotePlayerManager } from '../src/multiplayer/RemotePlayerManager.js';

const TEST_PORT = 3191;
const server = new MultiplayerServer({ port: TEST_PORT, host: '127.0.0.1' });

function createClient() {
  return ClientIO(`http://127.0.0.1:${TEST_PORT}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

async function run() {
  await server.start();
  console.log('Server started on', TEST_PORT);

  // 1. Client 1 (adityagurav) connects and joins
  const c1 = createClient();
  const c1Init = await new Promise((r) => c1.once('init', r));
  c1.emit('player:join', { username: 'adityagurav', boatLevel: 1 });
  const c1Join = await new Promise((r) => c1.once('player:joined_success', r));
  console.log('C1 joined:', c1Join.localPlayer.playerId, c1Join.localPlayer.username);

  // 2. Client 2 (tanishq) connects and joins
  const c2 = createClient();
  const c2Init = await new Promise((r) => c2.once('init', r));
  c2.emit('player:join', { username: 'tanishq', boatLevel: 1 });
  const c2Join = await new Promise((r) => c2.once('player:joined_success', r));
  console.log('C2 joined:', c2Join.localPlayer.playerId, c2Join.localPlayer.username);

  // Client 2 sets up RemotePlayerManager
  const scene2 = new THREE.Scene();
  const rpm2 = new RemotePlayerManager(scene2, { getHeight: () => 0.1, sample: () => 0.1 });
  rpm2.setLocalPlayer(c2Join.localPlayer, null);

  // Wire c2 socket events to rpm2 (same as App.jsx does)
  c2.on('players:list', (data) => {
    console.log('[C2] received players:list with', data.players?.length, 'players');
    rpm2.syncPlayers(data.players, c2Join.localPlayer.playerId);
  });
  c2.on('player:moved', (data) => {
    console.log('[C2] received player:moved:', data.playerId, data.transform);
    rpm2.handlePlayerMove(data);
  });
  c2.on('player:state_changed', (data) => {
    console.log('[C2] received player:state_changed:', data.playerId, data.state, data.transform);
    rpm2.handlePlayerState(data);
  });

  // Client 2 syncs existing players
  rpm2.syncPlayers(c2Join.existingPlayers, c2Join.localPlayer.playerId);

  const entryC1 = rpm2.remoteEntities.get(c1Join.localPlayer.playerId);
  console.log('Initial C1 entry on C2:');
  console.log('  state:', entryC1.state);
  console.log('  charGroup.visible:', entryC1.characterGroup.visible);
  console.log('  charGroup.position:', entryC1.characterGroup.position);
  console.log('  boatGroup.visible:', entryC1.boatGroup.visible);
  console.log('  boatGroup.position:', entryC1.boatGroup.position);

  // 3. Client 1 walks around harbor from (0, 1.5, -2) to (10, 1.5, 20)
  console.log('\n--- C1 walks around harbor ---');
  for (let i = 1; i <= 5; i++) {
    const x = i * 2;
    const z = -2 + i * 4;
    console.log(`C1 sending player:move step ${i}: (${x}, 1.5, ${z})`);
    c1.emit('player:move', {
      x,
      y: 1.5,
      z,
      yaw: 0.5,
      speed: 3.0,
      animState: 'Run',
      state: 'DOCKED',
      boatLevel: 1,
    });
    await new Promise((r) => setTimeout(r, 50));
    // Simulate C2 render frames
    for (let f = 0; f < 3; f++) rpm2.update(0.016);
  }

  console.log('After walking, C1 on C2:');
  console.log('  targetPos:', entryC1.targetPos);
  console.log('  currentPos:', entryC1.currentPos);
  console.log('  charGroup.position:', entryC1.characterGroup.position);

  // 4. Client 1 boards boat
  console.log('\n--- C1 boards boat (ACTIVE) ---');
  c1.emit('player:state', {
    state: 'ACTIVE',
    boatLevel: 1,
    transform: { x: 5.75, y: 0, z: 31, yaw: Math.PI, speed: 0 },
  });
  await new Promise((r) => setTimeout(r, 50));
  rpm2.update(0.016);

  console.log('After boarding, C1 on C2:');
  console.log('  state:', entryC1.state);
  console.log('  charGroup.visible:', entryC1.characterGroup.visible);
  console.log('  boatGroup.visible:', entryC1.boatGroup.visible);
  console.log('  boatGroup.position:', entryC1.boatGroup.position);

  // 5. Client 1 sails away into the ocean
  console.log('\n--- C1 sails away into the ocean ---');
  for (let i = 1; i <= 5; i++) {
    const x = 5.75 + i * 5;
    const z = 31 + i * 20;
    console.log(`C1 sending boat move step ${i}: (${x}, 0, ${z})`);
    c1.emit('player:move', {
      x,
      y: 0,
      z,
      yaw: Math.PI,
      speed: 10.0,
      state: 'ACTIVE',
      boatLevel: 1,
    });
    await new Promise((r) => setTimeout(r, 50));
    for (let f = 0; f < 3; f++) rpm2.update(0.016);
  }

  console.log('After sailing, C1 on C2:');
  console.log('  targetPos:', entryC1.targetPos);
  console.log('  currentPos:', entryC1.currentPos);
  console.log('  boatGroup.position:', entryC1.boatGroup.position);

  c1.disconnect();
  c2.disconnect();
  await server.stop();
}

run();

