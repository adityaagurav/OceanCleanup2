import * as THREE from 'three';
import { GLTFCharacter }       from './GLTFCharacter.js';
import { AnimationController } from './AnimationController.js';
import { PlayerConfig }        from '../config/PlayerConfig.js';

/**
 * CharacterController.js — Velocity-based third-person character controller.
 *
 * Uses GLTFCharacter for visuals, AnimationController for state machine.
 * Physics: velocity accumulation with acceleration/deceleration,
 *          downward raycast for ground detection, gravity, jump impulse.
 *
 * Features:
 *   • Walking / Running / Sprinting with gradual acceleration
 *   • Smooth rotation toward movement direction (interpolated)
 *   • Jump with tuned height (≈1.2m), no double jump, 30% air control
 *   • Swimming mode when in water (slower, no jump, auto-float)
 *   • Terrain speed modifiers (sand = 10% slower)
 *   • Capsule-like collision (dual raycasts)
 *   • Steep slope detection and sliding
 */

const {
  WALK_SPEED, RUN_SPEED, SPRINT_SPEED,
  JUMP_FORCE, GRAVITY, ACCELERATION, DECELERATION,
  TURN_SPEED, RAY_ORIGIN_OFFSET, RAY_SNAP_THRESHOLD,
  AIR_CONTROL, SWIM_SPEED, SWIM_ACCEL, SWIM_DECEL,
  WATER_LEVEL, SAND_SPEED_MODIFIER,
} = PlayerConfig;

