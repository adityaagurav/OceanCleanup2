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
   * @param {THREE.Mesh[]} wallColliders — props/buildings that block horizontal movement
   */
  constructor(scene, colliders, wallColliders = []) {
    this.scene     = scene;
    this.colliders = colliders;
    this.wallColliders = wallColliders;

    // ── Visual ──────────────────────────────────────────────────────
    this._char = new ProceduralCharacter();
    this._char.addTo(scene);

    // Wrapper group — position/rotation controlled by physics
    this.group = this._char.root;

    // ── Physics state ───────────────────────────────────────────────
    this.position     = new THREE.Vector3(0, 5, 0);
    this.prevPosition = new THREE.Vector3(0, 5, 0);
    this.velocity     = new THREE.Vector3();
    this.yaw          = 0;
    this.prevYaw      = 0;
    this.isGrounded   = false;
    this.wasGrounded  = false;

    // ── Animation state ─────────────────────────────────────────────
    this.currentStateName = 'Idle';

    // ── Raycaster ───────────────────────────────────────────────────
    this._raycaster = new THREE.Raycaster();
    this._downDir   = new THREE.Vector3(0, -1, 0);
    this._horizRay  = new THREE.Raycaster();

    // ── Scratch vectors ─────────────────────────────────────────────
    this._inputDir   = new THREE.Vector3();
    this._desiredXZ  = new THREE.Vector3();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────────

  setPosition(x, y, z) {
    if (typeof x === 'object' && x !== null) {
      y = x.y;
      z = x.z;
      x = x.x;
    }
    this.position.set(x, y, z);
    this.prevPosition.set(x, y, z);
    this.group.position.copy(this.position);
  }

  rebase(offset) {
    this.position.sub(offset);
    this.prevPosition.sub(offset);
    this.group.position.sub(offset);
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
    // Store previous physics state before integration
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;

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

    // ── 5.5 Horizontal collision ────────────────────────────────────
    this._resolveHorizontalCollision(dt);

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

    // ── 9. Resolve animation state ─────────────────────────────────
    this._resolveState(input);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Render Update — every frame, sub-frame interpolation + visual animation
  // ─────────────────────────────────────────────────────────────────────────

  renderUpdate(alpha, frameDelta, camCtrl) {
    let fd = frameDelta;
    if (typeof alpha === 'number' && typeof frameDelta === 'number') {
      // Sub-frame interpolation for smooth movement at any refresh rate
      this.group.position.lerpVectors(this.prevPosition, this.position, alpha);

      let diff = this.yaw - this.prevYaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      this.group.rotation.y = this.prevYaw + diff * alpha;
    } else {
      // Fallback if called as renderUpdate(frameDelta, camCtrl)
      fd = alpha;
      camCtrl = frameDelta;
      this.group.position.copy(this.position);
      this.group.rotation.y = this.yaw;
    }

    this._char.update(this.currentStateName, this.speed, fd);

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

  /**
   * Prevents walking/clipping through solid props and buildings.
   * Probes the movement direction on the X and Z axes separately so the body
   * slides along walls instead of snagging. The probe heights clear the floor
   * (so the character can step up onto the pier from the water) while catching
   * low crates/barrels/benches up to tall railings and buildings.
   */
  _resolveHorizontalCollision(dt) {
    if (!this.wallColliders || this.wallColliders.length === 0) return;

    const radius = 0.45;
    const probes = [0.25, 0.7, 1.15]; // heights above the feet
    const origin = new THREE.Vector3();

    const blockAxis = (axis) => {
      const vel = axis === 'x' ? this.velocity.x : this.velocity.z;
      if (Math.abs(vel) < 0.01) return;

      const dir = axis === 'x'
        ? new THREE.Vector3(Math.sign(vel), 0, 0)
        : new THREE.Vector3(0, 0, Math.sign(vel));
      const travel = Math.abs(vel) * dt + radius;

      for (const h of probes) {
        origin.set(this.position.x, this.position.y + h, this.position.z);
        this._horizRay.set(origin, dir);
        const hits = this._horizRay.intersectObjects(this.wallColliders, false);
        if (hits.length > 0 && hits[0].distance < travel) {
          // Blocked — cancel movement along this axis so the body slides
          if (axis === 'x') this.velocity.x = 0; else this.velocity.z = 0;
          return;
        }
      }
    };

    blockAxis('x');
    blockAxis('z');
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
