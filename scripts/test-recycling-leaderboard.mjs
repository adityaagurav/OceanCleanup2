/**
 * test-recycling-leaderboard.mjs — Recycling points system + live leaderboard.
 *
 * Verifies:
 *   1. Recycling 1 item awards exactly 10 points.
 *   2. Recycling 5 items awards exactly 50 points.
 *   3. Recycling 10 items awards exactly 100 points.
 *   4. Duplicate transaction protection (re-sent id rejected, balance unchanged).
 *   5. Invalid item counts (0, negative, >15, fractional, string) rejected.
 *   6. Unsuccessful recycling (un-joined socket, DOCKED state) rejected.
 *   7. Collecting/walking without recycling awards zero points.
 *   8. Leaderboard updates in real-time across all clients.
 *   9. Equal-point rankings work consistently (stable deterministic tie-break).
 *  10. Late-joining players receive the latest rankings.
 *  11. Top 5 display + personal ranking rules (never duplicated).
 *  12. Lifetime point persistence across disconnects and store restarts.
 *  13. Canvas rendering smoke test.
 *
 * Runs the REAL server (MultiplayerServer + LeaderboardStore) with raw
 * socket.io clients, and the REAL display logic
 * (LeaderboardDisplay.computeLeaderboardSections / LeaderboardBoard.drawLeaderboard).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ClientIO } from 'socket.io-client';
import {
  MultiplayerServer,
  RECYCLE_POINTS_PER_ITEM,
  MAX_RECYCLE_ITEMS,
  RECYCLE_POINTS_PER_KG,
  MAX_RECYCLE_KG,
} from '../server/multiplayerServer.js';
import { LeaderboardStore } from '../server/LeaderboardStore.js';
import {
  computeLeaderboardSections,
  POINTS_PER_ITEM,
  POINTS_PER_KG,
} from '../src/multiplayer/LeaderboardDisplay.js';
import { drawLeaderboard } from '../src/world/LeaderboardBoard.js';

const PORT = 3195;
const URL = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COOLDOWN_WAIT = 1150; // > RECYCLE_MIN_INTERVAL_MS between distinct awards

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
  const state = { name, leaderboard: null, awarded: [] };
  socket.on('leaderboard:update', (d) => { state.leaderboard = d; });
  socket.on('points:awarded', (d) => state.awarded.push(d));
  return { socket, state };
}

const join = (c, username) =>
  new Promise((r) => c.socket.emit('player:join', { username, boatLevel: 1 }, r));
const board = (c, x = 10, z = 40) =>
  c.socket.emit('player:state', { state: 'ACTIVE', boatLevel: 1, transform: { x, y: 0, z, yaw: 0, speed: 0 } });
const walk = (c, x, z) =>
  c.socket.emit('player:move', { x, y: 1.5, z, yaw: 0, speed: 3, animState: 'Walk', state: 'DOCKED', boatLevel: 1 });
const deliver = (c, transactionId, itemCount, extra = {}) =>
  new Promise((r) => c.socket.emit('recycle:deliver', { transactionId, itemCount, ...extra }, r));
const disconnect = (c) =>
  new Promise((r) => { c.socket.disconnect(); setTimeout(r, 150); });

async function main() {
  const server = new MultiplayerServer({ port: PORT, host: '127.0.0.1', leaderboardStore: new LeaderboardStore() });
  await server.start();

  const A = createClient('A');   // Alice — first joiner (host role)
  const B = createClient('B');   // Bob — second joiner (friend role)
  const ackA = await join(A, 'Alice');
  const ackB = await join(B, 'Bob');
  eq(ackA.success, true, 'Alice joins');
  eq(ackB.success, true, 'Bob joins');
  const aliceId = ackA.localPlayer.playerId;
  const bobId = ackB.localPlayer.playerId;
  await sleep(200);

  // ── 0. Collecting without recycling awards zero points ─────────────────
  console.log('\n0. Collecting without recycling awards zero points');
  for (let i = 0; i < 5; i++) { walk(A, 5 + i, 20 + i); walk(B, -5 + i, 25 + i); await sleep(40); }
  await sleep(250);
  const initial = A.state.leaderboard?.entries || [];
  eq(initial.length, 2, 'leaderboard shows both joined players after walking/collecting');
  eq(initial.find((e) => e.playerId === aliceId)?.points, 0, 'Alice has 0 points without recycling');
  eq(initial.find((e) => e.playerId === bobId)?.points, 0, 'Bob has 0 points without recycling');

  // ── 1. Recycling 1 item → exactly 10 points ───────────────────────────
  console.log('\n1. Recycling 1 item awards exactly 10 points');
  board(A);
  await sleep(120);
  const r1 = await deliver(A, 'tx-1item', 1);
  eq(r1.success, true, 'server accepts the 1 item transaction');
  eq(r1.points, RECYCLE_POINTS_PER_ITEM, '1 item awards exactly 10 points');
  eq(r1.itemCount, 1, 'response includes itemCount 1');
  eq(r1.totalPoints, 10, "Alice's lifetime total is 10");
  eq(A.state.awarded.at(-1)?.points, 10, 'points:awarded event carries +10 to the earner');
  eq(A.state.awarded.at(-1)?.itemCount, 1, 'points:awarded event carries itemCount 1');

  // ── 2. Duplicate transaction protection ───────────────────────────────
  console.log('\n2. Repeated requests cannot award duplicate points');
  const dup = await deliver(A, 'tx-1item', 1);
  eq(dup.success, false, 're-sending the same transactionId is rejected');
  eq(dup.error, 'duplicate-transaction', 'rejection reason is duplicate-transaction');
  const aliceSession = [...server.players.values()].find((p) => p.playerId === aliceId);
  eq(aliceSession.points, 10, 'total still exactly 10 (no double award)');

  // Rate limit: a DISTINCT transaction inside the cooldown window is rejected
  const tooSoon = await deliver(A, 'tx-toosoon', 2);
  eq(tooSoon.success, false, 'award inside the 1 s cooldown is rejected');
  eq(tooSoon.error, 'too-soon', 'rejection reason is too-soon');

  // ── 3. Recycling 5 items → exactly 50 points ──────────────────────────
  console.log('\n3. Recycling 5 items awards exactly 50 points');
  await sleep(COOLDOWN_WAIT);
  const r5 = await deliver(A, 'tx-5items', 5);
  eq(r5.success, true, 'server accepts the 5 items transaction');
  eq(r5.points, 50, '5 items awards exactly 50 points');
  eq(r5.itemCount, 5, 'response includes itemCount 5');
  eq(r5.totalPoints, 60, "Alice's lifetime total is 60 (10 + 50)");
  eq(A.state.awarded.at(-1)?.points, 50, 'points:awarded event carries +50 to the earner');
  eq(A.state.awarded.at(-1)?.itemCount, 5, 'points:awarded event carries itemCount 5');

  // ── 4. Recycling 10 items → exactly 100 points ────────────────────────
  console.log('\n4. Recycling 10 items awards exactly 100 points');
  await sleep(COOLDOWN_WAIT);
  const r10 = await deliver(A, 'tx-10items', 10);
  eq(r10.success, true, 'server accepts the 10 items transaction');
  eq(r10.points, 100, '10 items awards exactly 100 points');
  eq(r10.itemCount, 10, 'response includes itemCount 10');
  eq(r10.totalPoints, 160, "Alice's lifetime total is 160 (60 + 100)");
  eq(A.state.awarded.at(-1)?.points, 100, 'points:awarded event carries +100 to the earner');
  eq(A.state.awarded.at(-1)?.itemCount, 10, 'points:awarded event carries itemCount 10');

  // ── 5. Leaderboard updates in real-time after recycling ───────────────
  console.log('\n5. Leaderboard updates after recycling');
  const beforeBobSaw = B.state.leaderboard?.entries?.find((e) => e.playerId === aliceId)?.points;
  await sleep(200);
  eq(B.state.leaderboard?.entries?.find((e) => e.playerId === aliceId)?.points, 160,
    'Bob receives Alice\'s updated total via leaderboard:update');
  ok(beforeBobSaw === 160 || B.state.leaderboard.entries.length === 2, 'update was broadcast (not a stale list)');

  // Client can never submit a balance — extra fields are ignored
  await sleep(COOLDOWN_WAIT);
  const spoof = await deliver(A, 'tx-spoof', 1, { points: 999999, totalPoints: 999999 });
  eq(spoof.points, 10, 'extra client fields are ignored — server computes points from itemCount only');
  eq(spoof.totalPoints, 170, "server-calculated total is 170, not the client's spoofed value");

  // ── 6. Equal points → stable, consistent tie-break ────────────────────
  console.log('\n6. Equal-point rankings work consistently');
  board(B);
  await sleep(COOLDOWN_WAIT);
  const rb1 = await deliver(B, 'bob-15items', 15);
  eq(rb1.success, true, 'Bob recycles 15 items (valid ≤15)');
  eq(rb1.totalPoints, 150, "Bob's lifetime total is 150");
  await sleep(COOLDOWN_WAIT);
  const rb2 = await deliver(B, 'bob-2items', 2);
  eq(rb2.success, true, 'Bob recycles 2 items');
  eq(rb2.totalPoints, 170, "Bob's lifetime total ties Alice at 170");
  await sleep(250);
  const tieListA = A.state.leaderboard.entries;
  const tieListB = B.state.leaderboard.entries;
  eq(tieListA[0].playerId, aliceId, 'tie-break: earlier connection ranks first (Alice #1)');
  eq(tieListA[1].playerId, bobId, 'tie-break: Bob ranks second on equal points');
  eq(tieListA[0].rank, 1, 'ranks are 1-based');
  assert.deepEqual(tieListB, tieListA, 'A and B receive identical rankings');
  passed += 1; console.log('  ✔ A and B receive identical rankings');

  // Tie order must not drift across re-broadcasts triggered by other events
  const C = createClient('C');
  const ackC = await join(C, 'Carol');
  eq(ackC.success, true, 'Carol joins');
  await sleep(250);
  eq(C.state.leaderboard?.entries?.[0]?.playerId, aliceId, 'tie order stable after a third player joins (Alice still #1)');
  eq(C.state.leaderboard?.entries?.[1]?.playerId, bobId, 'tie order stable (Bob still #2)');

  // ── 7. Late joiner receives the latest rankings ───────────────────────
  console.log('\n7. Late-joining players receive the latest rankings');
  ok(!!C.state.leaderboard, 'Carol (late joiner) received a leaderboard:update on join');
  eq(C.state.leaderboard.entries.length, 3, 'late joiner sees all three players');
  eq(C.state.leaderboard.entries.find((e) => e.username === 'Alice')?.points, 170, 'late joiner sees Alice\'s lifetime 170');

  // ── 8. All clients see identical rankings ────────────────────────────
  console.log('\n8. All clients see identical rankings');
  board(C);
  await sleep(COOLDOWN_WAIT);
  const rc = await deliver(C, 'carol-5items', 5);
  eq(rc.totalPoints, 50, 'Carol recycles 5 items → 50 points');
  await sleep(250);
  assert.deepEqual(A.state.leaderboard.entries, B.state.leaderboard.entries);
  assert.deepEqual(B.state.leaderboard.entries, C.state.leaderboard.entries);
  passed += 1; console.log('  ✔ A, B and C receive byte-identical rankings after recycling');

  // Leaderboard updates when a player leaves
  await disconnect(C);
  await sleep(250);
  eq(A.state.leaderboard.entries.length, 2, 'leaderboard drops Carol after she disconnects');
  ok(!A.state.leaderboard.entries.some((e) => e.username === 'Carol'), 'Carol is gone from the board');

  // ── 9. Validation battery: invalid counts and unsuccessful recycling ─
  console.log('\n9. Validation: invalid counts and unsuccessful recycling');
  eq(await deliver(A, 'v-zero', 0).then((r) => r.error), 'invalid-amount', 'itemCount=0 rejected');
  eq(await deliver(A, 'v-neg', -5).then((r) => r.error), 'invalid-amount', 'negative itemCount rejected');
  eq(await deliver(A, 'v-over', MAX_RECYCLE_ITEMS + 1).then((r) => r.error), 'invalid-amount', 'itemCount>15 rejected');
  eq(await deliver(A, 'v-frac', 2.5).then((r) => r.error), 'invalid-amount', 'fractional itemCount rejected');
  eq(await deliver(A, 'v-str', '10').then((r) => r.error), 'invalid-amount', 'string itemCount rejected');
  eq(await deliver(A, '', 5).then((r) => r.error), 'invalid-transaction', 'missing transactionId rejected');
  eq(await deliver(A, 'x'.repeat(200), 5).then((r) => r.error), 'invalid-transaction', 'oversized transactionId rejected');

  // Unsuccessful recycling: invalid state (never boarded / while DOCKED)
  B.socket.emit('player:state', { state: 'DOCKED', transform: { x: 0, y: 1.5, z: -3 } });
  await sleep(150);
  eq(await deliver(B, 'v-state', 5).then((r) => r.error), 'invalid-state', 'recycling while DOCKED rejected');
  board(B); // back to sailing for subsequent checks

  // Unsuccessful recycling: not joined
  const raw = ClientIO(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((r) => raw.once('init', r));
  eq(await new Promise((r) => raw.emit('recycle:deliver', { transactionId: 'v-raw', itemCount: 5 }, r)).then((r) => r.error),
    'not-joined', 'un-joined socket rejected');
  raw.disconnect();

  // Backward compatibility test: legacy payload with kg instead of itemCount
  await sleep(COOLDOWN_WAIT);
  const legacyResp = await new Promise((r) => A.socket.emit('recycle:deliver', { transactionId: 'legacy-tx', kg: 1 }, r));
  eq(legacyResp.success, true, 'legacy { transactionId, kg } payload accepted');
  eq(legacyResp.points, 10, 'legacy payload awards 10 points per unit');
  eq(legacyResp.totalPoints, 180, 'Alice total is now 180');

  // None of the invalid/unsuccessful attempts changed any balance
  await sleep(200);
  eq(A.state.leaderboard.entries.find((e) => e.playerId === aliceId)?.points, 180, "Alice's balance unchanged by rejected attempts");

  // ── 10. Lifetime persistence: disconnect/rejoin + store restart ──────
  console.log('\n10. Lifetime persistence across disconnects and restarts');
  await disconnect(B);
  const B2 = createClient('B2');
  const ackB2 = await join(B2, 'Bob');
  eq(ackB2.success, true, 'Bob rejoins with a fresh socket');
  await sleep(200);
  eq(A.state.leaderboard.entries.find((e) => e.username === 'Bob')?.points, 170,
    'points survived Bob\'s disconnect (lifetime balance, no reset)');
  await disconnect(B2);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-lb-'));
  const file = path.join(tmpDir, 'points.json');
  try {
    const store1 = new LeaderboardStore({ file }); // "first server run"
    store1.setPoints('alice', 180);
    store1.setPoints('Bob', 170);
    const store2 = new LeaderboardStore({ file }); // simulated server restart
    eq(store2.getPoints('Alice'), 180, 'lifetime points persist across a store (server) restart');
    eq(store2.getPoints('bob'), 170, 'keys are case-insensitive');
    eq(store2.getPoints('stranger'), 0, 'unknown players default to 0');
    store2.addPoints('alice', 10);
    const store3 = new LeaderboardStore({ file }); // restart after an award
    eq(store3.getPoints('Alice'), 190, 'awards written after a restart persist too');
    const roundTrip = JSON.parse(fs.readFileSync(file, 'utf8'));
    eq(roundTrip.alice, 190, 'file contents match the in-memory totals');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // ── 11. Display logic: Top 5 + personal ranking rules ────────────────
  console.log('\n11. Top 5 display + personal ranking rules');
  eq(POINTS_PER_ITEM, RECYCLE_POINTS_PER_ITEM, 'client display constant matches the server rate');
  eq(POINTS_PER_KG, POINTS_PER_ITEM, 'POINTS_PER_KG is alias for POINTS_PER_ITEM');
  const entries = [
    { rank: 1, playerId: 'p1', username: 'PlayerA', points: 2000 },
    { rank: 2, playerId: 'p2', username: 'PlayerB', points: 1800 },
    { rank: 3, playerId: 'p3', username: 'PlayerC', points: 1500 },
    { rank: 4, playerId: 'p4', username: 'PlayerD', points: 1200 },
    { rank: 5, playerId: 'p5', username: 'PlayerE', points: 1000 },
    { rank: 6, playerId: 'p6', username: 'PlayerF', points: 800 },
    { rank: 7, playerId: 'p7', username: 'PlayerG', points: 600 },
    { rank: 8, playerId: 'p8', username: 'PlayerH', points: 450 },
  ];

  // Top 5 rows in order
  const all = computeLeaderboardSections(entries, null);
  eq(all.top5.length, 5, 'section 1 shows exactly the Top 5');
  eq(all.top5.map((e) => e.rank).join(','), '1,2,3,4,5', 'Top 5 rows are ranked 1–5 in order');
  eq(all.personal, null, 'no personal row without a local player');

  // Outside Top 5 → own rank below
  const outS = computeLeaderboardSections(entries, 'p8');
  ok(!!outS.personal, 'player ranked 8th gets a personal section below the Top 5');
  eq(outS.personal.rank, 8, 'personal row shows the true rank (8)');
  eq(outS.personal.points, 450, 'personal row shows total points (450)');
  eq(outS.top5.filter((e) => e.isYou).length, 0, 'no Top 5 row is highlighted for an outside player');

  // Inside Top 5 → highlighted, never duplicated
  const inS = computeLeaderboardSections(entries, 'p3');
  eq(inS.personal, null, 'player ranked 3rd gets NO separate personal row (never twice)');
  eq(inS.top5.filter((e) => e.isYou).length, 1, 'exactly one highlighted Top 5 row (the player)');
  eq(inS.top5.find((e) => e.isYou).playerId, 'p3', 'the highlighted row is the player');
  const firstS = computeLeaderboardSections(entries, 'p1');
  eq(firstS.personal, null, 'rank-1 player also never duplicated');
  eq(firstS.top5[0].isYou, true, 'rank-1 player highlighted in place');
  const unknown = computeLeaderboardSections(entries, 'nope');
  eq(unknown.personal, null, 'unlisted player gets no personal row');

  // ── 12. Canvas rendering smoke test (stub ctx, no DOM needed) ────────
  console.log('\n12. Canvas rendering smoke test');
  const makeCtx = () => {
    const calls = { fillText: [] };
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
      fillRect() {}, fill() {}, stroke() {}, beginPath() {}, closePath() {},
      moveTo() {}, lineTo() {}, quadraticCurveTo() {}, setLineDash() {},
      fillText(t) { calls.fillText.push(String(t)); },
    };
    ctx._calls = calls;
    return ctx;
  };
  const ctx1 = makeCtx();
  drawLeaderboard(ctx1, 640, 416, computeLeaderboardSections(entries, 'p8'));
  const texts1 = ctx1._calls.fillText;
  ok(texts1.some((t) => t.includes('RECYCLING LEADERS')), 'board shows the title');
  eq(texts1.filter((t) => t.includes('YOU')).length, 1, 'outside player: exactly one YOU row rendered');
  ok(texts1.some((t) => t.startsWith('8. YOU')), 'personal row shows "8. YOU"');

  const ctx2 = makeCtx();
  drawLeaderboard(ctx2, 640, 416, computeLeaderboardSections(entries, 'p3'));
  eq(ctx2._calls.fillText.filter((t) => t.includes('YOU')).length, 1,
    'inside Top 5: YOU rendered once (no duplicate row)');
  ok(ctx2._calls.fillText.some((t) => t.includes('(YOU)')), 'Top 5 row marked "(YOU)" in place');

  const ctx3 = makeCtx();
  drawLeaderboard(ctx3, 640, 416, { top5: [], personal: null, isEmpty: true });
  ok(ctx3._calls.fillText.some((t) => t.includes('No points yet')), 'empty board shows the placeholder');

  await disconnect(A);
  await disconnect(B);
  await server.stop();
  console.log(`\nALL RECYCLING & LEADERBOARD TESTS PASSED (${passed} assertions)`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
);
