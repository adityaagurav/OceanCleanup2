import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { BoatConfig } from '../config/BoatConfig.js';

/**
 * BoatBuoyancy.js — Fake buoyancy from four invisible float points.
 *
 * Unity-spec equivalent for Three.js: the boat hull is never driven by rigid
 * bodies or AddForce. Every frame we sample the shared WaveSampler under four
 * local float points (front-left / front-right / back-left / back-right):
 *
 *   - average height  → boat Y (plus a hull draft offset)
 *   - front/back avg  → pitch  (atan2 over the hull length)
 *   - left/right avg  → roll   (atan2 over the hull width)
 *
 * On top of the wave response we add three lightweight "feel" layers, all
 * interpolated with exponential smoothing so nothing ever snaps:
 *   - idle bob / pitch / roll  — Perlin-driven, non-repeating, only when idle
 *   - speed reaction           — bow rises under throttle, dips when braking
 *   - turning lean             — rolls into the turn, max 5°, eases back
 *
 * Debug mode (setDebug) visualises the four float points, the sampled water
 * height under each, and the boat axes.
 */
export class BoatBuoyancy {
  constructor() {
    const B = BoatConfig.BUOYANCY;
    const L = BoatConfig.LEAN;

    // Float points in boat-local space (boat forward = -Z, right = +X).
    this._points = [
      { x: -B.FLOAT_HALF_X, z: B.FLOAT_FRONT },
      { x:  B.FLOAT_HALF_X, z: B.FLOAT_FRONT },
      { x: -B.FLOAT_HALF_X, z: B.FLOAT_BACK  },
      { x:  B.FLOAT_HALF_X, z: B.FLOAT_BACK  },
    ];
    this._hullLen = B.FLOAT_BACK - B.FLOAT_FRONT;
    this._hullWid = B.FLOAT_HALF_X * 2;

    // Smoothed output state.
    this._curY     = null; // lazy-init from the boat on first update
    this._curPitch = 0;
    this._curRoll  = 0;

    // Idle Perlin field (unique seed, separate from the wave field).
    this._idleNoise = createNoise2D(Math.random);

    // Precomputed lean tuning.
    this._maxLean = THREE.MathUtils.degToRad(L.MAX_LEAN_DEG);

    // Debug markers — built lazily on the first setDebug(true).
    this._debug = false;
    this._markers = null;
  }

  /**
   * Drive the boat's float every render frame.
   * @param {number} dt - frame delta (s)
   * @param {THREE.Object3D} boat - the boat group (rotation.y owned by the controller)
   * @param {{speed:number, throttle:number, steer:number, accel:number, time:number, sampler:object}} ctx
   */
  update(dt, boat, ctx) {
    const B = BoatConfig.BUOYANCY;
    const L = BoatConfig.LEAN;

    if (this._curY === null) this._curY = boat.position.y;

    // ── 1. Sample the wave field under the four float points ─────
    const yaw = boat.rotation.y;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const bx = boat.position.x, bz = boat.position.z;
    const t = ctx.time;

    let front = 0, back = 0, left = 0, right = 0, avg = 0;
    for (let i = 0; i < 4; i++) {
      const p = this._points[i];
      // Rotate the local float point into world space (R_y on XZ).
      const wx = bx + p.x * cosY + p.z * sinY;
      const wz = bz - p.x * sinY + p.z * cosY;
      const h = ctx.sampler.getHeight(wx, wz, t);
      avg += h;
      if (i < 2) front += h; else back += h;
      if (i % 2 === 0) left += h; else right += h;
      if (this._debug) this._setMarker(i, wx, wz, h);
    }
    avg /= 4; front /= 2; back /= 2; left /= 2; right /= 2;

    // ── 2. Wave targets: Y, pitch (front/back), roll (left/right) ─
    // The hull reacts MORE to waves at speed and sits calm at idle.
    const speed = Math.abs(ctx.speed);
    const speedFactor = Math.min(1, speed / BoatConfig.MAX_SPEED);
    const waveScale = 1 + speedFactor * B.SPEED_WAVE_BOOST;

    let targetY     = avg + B.DRAFT;
    let targetPitch = Math.atan2(front - back, this._hullLen) * waveScale;
    let targetRoll  = Math.atan2(right - left, this._hullWid)  * waveScale;

    // ── 3. Idle floating — Perlin-driven, fades out as we move ───
    const idle = Math.max(0, Math.min(1, 1 - speed / B.IDLE_THRESHOLD));
    if (idle > 0) {
      const nT = t * B.IDLE_BOB_SPEED;
      targetY     += this._idleNoise(nT, 0.0)       * B.IDLE_BOB_AMOUNT * idle;
      targetPitch += this._idleNoise(nT + 100, 0.0) * B.IDLE_PITCH      * idle;
      targetRoll  += this._idleNoise(nT + 200, 0.0) * B.IDLE_ROLL       * idle;
    }

    // ── 4. Speed reaction driven by ACCELERATION, not raw throttle ──
    // Under throttle from standstill the bow lifts; once speed stabilises at
    // cruise the acceleration → 0 and the bow EASES BACK to neutral — exactly
    // how a real motorboat sits. Braking (negative accel) dips the bow.
    const accelClamped = Math.max(-4.5, Math.min(4.5, ctx.accel || 0));
    targetPitch += accelClamped * L.PITCH_PER_ACCEL;

    // ── 5. Turning lean — roll into the turn, max 5° ─────────────
    const leanFade = Math.max(0, Math.min(1, (speed - L.LEAN_MIN_SPEED) / (BoatConfig.MAX_SPEED - L.LEAN_MIN_SPEED)));
    const lean = -ctx.steer * this._maxLean * leanFade;
    targetRoll += lean;

    // ── 6. Exponential smoothing + apply (yaw stays with controller) ─
    const kY = 1 - Math.exp(-B.RESPONSE * dt);
    const kP = 1 - Math.exp(-L.PITCH_RESPONSE * dt);
    const kR = 1 - Math.exp(-L.LEAN_SPEED * dt);

    this._curY     += (targetY     - this._curY)     * kY;
    this._curPitch += (targetPitch - this._curPitch) * kP;
    this._curRoll  += (targetRoll  - this._curRoll)  * kR;

    boat.position.y = this._curY;
    boat.rotation.x = this._curPitch;
    boat.rotation.z = this._curRoll;

    if (this._debug) this._updateDebugAxes(boat);
  }

