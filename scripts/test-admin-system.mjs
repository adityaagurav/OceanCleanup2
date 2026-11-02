/**
 * test-admin-system.mjs — Comprehensive regression and feature verification for
 * the OceanCleanup lightweight Admin System.
 *
 * Verifies:
 *   1. Duplicate usernames are rejected (case-insensitive: "Aditya" vs "aditya").
 *   2. Usernames are freed when players disconnect.
 *   3. Reserved username "admin" cannot be claimed without the correct admin access code.
 *   4. Admin login with correct code grants administrator role (isAdmin: true).
 *   5. Normal players cannot execute admin events (unauthorized guard).
 *   6. Admin receives real-time player list updates (username, ID, status, boatLevel, coins, points).
 *   7. Players can file moderation reports with reason & description.
 *   8. Reports are broadcast to admins, and admin can update status (Pending -> Reviewed -> Resolved).
 *   9. Admin can issue in-game warnings delivered to target player.
 *  10. Admin can kick player from session (kicked player disconnected with clear reason).
 *  11. Admin cannot kick themselves.
 *  12. Report persistence across store restarts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ClientIO } from 'socket.io-client';
import { MultiplayerServer } from '../server/multiplayerServer.js';
import { LeaderboardStore } from '../server/LeaderboardStore.js';
import { ReportStore } from '../server/ReportStore.js';

const PORT = 3196;
const URL = `http://127.0.0.1:${PORT}`;
const ADMIN_CODE = 'superSecretAdminCode42';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log(`  ✔ ${label}`);
}
function eq(actual, expected, label) {
  assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`);
  passed += 1;
  console.log(`  ✔ ${label}`);
}

function createClient(name) {
  const socket = ClientIO(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
  const state = {
    name,
    warnings: [],
    kicked: [],
    adminInits: [],
    playersUpdates: [],
    reportsUpdates: [],
  };

  socket.on('player:warning', (d) => state.warnings.push(d));
  socket.on('player:kicked', (d) => state.kicked.push(d));
  socket.on('admin:init', (d) => state.adminInits.push(d));
  socket.on('admin:players_update', (d) => state.playersUpdates.push(d));
  socket.on('admin:reports_update', (d) => state.reportsUpdates.push(d));

  return { socket, state };
}

const join = (c, username, boatLevel = 1, adminCode = '', coins = 0) =>
  new Promise((r) => c.socket.emit('player:join', { username, boatLevel, adminCode, coins }, r));

const disconnect = (c) =>
  new Promise((r) => { c.socket.disconnect(); setTimeout(r, 120); });

async function main() {
  console.log('--- OceanCleanup Admin System Tests ---');

  const server = new MultiplayerServer({
    port: PORT,
    host: '127.0.0.1',
    adminAccessCode: ADMIN_CODE,
    leaderboardStore: new LeaderboardStore(),
    reportStore: new ReportStore(),
  });
  await server.start();

  // ── 1. Normal player joins ──────────────────────────────────────────
  console.log('\n1. Normal player joining');
  const p1 = createClient('Player1');
  const ack1 = await join(p1, 'Aditya', 1, '', 25);
  eq(ack1.success, true, 'Aditya successfully joins');
  eq(ack1.localPlayer.username, 'Aditya', 'Joined with requested name Aditya');
  eq(ack1.localPlayer.isAdmin, false, 'Normal player isAdmin is false');
  eq(ack1.localPlayer.coins, 25, 'Player coins registered');

  // ── 2. Duplicate username rejection (case-insensitive) ──────────────
  console.log('\n2. Duplicate username checks (case-insensitive)');
  const p2 = createClient('Player2');
  const dupExact = await join(p2, 'Aditya');
  eq(dupExact.success, false, 'Exact duplicate "Aditya" rejected');
  eq(dupExact.error, 'username-taken', 'Error code is username-taken');

  const dupLower = await join(p2, 'aditya');
  eq(dupLower.success, false, 'Lowercase duplicate "aditya" rejected');
  eq(dupLower.error, 'username-taken', 'Error code is username-taken');

  const dupUpper = await join(p2, 'ADITYA');
  eq(dupUpper.success, false, 'Uppercase duplicate "ADITYA" rejected');
  eq(dupUpper.error, 'username-taken', 'Error code is username-taken');

  // Join p2 with an available unique name
  const ack2 = await join(p2, 'Bob', 2, '', 50);
  eq(ack2.success, true, 'Bob joins with unique name');
  eq(ack2.localPlayer.username, 'Bob', 'Bob callsign confirmed');

  // ── 3. Username released on disconnect ──────────────────────────────
  console.log('\n3. Username released on disconnect');
  await disconnect(p1);
  const p3 = createClient('Player3');
  const ack3 = await join(p3, 'aditya');
  eq(ack3.success, true, 'aditya can now join after previous Aditya disconnected');
  eq(ack3.localPlayer.username, 'aditya', 'aditya callsign claimed');

  // ── 4. Reserved "admin" callsign protection ─────────────────────────
  console.log('\n4. Reserved "admin" callsign protection');
  const imposter = createClient('Imposter');
  const impNoCode = await join(imposter, 'admin');
  eq(impNoCode.success, false, 'Joining as "admin" without code rejected');
  eq(impNoCode.error, 'invalid-admin-code', 'Rejection reason is invalid-admin-code');

  const impBadCode = await join(imposter, 'Admin', 1, 'wrongPassword123');
  eq(impBadCode.success, false, 'Joining as "Admin" with incorrect code rejected');
  eq(impBadCode.error, 'invalid-admin-code', 'Rejection reason is invalid-admin-code');

  // Normal player cannot execute admin commands
  const unauthData = await new Promise((r) => imposter.socket.emit('admin:get_data', r));
  eq(unauthData.success, false, 'Unauthenticated admin:get_data rejected');
  eq(unauthData.error, 'unauthorized', 'Error code is unauthorized');

  const unauthKick = await new Promise((r) => imposter.socket.emit('admin:kick_player', { targetPlayerId: ack2.localPlayer.playerId }, r));
  eq(unauthKick.success, false, 'Unauthenticated admin:kick_player rejected');
  eq(unauthKick.error, 'unauthorized', 'Error code is unauthorized');

  // ── 5. Admin authentication ─────────────────────────────────────────
  console.log('\n5. Admin authentication with correct access code');
  const adminClient = createClient('Admin');
  const adminAck = await join(adminClient, 'admin', 3, ADMIN_CODE, 100);
  eq(adminAck.success, true, 'Admin successfully logs in with code');
  eq(adminAck.localPlayer.isAdmin, true, 'Admin localPlayer.isAdmin is true');
  eq(adminAck.localPlayer.username, 'Admin', 'Admin callsign assigned');

  await sleep(150);
  ok(adminClient.state.adminInits.length > 0, 'Admin received initial admin:init packet');
  const initData = adminClient.state.adminInits[0];
  ok(Array.isArray(initData.players), 'init packet contains players list');
  ok(Array.isArray(initData.reports), 'init packet contains reports list');

  // Another admin login while admin is connected rejected
  const admin2 = createClient('Admin2');
  const dupAdmin = await join(admin2, 'admin', 1, ADMIN_CODE);
  eq(dupAdmin.success, false, 'Duplicate admin login rejected while admin online');
  eq(dupAdmin.error, 'username-taken', 'Rejection reason is username-taken');
  await disconnect(admin2);

  // ── 6. Player Management (list, stats, auto-updates) ────────────────
  console.log('\n6. Player Management & live updates');
  const adminData = await new Promise((r) => adminClient.socket.emit('admin:get_data', r));
  eq(adminData.success, true, 'admin:get_data succeeds for authenticated admin');
  eq(adminData.players.length, 3, 'Admin sees all 3 joined players (Bob, aditya, Admin)');

  const bobEntry = adminData.players.find((p) => p.username === 'Bob');
  ok(!!bobEntry, 'Bob found in admin players list');
  eq(bobEntry.status, 'Online', 'Bob status is Online');
  eq(bobEntry.boatLevel, 2, 'Bob boat level is 2');
  eq(bobEntry.coins, 50, 'Bob coins is 50');

  // Bob syncs updated coins -> admin gets live update
  p2.socket.emit('player:sync_coins', { coins: 85 });
  await sleep(150);
  const latestPlayers = adminClient.state.playersUpdates.at(-1);
  ok(!!latestPlayers, 'Admin received real-time admin:players_update broadcast');
  eq(latestPlayers.find((p) => p.username === 'Bob')?.coins, 85, 'Bob updated coins reflected in admin broadcast');

  // ── 7. Player Reports (filing & management) ─────────────────────────
  console.log('\n7. Player Reports filing & status workflow');
  const repAck = await new Promise((r) =>
    p2.socket.emit(
      'admin:report_player',
      {
        reportedUsername: 'aditya',
        reportedPlayerId: ack3.localPlayer.playerId,
        reason: 'Griefing / Ramming',
        description: 'Repeatedly rammed my boat at the harbor dock.',
      },
      r
    )
  );
  eq(repAck.success, true, 'Bob successfully filed a report against aditya');
  ok(!!repAck.report?.id, 'Report received a unique ID');
  eq(repAck.report.status, 'Pending', 'Initial report status is Pending');
  eq(repAck.report.reporterUsername, 'Bob', 'Reporter username is recorded');
  eq(repAck.report.reportedUsername, 'aditya', 'Reported username is recorded');

  await sleep(150);
  const reportsBroadcast = adminClient.state.reportsUpdates.at(-1);
  ok(!!reportsBroadcast, 'Admin received live admin:reports_update broadcast');
  const foundReport = reportsBroadcast.find((r) => r.id === repAck.report.id);
  ok(!!foundReport, 'Filed report present in admin broadcast');
  eq(foundReport.reason, 'Griefing / Ramming', 'Reason matches');

  // Admin marks report as Reviewed
  const updateAck1 = await new Promise((r) =>
    adminClient.socket.emit('admin:update_report', { reportId: repAck.report.id, status: 'Reviewed' }, r)
  );
  eq(updateAck1.success, true, 'Admin successfully updated report to Reviewed');
  eq(updateAck1.report.status, 'Reviewed', 'Returned report status is Reviewed');

  // Admin marks report as Resolved
  const updateAck2 = await new Promise((r) =>
    adminClient.socket.emit('admin:update_report', { reportId: repAck.report.id, status: 'Resolved' }, r)
  );
  eq(updateAck2.success, true, 'Admin successfully updated report to Resolved');
  eq(updateAck2.report.status, 'Resolved', 'Returned report status is Resolved');

  // ── 8. Player Moderation: Warning ───────────────────────────────────
  console.log('\n8. Player Moderation: Warning');
  const warnAck = await new Promise((r) =>
    adminClient.socket.emit(
      'admin:warn_player',
      {
        targetPlayerId: ack3.localPlayer.playerId,
        message: 'Please refrain from colliding with moored boats.',
      },
      r
    )
  );
  eq(warnAck.success, true, 'admin:warn_player acknowledged with success');
  await sleep(150);
  eq(p3.state.warnings.length, 1, 'aditya received in-game warning notification');
  eq(p3.state.warnings[0].message, 'Please refrain from colliding with moored boats.', 'Warning message text matches');
  eq(p3.state.warnings[0].adminUsername, 'Admin', 'Admin sender recorded');

  // ── 9. Player Moderation: Kick ──────────────────────────────────────
  console.log('\n9. Player Moderation: Kick');
  let adityaDisconnected = false;
  p3.socket.on('disconnect', () => { adityaDisconnected = true; });

  const kickAck = await new Promise((r) =>
    adminClient.socket.emit(
      'admin:kick_player',
      {
        targetPlayerId: ack3.localPlayer.playerId,
        reason: 'Unsportsmanlike conduct.',
      },
      r
    )
  );
  eq(kickAck.success, true, 'admin:kick_player acknowledged with success');
  await sleep(200);

  eq(p3.state.kicked.length, 1, 'aditya received player:kicked event');
  eq(p3.state.kicked[0].reason, 'Unsportsmanlike conduct.', 'Kick reason matches');
  eq(adityaDisconnected, true, 'aditya socket was forcibly disconnected');

  // Admin self-kick protection
  const selfKick = await new Promise((r) =>
    adminClient.socket.emit('admin:kick_player', { targetPlayerId: adminAck.localPlayer.playerId }, r)
  );
  eq(selfKick.success, false, 'Admin cannot kick themselves');
  eq(selfKick.error, 'cannot-kick-self', 'Rejection code is cannot-kick-self');

  // ── 10. Report Persistence across store restart ─────────────────────
  console.log('\n10. Report persistence across server/store restarts');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-reports-'));
  const reportsFile = path.join(tmpDir, 'reports.json');
  try {
    const store1 = new ReportStore({ file: reportsFile });
    const r1 = store1.addReport({
      reportedUsername: 'Troublemaker',
      reporterUsername: 'Hero',
      reason: 'Spam',
      description: 'Persistent spamming',
    });
    store1.updateStatus(r1.id, 'Reviewed');

    // Simulate restart with store2
    const store2 = new ReportStore({ file: reportsFile });
    const loaded = store2.getReports();
    eq(loaded.length, 1, 'Report persisted across store restart');
    eq(loaded[0].reportedUsername, 'Troublemaker', 'Persisted report username matches');
    eq(loaded[0].status, 'Reviewed', 'Persisted report status matches');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Cleanup
  await disconnect(p2);
  await disconnect(imposter);
  await disconnect(adminClient);
  await server.stop();

  console.log(`\nALL ADMIN & MODERATION TESTS PASSED (${passed} assertions)`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nTEST FAILED:', err.message, err.stack);
    process.exit(1);
  }
);

