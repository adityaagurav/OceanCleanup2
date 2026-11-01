import { BoatConfig } from '../config/BoatConfig.js';

/**
 * BoatCollisionSystem.js — Phase 3B: Server-authoritative boat-to-boat collision physics.
 *
 * Implements:
 *  1. Hull collision representation via Oriented Bounding Boxes (OBB) tailored to boat tiers.
 *  2. Broadphase radius check + Narrowphase Separating Axis Theorem (SAT).
 *  3. Inelastic/damped momentum transfer, directional deflection, speed reduction, and separation.
 *  4. Tangential friction, rotational yaw impulse, and continuous water drag damping.
 *  5. Multi-boat simultaneous collision resolution.
 *  6. Compatible with both Node.js (multiplayer server) and browser (client).
 */
export class BoatCollisionSystem {
  /**
   * Get hull dimensions and mass for a given boat upgrade level.
   * @param {number} level - 1, 2, or 3
   * @returns {{ length: number, width: number, halfLength: number, halfWidth: number, mass: number }}
   */
  static getHullDimensions(level = 1) {
    const lvl = Math.max(1, Math.min(3, Number(level) || 1));
    const levelConfig = BoatConfig.LEVELS[lvl - 1] || BoatConfig.LEVELS[0];
    const scale = levelConfig.modelScale || 1.0;

    const length = BoatConfig.COLLISION.BASE_LENGTH * scale;
    const width = BoatConfig.COLLISION.BASE_WIDTH * scale;
    const mass = levelConfig.mass || BoatConfig.COLLISION.MASS_BY_LEVEL[lvl - 1] || 1200;

    return {
      length,
      width,
      halfLength: length * 0.5,
      halfWidth: width * 0.5,
      mass,
    };
  }

  /**
   * Compute 2D Oriented Bounding Box (OBB) in XZ space.
   * In OceanCleanup.io:
   *  - yaw = 0 points in local -Z direction (forward: x=0, z=-1).
   *  - right: x=-1, z=0.
   * @param {number} x
   * @param {number} z
   * @param {number} yaw - heading in radians
   * @param {number} level - boat level (1, 2, 3)
   */
  static getBoatOBB(x, z, yaw = 0, level = 1) {
    const dims = this.getHullDimensions(level);
    const clean = (v) => (Math.abs(v) < 1e-9 ? 0 : v);
    const forwardX = clean(-Math.sin(yaw));
    const forwardZ = clean(-Math.cos(yaw));
    const rightX = clean(-Math.cos(yaw));
    const rightZ = clean(Math.sin(yaw));

    const radius = Math.hypot(dims.halfLength, dims.halfWidth);

    return {
      x,
      z,
      yaw,
      level,
      mass: dims.mass,
      halfLength: dims.halfLength,
      halfWidth: dims.halfWidth,
      forward: { x: forwardX, z: forwardZ },
      right: { x: rightX, z: rightZ },
      radius,
    };
  }

