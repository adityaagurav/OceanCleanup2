import * as THREE from 'three';
import { BoatConfig } from '../config/BoatConfig.js';

/**
 * BoatController.js — Simple boat controller for the harbor/ocean game.
 * 
 * The boat moves forward/backward with W/S, turns left/right with A/D.
 * It has a maximum speed and acceleration/deceleration.
 * It also responds to waves for a bobbing effect.
 * Uses fixed physics timestep updates with interpolation for smooth rendering.
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

    // Movement state
    this.speed = 0; // current forward speed (m/s)
    this.acceleration = BoatConfig.ACCELERATION;
    this.deceleration = BoatConfig.DECELERATION;
    this.maxSpeed = BoatConfig.MAX_SPEED;
    this.reverseSpeed = BoatConfig.REVERSE_SPEED;
    this.turnSpeed = BoatConfig.TURN_SPEED;

    // Bobbing effect (optional)
    this.bobOffset = 0;
    this.bobSpeed = BoatConfig.BOB_SPEED;
    this.bobAmount = BoatConfig.BOB_AMOUNT;

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

    // --- 1. Handle throttle (W/S) ---
    let targetSpeed = 0;
    if (input.keys.forward) targetSpeed = this.maxSpeed;
    if (input.keys.backward) targetSpeed = -this.reverseSpeed;
    
    // If no input, decelerate towards 0
    if (!input.keys.forward && !input.keys.backward) {
      targetSpeed = 0;
    }

    // Accelerate/decelerate towards target speed
    const accel = (targetSpeed > this.speed) ? this.acceleration : this.deceleration;
    this.speed += (targetSpeed - this.speed) * Math.min(accel * dt, 1);

    // --- 2. Handle steering (A/D) ---
    // Only steer if we have some speed
    if (Math.abs(this.speed) > 0.1) {
      // The boat's forward axis is local -Z. Positive yaw turns that heading
      // left, so A is left and D is right.
      const turnDirection = (input.keys.right ? 1 : 0) - (input.keys.left ? 1 : 0);
      const turnAmount = turnDirection * this.turnSpeed * Math.abs(this.speed) / this.maxSpeed;
      this.physicsRotationY += turnAmount * dt;
    }

    // --- 3. Apply movement ---
    // Move forward in the direction the boat is facing
    const forward = new THREE.Vector3(0, 0, -1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.physicsRotationY);
    forward.applyQuaternion(q);

    const travel = forward.clone().multiplyScalar(Math.sign(this.speed));
    const moveDist = Math.abs(this.speed) * dt;

    // Collide with docks, harbour walls and land — never with the open water.
    // The boat bumps and holds against the pier instead of driving through it.
    if (moveDist > 0.0001 && this._collisionBlocks(travel, moveDist)) {
      this.speed = 0;
    } else {
      this.physicsPosition.add(travel.multiplyScalar(moveDist));
    }

    // --- 4. Update bobbing effect (optional) ---
    this.bobOffset += this.bobSpeed * dt;
    const bobY = Math.sin(this.bobOffset) * this.bobAmount;
    this.physicsPosition.y = bobY;
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
