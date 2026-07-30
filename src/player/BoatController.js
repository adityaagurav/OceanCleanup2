import * as THREE from 'three';
import { BoatModel } from './BoatModel.js';
import { PlayerConfig }  from '../config/PlayerConfig.js';

/**
 * BoatController.js — Physics-based boat controller with realistic water feel.
 *
 * Features:
 *   • Thrust-based forward/reverse movement
 *   • Speed-dependent steering (boat turns faster at speed)
 *   • Visual buoyancy bobbing, roll banking on turns, pitch on acceleration
 *   • Improved boarding/disembark positioning (places character beside boat)
 *   • InteractionSystem compatible via getBoatGroup()
 */

const {
  WALK_SPEED, RUN_SPEED, SPRINT_SPEED,
  GRAVITY, ACCELERATION, DECELERATION,
  TURN_SPEED, RAY_ORIGIN_OFFSET, RAY_SNAP_THRESHOLD,
  BOAT_BOARD_RADIUS,
} = PlayerConfig;

export class BoatController {
  constructor(scene, colliders) {
    this.scene     = scene;
    this.colliders = colliders;

    this._boat = new BoatModel();
    this._boat.addTo(scene);
    this.group = this._boat.root;

    this.position    = new THREE.Vector3(0, 0, 0);
    this.velocity    = new THREE.Vector3();
    this.yaw         = 0;
    this.isGrounded  = false;
    this.maxSpeed    = 12.0; // default, will be overwritten by BoatManager

    // Physics visual extras
    this.currentTurnRate = 0;
    this.roll = 0;
    this.pitch = 0;
    this.time = 0;

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

  /**
   * Get the boat's root group for InteractionSystem registration.
   * @returns {THREE.Group}
   */
  getBoatGroup() { return this.group; }

  /**
   * Get a disembark position beside the boat (port side).
   * @returns {THREE.Vector3}
   */
  getDisembarkPosition() {
    // Place character 3m to the left side of the boat
    const sideOffset = new THREE.Vector3(-3.0, 1.5, 0);
    sideOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return this.getPosition().add(sideOffset);
  }

  /**
   * Get the cockpit position where the character sits.
   * @returns {THREE.Vector3}
   */
  getCockpitPosition() {
    const cockpitOffset = new THREE.Vector3(0, 1.8, -1.5);
    cockpitOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return new THREE.Vector3(
      this.position.x + cockpitOffset.x,
      this.position.y + cockpitOffset.y,
      this.position.z + cockpitOffset.z
    );
  }

  get speed() {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
  }

  fixedUpdate(input, camCtrl, dt) {
    const hasInput = input.keys.forward || input.keys.backward || input.keys.left || input.keys.right;

    // 1. Calculate thrust intent
    let throttle = 0;
    if (input.keys.forward) throttle = 1;
    if (input.keys.backward) throttle = -0.5;

    // 2. Steer (A/D)
    let steering = 0;
    if (input.keys.left) steering = 1;
    if (input.keys.right) steering = -1;

    // Turn speed depends on how fast the boat is going
    const speedFactor = Math.min(this.speed / 5.0, 1.0) + 0.1;
    const turnRate = steering * 0.8 * speedFactor * dt;

    // Reverse steering logic like a real boat
    const turnDirection = throttle < 0 ? -1 : 1;
    this.yaw += turnRate * turnDirection;

    this.currentTurnRate = (turnRate * turnDirection) / dt;

    // Forward vector of the boat
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    // Thrust
    let targetSpeed = 0;
    if (throttle > 0) {
      targetSpeed = input.keys.sprint ? this.maxSpeed * 1.4 : this.maxSpeed;
    } else if (throttle < 0) {
      targetSpeed = -this.maxSpeed * 0.5;
    }

    // Apply thrust along the boat's forward direction
    const thrustX = forward.x * targetSpeed;
    const thrustZ = forward.z * targetSpeed;

    const rate = throttle !== 0 ? ACCELERATION * 0.1 : DECELERATION * 0.05;
    this.velocity.x += (thrustX - this.velocity.x) * Math.min(rate * dt, 1);
    this.velocity.z += (thrustZ - this.velocity.z) * Math.min(rate * dt, 1);

    if (this.isGrounded) {
      this.velocity.y = Math.max(this.velocity.y, 0);
    } else {
      this.velocity.y += GRAVITY * dt;
    }

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    this._detectGround();

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;

    this.currentStateName = this.speed > 0.3 ? 'Run' : 'Idle';
  }

  renderUpdate(frameDelta, camCtrl) {
    this._boat.update(this.currentStateName, this.speed, frameDelta);
    this.time += frameDelta;

    // Visual Buoyancy (bobbing)
    const bobbing = Math.sin(this.time * 2.0) * 0.05;
    const pitchBob = Math.cos(this.time * 1.5) * 0.03;

    // Banking (roll) based on turn rate and speed
    const speedFactorVisual = Math.min(this.speed / 5.0, 1.0);
    const targetRoll = -this.currentTurnRate * 0.1 * speedFactorVisual;
    this.roll += (targetRoll - this.roll) * frameDelta * 5.0;

    // Engine acceleration pitch
    const accelPitch = (this.speed > 0.5 && this._inputDir.lengthSq() > 0) ? -0.05 : 0;
    this.pitch += ((pitchBob + accelPitch) - this.pitch) * frameDelta * 3.0;

    this.group.position.y = this.position.y + (this.isGrounded ? 0 : bobbing);
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
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
  }
}
