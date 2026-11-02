import * as THREE from 'three';
import { GraphicsConfig } from '../config/GraphicsConfig.js';
import { BoatConfig } from '../config/BoatConfig.js';

/**
 * CameraController.js — Spring-interpolated third-person follow camera.
 *
 * KEY DESIGN DECISION:
 *   The camera yaw is stored as an ABSOLUTE world-space angle (_camYaw).
 *   It is NEVER computed from charYaw. This prevents the circular drift bug
 *   where: player presses W → character turns → camera moves → new cam direction
 *   → character turns again → spinning in circles forever.
 *
 *   Mouse X: directly adjusts _camYaw (orbit camera horizontally)
 *   Mouse Y: adjusts _elevation (tilt up/down)
 *   Scroll:  adjusts _distance (zoom)
 *
 *   W key moves character in the direction the camera is looking.
 *   Character body rotates to face that direction.
 *   Camera stays at its current _camYaw unless the mouse is moved.
 */

const {
  CAM_DEFAULT_DISTANCE:  DEFAULT_DISTANCE,
  CAM_MIN_DISTANCE:      MIN_DISTANCE,
  CAM_MAX_DISTANCE:      MAX_DISTANCE,
  CAM_DEFAULT_ELEVATION: DEFAULT_ELEVATION,
  CAM_MIN_ELEVATION:     MIN_ELEVATION,
  CAM_MAX_ELEVATION:     MAX_ELEVATION,
  CAM_SPRING_FACTOR:     SPRING_FACTOR,
  CAM_MOUSE_SENSITIVITY: MOUSE_SENSITIVITY,
  CAM_ZOOM_SENSITIVITY:  ZOOM_SENSITIVITY,
} = GraphicsConfig;

export class CameraController {
  /**
   * @param {THREE.Camera} camera
   * @param {HTMLElement} domElement — canvas for pointer lock
   */
  constructor(camera, domElement) {
    this.camera     = camera;
    this.domElement = domElement;

    // Absolute world-space camera orbit angles (INDEPENDENT of character yaw)
    this._camYaw   = Math.PI; // π = camera starts directly behind character (+Z facing)
    this._elevation = DEFAULT_ELEVATION;
    this._distance  = DEFAULT_DISTANCE;

    // Look-at point: Chest level for Third Person view
    this._lookAtHeightOffset = 1.2;

    // Spring: smooth camera position lerp
    this._springPos   = new THREE.Vector3();
    this._initialized = false;

    // Boat-feel state: smoothed camera roll (into turns), smoothed speed FOV,
    // and scratch vectors.
    this._camRoll = 0;
    this._fov     = GraphicsConfig.FOV;
    this._tmpV    = new THREE.Vector3();
    this._idealOffset = new THREE.Vector3();
    this._lookAtPos   = new THREE.Vector3();
    this._idealPos    = new THREE.Vector3();
    this._camForward  = new THREE.Vector3();
    this._camRight    = new THREE.Vector3();

    this._onClick = () => {
      this.requestLock();
    };
    if (this.domElement) {
      this.domElement.addEventListener('click', this._onClick);
    }
  }

  /** Request pointer lock with safe error handling */
  requestLock() {
    try {
      const p = this.domElement?.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {}
  }

  /**
   * Called every RENDER frame.
   * @param {THREE.Vector3} charPosition
   * @param {number} _charYaw — intentionally ignored (see design note above)
   * @param {InputManager} input
   * @param {number} frameDelta
   * @param {object|null} boatFeel — optional feel layer for boat mode:
   *   { bob: wave bob height (m), roll: target camera roll (rad), pitch: boat
   *   pitch (rad, positive = bow up), delay: spring stiffness multiplier }.
   *   All offsets are tiny and spring-smoothed so they read as a heavy hull,
   *   never motion sickness. null keeps the character camera behaviour
   *   identical (and eases any leftover boat roll back to zero).
   */
  update(charPosition, _charYaw, input, frameDelta, boatFeel = null) {
    if (!charPosition || !Number.isFinite(charPosition.x) || !Number.isFinite(charPosition.z)) return;

    // ── 1. Mouse input: adjust ABSOLUTE camera yaw/elevation ────────
    const mouse = input.consumeMouseDelta();

    if (Number.isFinite(mouse.dx) && Number.isFinite(mouse.dy)) {
      if (mouse.dx !== 0 || mouse.dy !== 0) {
        // Mouse right (+dx) → orbit camera clockwise → camYaw decreases
        this._camYaw   -= mouse.dx * MOUSE_SENSITIVITY;
        this._elevation += mouse.dy * MOUSE_SENSITIVITY;
        this._elevation  = Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, this._elevation));
      }
    }