export class CharacterController {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Mesh[]} colliders — island meshes used for ground detection
   * @param {THREE.Mesh[]} extraColliders — boat deck, docks, etc.
   */
  constructor(scene, colliders, extraColliders = []) {
    this.scene     = scene;
    this.colliders = colliders;
    this.extraColliders = extraColliders;

    // ── Visual ──────────────────────────────────────────────────────
    this._char = new GLTFCharacter();
    this._char.addTo(scene);
    this.group = this._char.root;

    // ── Animation ───────────────────────────────────────────────────
    this._animCtrl = new AnimationController(this._char._char || this._char);

    // ── Physics state ───────────────────────────────────────────────
    this.position    = new THREE.Vector3(0, 5, 0);
    this.velocity    = new THREE.Vector3();
    this.yaw         = 0;
    this.isGrounded  = false;
    this.wasGrounded = false;
    this.isOnSteepSlope = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);

    // ── State flags ─────────────────────────────────────────────────
    this.isSwimming    = false;
    this.isInWater     = false;
    this.terrainType   = 'normal'; // 'normal', 'sand', 'rock', 'dock'
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

  /** Get the animation controller for external queries */
  getAnimationController() { return this._animCtrl; }

  // ─────────────────────────────────────────────────────────────────────────
  //  Fixed Update — 60Hz physics step
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {InputManager} input
   * @param {CameraController} camCtrl
   * @param {number} dt — fixed delta (1/60)
   */
  fixedUpdate(input, camCtrl, dt) {
    // ── 0. Detect water ──────────────────────────────────────────────
    this.isInWater = this.position.y <= WATER_LEVEL + 0.3;
    const wasSwimming = this.isSwimming;
    this.isSwimming = this.isInWater && !this.isGrounded;

    // ── 1. Camera-relative input direction ───────────────────────────
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
    let targetSpeed;
    if (this.isSwimming) {
      // Swimming — slower, no sprint difference
      targetSpeed = hasInput ? SWIM_SPEED : 0;
    } else {
      targetSpeed = input.keys.sprint ? SPRINT_SPEED
                  : hasInput          ? RUN_SPEED
                  : 0;
      // Hold backward at walk speed
      if (input.keys.backward && !input.keys.forward) targetSpeed = WALK_SPEED;
    }

    // Terrain speed modifier
    if (this.terrainType === 'sand' && !this.isSwimming) {
      targetSpeed *= SAND_SPEED_MODIFIER;
    }

    // Prevent moving up steep slopes
    if (this.isOnSteepSlope && hasInput) {
      targetSpeed *= 0.1;
    }

    this._desiredXZ.set(
      hasInput ? this._inputDir.x * targetSpeed : 0,
      0,
      hasInput ? this._inputDir.z * targetSpeed : 0,
    );

    // ── 3. Accelerate / decelerate ──────────────────────────────────
    let accel, decel;
    if (this.isSwimming) {
      accel = SWIM_ACCEL;
      decel = SWIM_DECEL;
    } else {
      accel = ACCELERATION;
      decel = DECELERATION;
    }

    const isAirborne = !this.isGrounded && !this.isOnSteepSlope && !this.isSwimming;
    const airControl = isAirborne ? AIR_CONTROL : 1.0;
    const rate = hasInput ? accel * airControl : decel;

    this.velocity.x += (this._desiredXZ.x - this.velocity.x) * Math.min(rate * dt, 1);
    this.velocity.z += (this._desiredXZ.z - this.velocity.z) * Math.min(rate * dt, 1);

    // Slide down steep slopes
    if (this.isOnSteepSlope) {
      this.velocity.x += this.groundNormal.x * 20.0 * dt;
      this.velocity.z += this.groundNormal.z * 20.0 * dt;
    }

    // ── 4. Gravity / Water buoyancy ─────────────────────────────────
    if (this.isSwimming) {
      // Float at water level — gentle bob
      const depth = WATER_LEVEL - this.position.y;
      this.velocity.y += depth * 10.0 * dt; // spring toward water level
      this.velocity.y *= 0.92; // damping
    } else if (this.isGrounded && !this.isOnSteepSlope) {
      this.velocity.y = Math.max(this.velocity.y, 0);
    } else {
      // Heavier gravity when falling for snappy, responsive jump arc
      const currentGravity = this.velocity.y < 0 ? GRAVITY * 1.5 : GRAVITY;
      this.velocity.y += currentGravity * dt;
    }

    // ── 5. Jump ─────────────────────────────────────────────────────
    if (input.keys.jump && this.isGrounded && !this.isOnSteepSlope && !this.isSwimming) {
      this.velocity.y = JUMP_FORCE;
      this.isGrounded = false;
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
    if (this.isSwimming) {
      this.group.position.y -= 0.8; // Submerge to waist
    }
    this.group.rotation.y = this.yaw;

    // ── 10. Resolve animation state ─────────────────────────────────
    this._resolveState(input);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Render Update — every frame, drives visual animation
  // ─────────────────────────────────────────────────────────────────────────

  renderUpdate(frameDelta, camCtrl) {
    // Update animation controller
    this._animCtrl.update(frameDelta, this.speed);

    // Drive character visuals
    this._char.update(this.currentStateName, this.speed, frameDelta);

    // Hide head in First-Person view to prevent clipping
    if (camCtrl) {
      const isFPS = camCtrl._distance < 1.0;
      if (this._char.head) this._char.head.visible = !isFPS;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Private
  // ─────────────────────────────────────────────────────────────────────────

  _detectGround() {
    this.isGrounded = false;
    this.isOnSteepSlope = false;
    this.groundNormal.set(0, 1, 0);
    this.terrainType = 'normal';

    const allColliders = [...this.colliders, ...this.extraColliders];
    if (allColliders.length === 0) return;

    const origin = new THREE.Vector3(
      this.position.x,
      this.position.y + RAY_ORIGIN_OFFSET,
      this.position.z
    );
    this._raycaster.set(origin, this._downDir);
    const hits = this._raycaster.intersectObjects(allColliders, false);

    if (hits.length > 0 && hits[0].distance <= RAY_SNAP_THRESHOLD && this.velocity.y <= 0) {
      this.position.y = Math.max(hits[0].point.y, 0);

      // Detect terrain type from vertex colors
      this._detectTerrainType(hits[0]);

      // Calculate slope
      if (hits[0].face) {
        this.groundNormal.copy(hits[0].face.normal);
        const slopeAngle = this.groundNormal.angleTo(new THREE.Vector3(0, 1, 0));
        if (slopeAngle > Math.PI / 4) { // > 45 degrees
          this.isOnSteepSlope = true;
        }
      }

      if (!this.isOnSteepSlope) {
        this.velocity.y = 0;
        this.isGrounded = true;
      }
    } else if (this.position.y <= WATER_LEVEL) {
      // Float on water surface
      this.position.y = WATER_LEVEL;
      // Don't set isGrounded — this triggers swimming
    }
  }

  /**
   * Detect terrain type from hit geometry vertex colors.
   * Sand-colored vertices (warm yellow/beige) → 'sand'
   */
  _detectTerrainType(hit) {
    const geo = hit.object.geometry;
    if (!geo || !geo.attributes.color || !hit.face) {
      this.terrainType = 'normal';
      return;
    }

    const colorAttr = geo.attributes.color;
    const faceIndex = hit.face.a; // sample first vertex of face

    const r = colorAttr.getX(faceIndex);
    const g = colorAttr.getY(faceIndex);
    const b = colorAttr.getZ(faceIndex);

    // Sand detection: warm yellow/beige tones (high R, medium G, low B)
    if (r > 0.7 && g > 0.6 && b < 0.5) {
      this.terrainType = 'sand';
    } else {
      this.terrainType = 'normal';
    }
  }

  _resolveState(input) {
    const hSpeed   = this.speed;
    const moving   = hSpeed > 0.3;
    const sprinting = input.keys.sprint && moving;
    const falling  = !this.isGrounded && this.velocity.y < -0.5;
    const jumping  = !this.isGrounded && this.velocity.y > 0.5;

    let newState;

    if (this.isSwimming) {
      // Swimming states
      newState = moving ? 'Swim' : 'TreadWater';
    } else if (jumping) {
      newState = 'Jump';
    } else if (falling) {
      newState = 'Fall';
    } else if (sprinting) {
      newState = hSpeed > SPRINT_SPEED * 0.8 ? 'Sprint' : 'Run';
    } else if (moving) {
      newState = hSpeed > WALK_SPEED * 1.2 ? 'Run' : 'Walk';
    } else {
      newState = 'Idle';
    }

    // Landing transition
    if (this.isGrounded && !this.wasGrounded && !this.isSwimming) {
      newState = 'Land';
      this._animCtrl.setState('Land', { lockDuration: 0.15, onComplete: () => {
        this._animCtrl.setState(moving ? 'Walk' : 'Idle');
      }});
      this.currentStateName = 'Land';
      return;
    }

    // Update if not locked
    if (!this._animCtrl.isLocked()) {
      this._animCtrl.setState(newState);
      this.currentStateName = newState;
    }
  }
}
