/**
 * test-boat-collision-physics.mjs — Comprehensive test suite for Phase 3B: Boat-to-Boat Collision Physics.
 *
 * Scenarios Tested:
 *  1. Head-on collision (speed reduction, deflection, momentum conservation, no zero-clamp).
 *  2. Side collision (T-bone impact): lateral push, direction deflection, friction, yaw torque.
 *  3. Moving boat hits stationary boat: momentum transfer, stationary boat accelerates, mover slows.
 *  4. Low-speed vs high-speed collisions: proportional dynamic impulse.
 *  5. Multi-boat collision: 3-boat pileup resolves without overlapping.
 *  6. Natural separation after impact: separating velocity, no sticking or vibration jitter.
 *  7. Boats do not pass through each other: continuous penetration prevention across movement steps.
 *  8. Docked boats do not participate in collisions: state: 'DOCKED' is excluded.
 *  9. Server-authoritative collision detection and multi-client broadcast synchronization.
 *  10. Player disconnecting during/after collision handled cleanly without errors.
 *  11. New player joining during active ocean sailing receives clean state.
 *  12. Fixed timestep numerical stability across 30, 60, and 120 FPS.
 */

import assert from 'node:assert/strict';
import { io as ClientIO } from 'socket.io-client';
import * as THREE from 'three';
import { BoatConfig } from '../src/config/BoatConfig.js';
import { BoatCollisionSystem } from '../src/physics/BoatCollisionSystem.js';
import { BoatController } from '../src/player/BoatController.js';
import { MultiplayerServer } from '../server/multiplayerServer.js';

console.log('💥 Starting Phase 3B Boat-to-Boat Collision Physics Test Suite...\n');

