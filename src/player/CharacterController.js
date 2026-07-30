import * as THREE from 'three';
import { ProceduralCharacter } from './ProceduralCharacter.js';
import { PlayerConfig }         from '../config/PlayerConfig.js';

/**
 * CharacterController.js — Velocity-based third-person character controller.
 *
 * Uses ProceduralCharacter for visuals.
 * Physics: velocity accumulation with acceleration/deceleration,
 *          downward raycast for ground detection, gravity, jump impulse.
 */

const {
  WALK_SPEED, RUN_SPEED, SPRINT_SPEED,
  JUMP_FORCE, GRAVITY, ACCELERATION, DECELERATION,
  TURN_SPEED, RAY_ORIGIN_OFFSET, RAY_SNAP_THRESHOLD,
} = PlayerConfig;

export class CharacterController {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Mesh[]} colliders — island meshes used for ground detection
   */
  constructor(scene, colliders) {
    this.scene     = scene;
    this.colliders = colliders;

    // ── Visual ──────────────────────────────────────────────────────
    this._char = new ProceduralCharacter();
    this._char.addTo(scene);

    // Wrapper group — position/rotation controlled by physics
    this.group = this._char.root;

    // ── Physics state ───────────────────────────────────────────────
    this.position    = new THREE.Vector3(0, 5, 0);
    this.velocity    = new THREE.Vector3();
    this.yaw         = 0;
    this.isGrounded  = false;
    this.wasGrounded = false;

    // ── Animation state ─────────────────────────────────────────────
    this.currentStateName = 'Idle';

    // ── Raycaster ───────────────────────────────────────────────────
    this._raycaster = new THREE.Raycaster();
    this._downDir   = new THREE.Vector3(0, -1, 0);

    // ── Scratch vectors ─────────────────────────────────────────────
    this._inputDir   = new THREE.Vector3();
    this._desiredXZ  = new THREE.Vector3();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────────

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.group.position.copy(this.position);
  }

  getPosition() { return this.group.position.clone(); }

  getDeckPosition() {
    return this.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  }

  /** Horizontal speed in m/s for HUD + animation sync */
  get speed() {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Fixed Update — 60Hz physics step
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {InputManager} input
   * @param {CameraController} camCtrl  — pass controller (not raw camera)
   * @param {number} dt  — fixed delta (1/60)
   */
  fixedUpdate(input, camCtrl, dt) {
    // ── 1. Camera-relative input direction (no charYaw dependency) ──
    const camForward = camCtrl.getCameraForward();
    const camRight   = camCtrl.getCameraRight();

    this._inputDir.set(0, 0, 0);
    if (input.keys.forward)  this._inputDir.add(camForward);
    if (input.keys.backward) this._inputDir.sub(camForward);
    if (input.keys.right)    this._inputDir.add(camRight);
    if (input.keys.left)     this._inputDir.sub(camRight);

    const hasInput = this._inputDir.lengthSq() > 0;
    if (hasInput) this._inputDir.normalize();

    // ── 2. Desired XZ velocity ──────────────────────────────────────
    let targetSpeed = input.keys.sprint ? SPRINT_SPEED
                    : hasInput          ? RUN_SPEED
                    : 0;

    // Hold backward at walk speed
    if (input.keys.backward && !input.keys.forward) targetSpeed = WALK_SPEED;

    this._desiredXZ.set(
      hasInput ? this._inputDir.x * targetSpeed : 0,
      0,
      hasInput ? this._inputDir.z * targetSpeed : 0,
    );

    // ── 3. Accelerate / decelerate ──────────────────────────────────
    const rate = hasInput ? ACCELERATION : DECELERATION;
    this.velocity.x += (this._desiredXZ.x - this.velocity.x) * Math.min(rate * dt, 1);
    this.velocity.z += (this._desiredXZ.z - this.velocity.z) * Math.min(rate * dt, 1);

    // ── 4. Gravity ──────────────────────────────────────────────────
    if (this.isGrounded) {
      this.velocity.y = Math.max(this.velocity.y, 0);
    } else {
      this.velocity.y += GRAVITY * dt;
    }

    // ── 5. Jump ─────────────────────────────────────────────────────
    if (input.keys.jump && this.isGrounded) {
      this.velocity.y  = JUMP_FORCE;
      this.isGrounded  = false;
    }

    // ── 6. Integrate position ───────────────────────────────────────
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // ── 7. Ground detection ─────────────────────────────────────────
    this.wasGrounded = this.isGrounded;
    this._detectGround();

    // ── 8. Rotate body to face movement direction ───────────────────
    if (hasInput) {
      const targetYaw = Math.atan2(this._inputDir.x, this._inputDir.z);
      let diff = targetYaw - this.yaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      this.yaw += diff * Math.min(TURN_SPEED * dt, 1);
    }

    // ── 9. Apply to scene ───────────────────────────────────────────
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;

    // ── 10. Resolve animation state ─────────────────────────────────
    this._resolveState(input);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Render Update — every frame, drives visual animation
  // ─────────────────────────────────────────────────────────────────────────

  renderUpdate(frameDelta, camCtrl) {
    this._char.update(this.currentStateName, this.speed, frameDelta);

    // Hide head in First-Person view to prevent clipping
    if (camCtrl) {
      const isFPS = camCtrl._distance < 1.0;
      if (this._char.head) this._char.head.visible = !isFPS;
      if (this._char.torso) {
        // Optional: hide torso or backpack in pure FPS if they clip when looking down
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Private
  // ─────────────────────────────────────────────────────────────────────────

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
      // Float on water surface
      this.position.y = 0;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
  }

  _resolveState(input) {
    const hSpeed   = this.speed;
    const moving   = hSpeed > 0.3;
    const sprinting = input.keys.sprint && moving;
    const falling  = !this.isGrounded && this.velocity.y < -0.5;
    const jumping  = !this.isGrounded && this.velocity.y > 0.5;

    if      (jumping)   this.currentStateName = 'Jump';
    else if (falling)   this.currentStateName = 'Fall';
    else if (sprinting) this.currentStateName = 'Run';
    else if (moving)    this.currentStateName = 'Walk';
    else                this.currentStateName = 'Idle';

    // Landing snap
    if (this.isGrounded && !this.wasGrounded) {
      this.currentStateName = moving ? 'Walk' : 'Idle';
    }
  }
}
