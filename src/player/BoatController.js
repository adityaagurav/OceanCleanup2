import * as THREE from 'three';
import { BoatConfig } from '../config/BoatConfig.js';
import { BoatInertia } from './BoatInertia.js';

/**
 * BoatController.js — Boat movement controller for the harbor/ocean game.
 * 
 * The boat moves forward/backward with W/S, turns left/right with A/D, and
 * bumps against docks/land instead of driving through them.
 * 
 * NOTE: ALL momentum/throttle/steering-feel math lives in BoatInertia.js (the
 * "heavy" layer: progressive throttle, water drag coast, steering inertia).
 * This controller only integrates the resulting speed/yaw into position and
 * keeps the fixed-timestep interpolation + collision behaviour intact.
 * 
 * Vertical floating (Y, pitch, roll) is owned by BoatBuoyancy.js — this
 * controller exposes the speed/throttle/steer/accel signals those systems feed
 * on. Uses fixed physics timestep updates with interpolation for smooth
 * rendering.
 */
export class BoatController {
  /**
   * @param {THREE.Object3D} boat - The boat mesh (or group) to control
   * @param {InputManager} input - The input manager
   * @param {THREE.Mesh[]} [colliders] - solids the boat must not drive through
   */
  constructor(boat, input, colliders = []) {
    this.boat = boat;
    this.input = input;
    this.colliders = colliders;
    this.enabled = true;

    // Momentum / inertia (heavy feel) — owns speed, throttle, steer, yawRate.
    this.inertia = new BoatInertia();
    this.speed    = 0; // current forward speed (m/s, signed)
    this.throttle = 0; // smoothed -1..1 (positive = forward) — for feel/audio
    this.steer    = 0; // smoothed helm -1..1 (positive = turning left)
    this.accel    = 0; // signed acceleration (m/s²) — for buoyancy pitch
    this.maxSpeed = BoatConfig.MAX_SPEED;
    this.reverseSpeed = BoatConfig.REVERSE_SPEED;
    this.level = 1;
    this.mass = BoatConfig.COLLISION?.BASE_MASS || 1200;
    this.hullHalfLength = (BoatConfig.COLLISION?.BASE_LENGTH || 4.0) * 0.5;
    this.hullHalfWidth = (BoatConfig.COLLISION?.BASE_WIDTH || 2.0) * 0.5;

    // Phase 3B: Collision deflection & impulse response
    this.deflectionVelocity = new THREE.Vector3(0, 0, 0); // world XZ push velocity
    this.deflectionYawRate = 0; // angular torque impulse from off-center impacts

    // Physics interpolation state
    this.physicsPosition = new THREE.Vector3();
    this.physicsRotationY = 0;
    this.prevPosition = new THREE.Vector3();
    this.prevRotationY = 0;

    // Synchronize initial physics state to match initial boat state
    this.physicsPosition.copy(this.boat.position);
    this.physicsRotationY = this.boat.rotation.y;
    this.prevPosition.copy(this.boat.position);
    this.prevRotationY = this.boat.rotation.y;

    this._ray = new THREE.Raycaster();
    this._travel = new THREE.Vector3();
    this._probeOrigin = new THREE.Vector3();
  }

