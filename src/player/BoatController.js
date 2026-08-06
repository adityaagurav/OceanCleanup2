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
    this.inertia.update(input, dt);
    this.speed    = this.inertia.speed;
    this.throttle = this.inertia.throttle;
    this.steer    = this.inertia.steer;
    this.accel    = this.inertia.accel;
    this.physicsRotationY += this.inertia.yawRate * dt;

    // --- 2. Apply movement ---
    // Move forward in the direction the boat is facing (local -Z).
    const forward = new THREE.Vector3(0, 0, -1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.physicsRotationY);
    forward.applyQuaternion(q);

    const travel = forward.clone().multiplyScalar(Math.sign(this.speed));
    const moveDist = Math.abs(this.speed) * dt;

    // Collide with docks, harbour walls and land — never with the open water.
    // The boat bumps and holds against the pier instead of driving through it.
    if (moveDist > 0.0001 && this._collisionBlocks(travel, moveDist)) {
      this.speed = 0;
      this.inertia.halt();
    } else {
      this.physicsPosition.add(travel.multiplyScalar(moveDist));
    }

    // Vertical float (Y/pitch/roll) is owned by BoatBuoyancy — the physics
    // state rides at a stable base height so the collision probe and the
    // controller's XZ interpolation stay independent of the waves.
    this.physicsPosition.y = 0;
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
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
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
    const origin = this.physicsPosition.clone();
    origin.y = 0.3; // just above the bob range, at dock height
    this._ray.set(origin, dir);
    const hits = this._ray.intersectObjects(this.colliders, false);
    const stopDistance = moveDist + 2.0; // boat half-length margin
    return hits.length > 0 && hits[0].distance < stopDistance;
  }
}
