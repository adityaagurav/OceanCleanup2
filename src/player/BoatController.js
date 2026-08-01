import * as THREE from 'three';
import { BoatConfig } from '../config/BoatConfig.js';

/**
 * BoatController.js — Simple boat controller for the harbor/ocean game.
 * 
 * The boat moves forward/backward with W/S, turns left/right with A/D.
 * It has a maximum speed and acceleration/deceleration.
 * It also responds to waves for a bobbing effect.
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

    this._ray = new THREE.Raycaster();
  }

  /**
   * Fixed update for physics (called at fixed timestep)
   * @param {InputManager} input
   * @param {number} dt - fixed time step (1/60)
   */
  fixedUpdate(input, dt) {
    if (!this.enabled) return;

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
      this.boat.rotation.y += turnAmount * dt;
    }

    // --- 3. Apply movement ---
    // Move forward in the direction the boat is facing
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.boat.quaternion);

    const travel = forward.clone().multiplyScalar(Math.sign(this.speed));
    const moveDist = Math.abs(this.speed) * dt;

    // Collide with docks, harbour walls and land — never with the open water.
    // The boat bumps and holds against the pier instead of driving through it.
    if (moveDist > 0.0001 && this._collisionBlocks(travel, moveDist)) {
      this.speed = 0;
    } else {
      this.boat.position.add(travel.multiplyScalar(moveDist));
    }

    // --- 4. Update bobbing effect (optional) ---
    this.bobOffset += this.bobSpeed * dt;
    const bobY = Math.sin(this.bobOffset) * this.bobAmount;
    this.boat.position.y = bobY; // assuming the boat's base is at y=0, we adjust to bob
  }

  /**
   * Render update for visual effects (called every frame)
   * @param {number} frameDelta
   * @param {CameraController} cameraCtrl - for any view-dependent effects
   */
  renderUpdate(frameDelta, cameraCtrl) {
    // For now, no special render updates needed
    // We could add wake effects, etc.
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
    const origin = this.boat.position.clone();
    origin.y = 0.3; // just above the bob range, at dock height
    this._ray.set(origin, dir);
    const hits = this._ray.intersectObjects(this.colliders, false);
    const stopDistance = moveDist + 2.0; // boat half-length margin
    return hits.length > 0 && hits[0].distance < stopDistance;
  }
}
