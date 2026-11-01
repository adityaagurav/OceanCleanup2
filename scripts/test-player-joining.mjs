/**
 * test-player-joining.mjs — Comprehensive automated test suite for Phase 2:
 * Player Identity and Joining System in OceanCleanup.io.
 *
 * Verifies:
 *  1. Unique player IDs and temporary guest usernames generated on connection.
 *  2. Custom guest username registration.
 *  3. Automatic fallback name if username is omitted or blank.
 *  4. Duplicate username resolution (appends _2, _3).
 *  5. Distinct visual boat colors (from COLOR_PALETTE) and harbour berths (from HARBOR_BERTHS).
 *  6. Broadcasting of join events (`player:joined`) to other connected clients.
 *  7. Reception of existing players list on join (`player:joined_success`).
 *  8. Up-to-date connected players list (`players:list`).
 *  9. Broadcasting of departure (`player:left`) and removal from active list on disconnect.
 * 10. Prevention of duplicate player registrations on re-join or reconnection.
 */

import assert from 'node:assert/strict';
import { io as ClientIO } from 'socket.io-client';
import { MultiplayerServer, COLOR_PALETTE, HARBOR_BERTHS } from '../server/multiplayerServer.js';

console.log('⛵ Starting Phase 2: Player Identity & Joining Test Suite...\n');

