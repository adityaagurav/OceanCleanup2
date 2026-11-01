import { io as ClientIO } from 'socket.io-client';
import { MultiplayerServer } from '../server/multiplayerServer.js';

const TEST_PORT = 3192;
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

  const c1 = createClient();
  const c2 = createClient();

  const c1Init = await new Promise(r => c1.once('init', r));
  const c2Init = await new Promise(r => c2.once('init', r));
  console.log('C1 init:', c1Init.playerId);
  console.log('C2 init:', c2Init.playerId);

  // Client 1 joins
  c1.emit('player:join', { username: 'Player1', boatLevel: 1 });
  const c1Join = await new Promise(r => c1.once('player:joined_success', r));
  console.log('C1 join success:', c1Join.localPlayer.username);

  // Client 2 listens to events
  const c2Events = [];
  c2.on('player:joined', (d) => c2Events.push({ type: 'player:joined', d }));
  c2.on('players:list', (d) => c2Events.push({ type: 'players:list', count: d.players.length }));
  c2.on('player:moved', (d) => c2Events.push({ type: 'player:moved', d }));
  c2.on('player:state_changed', (d) => c2Events.push({ type: 'player:state_changed', d }));

  // Client 2 joins
  c2.emit('player:join', { username: 'Player2', boatLevel: 1 });
  const c2Join = await new Promise(r => c2.once('player:joined_success', r));
  console.log('C2 join success:', c2Join.localPlayer.username);

  // Client 1 moves on foot
  console.log('C1 sending player:move (foot)...');
  c1.emit('player:move', {
    x: 10,
    y: 1.5,
    z: 25,
    yaw: 1.2,
    speed: 3.5,
    animState: 'Run',
    state: 'DOCKED',
    boatLevel: 1,
  });

  await new Promise(r => setTimeout(r, 200));

  // Client 1 boards boat
  console.log('C1 sending player:state (ACTIVE)...');
  c1.emit('player:state', {
    state: 'ACTIVE',
    boatLevel: 1,
    transform: { x: 5.75, y: 0, z: 31, yaw: Math.PI, speed: 0 },
  });

  await new Promise(r => setTimeout(r, 200));

  // Client 1 sails away in ocean
  console.log('C1 sending player:move (boat in ocean)...');
  c1.emit('player:move', {
    x: 45,
    y: 0.1,
    z: 120,
    yaw: 2.5,
    speed: 8.0,
    state: 'ACTIVE',
    boatLevel: 1,
  });

  await new Promise(r => setTimeout(r, 200));

  console.log('Events captured by C2:');
  for (const ev of c2Events) {
    if (ev.type === 'player:moved') {
      console.log(' -> player:moved:', ev.d.playerId, ev.d.state, ev.d.transform);
    } else if (ev.type === 'player:state_changed') {
      console.log(' -> player:state_changed:', ev.d.playerId, ev.d.state, ev.d.transform);
    } else {
      console.log(' ->', ev.type, ev);
    }
  }

  c1.disconnect();
  c2.disconnect();
  await server.stop();
}

run();