  /**
   * Separating Axis Theorem (SAT) collision test between two 2D OBBs.
   * @param {object} obbA
   * @param {object} obbB
   * @returns {null | { normal: {x: number, z: number}, depth: number, contactPoint: {x: number, z: number} }}
   */
  static testOBBOverlap(obbA, obbB) {
    // 1. Broadphase bounding circle test
    const dx = obbB.x - obbA.x;
    const dz = obbB.z - obbA.z;
    const distSq = dx * dx + dz * dz;
    const maxRadius = obbA.radius + obbB.radius;
    if (distSq > maxRadius * maxRadius) {
      return null; // Far apart, cannot collide
    }

    // 2. Narrowphase: 4 candidate separating axes (forward & right of both boats)
    const axes = [
      obbA.forward,
      obbA.right,
      obbB.forward,
      obbB.right,
    ];

    let minOverlap = Infinity;
    let minAxis = null;
    let bestAlign = -1;
    const centerDist = Math.hypot(dx, dz);

    for (let i = 0; i < 4; i++) {
      const axis = axes[i];
      // Normalize axis safety
      const len = Math.hypot(axis.x, axis.z);
      if (len < 1e-6) continue;
      const ax = axis.x / len;
      const az = axis.z / len;

      // Project Box A
      const projA =
        obbA.halfLength * Math.abs(obbA.forward.x * ax + obbA.forward.z * az) +
        obbA.halfWidth * Math.abs(obbA.right.x * ax + obbA.right.z * az);

      // Project Box B
      const projB =
        obbB.halfLength * Math.abs(obbB.forward.x * ax + obbB.forward.z * az) +
        obbB.halfWidth * Math.abs(obbB.right.x * ax + obbB.right.z * az);

      // Distance between centers projected on axis
      const distOnAxis = Math.abs(dx * ax + dz * az);
      const overlap = projA + projB - distOnAxis;

      if (overlap <= 0) {
        return null; // Separating axis found: no collision
      }

      // Tie-break nearly identical overlaps in favor of the axis aligned with center offset
      const align = centerDist > 1e-4 ? Math.abs(ax * dx + az * dz) / centerDist : 1.0;

      if (overlap < minOverlap - 0.05) {
        minOverlap = overlap;
        minAxis = { x: ax, z: az };
        bestAlign = align;
      } else if (Math.abs(overlap - minOverlap) <= 0.05 && align > bestAlign) {
        minOverlap = overlap;
        minAxis = { x: ax, z: az };
        bestAlign = align;
      }
    }

    if (!minAxis) return null;

    // Ensure normal points from A to B (so A moves -normal, B moves +normal)
    let dotDir = dx * minAxis.x + dz * minAxis.z;
    if (centerDist < 1e-4) {
      dotDir = obbA.forward.x * minAxis.x + obbA.forward.z * minAxis.z;
    }
    if (dotDir < 0) {
      minAxis.x = -minAxis.x;
      minAxis.z = -minAxis.z;
    }

    // Approximate contact point as midpoint between hulls along normal
    const contactX = obbA.x + dx * 0.5;
    const contactZ = obbA.z + dz * 0.5;

    return {
      normal: minAxis,
      depth: minOverlap,
      contactPoint: { x: contactX, z: contactZ },
    };
  }