  /**
   * Toggle debug visualisation: float points, sampled water height, axes.
   * @param {boolean} on
   */
  setDebug(on) {
    this._debug = on;
    if (on) this._buildDebug();
    if (this._markers) this._markers.group.visible = on;
  }

  // ── Debug helpers ──────────────────────────────────────────────

  _buildDebug() {
    if (this._markers) return;
    const group = new THREE.Group(); // world-space overlay (added to the scene)
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const geo = new THREE.OctahedronGeometry(0.08, 0);
    const markers = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(geo, mat);
      group.add(m);
      markers.push(m);
    }
    // Water-height probe lines (surface → float point).
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 });
    const lines = [];
    for (let i = 0; i < 4; i++) {
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(lg, lineMat);
      group.add(line);
      lines.push(line);
    }
    // Boat axes (red = +X, green = +Y, blue = +Z) at the boat transform.
    const axesGroup = new THREE.Group();
    const axes = [];
    const axisCols = [0xff4444, 0x44ff44, 0x4488ff];
    for (let i = 0; i < 3; i++) {
      const ag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const a = new THREE.Line(ag, new THREE.LineBasicMaterial({ color: axisCols[i] }));
      axesGroup.add(a);
      axes.push(a);
    }
    group.visible = true;
    axesGroup.visible = true;
    this._markers = { group, markers, lines, axesGroup, axes };
  }

  _attachDebug(boat) {
    if (!this._markers || this._markers.group.parent) return;
    (boat.parent || boat).add(this._markers.group);
  }

  _setMarker(i, wx, wz, waterH) {
    const m = this._markers.markers[i];
    m.position.set(wx, this._curY, wz);
    const line = this._markers.lines[i];
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, wx, waterH, wz);
    pos.setXYZ(1, wx, this._curY, wz);
    pos.needsUpdate = true;
  }

  _updateDebugAxes(boat) {
    this._attachDebug(boat);
    const g = this._markers.axesGroup;
    g.position.copy(boat.position);
    g.quaternion.copy(boat.quaternion);
    const axes = this._markers.axes;
    const L = 1.4;
    const dirs = [[L, 0, 0], [0, L, 0], [0, 0, L]];
    for (let i = 0; i < 3; i++) {
      const pos = axes[i].geometry.attributes.position;
      pos.setXYZ(0, 0, 0, 0);
      pos.setXYZ(1, dirs[i][0], dirs[i][1], dirs[i][2]);
      pos.needsUpdate = true;
    }
  }
}