  /**
   * Fixed update for physics (called at fixed timestep)
   * @param {InputManager} input
   * @param {number} dt - fixed time step (1/60)
   */
  fixedUpdate(input, dt) {
    if (!this.enabled) return;

    // Store previous physics state before integration
    this.prevPosition.copy(this.physicsPosition);
    this.prevRotationY = this.physicsRotationY;

    // --- 1. Momentum (progressive throttle, water drag, steering inertia) ---
    this.inertia.maxSpeed = this.maxSpeed;
    this.inertia.update(input, dt);

    // If recovering from a collision, clamp forward speed so the boat cannot penetrate through
    if (this.collisionCooldown && Date.now() < this.collisionCooldown) {
      if (this.inertia.speed > 2.0) {
        this.inertia.speed = 2.0;
      }
    }

    this.speed    = this.inertia.speed;
    this.throttle = this.inertia.throttle;
    this.steer    = this.inertia.steer;
    this.accel    = this.inertia.accel;
    this.physicsRotationY += this.inertia.yawRate * dt;
    this.physicsRotationY = ((this.physicsRotationY + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

    // --- 2. Apply movement ---
    // Fast analytical forward vector in XZ plane (local -Z rotated by yaw)
    // Avoids 4 allocations (3 Vector3s + 1 Quaternion) on every physics step
    const fwdX = -Math.sin(this.physicsRotationY);
    const fwdZ = -Math.cos(this.physicsRotationY);
    const sign = Math.sign(this.speed);
    this._travel.set(fwdX * sign, 0, fwdZ * sign);
    const moveDist = Math.abs(this.speed) * dt;

    // Collide with docks, harbour walls and land — never with the open water.
    // The boat bumps and holds against the pier instead of driving through it.
    if (moveDist > 0.0001 && this._collisionBlocks(this._travel, moveDist)) {
      this.speed = 0;
      this.inertia.halt();
    } else {
      this.physicsPosition.x += this._travel.x * moveDist;
      this.physicsPosition.z += this._travel.z * moveDist;
    }

    // --- 2.5 Phase 3B: Apply lateral deflection velocity & water drag damping ---
    if (this.deflectionVelocity.lengthSq() > 0.0001) {
      this.physicsPosition.x += this.deflectionVelocity.x * dt;
      this.physicsPosition.z += this.deflectionVelocity.z * dt;
      const dragFactor = Math.exp(-(BoatConfig.COLLISION?.WATER_DRAG_DEFLECTION || 3.6) * dt);
      this.deflectionVelocity.multiplyScalar(dragFactor);
      if (this.deflectionVelocity.lengthSq() < 0.0025) {
        this.deflectionVelocity.set(0, 0, 0);
      }
    }

    // Apply angular yaw deflection from off-center impact torque
    if (Math.abs(this.deflectionYawRate) > 0.001) {
      this.physicsRotationY += this.deflectionYawRate * dt;
      this.physicsRotationY = ((this.physicsRotationY + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this.deflectionYawRate *= Math.exp(-4.0 * dt);
      if (Math.abs(this.deflectionYawRate) < 0.005) {
        this.deflectionYawRate = 0;
      }
    }

    // Vertical float (Y/pitch/roll) is owned by BoatBuoyancy — the physics
    // state rides at a stable base height so the collision probe and the
    // controller's XZ interpolation stay independent of the waves.
    this.physicsPosition.y = 0;
  }

  /** Apply the upgrade's driving and collision dimensions immediately. */
  applyUpgrade({ level, speed, modelScale, mass }) {
    this.level = level || this.level;
    this.maxSpeed = speed;
    this.inertia.maxSpeed = speed;
    const scale = modelScale || 1.0;
    this.hullHalfLength = (BoatConfig.COLLISION?.BASE_LENGTH || 4.0) * 0.5 * scale;
    this.hullHalfWidth = (BoatConfig.COLLISION?.BASE_WIDTH || 2.0) * 0.5 * scale;
    this.mass = mass || BoatConfig.COLLISION?.MASS_BY_LEVEL[(this.level || 1) - 1] || 1200;
    this.boat.userData.maxSpeed = speed;
  }

  /**
   * Phase 3B: Apply server-authoritative collision correction or local collision response.
   * @param {object} correction - { x, z, yaw, speed, deflectionVx, deflectionVz, yawDeflectionRate }
   */
  applyCollisionCorrection(correction) {
    if (!correction) return;

    if (typeof correction.x === 'number' && typeof correction.z === 'number') {
      this.physicsPosition.x = correction.x;
      this.physicsPosition.z = correction.z;
      this.prevPosition.x = correction.x;
      this.prevPosition.z = correction.z;
      if (this.boat) {
        this.boat.position.x = correction.x;
        this.boat.position.z = correction.z;
      }
    }
    if (typeof correction.yaw === 'number') {
      this.physicsRotationY = correction.yaw;
      this.prevRotationY = correction.yaw;
      if (this.boat) {
        this.boat.rotation.y = correction.yaw;
      }
    }
    if (typeof correction.speed === 'number') {
      this.speed = correction.speed;
      this.inertia.speed = correction.speed;
      // Kill positive throttle on impact so holding W doesn't immediately force boat through
      if (this.inertia.throttle > 0) {
        this.inertia.throttle = 0;
      }
    }
    if (typeof correction.deflectionVx === 'number' && typeof correction.deflectionVz === 'number') {
      this.deflectionVelocity.set(correction.deflectionVx, 0, correction.deflectionVz);
    }
    if (typeof correction.yawDeflectionRate === 'number') {
      this.deflectionYawRate = correction.yawDeflectionRate;
    }
    this.collisionCooldown = Date.now() + 250;
  }

  /**
   * Render update for visual interpolation (called every render frame)
   * @param {number} alpha - sub-frame interpolation factor
   * @param {CameraController} cameraCtrl - for any view-dependent effects
   */
  renderUpdate(alpha, cameraCtrl) {
    if (!this.enabled) return;

    // Linearly interpolate boat position
    this.boat.position.lerpVectors(this.prevPosition, this.physicsPosition, alpha);

    // Interpolate rotation.y handling wrapping correctly
    let diff = this.physicsRotationY - this.prevRotationY;
    diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.boat.rotation.y = this.prevRotationY + diff * alpha;
  }

  /**
   * Shift physics states during a floating-origin rebase.
   * @param {THREE.Vector3} offset
   */
  rebase(offset) {
    this.physicsPosition.sub(offset);
    this.prevPosition.sub(offset);
  }

  /**
   * Get the current speed (for HUD)
   * @returns {number} speed in m/s
   */
  getSpeed() {
    return Math.abs(this.speed);
  }

  /**
   * Horizontal collision probe. Stops the boat from driving through the dock,
   * pier or land while leaving it free to glide on open water.
   * The probe sits just above the wave-bob range so the hull reacts to
   * structures at water level.
   * @param {THREE.Vector3} dir - unit travel direction
   * @param {number} moveDist - distance this step (m)
   * @returns {boolean} true when the path is blocked
   */
  _collisionBlocks(dir, moveDist) {
    if (!this.colliders || this.colliders.length === 0) return false;
    this._probeOrigin.copy(this.physicsPosition);
    this._probeOrigin.y = 0.3; // just above the bob range, at dock height
    this._ray.set(this._probeOrigin, dir);
    const hits = this._ray.intersectObjects(this.colliders, false);
    const stopDistance = moveDist + this.hullHalfLength; // scale collision margin with upgraded hull
    return hits.length > 0 && hits[0].distance < stopDistance;
  }
}