  /**
   * Resolve physical interaction between two colliding ocean boats.
   * Calculates separation, momentum transfer, deflection velocity, and angular torque.
   *
   * @param {object} boatA - { id, x, z, yaw, speed, level, mass, deflectionVx, deflectionVz }
   * @param {object} boatB - { id, x, z, yaw, speed, level, mass, deflectionVx, deflectionVz }
   * @returns {null | object} Collision resolution data or null if not colliding
   */
  static resolvePairCollision(boatA, boatB) {
    const obbA = this.getBoatOBB(boatA.x, boatA.z, boatA.yaw || 0, boatA.level || 1);
    const obbB = this.getBoatOBB(boatB.x, boatB.z, boatB.yaw || 0, boatB.level || 1);

    const hit = this.testOBBOverlap(obbA, obbB);
    if (!hit) return null;

    const { normal, depth, contactPoint } = hit;
    const cfg = BoatConfig.COLLISION;

    const mA = boatA.mass || obbA.mass;
    const mB = boatB.mass || obbB.mass;
    const invMA = 1 / mA;
    const invMB = 1 / mB;
    const invMTotal = invMA + invMB;

    // ── 1. Positional Separation (De-penetration) ──────────────────────
    const totalSeparation = depth + cfg.SEPARATION_SLOP;
    const sepAx = -normal.x * totalSeparation * (invMA / invMTotal);
    const sepAz = -normal.z * totalSeparation * (invMA / invMTotal);
    const sepBx = +normal.x * totalSeparation * (invMB / invMTotal);
    const sepBz = +normal.z * totalSeparation * (invMB / invMTotal);

    // ── 2. Velocity & Momentum Transfer ──────────────────────────────
    // Full velocity vector in world space: forward component + any existing lateral deflection
    const forwardSpeedA = Number(boatA.speed) || 0;
    const forwardSpeedB = Number(boatB.speed) || 0;

    const deflAx = Number(boatA.deflectionVx) || 0;
    const deflAz = Number(boatA.deflectionVz) || 0;
    const deflBx = Number(boatB.deflectionVx) || 0;
    const deflBz = Number(boatB.deflectionVz) || 0;

    const vAx = obbA.forward.x * forwardSpeedA + deflAx;
    const vAz = obbA.forward.z * forwardSpeedA + deflAz;
    const vBx = obbB.forward.x * forwardSpeedB + deflBx;
    const vBz = obbB.forward.z * forwardSpeedB + deflBz;

    // Relative velocity: V_A - V_B
    const relVx = vAx - vBx;
    const relVz = vAz - vBz;

    // Closing speed along the collision normal
    const vNormal = relVx * normal.x + relVz * normal.z;

    let impulseMag = 0;
    let newSpeedA = forwardSpeedA;
    let newSpeedB = forwardSpeedB;
    let newDeflAx = deflAx;
    let newDeflAz = deflAz;
    let newDeflBx = deflBx;
    let newDeflBz = deflBz;
    let yawDeflectionA = 0;
    let yawDeflectionB = 0;

    // If closing, apply dynamic impulse
    if (vNormal > 0.05) {
      const e = cfg.RESTITUTION;
      impulseMag = ((1 + e) * vNormal) / invMTotal;

      // Tangential velocity and hull friction damping
      const tangentX = -normal.z;
      const tangentZ = normal.x;
      const vTangent = relVx * tangentX + relVz * tangentZ;
      const maxFriction = cfg.FRICTION * impulseMag;
      const frictionImpulse = Math.max(-maxFriction, Math.min(maxFriction, -vTangent / invMTotal * 0.35));

      // Total impulse vectors applied to boats
      const impulseAx = -normal.x * impulseMag - tangentX * frictionImpulse;
      const impulseAz = -normal.z * impulseMag - tangentZ * frictionImpulse;
      const impulseBx = +normal.x * impulseMag + tangentX * frictionImpulse;
      const impulseBz = +normal.z * impulseMag + tangentZ * frictionImpulse;

      // Resulting new world velocity vectors
      const postVAx = vAx + impulseAx * invMA;
      const postVAz = vAz + impulseAz * invMA;
      const postVBx = vBx + impulseBx * invMB;
      const postVBz = vBz + impulseBz * invMB;

      // Project back into forward heading speed + lateral water deflection
      newSpeedA = postVAx * obbA.forward.x + postVAz * obbA.forward.z;
      newDeflAx = postVAx - obbA.forward.x * newSpeedA;
      newDeflAz = postVAz - obbA.forward.z * newSpeedA;

      newSpeedB = postVBx * obbB.forward.x + postVBz * obbB.forward.z;
      newDeflBx = postVBx - obbB.forward.x * newSpeedB;
      newDeflBz = postVBz - obbB.forward.z * newSpeedB;

      // Side collisions: reduce forward speed when hull flank is struck
      const sideImpactA = Math.abs(normal.x * obbA.forward.z - normal.z * obbA.forward.x);
      const sideImpactB = Math.abs(normal.x * obbB.forward.z - normal.z * obbB.forward.x);
      if (sideImpactA > 0.25) {
        newSpeedA *= Math.max(0.15, 1.0 - 0.55 * sideImpactA);
      }
      if (sideImpactB > 0.25) {
        newSpeedB *= Math.max(0.15, 1.0 - 0.55 * sideImpactB);
      }

      // Clamp deflection speed for numerical stability
      const deflSpeedA = Math.hypot(newDeflAx, newDeflAz);
      if (deflSpeedA > cfg.MAX_DEFLECTION_SPEED) {
        const factor = cfg.MAX_DEFLECTION_SPEED / deflSpeedA;
        newDeflAx *= factor;
        newDeflAz *= factor;
      }
      const deflSpeedB = Math.hypot(newDeflBx, newDeflBz);
      if (deflSpeedB > cfg.MAX_DEFLECTION_SPEED) {
        const factor = cfg.MAX_DEFLECTION_SPEED / deflSpeedB;
        newDeflBx *= factor;
        newDeflBz *= factor;
      }

      // ── 3. Rotational Yaw Impulse (Off-Center Impacts) ───────────────
      const rAx = contactPoint.x - obbA.x;
      const rAz = contactPoint.z - obbA.z;
      const torqueA = rAx * impulseAz - rAz * impulseAx;

      const rBx = contactPoint.x - obbB.x;
      const rBz = contactPoint.z - obbB.z;
      const torqueB = rBx * impulseBz - rBz * impulseBx;

      const iA = (mA * (obbA.halfLength * obbA.halfLength + obbA.halfWidth * obbA.halfWidth)) / 3;
      const iB = (mB * (obbB.halfLength * obbB.halfLength + obbB.halfWidth * obbB.halfWidth)) / 3;

      yawDeflectionA = Math.max(
        -cfg.MAX_ANGULAR_DEFLECTION,
        Math.min(cfg.MAX_ANGULAR_DEFLECTION, (torqueA / iA) * cfg.ANGULAR_DEFLECTION_SCALE)
      );
      yawDeflectionB = Math.max(
        -cfg.MAX_ANGULAR_DEFLECTION,
        Math.min(cfg.MAX_ANGULAR_DEFLECTION, (torqueB / iB) * cfg.ANGULAR_DEFLECTION_SCALE)
      );
    } else {
      // Even if relative velocity is minimal or separating, overlapping hulls must push apart
      const separationPush = Math.min(3.5, (depth + cfg.SEPARATION_SLOP) * 4.0);
      newDeflAx -= normal.x * separationPush * (invMA / invMTotal);
      newDeflAz -= normal.z * separationPush * (invMA / invMTotal);
      newDeflBx += normal.x * separationPush * (invMB / invMTotal);
      newDeflBz += normal.z * separationPush * (invMB / invMTotal);
      newSpeedA *= 0.8;
      newSpeedB *= 0.8;
    }

    return {
      boatA: {
        playerId: boatA.playerId || boatA.id,
        x: boatA.x + sepAx,
        z: boatA.z + sepAz,
        yaw: boatA.yaw + yawDeflectionA * 0.1, // Slight immediate rotation
        speed: newSpeedA,
        deflectionVx: newDeflAx,
        deflectionVz: newDeflAz,
        yawDeflectionRate: yawDeflectionA,
      },
      boatB: {
        playerId: boatB.playerId || boatB.id,
        x: boatB.x + sepBx,
        z: boatB.z + sepBz,
        yaw: boatB.yaw + yawDeflectionB * 0.1,
        speed: newSpeedB,
        deflectionVx: newDeflBx,
        deflectionVz: newDeflBz,
        yawDeflectionRate: yawDeflectionB,
      },
      normal,
      depth,
      closingSpeed: Math.max(0, vNormal),
      impulse: impulseMag,
      contactPoint,
    };
  }

