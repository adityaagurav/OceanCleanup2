/**
 * test-two-client-boat-sync.mjs — Two-client multiplayer boat movement sync test.
 *
 * Reproduces the reported one-way bug:
 *   - Laptop A (host, joined first) can see Laptop B (friend) moving their boat.
 *   - Laptop B (friend) cannot see Laptop A (host) moving their boat.
 *
 * The harness runs the REAL client stack:
 *   - src/multiplayer/NetworkManager.js      (socket.io client, join, events)
 *   - src/multiplayer/RemotePlayerManager.js (remote boat spawn/state/apply)
 *   - server/multiplayerServer.js            (authoritative server)
 * and faithfully replicates Engine._fixedUpdate's ordering:
 *   BOAT branch runs the Phase 3B collision probe (rpm.getActiveOceanBoats())
 *   BEFORE the 20 Hz player:move send block, with GameLoop.js's catch semantics
 *   (a throw aborts the remainder of that fixed tick — including the send).
 *
 * Phases:
 *   Phase 1 — A stays on foot at the harbor (HARBOR), B sails (ACTIVE).
 *            Expected (report): A sees B moving. Both directions should work.
 *   Phase 2 — A boards and sails (both ACTIVE).
 *            Expected (report): B must see A moving — this is the failing case.
 *
 * Exits non-zero on any assertion failure.
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MultiplayerServer } from '../server/multiplayerServer.js';
import { RemotePlayerManager } from '../src/multiplayer/RemotePlayerManager.js';
import { NetworkManager } from '../src/multiplayer/NetworkManager.js';
import { BoatCollisionSystem } from '../src/physics/BoatCollisionSystem.js';

const PORT = 3193;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SERVER_URL = `http://127.0.0.1:${PORT}`;

function createClient(name) {
  const nm = new NetworkManager({ serverUrl: SERVER_URL });
  const rpm = new RemotePlayerManager(new THREE.Scene(), {
    getHeight: () => 0,
    sample: () => 0,
  });

  const stats = {
    name,
    sent: 0,
    movedReceived: 0,
    stateReceived: 0,
    fixedUpdateErrors: [],
    netTimer: 0,
    gameState: 'HARBOR',
    lastSent: { x: 0, y: 1.5, z: 0 },
    localPos: { x: 0, y: 1.5, z: 0 },
  };

  // ── Event wiring (mirrors src/App.jsx engine effect) ─────────────────────
  nm.on('joinSuccess', (payload) => {
    if (payload.localPlayer) rpm.setLocalPlayer(payload.localPlayer, null);
    payload.existingPlayers?.forEach((p) => rpm.addPlayer(p));
  });
  nm.on('playerJoined', (p) => rpm.addPlayer(p));
  nm.on('playerLeft', (p) => rpm.removePlayer(p.playerId));
  nm.on('playersList', (players) => rpm.syncPlayers(players, nm.state.playerId));
  nm.on('playerMoved', (d) => {
    stats.movedReceived += 1;
    rpm.handlePlayerMove(d);
  });
  nm.on('playerStateChanged', (d) => {
    stats.stateReceived += 1;
    rpm.handlePlayerState(d);
  });

  /**
   * Faithful replica of Engine._fixedUpdate (src/engine/Engine.js ~line 478):
   *  1. BOAT branch → Phase 3B predictive collision probe
   *     (this.remotePlayers.getActiveOceanBoats()) — runs BEFORE the send.
   *  2. 20 Hz movement sync send block.
   * GameLoop.js wraps onFixedUpdate in try/catch: a throw aborts the rest of
   * the tick (accumulator reset) — so the send never happens that tick.
   */
  function fixedUpdate(dt) {
    try {
      if (stats.gameState === 'BOAT') {
        // Engine.js: const remoteBoats = this.remotePlayers.getActiveOceanBoats();
        const remoteBoats = rpm.getActiveOceanBoats();
        if (remoteBoats.length > 0) {
          const localBoatState = {
            id: 'local',
            playerId: nm.state.playerId || 'local',
            x: stats.localPos.x,
            z: stats.localPos.z,
            yaw: 0,
            speed: 8,
            level: 1,
            mass: 1200,
            deflectionVx: 0,
            deflectionVz: 0,
          };
          for (const rBoat of remoteBoats) {
            const col = BoatCollisionSystem.resolvePairCollision(localBoatState, rBoat);
            if (col) break;
          }
        }
      }

      // ── High-frequency Multiplayer Movement Sync (20 Hz) ───────────────
      stats.netTimer += dt;
      if (stats.netTimer >= 0.05) {
        stats.netTimer = 0;
        if (nm.isConnected()) {
          if (stats.gameState === 'HARBOR') {
            stats.lastSent = { ...stats.localPos };
            nm.sendPlayerMove({
              x: stats.localPos.x,
              y: stats.localPos.y,
              z: stats.localPos.z,
              yaw: 0,
              speed: 3,
              animState: 'Walk',
              state: 'DOCKED',
              boatLevel: 1,
            });
            stats.sent += 1;
          } else if (stats.gameState === 'BOAT') {
            stats.lastSent = { ...stats.localPos };
            nm.sendPlayerMove({
              x: stats.localPos.x,
              y: stats.localPos.y,
              z: stats.localPos.z,
              yaw: 0,
              speed: 8,
              deflectionVx: 0,
              deflectionVz: 0,
              state: 'ACTIVE',
              boatLevel: 1,
            });
            stats.sent += 1;
          }
        }
      }
    } catch (err) {
      // GameLoop.js: console.error + accumulator reset; tick aborted.
      if (stats.fixedUpdateErrors.length < 3) {
        stats.fixedUpdateErrors.push(`${err.constructor.name}: ${err.message}`);
      }
    }
  }

  async function join(username) {
    nm.connect();
    for (let i = 0; i < 100 && !nm.isConnected(); i++) await sleep(50);
    assert.ok(nm.isConnected(), `${name}: socket must connect`);
    const ack = await nm.joinGame(username, 1);
    assert.equal(ack.success, true, `${name}: join must succeed`);
    // Mirror App.jsx engine-creation state sync
    if (nm.state.localPlayer) rpm.setLocalPlayer(nm.state.localPlayer, null);
    if (nm.state.players.length > 0) rpm.syncPlayers(nm.state.players, nm.state.playerId);
    await sleep(150); // let join broadcasts settle
  }

  function board(x, y, z) {
    stats.gameState = 'BOAT';
    stats.localPos = { x, y, z };
    nm.sendPlayerState({
      state: 'ACTIVE',
      boatLevel: 1,
      transform: { x, y, z, yaw: 0, speed: 0 },
    });
  }

  function remoteEntry(otherPlayerId) {
    return rpm.remoteEntities.get(otherPlayerId);
  }

  return { nm, rpm, stats, fixedUpdate, join, board, remoteEntry };
}

