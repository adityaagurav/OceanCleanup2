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
 *   - Braking — thrusting against the direction of motion applies extra brake
 *     force, giving a distinct "dig in" when reversing.
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
  }

  reset() {
    this.speed = 0; this.throttle = 0; this.steer = 0; this.yawRate = 0; this.accel = 0;
  }

  /** Immediate stop (collision). Keeps a little helm/yaw momentum to fade. */
  halt() {
    this.speed = 0;
    this.accel = 0;
    this.yawRate *= 0.3;
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
    const thrust = this.throttle * I.ACCELERATION;

    let a = thrust + drag;
    // Braking: thrusting against the direction of motion digs the hull in.
    if (v !== 0 && this.throttle !== 0 && Math.sign(v) !== Math.sign(this.throttle)) {
      a += -Math.sign(v) * I.BRAKE_FORCE;
    }
    this.accel = a;

    let nv = v + a * dt;
    nv = Math.max(-REV, Math.min(MAX, nv));
    // Coast-to-stop: no throttle and crawling → settle to a full stop.
    if (target === 0 && Math.abs(nv) < I.COAST_STOP) nv = 0;
    this.speed = nv;

    // ── 3. Steering inertia ──────────────────────────────────────
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