  /**
   * Multi-boat simultaneous collision resolution.
   * Runs an iterative constraint solver (up to 3 iterations) to resolve pileups cleanly.
   *
   * @param {Array<object>} activeBoats - Array of boat state objects
   * @param {number} dt - Fixed physics time step (e.g. 1/60 or 1/30)
   * @returns {Array<object>} List of resolved collisions that occurred this step
   */
  static resolveMultipleCollisions(activeBoats, dt = 1 / 60) {
    if (!activeBoats || activeBoats.length < 2) return [];

    const collisionMap = new Map();
    const maxIterations = 3;

    for (let iter = 0; iter < maxIterations; iter++) {
      let anyCollision = false;

      for (let i = 0; i < activeBoats.length; i++) {
        for (let j = i + 1; j < activeBoats.length; j++) {
          const bA = activeBoats[i];
          const bB = activeBoats[j];

          // Skip boats that are not in active ocean state
          if (bA.state && bA.state !== 'ACTIVE') continue;
          if (bB.state && bB.state !== 'ACTIVE') continue;

          const res = this.resolvePairCollision(bA, bB);
          if (res) {
            anyCollision = true;

            // Apply corrected physics states in-place to boats
            bA.x = res.boatA.x;
            bA.z = res.boatA.z;
            bA.yaw = res.boatA.yaw;
            bA.speed = res.boatA.speed;
            bA.deflectionVx = res.boatA.deflectionVx;
            bA.deflectionVz = res.boatA.deflectionVz;
            if (res.boatA.yawDeflectionRate) bA.yawRate = res.boatA.yawDeflectionRate;

            bB.x = res.boatB.x;
            bB.z = res.boatB.z;
            bB.yaw = res.boatB.yaw;
            bB.speed = res.boatB.speed;
            bB.deflectionVx = res.boatB.deflectionVx;
            bB.deflectionVz = res.boatB.deflectionVz;
            if (res.boatB.yawDeflectionRate) bB.yawRate = res.boatB.yawDeflectionRate;

            const pairKey = [bA.id || bA.playerId, bB.id || bB.playerId].sort().join('::');
            collisionMap.set(pairKey, res);
          }
        }
      }

      if (!anyCollision) break;
    }

    return Array.from(collisionMap.values());
  }
}
