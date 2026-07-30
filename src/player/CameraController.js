import * as THREE from 'three';
import { GraphicsConfig } from '../config/GraphicsConfig.js';

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
 * Features:
 *   • Anti-clip raycasting — camera pulls closer when terrain/objects block view
 *   • Vehicle-aware zoom — zooms out when in boat
 *   • Swim camera — raises slightly when character is swimming
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

    // Look-at point offset
    this._lookAtHeightOffset = 2.0;

    // Spring: smooth camera position lerp
    this._springPos   = new THREE.Vector3();
    this._initialized = false;

    // Vehicle state
    this._vehicleType = 'CHARACTER';
    this._targetDistance = DEFAULT_DISTANCE;
    this._targetLookAtHeightOffset = 2.0;

    // Swimming state
    this._isSwimming = false;

    // Anti-clip raycaster
    this._clipRaycaster = new THREE.Raycaster();
    this._clipColliders = [];

    this.domElement.addEventListener('click', () => this.domElement.requestPointerLock());
  }

  /**
   * Register colliders for anti-clip raycasting.
   * @param {THREE.Mesh[]} colliders
   */
  setClipColliders(colliders) {
    this._clipColliders = colliders;
  }

  /**
   * Set whether character is swimming (adjusts camera behavior).
   * @param {boolean} swimming
   */
  setSwimming(swimming) {
    this._isSwimming = swimming;
  }

  /**
   * Called every RENDER frame.
   * @param {THREE.Vector3} charPosition
   * @param {number} _charYaw — intentionally ignored (see design note above)
   * @param {InputManager} input
   * @param {number} frameDelta
   */
  update(charPosition, _charYaw, input, frameDelta) {
    if (!charPosition) return;

    // ── 1. Mouse input: adjust ABSOLUTE camera yaw/elevation ────────
    const mouse = input.consumeMouseDelta();

    if (input.isPointerLocked) {
      this._camYaw   -= mouse.dx * MOUSE_SENSITIVITY;
      this._elevation += mouse.dy * MOUSE_SENSITIVITY;
      this._elevation  = Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, this._elevation));
    }

    // Scroll zoom
    this._distance += mouse.scroll * ZOOM_SENSITIVITY;
    this._distance  = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, this._distance));

    // ── 1.5 Dynamic Zoom based on vehicle / swim ────────────────────
    if (this._vehicleType === 'BOAT') {
      this._targetDistance = DEFAULT_DISTANCE * 3.0; // Zoom out more for boat
      this._targetLookAtHeightOffset = 4.0;
    } else if (this._isSwimming) {
      this._targetDistance = DEFAULT_DISTANCE * 0.8;
      this._targetLookAtHeightOffset = 1.5;
    } else {
      this._targetDistance = DEFAULT_DISTANCE;
      this._targetLookAtHeightOffset = 2.0;
    }

    this._distance += (this._targetDistance - this._distance) * 2.0 * frameDelta;
    this._lookAtHeightOffset += (this._targetLookAtHeightOffset - this._lookAtHeightOffset) * 2.0 * frameDelta;

    // ── 2. Compute ideal camera position ────────────────────────────
    const cosE = Math.cos(this._elevation);
    const sinE = Math.sin(this._elevation);

    const offset = new THREE.Vector3(
      this._distance * cosE * Math.sin(this._camYaw),
      this._distance * sinE,
      this._distance * cosE * Math.cos(this._camYaw),
    );

    const lookAt  = charPosition.clone();
    lookAt.y     += this._lookAtHeightOffset;

    let idealPos = lookAt.clone().add(offset);
    if (idealPos.y < 0.5) idealPos.y = 0.5; // never clip into water

    // ── 2.5 Anti-clip: raycast from lookAt to ideal position ────────
    if (this._clipColliders.length > 0) {
      const clipDir = idealPos.clone().sub(lookAt).normalize();
      const clipDist = idealPos.distanceTo(lookAt);

      this._clipRaycaster.set(lookAt, clipDir);
      this._clipRaycaster.far = clipDist;

      const clipHits = this._clipRaycaster.intersectObjects(this._clipColliders, false);
      if (clipHits.length > 0) {
        // Pull camera closer to avoid clipping, with a small margin
        const hitDist = clipHits[0].distance - 0.3;
        if (hitDist > MIN_DISTANCE) {
          idealPos = lookAt.clone().add(clipDir.multiplyScalar(hitDist));
        } else {
          idealPos = lookAt.clone().add(clipDir.normalize().multiplyScalar(MIN_DISTANCE));
        }
      }
    }

    // ── 3. Exponential-decay spring (no jitter, cinematic) ──────────
    if (!this._initialized) {
      this._springPos.copy(idealPos);
      this._initialized = true;
    }

    const t = 1 - Math.exp(-SPRING_FACTOR * frameDelta);
    this._springPos.lerp(idealPos, t);

    this.camera.position.copy(this._springPos);
    this.camera.lookAt(lookAt);
  }

  setVehicleType(type) {
    this._vehicleType = type;
  }

  /**
   * Returns the FLAT (XZ only) direction the camera is looking.
   * Used by CharacterController to compute "forward" for W key.
   * @returns {THREE.Vector3} normalized, Y = 0
   */
  getCameraForward() {
    return new THREE.Vector3(
      -Math.sin(this._camYaw),
      0,
      -Math.cos(this._camYaw),
    ).normalize();
  }

  /**
   * Returns camera right (perpendicular to forward in XZ plane).
   * Used by CharacterController for A/D strafing.
   * @returns {THREE.Vector3} normalized, Y = 0
   */
  getCameraRight() {
    // Flipped signs to fix A/D key reversal
    return new THREE.Vector3(
       Math.cos(this._camYaw),
      0,
      -Math.sin(this._camYaw),
    ).normalize();
  }
}
