import { PlayerConfig } from '../config/PlayerConfig.js';

/**
 * AnimationController.js — Procedural animation state machine with crossfade blending.
 *
 * Manages validated state transitions and smooth interpolation between
 * animation states. Works with ProceduralCharacter to drive limb poses.
 *
 * State Graph:
 *   Movement:  Idle ↔ Walk ↔ Run ↔ Sprint → Jump → Fall → Land → Idle
 *   Swimming:  Swim ↔ TreadWater ↔ BoardBoat → Idle
 *   Interact:  Idle → PickupTrash → CarryObject → ThrowNet → Idle
 *   Boat:      Idle → BoardBoat → Sit → LeaveBoat → Idle
 *   Emotes:    Idle → Celebrate / Wave / Sleep → Idle
 */

const { ANIM_BLEND_SPEED } = PlayerConfig;

// All valid states
const STATES = [
  'Idle', 'Walk', 'Run', 'Sprint',
  'Jump', 'Fall', 'Land',
  'Swim', 'TreadWater',
  'BoardBoat', 'LeaveBoat', 'Sit',
  'PickupTrash', 'CarryObject', 'ThrowNet',
  'Fishing', 'OpenChest', 'PushBoat',
  'Celebrate', 'Wave', 'Sleep', 'Death',
];

// Define valid transitions (from → allowed destinations)
// Using a permissive graph — any movement state can transition to any other movement state
const TRANSITION_GROUPS = {
  movement: ['Idle', 'Walk', 'Run', 'Sprint', 'Jump', 'Fall', 'Land'],
  swimming: ['Swim', 'TreadWater'],
  boat:     ['BoardBoat', 'LeaveBoat', 'Sit'],
  interact: ['PickupTrash', 'CarryObject', 'ThrowNet', 'Fishing', 'OpenChest', 'PushBoat'],
  emote:    ['Celebrate', 'Wave', 'Sleep', 'Death'],
};

export class AnimationController {
  /**
   * @param {object} character — ProceduralCharacter instance (drives its _animate)
   */
  constructor(character) {
    this._char = character;

    // Current and previous state for blending
    this._currentState = 'Idle';
    this._previousState = 'Idle';

    // Blend progress (0 = fully previous, 1 = fully current)
    this._blendWeight = 1.0;
    this._blendDuration = PlayerConfig.ANIM_CROSSFADE_DURATION;

    // Time spent in current state (for animation timing)
    this._stateTime = 0;

    // Locked state — for animations that must play to completion
    this._locked = false;
    this._lockDuration = 0;
    this._lockTimer = 0;
    this._lockCallback = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Request a state transition. If the transition is valid and not locked,
   * the state changes with a crossfade blend.
   * @param {string} newState
   * @param {object} [options]
   * @param {boolean} [options.force=false] — bypass transition validation
   * @param {number} [options.lockDuration=0] — lock state for N seconds (for one-shot anims)
   * @param {function} [options.onComplete] — callback when lock expires
   * @returns {boolean} true if transition occurred
   */
  setState(newState, options = {}) {
    const { force = false, lockDuration = 0, onComplete = null } = options;

    // Don't re-enter same state (unless forced)
    if (newState === this._currentState && !force) return false;

    // Can't change state while locked (unless forced)
    if (this._locked && !force) return false;

    // Validate state name
    if (!STATES.includes(newState)) {
      console.warn(`AnimationController: Unknown state "${newState}"`);
      return false;
    }

    // Start crossfade
    this._previousState = this._currentState;
    this._currentState = newState;
    this._blendWeight = 0;
    this._stateTime = 0;

    // Lock if requested
    if (lockDuration > 0) {
      this._locked = true;
      this._lockDuration = lockDuration;
      this._lockTimer = 0;
      this._lockCallback = onComplete;
    }

    return true;
  }

  /**
   * Drive the animation forward. Call every render frame.
   * @param {number} dt — frame delta in seconds
   * @param {number} speed — horizontal speed in m/s (for walk/run cycle)
   */
  update(dt, speed) {
    // Advance blend
    if (this._blendWeight < 1.0) {
      this._blendWeight += dt * ANIM_BLEND_SPEED;
      if (this._blendWeight >= 1.0) {
        this._blendWeight = 1.0;
      }
    }

    // Advance lock timer
    if (this._locked) {
      this._lockTimer += dt;
      if (this._lockTimer >= this._lockDuration) {
        this._locked = false;
        if (this._lockCallback) {
          this._lockCallback();
          this._lockCallback = null;
        }
      }
    }

    // Advance state time
    this._stateTime += dt;

    // Drive the character's animation
    if (this._char) {
      this._char._state = this._currentState;
      this._char._speed = speed;
      this._char._blendWeight = this._blendWeight;
      this._char._stateTime = this._stateTime;
    }
  }

  /**
   * Get current animation state name.
   * @returns {string}
   */
  getCurrentState() {
    return this._currentState;
  }

  /**
   * Get previous state (for blend source).
   * @returns {string}
   */
  getPreviousState() {
    return this._previousState;
  }

  /**
   * Get crossfade blend weight (0–1).
   * @returns {number}
   */
  getBlendWeight() {
    return this._blendWeight;
  }

  /**
   * Check if currently in a locked one-shot animation.
   * @returns {boolean}
   */
  isLocked() {
    return this._locked;
  }

  /**
   * Force unlock (e.g. player takes damage mid-animation).
   */
  unlock() {
    this._locked = false;
    this._lockCallback = null;
  }

  /**
   * Time spent in current state.
   * @returns {number}
   */
  getStateTime() {
    return this._stateTime;
  }
}
