import { BoatConfig } from '../config/BoatConfig.js';

/**
 * BoatInertia.js — The "heavy" layer of the boat: momentum, water drag and
 * steering inertia, as pure lightweight math (no physics engine, no bodies).
 *
 * Unity-spec equivalent of BoatInertia.cs / BoatMotionEffects.cs. The boat
 * controller delegates ALL of its speed/throttle/steering feel to this class:
 *
 *   - Progressive throttle — input is ramped through a smooth curve (0 → 20 →
 *     40 → … → 100%) so power delivery never snaps.
 *   - Water drag — releasing the throttle leaves only quadratic water drag, so
 *     the boat coasts and slowly settles instead of stopping instantly.
 *   - Braking — pressing S while moving forward digs the hull in with a braking
 *     deceleration that is stronger than plain drag but speed-scaled, so the
 *     boat decelerates progressively (never snaps to zero) and needs more room
 *     to stop from high speed. S never sets the velocity to zero — it only
 *     opposes it.
 *   - Zero-velocity handling — braking is gated by a dead zone: once the speed
 *     drops below DEAD_ZONE the hull settles cleanly to 0 (no sign-flip jitter
 *     at a standstill), and if reverse is still held it waits a short
 *     REVERSE_ENGAGE_DELAY before creeping backward, so the sequence reads
 *     brake → stop → pause → reverse.
 *   - Steering inertia — the helm angle is smoothed AND the yaw rate itself is
 *     springy: the hull starts turning, keeps rotating from inertia, and
 *     gradually straightens when the input is released.
 *
 * Exposes the state the rest of the game reads: speed, throttle, steer, yawRate
 * and the signed acceleration actually applied (used by the buoyancy pitch).
 */
export class BoatInertia {
  constructor() {
    this._cfg = BoatConfig.INERTIA;

    // Output state.
    this.speed    = 0; // m/s (signed — negative = reversing)
    this.throttle = 0; // smoothed -1..1 (positive = forward)
    this.steer    = 0; // smoothed helm angle -1..1 (positive = turning left)
    this.yawRate  = 0; // current yaw rotation speed (rad/s)
    this.accel    = 0; // signed acceleration applied last step (m/s²)
    this._reverseTimer = 0; // seconds held at a stop while reverse is requested
  }

  reset() {
    this.speed = 0; this.throttle = 0; this.steer = 0; this.yawRate = 0; this.accel = 0;
    this._reverseTimer = 0;
  }

  /** Immediate stop (collision). Keeps a little helm/yaw momentum to fade. */
  halt() {
    this.speed = 0;
    this.accel = 0;
    this.yawRate *= 0.3;
    this._reverseTimer = 0;
  }

  /**
   * Advance the momentum state by one fixed physics step.
   * @param {object} input - InputManager (reads keys.forward/backward/left/right)
   * @param {number} dt - fixed step (1/60)
   */
  update(input, dt) {
    const I = this._cfg;
    const MAX = BoatConfig.MAX_SPEED;
    const REV = BoatConfig.REVERSE_SPEED;

    // ── 1. Progressive throttle ─────────────────────────────────
    let target = 0;
    if (input.keys.forward) target = 1;
    else if (input.keys.backward) target = -1;
    const kT = 1 - Math.exp(-I.THROTTLE_RAMP * dt);
    this.throttle += (target - this.throttle) * kT;

    // ── 2. Signed acceleration: thrust + water drag + braking ────
    const v = this.speed;
    // Drag always opposes motion: linear kills low-speed creep, quadratic is
    // the heavy "pushing through water" resistance at speed.
    const drag = -Math.sign(v) * (I.DRAG_LINEAR * Math.abs(v) + I.DRAG_QUAD * v * v);

    const braking = v !== 0 && this.throttle !== 0 && Math.sign(v) !== Math.sign(this.throttle);
    let a;
    if (braking) {
      // Reverse throttle dug in against motion: a braking deceleration that is
      // STRONGER than plain water drag (so S clearly brakes) yet scales with
      // speed (so the hull feels heavier and needs more room to stop at speed).
      // The reverse thrust is folded into this single term — S only opposes the
      // current motion, it never sets the velocity to zero (or to reverse).
      const brakeDecel = I.BRAKE_FORCE + I.BRAKE_SPEED_SCALE * Math.abs(v);
      a = drag - Math.sign(v) * brakeDecel;
    } else {
      a = this.throttle * I.ACCELERATION + drag;
    }
    this.accel = a;

    let nv = v + a * dt;
    nv = Math.max(-REV, Math.min(MAX, nv));

    // ── 3. Zero-velocity handling (no sign flips, no jitter) ─────
    // While braking, the hull must never be carried across zero: once the step
    // lands inside DEAD_ZONE (or would overshoot it) we settle to a clean stop.
    // This replaces the naive `-sign(v)*force` term, which jumped abruptly as v
    // crossed 0 and made the hull judder around a standstill.
    const dead = I.DEAD_ZONE;
    if (braking && (Math.sign(nv) !== Math.sign(v) || Math.abs(nv) <= dead)) {
      nv = 0;
    }

    // Held at a dead stop with reverse requested: the motor "shifts into
    // reverse" — hold the hull still for a short beat before reverse thrust is
    // allowed to build, so the sequence reads stop → pause → creep backward.
    if (v === 0 && this.throttle < 0) {
      this._reverseTimer += dt;
      if (this._reverseTimer < I.REVERSE_ENGAGE_DELAY) nv = 0;
    } else {
      this._reverseTimer = 0;
    }

    // Coast-to-stop: no throttle and crawling → settle to a full stop.
    if (target === 0 && Math.abs(nv) < I.COAST_STOP) nv = 0;
    this.speed = nv;

    // ── 4. Steering inertia ──────────────────────────────────────
    // Only steer once the hull is moving (matches the original control rule).
    let steerInput = 0;
    if (Math.abs(this.speed) > 0.1) {
      steerInput = (input.keys.right ? 1 : 0) - (input.keys.left ? 1 : 0);
    }
    const kH = 1 - Math.exp(-I.HELM_RATE * dt);
    this.steer += (steerInput - this.steer) * kH;

    // The yaw rate target scales with hull speed; the actual yaw rate eases
    // toward it, so the hull "carries" the turn and straightens gradually.
    const targetYawRate = this.steer * BoatConfig.TURN_SPEED * (Math.abs(this.speed) / MAX);
    const kY = 1 - Math.exp(-I.YAW_RESPONSE * dt);
    this.yawRate += (targetYawRate - this.yawRate) * kY;
  }
}