const TEST_PORT = 3099;
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

    // ── TEST 1: Unique Player ID and Temp Username on Connection ───────────
    console.log('Test 1: Unique Player ID & Temp Username on Connection');
    const client1 = createClient();
    const init1 = await waitForEvent(client1, 'init');

    assert.ok(init1.socketId, 'Client 1 must receive socketId');
    assert.ok(init1.playerId, 'Client 1 must receive playerId');
    assert.ok(init1.tempUsername, 'Client 1 must receive temporary guest username');
    assert.equal(typeof init1.playerId, 'string');
    assert.ok(init1.playerId.startsWith('p_'));
    console.log(`  ✔ Client 1 connected: ID=${init1.playerId}, TempName="${init1.tempUsername}"`);

    const client2 = createClient();
    const init2 = await waitForEvent(client2, 'init');
    assert.notEqual(init1.playerId, init2.playerId, 'Player IDs must be unique');
    assert.notEqual(init1.socketId, init2.socketId, 'Socket IDs must be unique');
    console.log(`  ✔ Client 2 connected: ID=${init2.playerId}, TempName="${init2.tempUsername}"`);
    console.log('  ✔ Unique player IDs and temporary usernames verified\n');

    // ── TEST 2: Custom Guest Username Registration ─────────────────────────
    console.log('Test 2: Custom Guest Username Registration');
    client1.emit('player:join', { username: 'CaptainEco', boatLevel: 1 });
    const join1Success = await waitForEvent(client1, 'player:joined_success');

    assert.equal(join1Success.success, true);
    assert.equal(join1Success.localPlayer.username, 'CaptainEco');
    assert.equal(join1Success.localPlayer.playerId, init1.playerId);
    assert.ok(join1Success.localPlayer.color, 'Must be assigned a color theme');
    assert.ok(join1Success.localPlayer.berth, 'Must be assigned a harbour berth');
    assert.equal(join1Success.existingPlayers.length, 0, 'First player has no existing players');
    console.log(`  ✔ Player 1 joined as "${join1Success.localPlayer.username}" with color ${join1Success.localPlayer.color.name} at Berth (${join1Success.localPlayer.berth.x}, ${join1Success.localPlayer.berth.z})\n`);

    // ── TEST 3: Duplicate Username Resolution & Join Broadcast ─────────────
    console.log('Test 3: Duplicate Username Handling & Join Broadcast');
    // Client 2 attempts to join with the SAME username: "CaptainEco"
    // Client 1 should receive a 'player:joined' broadcast
    const joinBroadcastPromise = waitForEvent(client1, 'player:joined');

    client2.emit('player:join', { username: 'CaptainEco', boatLevel: 1 });
    const join2Success = await waitForEvent(client2, 'player:joined_success');
    const joinBroadcast = await joinBroadcastPromise;

    assert.equal(join2Success.success, true);
    assert.equal(join2Success.localPlayer.username, 'CaptainEco_2', 'Duplicate username must receive _2 suffix');
    assert.equal(joinBroadcast.player.username, 'CaptainEco_2', 'Broadcasted username must match resolved unique name');
    assert.equal(join2Success.existingPlayers.length, 1, 'Client 2 must receive existing player (Client 1)');
    assert.equal(join2Success.existingPlayers[0].username, 'CaptainEco');

    // Berths and colors must be visually distinct
    assert.notEqual(
      join1Success.localPlayer.color.primary,
      join2Success.localPlayer.color.primary,
      'Players must have distinct boat colors'
    );
    assert.notEqual(
      `${join1Success.localPlayer.berth.x},${join1Success.localPlayer.berth.z}`,
      `${join2Success.localPlayer.berth.x},${join2Success.localPlayer.berth.z}`,
      'Players must have separate non-overlapping harbour berths'
    );
    console.log(`  ✔ Duplicate "CaptainEco" resolved to "${join2Success.localPlayer.username}"`);
    console.log(`  ✔ Separate distinct colors: ${join1Success.localPlayer.color.name} vs ${join2Success.localPlayer.color.name}`);
    console.log(`  ✔ Separate distinct berths: (${join1Success.localPlayer.berth.x}, ${join1Success.localPlayer.berth.z}) vs (${join2Success.localPlayer.berth.x}, ${join2Success.localPlayer.berth.z})\n`);

    // ── TEST 4: Automatic Fallback Name on Blank / Empty Username ──────────
    console.log('Test 4: Automatic Fallback Name for Blank/Empty Usernames');
    const client3 = createClient();
    await waitForEvent(client3, 'init');

    client3.emit('player:join', { username: '   ' }); // Empty spaces
    const join3Success = await waitForEvent(client3, 'player:joined_success');

    assert.equal(join3Success.success, true);
    assert.ok(join3Success.localPlayer.username.length > 2);
    assert.notEqual(join3Success.localPlayer.username.trim(), '');
    console.log(`  ✔ Blank username automatically received fallback name: "${join3Success.localPlayer.username}"\n`);

    // ── TEST 5: Active Player List Accuracy ────────────────────────────────
    console.log('Test 5: Active Connected Player List Broadcast');
    const client4 = createClient();
    await waitForEvent(client4, 'init');

    const listUpdatePromise = waitForEvent(client1, 'players:list');
    client4.emit('player:join', { username: 'WaveRider' });
    await waitForEvent(client4, 'player:joined_success');
    const listUpdate = await listUpdatePromise;

    const activeUsernames = listUpdate.players.map((p) => p.username);
    assert.ok(activeUsernames.includes('CaptainEco'));
    assert.ok(activeUsernames.includes('CaptainEco_2'));
    assert.ok(activeUsernames.includes(join3Success.localPlayer.username));
    assert.ok(activeUsernames.includes('WaveRider'));
    assert.equal(listUpdate.players.length, 4);
    console.log(`  ✔ Active player list accurately reflects 4 players: ${activeUsernames.join(', ')}\n`);

    // ── TEST 6: Disconnection & Departure Broadcast ────────────────────────
    console.log('Test 6: Player Disconnection, Cleanup & player:left Broadcast');
    const leavePromise = waitForEvent(client1, 'player:left');
    const listAfterLeavePromise = waitForEvent(client1, 'players:list');

    client4.disconnect();
    const leavePayload = await leavePromise;
    const listAfterLeave = await listAfterLeavePromise;

    assert.equal(leavePayload.username, 'WaveRider');
    assert.ok(leavePayload.playerId);
    assert.equal(listAfterLeave.players.length, 3, 'Player list must decrease to 3 after departure');
    assert.ok(!listAfterLeave.players.some((p) => p.username === 'WaveRider'));
    console.log(`  ✔ Client 4 departure broadcasted: "${leavePayload.username}" left the harbour`);
    console.log(`  ✔ Active player list decremented to ${listAfterLeave.players.length} players\n`);

    // ── TEST 7: Reconnection Handling Without Duplicate Registrations ──────
    console.log('Test 7: Reconnection Without Duplicate Registrations');
    // Client 2 re-joins with the same socket
    client2.emit('player:join', { username: 'CaptainEco_2' });
    const rejoinSuccess = await waitForEvent(client2, 'player:joined_success');
    assert.equal(rejoinSuccess.success, true);
    assert.equal(server.getJoinedPlayers().length, 3, 'Re-join on existing socket must not create duplicate player entry');
    console.log('  ✔ Reconnection handled cleanly without duplicate entries\n');

    // Cleanup clients
    client1.disconnect();
    client2.disconnect();
    client3.disconnect();

    await server.stop();
    console.log('🎉 All Phase 2 Player Identity & Joining Tests Passed Successfully (7/7)!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Phase 2 Test Failure:', err);
    try { await server.stop(); } catch (e) {}
    process.exit(1);
  }
}

runTests();