    // Scroll zoom
    if (Number.isFinite(mouse.scroll) && mouse.scroll !== 0) {
      this._distance += mouse.scroll * ZOOM_SENSITIVITY;
      this._distance  = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, this._distance));
    }

    // ── 1b. Boat feel: yaw trail — while the hull turns, drift the camera's
    //         orbit angle toward the boat's heading (partially + slowly), so
    //         the view trails the turn like it's attached to a heavy hull.
    //         Applied BEFORE the ideal position is computed. Mouse input
    //         adjusts _camYaw first, so it always wins when the player looks.
    if (boatFeel && boatFeel.yaw != null) {
      let diff = boatFeel.yaw - this._camYaw;
      diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const ky = 1 - Math.exp(-BoatConfig.CAMERA.YAW_LAG_RESPONSE * Math.min(frameDelta, 0.1));
      this._camYaw += diff * ky * BoatConfig.CAMERA.YAW_LAG_AMOUNT;
    }

    // Normalize camYaw and guard against NaN
    this._camYaw = ((this._camYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    if (!Number.isFinite(this._camYaw)) this._camYaw = Math.PI;
    if (!Number.isFinite(this._elevation)) this._elevation = DEFAULT_ELEVATION;
    if (!Number.isFinite(this._distance)) this._distance = DEFAULT_DISTANCE;

    // ── 2. Compute ideal camera position ────────────────────────────
    const cosE = Math.cos(this._elevation);
    const sinE = Math.sin(this._elevation);

    // Camera offset from look-at point (absolute angle, no charYaw dependency)
    this._idealOffset.set(
      this._distance * cosE * Math.sin(this._camYaw),
      this._distance * sinE,
      this._distance * cosE * Math.cos(this._camYaw),
    );

    this._lookAtPos.copy(charPosition);
    this._lookAtPos.y += this._lookAtHeightOffset;

    // Boat feel: tiny vertical bob + pitch-from-acceleration on the look-at.
    if (boatFeel) {
      this._lookAtPos.y += (boatFeel.bob || 0) + (boatFeel.pitch || 0) * BoatConfig.CAMERA.PITCH_AMOUNT;
    }
    if (this._lookAtPos.y < 0.2) this._lookAtPos.y = 0.2; // never look below the waterline

    this._idealPos.copy(this._lookAtPos).add(this._idealOffset);
    if (this._idealPos.y < 0.5) this._idealPos.y = 0.5; // never clip into water

    // ── 3. Exponential-decay spring (no jitter, cinematic) ──────────
    if (!this._initialized) {
      this._springPos.copy(this._idealPos);
      this._initialized = true;
    }

    // Boat mode adds a tiny extra lag so the camera feels attached to a heavy
    // hull instead of glued to it.
    const lag = boatFeel?.delay ?? 1;
    const safeDelta = Math.min(Math.max(frameDelta, 0), 0.1);
    const t = 1 - Math.exp(-SPRING_FACTOR * lag * safeDelta);
    if (Number.isFinite(t) && t > 0) {
      this._springPos.lerp(this._idealPos, t);
    } else {
      this._springPos.copy(this._idealPos);
    }
    if (!Number.isFinite(this._springPos.x)) {
      this._springPos.copy(this._idealPos);
    }

    this.camera.position.copy(this._springPos);
    this.camera.lookAt(this._lookAtPos);

    // ── 4. Boat feel: roll into turns (smoothed) ───────────────────
    // lookAt() resets orientation every frame, so we simply re-apply the
    // smoothed roll around the camera's own forward axis each frame.
    const targetRoll = boatFeel?.roll ?? 0;
    const kR = 1 - Math.exp(-BoatConfig.CAMERA.ROLL_RESPONSE * frameDelta);
    this._camRoll += (targetRoll - this._camRoll) * kR;
    if (Math.abs(this._camRoll) > 0.0005) {
      const fwd = this._tmpV.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.camera.rotateOnAxis(fwd, this._camRoll);
    }

    // ── 5. Boat feel: speed FOV widening (subtle) ──────────────────
    // The view opens up a few degrees at full throttle, easing back to the
    // base FOV at idle / in character mode. Cheap: one projection update.
    const targetFov = GraphicsConfig.FOV
      + (boatFeel ? (boatFeel.speedFactor || 0) * BoatConfig.CAMERA.FOV_BOOST : 0);
    const kF = 1 - Math.exp(-BoatConfig.CAMERA.FOV_RESPONSE * frameDelta);
    this._fov += (targetFov - this._fov) * kF;
    if (Math.abs(this.camera.fov - this._fov) > 0.01) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Shift the camera by -offset without any spring lag.
   * Called by the engine's floating-origin rebase so the boat can sail
   * unlimited distances while coordinates stay small and the camera never
   * visibly jumps.
   */
  rebase(offset) {
    this._springPos.sub(offset);
    this.camera.position.sub(offset);
  }

  /**
   * Current absolute camera orbit yaw (radians) — read by the engine's HUD
   * compass so the rose tracks the direction the camera is looking.
   * @returns {number} radians, in (-∞, ∞) — wrap before display
   */
  getYaw() {
    return this._camYaw;
  }

  /**
   * Returns the FLAT (XZ only) direction the camera is looking.
   * Used by CharacterController to compute "forward" for W key.
   * Because _camYaw is absolute, this never drifts.
   * @returns {THREE.Vector3} normalized, Y = 0
   */
  getCameraForward() {
    // Camera is at charPos + offset(camYaw). It looks TOWARD charPos.
    // So its forward is the direction FROM camera TO charPos:
    //   = -offset direction (flat) = (-sin(camYaw), 0, -cos(camYaw))
    return this._camForward.set(
      -Math.sin(this._camYaw),
      0,
      -Math.cos(this._camYaw),
    ).normalize();
  }

  /**
   * Returns camera right (perpendicular to forward in XZ plane).
   * Used by CharacterController for A/D strafing.
   * Right = Forward x Up = (-sin, 0, -cos) x (0, 1, 0) = (cos, 0, -sin).
   * @returns {THREE.Vector3} normalized, Y = 0
   */
  getCameraRight() {
    return this._camRight.set(
      Math.cos(this._camYaw),
      0,
      -Math.sin(this._camYaw),
    ).normalize();
  }
}
