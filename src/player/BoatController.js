import * as THREE from 'three';
<<<<<<< HEAD
import { FishingBoat } from './FishingBoat.js';
import { PlayerConfig }  from '../config/PlayerConfig.js';

const {
  WALK_SPEED, RUN_SPEED, SPRINT_SPEED,
  GRAVITY, ACCELERATION, DECELERATION,
  TURN_SPEED, RAY_ORIGIN_OFFSET, RAY_SNAP_THRESHOLD,
} = PlayerConfig;

export class BoatController {
  constructor(scene, colliders) {
    this.scene     = scene;
    this.colliders = colliders;

    this._boat = new FishingBoat();
    this._boat.addTo(scene);
    this.group = this._boat.root;

    this.position    = new THREE.Vector3(0, 0, 0); // Start on water
    this.velocity    = new THREE.Vector3();
    this.yaw         = 0;
    this.isGrounded  = false;
    
    // Default animation state
    this.currentStateName = 'Idle';

    this._raycaster = new THREE.Raycaster();
    this._downDir   = new THREE.Vector3(0, -1, 0);

    this._inputDir   = new THREE.Vector3();
    this._desiredXZ  = new THREE.Vector3();
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.group.position.copy(this.position);
  }

  getPosition() { return this.group.position.clone(); }

  getDeckPosition() {
    return this.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  }

  get speed() {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
  }

  fixedUpdate(input, camCtrl, dt) {
    const camForward = camCtrl.getCameraForward();
    const camRight   = camCtrl.getCameraRight();

    this._inputDir.set(0, 0, 0);
    if (input.keys.forward)  this._inputDir.add(camForward);
    if (input.keys.backward) this._inputDir.sub(camForward);
    if (input.keys.right)    this._inputDir.add(camRight);
    if (input.keys.left)     this._inputDir.sub(camRight);

    const hasInput = this._inputDir.lengthSq() > 0;
    if (hasInput) this._inputDir.normalize();

    // Boat speeds (can be tuned later if they need to be faster than character)
    let targetSpeed = input.keys.sprint ? SPRINT_SPEED * 1.5
                    : hasInput          ? RUN_SPEED * 1.5
                    : 0;

    if (input.keys.backward && !input.keys.forward) targetSpeed = WALK_SPEED * 1.5;

    this._desiredXZ.set(
      hasInput ? this._inputDir.x * targetSpeed : 0,
      0,
      hasInput ? this._inputDir.z * targetSpeed : 0,
    );

    const rate = hasInput ? ACCELERATION * 0.5 : DECELERATION * 0.5; // Boats accelerate slower
    this.velocity.x += (this._desiredXZ.x - this.velocity.x) * Math.min(rate * dt, 1);
    this.velocity.z += (this._desiredXZ.z - this.velocity.z) * Math.min(rate * dt, 1);

    if (this.isGrounded) {
      this.velocity.y = Math.max(this.velocity.y, 0);
    } else {
      this.velocity.y += GRAVITY * dt;
    }

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    this._detectGround();

    if (hasInput) {
      const targetYaw = Math.atan2(this._inputDir.x, this._inputDir.z);
      let diff = targetYaw - this.yaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      this.yaw += diff * Math.min(TURN_SPEED * 0.5 * dt, 1); // Boats turn slower
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;

    this.currentStateName = this.speed > 0.3 ? 'Run' : 'Idle';
  }

  renderUpdate(frameDelta, camCtrl) {
    this._boat.update(this.currentStateName, this.speed, frameDelta);
  }

  _detectGround() {
    this.isGrounded = false;
    if (!this.colliders || this.colliders.length === 0) return;

    const origin = new THREE.Vector3(
      this.position.x,
      this.position.y + RAY_ORIGIN_OFFSET,
      this.position.z
    );
    this._raycaster.set(origin, this._downDir);
    const hits = this._raycaster.intersectObjects(this.colliders, false);

    if (hits.length > 0 && hits[0].distance <= RAY_SNAP_THRESHOLD && this.velocity.y <= 0) {
      this.position.y = Math.max(hits[0].point.y, 0);
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
=======
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
   */
  constructor(boat, input) {
    this.boat = boat;
    this.input = input;

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
  }

  /**
   * Fixed update for physics (called at fixed timestep)
   * @param {InputManager} input
   * @param {number} dt - fixed time step (1/60)
   */
  fixedUpdate(input, dt) {
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
    forward.multiplyScalar(this.speed * dt);
    this.boat.position.add(forward);

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
>>>>>>> ce7c38d (add harbour boat cleanup gameplay)
  }
}