async function runTicks(a, b, durationMs) {
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    a.fixedUpdate(1 / 60);
    b.fixedUpdate(1 / 60);
    try {
      a.rpm.update(1 / 60);
      b.rpm.update(1 / 60);
    } catch (err) {
      console.error('[GameLoop] Error during onRender:', err.message);
    }
    await sleep(16);
  }
}

function assertSeesMoving(receiver, sender, label) {
  const entry = receiver.remoteEntry(sender.nm.state.playerId);
  assert.ok(entry, `${label}: receiver must have a remote entry for sender`);
  const dx = entry.targetPos.x - sender.stats.lastSent.x;
  const dz = entry.targetPos.z - sender.stats.lastSent.z;
  const drift = Math.hypot(dx, dz);
  assert.ok(
    drift < 5,
    `${label}: receiver's targetPos must track sender (drift=${drift.toFixed(2)}m, ` +
      `target=(${entry.targetPos.x.toFixed(1)},${entry.targetPos.z.toFixed(1)}), ` +
      `sender=(${sender.stats.lastSent.x.toFixed(1)},${sender.stats.lastSent.z.toFixed(1)}))`
  );
}

async function main() {
  const server = new MultiplayerServer({ port: PORT, host: '127.0.0.1' });
  await server.start();

  const a = createClient('A-host');
  const b = createClient('B-friend');

  try {
    // A (host) joins first, B (friend) second — matches the report's roles.
    await a.join('HostA');
    await b.join('FriendB');
    await sleep(200);

    // ── Phase 1: A on foot at harbor, B sails ──────────────────────────────
    a.stats.gameState = 'HARBOR';
    a.stats.localPos = { x: -5.75, y: 1.5, z: 31 };
    b.board(10, 0, 100);

    const p1Start = { aMoved: a.stats.movedReceived, bMoved: b.stats.movedReceived };
    let t = 0;
    const p1End = Date.now() + 1500;
    while (Date.now() < p1End) {
      t += 0.05;
      b.stats.localPos = { x: 10 + 6 * t, y: 0, z: 100 }; // B sails east
      a.fixedUpdate(1 / 60);
      b.fixedUpdate(1 / 60);
      a.rpm.update(1 / 60);
      b.rpm.update(1 / 60);
      await sleep(16);
    }

    const p1aRecv = a.stats.movedReceived - p1Start.aMoved;
    const p1bRecv = b.stats.movedReceived - p1Start.bMoved;
    console.log(`\nPhase 1 (A=HARBOR, B=sailing): A sent=${a.stats.sent} B sent=${b.stats.sent}`);
    console.log(`  A received ${p1aRecv} player:moved | B received ${p1bRecv} player:moved`);
    console.log(`  A fixedUpdate errors: [${a.stats.fixedUpdateErrors.join(' | ') || 'none'}]`);
    console.log(`  B fixedUpdate errors: [${b.stats.fixedUpdateErrors.join(' | ') || 'none'}]`);

    assertSeesMoving(a, b, 'P1: A(host) sees B(friend) boat');   // report: works
    assertSeesMoving(b, a, 'P1: B(friend) sees A(host) on foot');
    console.log('  ✔ Phase 1: both directions track (matches "A sees B" report case)');

    // ── Phase 2: A boards and sails — the reported failing direction ──────
    a.board(-5.75, 0, 40);
    const p2Start = { aMoved: a.stats.movedReceived, bMoved: b.stats.movedReceived };
    const p2ErrStart = { a: a.stats.fixedUpdateErrors.length, b: b.stats.fixedUpdateErrors.length };
    t = 0;
    const p2End = Date.now() + 2000;
    while (Date.now() < p2End) {
      t += 0.05;
      a.stats.localPos = { x: -5.75 + 6 * t, y: 0, z: 40 + 4 * t }; // A sails
      b.stats.localPos = { x: 10 + 6 * (t + 1.5), y: 0, z: 100 };  // B keeps sailing
      a.fixedUpdate(1 / 60);
      b.fixedUpdate(1 / 60);
      a.rpm.update(1 / 60);
      b.rpm.update(1 / 60);
      await sleep(16);
    }

    const p2aRecv = a.stats.movedReceived - p2Start.aMoved;
    const p2bRecv = b.stats.movedReceived - p2Start.bMoved;
    console.log(`\nPhase 2 (both sailing): A sent=${a.stats.sent} B sent=${b.stats.sent}`);
    console.log(`  A received ${p2aRecv} player:moved | B received ${p2bRecv} player:moved`);
    console.log(
      `  A new fixedUpdate errors: [${a.stats.fixedUpdateErrors.slice(p2ErrStart.a).join(' | ') || 'none'}]`
    );
    console.log(
      `  B new fixedUpdate errors: [${b.stats.fixedUpdateErrors.slice(p2ErrStart.b).join(' | ') || 'none'}]`
    );

    // Report requirement: B (friend) must see A (host) moving in real time.
    assertSeesMoving(b, a, 'P2: B(friend) sees A(host) boat');
    console.log('  ✔ Phase 2: B(friend) sees A(host) boat moving');

    // And the reverse must keep working.
    assertSeesMoving(a, b, 'P2: A(host) sees B(friend) boat');
    console.log('  ✔ Phase 2: A(host) sees B(friend) boat moving');

    // No client-side fixed-update exceptions may remain.
    assert.equal(a.stats.fixedUpdateErrors.length, 0, 'A must have no fixedUpdate errors');
    assert.equal(b.stats.fixedUpdateErrors.length, 0, 'B must have no fixedUpdate errors');
    console.log('  ✔ No GameLoop fixedUpdate exceptions on either client');

    console.log('\nALL TWO-CLIENT BOAT SYNC ASSERTIONS PASSED');
  } finally {
    a.nm.disconnect();
    b.nm.disconnect();
    await server.stop();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
);
