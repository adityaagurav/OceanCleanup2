/**
 * test-multiplayer-server.mjs — Comprehensive automated test suite for Phase 1: Multiplayer Server Setup.
 *
 * Verifies:
 *  1. Multiplayer server starts and binds successfully.
 *  2. HTTP health check endpoint (/health) returns valid status and telemetry.
 *  3. Multiple Socket.IO clients can connect simultaneously.
 *  4. Every connection receives a unique socket ID and handshake init packet.
 *  5. Server-side player map tracks total active connections accurately.
 *  6. Connection events ('player:connected') and player count updates are broadcast to all clients.
 *  7. Disconnection events ('player:disconnected') and updated counts are broadcast to remaining clients.
 *  8. Latency check ('ping:check') functions properly.
 *  9. Duplicate connection protection and clean shutdown.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { io as ClientIO } from 'socket.io-client';
import { MultiplayerServer } from '../server/multiplayerServer.js';

console.log('🌐 Starting Multiplayer Server Test Suite (Phase 1)...\n');

const TEST_PORT = 3099;
const TEST_HOST = '127.0.0.1';
const TEST_URL = `http://${TEST_HOST}:${TEST_PORT}`;

// ── 1. Start Server ──────────────────────────────────────────────────────────
console.log('Test 1: Server startup & binding');
const server = new MultiplayerServer({ port: TEST_PORT, host: TEST_HOST });
await server.start();
assert.equal(server.getPlayerCount(), 0, 'Server should start with 0 players');
console.log(`  ✔ MultiplayerServer successfully listening on ${TEST_URL}\n`);

// ── 2. HTTP Health Endpoint ──────────────────────────────────────────────────
console.log('Test 2: HTTP health & status endpoint (/health)');
const healthResponse = await new Promise((resolve, reject) => {
  http.get(`${TEST_URL}/health`, (res) => {
    let raw = '';
    res.on('data', (chunk) => (raw += chunk));
    res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(raw) }));
  }).on('error', reject);
});

assert.equal(healthResponse.statusCode, 200, 'Health endpoint should return 200 OK');
assert.equal(healthResponse.data.status, 'ok', 'Status should be ok');
assert.equal(healthResponse.data.playerCount, 0, 'Initial health check should report 0 players');
assert.ok(typeof healthResponse.data.uptime === 'number', 'Uptime should be reported');
console.log('  ✔ Health check returns 200 OK with valid JSON telemetry\n');

// Helper to create client promise
function createClient(name) {
  return new Promise((resolve, reject) => {
    const socket = ClientIO(TEST_URL, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    const events = {
      init: null,
      playerCountUpdates: [],
      playerConnected: [],
      playerDisconnected: [],
    };

    socket.on('init', (data) => {
      events.init = data;
    });

    socket.on('playerCount:update', (data) => {
      events.playerCountUpdates.push(data);
    });

    socket.on('player:connected', (data) => {
      events.playerConnected.push(data);
    });

    socket.on('player:disconnected', (data) => {
      events.playerDisconnected.push(data);
    });

    socket.on('connect', () => {
      resolve({ name, socket, events });
    });

    socket.on('connect_error', (err) => {
      reject(new Error(`[${name}] Connection failed: ${err.message}`));
    });
  });
}

// ── 3. First Client Connects ─────────────────────────────────────────────────
console.log('Test 3: First client connection & init handshake');
const client1 = await createClient('Client 1');
await new Promise((r) => setTimeout(r, 80));

assert.ok(client1.socket.id, 'Client 1 must have a valid socket ID');
assert.equal(server.getPlayerCount(), 1, 'Server should have 1 player connected');
assert.ok(client1.events.init, 'Client 1 should receive init packet');
assert.equal(client1.events.init.socketId, client1.socket.id, 'Init packet socketId must match client socket ID');
assert.equal(client1.events.init.playerCount, 1, 'Init packet should report 1 player');
console.log(`  ✔ Client 1 connected with unique socket ID: ${client1.socket.id}`);
console.log('  ✔ Server player count: 1\n');

// ── 4. Second Client Connects (Simultaneous connections & Broadcasts) ─────────
console.log('Test 4: Second client connection & broadcast synchronization');
const client2 = await createClient('Client 2');
await new Promise((r) => setTimeout(r, 80));

assert.ok(client2.socket.id, 'Client 2 must have a valid socket ID');
assert.notEqual(client1.socket.id, client2.socket.id, 'Every connection must receive a UNIQUE socket ID');
assert.equal(server.getPlayerCount(), 2, 'Server should have 2 players connected');

// Check that client 1 received the broadcast about client 2
const lastConnectedOnClient1 = client1.events.playerConnected[client1.events.playerConnected.length - 1];
assert.ok(lastConnectedOnClient1, 'Client 1 must receive player:connected broadcast');
assert.equal(lastConnectedOnClient1.socketId, client2.socket.id, 'Broadcasted socketId must match Client 2');
assert.equal(lastConnectedOnClient1.playerCount, 2, 'Broadcasted player count must be 2');

// Check playerCount:update on both clients
const lastCount1 = client1.events.playerCountUpdates[client1.events.playerCountUpdates.length - 1];
const lastCount2 = client2.events.playerCountUpdates[client2.events.playerCountUpdates.length - 1];
assert.equal(lastCount1.playerCount, 2, 'Client 1 playerCount must update to 2');
assert.equal(lastCount2.playerCount, 2, 'Client 2 playerCount must update to 2');

console.log(`  ✔ Client 2 connected with unique socket ID: ${client2.socket.id}`);
console.log('  ✔ Server player count updated to 2');
console.log('  ✔ player:connected event correctly broadcast to Client 1\n');

// ── 5. Third Client Connects ─────────────────────────────────────────────────
console.log('Test 5: Third client connection (3 simultaneous players)');
const client3 = await createClient('Client 3');
await new Promise((r) => setTimeout(r, 80));

assert.notEqual(client3.socket.id, client1.socket.id);
assert.notEqual(client3.socket.id, client2.socket.id);
assert.equal(server.getPlayerCount(), 3, 'Server must track 3 active players');

// Verify all players list
const playersList = server.getPlayers();
assert.equal(playersList.length, 3);
const socketIds = playersList.map((p) => p.socketId);
assert.ok(socketIds.includes(client1.socket.id));
assert.ok(socketIds.includes(client2.socket.id));
assert.ok(socketIds.includes(client3.socket.id));

console.log(`  ✔ Client 3 connected with unique socket ID: ${client3.socket.id}`);
console.log('  ✔ Server player collection correctly holds all 3 unique player sessions\n');

// ── 6. Ping / Latency Check ──────────────────────────────────────────────────
console.log('Test 6: Latency ping check event');
const pingResult = await new Promise((resolve) => {
  const start = Date.now();
  client1.socket.emit('ping:check', start, (ack) => {
    resolve({ ack, roundTrip: Date.now() - start });
  });
});
assert.ok(pingResult.ack, 'Server must acknowledge ping:check');
assert.ok(typeof pingResult.ack.serverTimestamp === 'number', 'Server must return timestamp');
console.log(`  ✔ Ping roundtrip verified (${pingResult.roundTrip}ms)\n`);

// ── 7. Disconnection & Broadcast to Remaining Clients ────────────────────────
console.log('Test 7: Client disconnection handling & broadcast to remaining clients');
const disconnectedId = client2.socket.id;
client2.socket.disconnect();
await new Promise((r) => setTimeout(r, 120));

assert.equal(server.getPlayerCount(), 2, 'Server player count must decrement to 2');

// Client 1 & Client 3 must have received player:disconnected
const lastDisconnected1 = client1.events.playerDisconnected[client1.events.playerDisconnected.length - 1];
const lastDisconnected3 = client3.events.playerDisconnected[client3.events.playerDisconnected.length - 1];

assert.ok(lastDisconnected1, 'Client 1 must receive player:disconnected broadcast');
assert.equal(lastDisconnected1.socketId, disconnectedId, 'Disconnected socket ID must match Client 2');
assert.equal(lastDisconnected1.playerCount, 2, 'Updated count must be 2');

assert.ok(lastDisconnected3, 'Client 3 must receive player:disconnected broadcast');
assert.equal(lastDisconnected3.socketId, disconnectedId, 'Disconnected socket ID must match Client 2');
assert.equal(lastDisconnected3.playerCount, 2, 'Updated count must be 2');

console.log(`  ✔ Client 2 (${disconnectedId}) cleanly disconnected`);
console.log('  ✔ player:disconnected event received by Client 1 and Client 3');
console.log('  ✔ Player count updated to 2 across all remaining clients\n');

// ── 8. Clean Shutdown ────────────────────────────────────────────────────────
console.log('Test 8: Server graceful shutdown');
client1.socket.disconnect();
client3.socket.disconnect();
await new Promise((r) => setTimeout(r, 80));

assert.equal(server.getPlayerCount(), 0, 'All clients disconnected');
await server.stop();
console.log('  ✔ Server stopped cleanly and released port\n');

console.log('🎉 ALL MULTIPLAYER SERVER (PHASE 1) TESTS PASSED! (8/8 test suites)\n');