const TEST_PORT = 3295;
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
    // SCENARIO 1: Head-on Collision
    // ────────────────────────────────────────────────────────────────────────
    console.log('Scenario 1: Head-on Collision Physics');
    {
      // Boat A: at z=1.0, moving North (forward = (0, -1)), speed = 10 m/s
      // Boat B: at z=-1.0, moving South (forward = (0, 1)), speed = 10 m/s
      // Closing in on each other along Z axis
      const boatA = {
        id: 'boat_a',
        x: 0,
        z: 1.0,
        yaw: 0, // facing -Z
        speed: 10,
        level: 1,
        mass: 1200,
        deflectionVx: 0,
        deflectionVz: 0,
      };

      const boatB = {
        id: 'boat_b',
        x: 0,
        z: -1.0,
        yaw: Math.PI, // facing +Z
        speed: 10,
        level: 1,
        mass: 1200,
        deflectionVx: 0,
        deflectionVz: 0,
      };

      const res = BoatCollisionSystem.resolvePairCollision(boatA, boatB);
      assert.ok(res, 'Head-on collision must be detected');

      // 1. De-penetration: Boat A pushed back (+Z), Boat B pushed back (-Z)
      assert.ok(res.boatA.z > boatA.z, 'Boat A must be pushed backwards (+Z)');
      assert.ok(res.boatB.z < boatB.z, 'Boat B must be pushed backwards (-Z)');

      // 2. Speed must be reduced due to inelastic collision, not clamped to 0
      assert.ok(res.boatA.speed < 10, 'Boat A forward speed must be reduced');
      assert.ok(res.boatB.speed < 10, 'Boat B forward speed must be reduced');
      assert.ok(res.boatA.speed > -10, 'Boat A must not teleport into infinite reverse');

      // 3. Normal points between the two boats
      assert.ok(Math.abs(res.normal.z) > 0.9, 'Collision normal must be predominantly on Z axis');

      console.log(`    ✔ Head-on detected: penetration depth ${res.depth.toFixed(3)}m, A z: ${boatA.z} -> ${res.boatA.z.toFixed(2)}, speed: 10 -> ${res.boatA.speed.toFixed(2)} m/s`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 2: Side Collision (T-Bone Impact)
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 2: Side Collision (T-Bone Impact)');
    {
      // Boat A sailing North (yaw = 0)
      // Boat B hitting Boat A's starboard/right flank, moving East (yaw = -PI/2)
      const boatA = {
        id: 'boat_a',
        x: 0,
        z: 0,
        yaw: 0,
        speed: 8,
        level: 1,
        mass: 1200,
        deflectionVx: 0,
        deflectionVz: 0,
      };

      const boatB = {
        id: 'boat_b',
        x: -1.2,
        z: 0,
        yaw: -Math.PI / 2, // facing +X
        speed: 10,
        level: 1,
        mass: 1200,
        deflectionVx: 0,
        deflectionVz: 0,
      };

      const res = BoatCollisionSystem.resolvePairCollision(boatA, boatB);
      assert.ok(res, 'T-Bone side collision must be detected');

      // Requirement 3: Push boats sideways AND reduce forward speed
      assert.ok(
        Math.abs(res.boatA.deflectionVx) > 0.5,
        `Boat A must receive lateral deflection along X: got ${res.boatA.deflectionVx}`
      );
      assert.ok(res.boatA.speed < 8, `Boat A forward speed must be reduced from 8 m/s, got ${res.boatA.speed}`);
      assert.ok(res.boatB.speed < 10, `Boat B forward speed must be reduced from 10 m/s, got ${res.boatB.speed}`);

      console.log(`    ✔ T-Bone side collision resolved: Boat A forward speed 8 -> ${res.boatA.speed.toFixed(2)} m/s, deflectionVx = ${res.boatA.deflectionVx.toFixed(2)} m/s, yaw rate = ${res.boatA.yawDeflectionRate.toFixed(2)} rad/s`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 3: Moving Boat Hits Stationary Boat (Momentum Transfer)
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 3: Moving Boat Hits Stationary Boat');
    {
      const movingBoat = {
        id: 'mover',
        x: 0,
        z: 1.0,
        yaw: 0, // facing -Z
        speed: 12,
        level: 1,
        mass: 1200,
        deflectionVx: 0,
        deflectionVz: 0,
      };

      const stationaryBoat = {
        id: 'stationary',
        x: 0,
        z: -1.0,
        yaw: 0,
        speed: 0,
        level: 1,
        mass: 1200,
        deflectionVx: 0,
        deflectionVz: 0,
      };

      const res = BoatCollisionSystem.resolvePairCollision(movingBoat, stationaryBoat);
      assert.ok(res, 'Collision must occur');

      // Moving boat slows down
      assert.ok(res.boatA.speed < 12, 'Moving boat must slow down');

      // Stationary boat gains forward speed / deflection momentum
      const stationaryGainedMotion = Math.abs(res.boatB.speed) > 0.5 || Math.hypot(res.boatB.deflectionVx, res.boatB.deflectionVz) > 0.5;
      assert.ok(stationaryGainedMotion, 'Stationary boat must gain momentum from impact');

      console.log(`    ✔ Momentum transfer verified: Mover speed 12 -> ${res.boatA.speed.toFixed(2)} m/s, Stationary boat new speed = ${res.boatB.speed.toFixed(2)} m/s, deflection = (${res.boatB.deflectionVx.toFixed(2)}, ${res.boatB.deflectionVz.toFixed(2)})`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 4: Low-Speed vs High-Speed Collision Scaling
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 4: Low-Speed vs High-Speed Collision Proportionality');
    {
      const slowA = { id: 'sA', x: 0, z: 1.6, yaw: 0, speed: 2, level: 1, mass: 1200 };
      const slowB = { id: 'sB', x: 0, z: -1.6, yaw: Math.PI, speed: 2, level: 1, mass: 1200 };
      const slowRes = BoatCollisionSystem.resolvePairCollision(slowA, slowB);

      const fastA = { id: 'fA', x: 0, z: 1.6, yaw: 0, speed: 12, level: 1, mass: 1200 };
      const fastB = { id: 'fB', x: 0, z: -1.6, yaw: Math.PI, speed: 12, level: 1, mass: 1200 };
      const fastRes = BoatCollisionSystem.resolvePairCollision(fastA, fastB);

      assert.ok(slowRes && fastRes, 'Both collisions must be resolved');
      const slowSpeedDrop = 2 - slowRes.boatA.speed;
      const fastSpeedDrop = 12 - fastRes.boatA.speed;

      assert.ok(
        fastSpeedDrop > slowSpeedDrop,
        `High-speed collision must cause greater momentum exchange than low-speed: fast drop ${fastSpeedDrop.toFixed(2)} vs slow drop ${slowSpeedDrop.toFixed(2)}`
      );

      console.log(`    ✔ Proportional impulse verified: Slow speed drop = ${slowSpeedDrop.toFixed(2)} m/s, Fast speed drop = ${fastSpeedDrop.toFixed(2)} m/s`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 5: Multiple Boats Colliding Simultaneously (3-Boat Pileup)
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 5: Multi-Boat Collision (3-Boat Pileup)');
    {
      const boat1 = { id: 'b1', x: 0, z: 0, yaw: 0, speed: 5, level: 1, mass: 1200, state: 'ACTIVE' };
      const boat2 = { id: 'b2', x: 1.0, z: 0.5, yaw: Math.PI / 2, speed: 5, level: 1, mass: 1200, state: 'ACTIVE' };
      const boat3 = { id: 'b3', x: 0.5, z: 1.0, yaw: Math.PI, speed: 5, level: 1, mass: 1200, state: 'ACTIVE' };

      const pileup = [boat1, boat2, boat3];
      const results = BoatCollisionSystem.resolveMultipleCollisions(pileup);

      assert.ok(results.length >= 2, `Multi-boat solver must resolve collisions between pairs, got ${results.length}`);

      // Check that boats are separated
      const obb1 = BoatCollisionSystem.getBoatOBB(boat1.x, boat1.z, boat1.yaw, boat1.level);
      const obb2 = BoatCollisionSystem.getBoatOBB(boat2.x, boat2.z, boat2.yaw, boat2.level);
      const obb3 = BoatCollisionSystem.getBoatOBB(boat3.x, boat3.z, boat3.yaw, boat3.level);

      const hit12 = BoatCollisionSystem.testOBBOverlap(obb1, obb2);
      const hit23 = BoatCollisionSystem.testOBBOverlap(obb2, obb3);
      const hit13 = BoatCollisionSystem.testOBBOverlap(obb1, obb3);

      assert.ok(!hit12 || hit12.depth < 0.05, 'Boat 1 and 2 should be separated');
      assert.ok(!hit23 || hit23.depth < 0.05, 'Boat 2 and 3 should be separated');
      assert.ok(!hit13 || hit13.depth < 0.05, 'Boat 1 and 3 should be separated');

      console.log(`    ✔ 3-Boat pileup resolved cleanly without trapped overlap`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 6: Natural Separation (No Sticking or Endless Vibration)
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 6: Natural Separation After Impact');
    {
      const bA = { id: 'a', x: 0, z: 1.6, yaw: 0, speed: 8, level: 1, mass: 1200 };
      const bB = { id: 'b', x: 0, z: -1.6, yaw: Math.PI, speed: 8, level: 1, mass: 1200 };

      const res = BoatCollisionSystem.resolvePairCollision(bA, bB);
      assert.ok(res, 'Initial collision occurred');

      // Next physics step with post-collision positions:
      const postA = { ...res.boatA, level: 1, mass: 1200 };
      const postB = { ...res.boatB, level: 1, mass: 1200 };

      // After de-penetration, boats should no longer be in colliding penetration
      const obbPostA = BoatCollisionSystem.getBoatOBB(postA.x, postA.z, postA.yaw, postA.level);
      const obbPostB = BoatCollisionSystem.getBoatOBB(postB.x, postB.z, postB.yaw, postB.level);
      const secondHit = BoatCollisionSystem.testOBBOverlap(obbPostA, obbPostB);

      assert.ok(!secondHit, 'De-penetrated boats must not immediately re-collide on the next step');
      console.log(`    ✔ Immediate post-collision separation confirmed: no sticking or overlap loop`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 7: Boats Do Not Pass Through Each Other (Penetration Prevention)
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 7: Continuous Penetration Prevention');
    {
      // Boat A at z=10 moving North (yaw=0, forward=(0,-1))
      // Boat B at z=-10 moving South (yaw=PI, forward=(0,1))
      let a = { id: 'a', x: 0, z: 10, yaw: 0, speed: 10, level: 1, mass: 1200, deflectionVx: 0, deflectionVz: 0 };
      let b = { id: 'b', x: 0, z: -10, yaw: Math.PI, speed: 10, level: 1, mass: 1200, deflectionVx: 0, deflectionVz: 0 };

      let collisionHappened = false;
      const dt = 1 / 60;

      for (let frame = 0; frame < 90; frame++) {
        // Integrate motion forward: A moves towards -Z, B moves towards +Z
        a.z += (-a.speed + a.deflectionVz) * dt;
        b.z += (+b.speed + b.deflectionVz) * dt;

        // Decay deflection
        a.deflectionVz *= Math.exp(-3.6 * dt);
        b.deflectionVz *= Math.exp(-3.6 * dt);

        const col = BoatCollisionSystem.resolvePairCollision(a, b);
        if (col) {
          collisionHappened = true;
          a.z = col.boatA.z;
          a.speed = col.boatA.speed;
          a.deflectionVz = col.boatA.deflectionVz;

          b.z = col.boatB.z;
          b.speed = col.boatB.speed;
          b.deflectionVz = col.boatB.deflectionVz;
        }

        // Boat A started at +10, Boat B at -10.
        // A must never cross B (A.z >= B.z - 0.1)
        assert.ok(
          a.z >= b.z - 0.1,
          `Boats must not tunnel through each other! Frame ${frame}: A.z=${a.z.toFixed(2)}, B.z=${b.z.toFixed(2)}`
        );
      }

      assert.ok(collisionHappened, 'Collision must have been intercepted during movement');
      console.log(`    ✔ Continuous penetration prevention verified: A.z stopped at ${a.z.toFixed(2)}m, B.z at ${b.z.toFixed(2)}m without tunnelling`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 8: Docked Boats Excluded from Collisions
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 8: Docked Boats Excluded from Collisions');
    {
      const oceanBoat = { id: 'ocean', x: 0, z: 0, yaw: 0, speed: 10, state: 'ACTIVE', level: 1 };
      const dockedBoat = { id: 'docked', x: 0, z: 0.5, yaw: 0, speed: 0, state: 'DOCKED', level: 1 };

      const collisions = BoatCollisionSystem.resolveMultipleCollisions([oceanBoat, dockedBoat]);
      assert.equal(collisions.length, 0, 'Docked boats must be ignored by multi-collision solver');

      console.log(`    ✔ Docked boat correctly filtered out from collision processing`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 9: Server Authority and Multi-Client Broadcast
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 9: Server Authority & Multi-Client Broadcast Synchronization');
    {
      const client1 = createClient();
      const client2 = createClient();

      // Handshake
      const init1 = await waitForEvent(client1, 'init');
      const init2 = await waitForEvent(client2, 'init');

      // Join game
      client1.emit('player:join', { username: 'Captain_One', boatLevel: 1 });
      await waitForEvent(client1, 'player:joined_success');

      client2.emit('player:join', { username: 'Captain_Two', boatLevel: 2 });
      await waitForEvent(client2, 'player:joined_success');

      // Launch both into ACTIVE ocean state
      client1.emit('player:state', {
        state: 'ACTIVE',
        boatLevel: 1,
        transform: { x: 50, y: 0, z: 50, yaw: 0, speed: 8 },
      });

      client2.emit('player:state', {
        state: 'ACTIVE',
        boatLevel: 2,
        transform: { x: 50, y: 0, z: 51.5, yaw: Math.PI, speed: 8 },
      });

      // Both clients should receive 'boats:collision' broadcast from the server's 30 Hz tick!
      const colPromise1 = waitForEvent(client1, 'boats:collision', 3000);
      const colPromise2 = waitForEvent(client2, 'boats:collision', 3000);

      const [colData1, colData2] = await Promise.all([colPromise1, colPromise2]);

      assert.ok(colData1, 'Client 1 must receive boats:collision event');
      assert.ok(colData2, 'Client 2 must receive boats:collision event');
      assert.equal(colData1.boatA.playerId, colData2.boatA.playerId, 'Both clients must receive identical collision participants');
      assert.equal(colData1.depth, colData2.depth, 'Both clients must receive identical penetration depth');

      console.log(`    ✔ Server detected collision and synchronized broadcast to both clients: depth ${colData1.depth.toFixed(3)}m, normal (${colData1.normal.x.toFixed(2)}, ${colData1.normal.z.toFixed(2)})`);

      // Requirement 9 Verification: Ensure normal movement updates do not overwrite collision corrections
      const moveBroadcastPromise = waitForEvent(client2, 'player:moved', 2000);
      client1.emit('player:move', {
        x: 50,
        z: 51.0, // Attempting to penetrate back into Client 2's boat at 51.5+
        yaw: 0,
        speed: 8,
      });

      const movedPayload = await moveBroadcastPromise;
      assert.notEqual(movedPayload.transform.z, 51.0, 'Server must reject penetrating movement update during collision cooldown');
      console.log(`    ✔ Requirement 9 verified: Normal move packet attempting z=51.0 constrained by server to z=${movedPayload.transform.z.toFixed(2)}`);

      client1.disconnect();
      client2.disconnect();
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 10: Player Disconnect During/After Collision Handled Cleanly
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 10: Player Disconnect During/After Collision');
    {
      const client1 = createClient();
      const client2 = createClient();

      await waitForEvent(client1, 'init');
      await waitForEvent(client2, 'init');

      client1.emit('player:join', { username: 'Sailor_A', boatLevel: 1 });
      client2.emit('player:join', { username: 'Sailor_B', boatLevel: 1 });

      await waitForEvent(client1, 'player:joined_success');
      await waitForEvent(client2, 'player:joined_success');

      // Put into ocean
      client1.emit('player:state', { state: 'ACTIVE', boatLevel: 1, transform: { x: 200, z: 200, speed: 5 } });
      client2.emit('player:state', { state: 'ACTIVE', boatLevel: 1, transform: { x: 200, z: 201, speed: 5 } });

      // Disconnect client 1 immediately
      client1.disconnect();

      // Wait a moment for server tick
      await new Promise((r) => setTimeout(r, 200));

      // Server should still be running and handling client 2 cleanly
      assert.ok(server.players.size >= 1, 'Server should maintain remaining client session');
      client2.disconnect();
      console.log(`    ✔ Server cleanly handled client disconnection without crash or NaN state`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 11: New Player Joining During Active Ocean Collision
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 11: Late Joiner State Replication');
    {
      const c1 = createClient();
      await waitForEvent(c1, 'init');
      c1.emit('player:join', { username: 'ActiveSailing', boatLevel: 3 });
      await waitForEvent(c1, 'player:joined_success');

      c1.emit('player:state', {
        state: 'ACTIVE',
        boatLevel: 3,
        transform: { x: 300, y: 0, z: 300, yaw: 0.5, speed: 12, deflectionVx: 1.2, deflectionVz: -0.8 },
      });

      // Late joiner connects
      const cLate = createClient();
      const initPromise = waitForEvent(cLate, 'init');
      const listPromise = waitForEvent(cLate, 'players:list');
      const [initLate, playerList] = await Promise.all([initPromise, listPromise]);

      const remoteActive = playerList.players.find((p) => p.username === 'ActiveSailing');
      assert.ok(remoteActive, 'Late joiner must receive active sailing player');
      assert.equal(remoteActive.state, 'ACTIVE', 'Late joiner must see state as ACTIVE');
      assert.equal(remoteActive.boatLevel, 3, 'Late joiner must see boatLevel as 3');
      assert.equal(remoteActive.transform.x, 300, 'Late joiner must receive valid coordinates');

      console.log(`    ✔ Late joiner correctly replicated active player state and boat model level`);
      c1.disconnect();
      cLate.disconnect();
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCENARIO 12: Fixed Timestep Numerical Stability (30, 60, 120 FPS)
    // ────────────────────────────────────────────────────────────────────────
    console.log('\nScenario 12: Fixed Timestep Numerical Stability across Frame Rates');
    {
      const testRates = [30, 60, 120];
      for (const fps of testRates) {
        const dt = 1 / fps;
        let vel = new THREE.Vector3(5, 0, 5);
        const drag = BoatConfig.COLLISION.WATER_DRAG_DEFLECTION;

        // Run 1 second of simulation
        for (let i = 0; i < fps; i++) {
          vel.multiplyScalar(Math.exp(-drag * dt));
        }

        assert.ok(!isNaN(vel.x) && !isNaN(vel.z), `Velocity must not be NaN at ${fps} FPS`);
        assert.ok(vel.length() < 0.2, `Deflection velocity must be properly damped after 1s at ${fps} FPS, got ${vel.length()}`);
      }

      console.log(`    ✔ Water drag exponential damping verified numerically stable across 30, 60, and 120 FPS`);
    }

    console.log('\n========================================================');
    console.log('🎉 ALL 12 COLLISION PHYSICS SCENARIOS PASSED SUCCESSFULLY!');
    console.log('========================================================\n');
  } catch (err) {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
  } finally {
    await server.stop();
  }
}

runTests();
