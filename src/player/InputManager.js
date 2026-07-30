/**
 * InputManager.js — Centralised, frame-rate-independent input state.
 *
 * Character and camera read from this instead of scattered addEventListener calls.
 * Mouse deltas are accumulated per frame and cleared after each read.
 *
 * Supports:
 *   • Keyboard (WASD + arrows)
 *   • Mouse (pointer lock orbit + scroll zoom)
 *   • Gamepad (stub — reads first connected gamepad)
 */
export class InputManager {
  constructor() {
    // Keyboard state — true while key is held
    this.keys = {
      forward:  false,  // W / ArrowUp
      backward: false,  // S / ArrowDown
      left:     false,  // A / ArrowLeft
      right:    false,  // D / ArrowRight
      jump:     false,  // Space
      sprint:   false,  // Shift
      interact: false,  // F
      enter_vehicle: false, // E
    };

    // "Just pressed" state — true for exactly one consumePress() call
    this._justPressed = {
      jump:          false,
      interact:      false,
      enter_vehicle: false,
    };

    // Mouse delta — accumulated between frames, consumed each frame
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.scrollDelta = 0;
    this.isPointerLocked = false;

    // Gamepad state
    this._gamepadIndex = null;
    this._gamepadAxes = { lx: 0, ly: 0, rx: 0, ry: 0 };
    this._gamepadButtons = {};

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onGamepadConnected = this._onGamepadConnected.bind(this);
    this._onGamepadDisconnected = this._onGamepadDisconnected.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Key Mapping
  // ─────────────────────────────────────────────────────────────────────────

  _mapKey(code) {
    switch (code) {
      case 'KeyW': case 'ArrowUp':    return 'forward';
      case 'KeyS': case 'ArrowDown':  return 'backward';
      case 'KeyA': case 'ArrowLeft':  return 'left';      // FIXED: was 'right'
      case 'KeyD': case 'ArrowRight': return 'right';     // FIXED: was 'left'
      case 'Space':                   return 'jump';
      case 'ShiftLeft': case 'ShiftRight': return 'sprint';
      case 'KeyF':                    return 'interact';
      case 'KeyE':                    return 'enter_vehicle';
      default:                        return null;
    }
  }

  _onKeyDown(e) {
    const action = this._mapKey(e.code);
    if (action) {
      e.preventDefault();
      // Track "just pressed" for one-shot actions
      if (!this.keys[action] && action in this._justPressed) {
        this._justPressed[action] = true;
      }
      this.keys[action] = true;
    }
  }

  _onKeyUp(e) {
    const action = this._mapKey(e.code);
    if (action) this.keys[action] = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Mouse
  // ─────────────────────────────────────────────────────────────────────────

  _onMouseMove(e) {
    if (!this.isPointerLocked) return;
    this.mouseDeltaX += e.movementX || 0;
    this.mouseDeltaY += e.movementY || 0;
  }

  _onWheel(e) {
    e.preventDefault();
    this.scrollDelta += e.deltaY;
  }

  _onPointerLockChange() {
    this.isPointerLocked = !!document.pointerLockElement;
  }

  /**
   * Call once per render frame. Returns accumulated mouse/scroll deltas and resets them.
   * @returns {{ dx: number, dy: number, scroll: number }}
   */
  consumeMouseDelta() {
    const result = {
      dx:     this.mouseDeltaX,
      dy:     this.mouseDeltaY,
      scroll: this.scrollDelta,
    };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.scrollDelta = 0;
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  One-Shot Press Detection
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns true if the action was pressed this frame (edge-triggered).
   * Does NOT consume the press — use consumePress() for that.
   */
  justPressed(action) {
    return !!this._justPressed[action];
  }

  /**
   * Returns true if the action was pressed this frame and consumes it.
   * Subsequent calls in the same frame return false.
   * Use for one-shot actions like jump, interact, board vehicle.
   */
  consumePress(action) {
    if (this._justPressed[action]) {
      this._justPressed[action] = false;
      return true;
    }
    return false;
  }

  /**
   * Call at the END of each fixed update to clear all just-pressed flags.
   * This ensures each press is only consumed once per physics tick.
   */
  clearPresses() {
    for (const key in this._justPressed) {
      this._justPressed[key] = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Gamepad (Stub)
  // ─────────────────────────────────────────────────────────────────────────

  _onGamepadConnected(e) {
    this._gamepadIndex = e.gamepad.index;
    console.log(`Gamepad connected: ${e.gamepad.id}`);
  }

  _onGamepadDisconnected(e) {
    if (this._gamepadIndex === e.gamepad.index) {
      this._gamepadIndex = null;
    }
  }

  /**
   * Poll gamepad state. Call once per frame before reading input.
   * Merges gamepad axes into keyboard-equivalent booleans.
   */
  pollGamepad() {
    if (this._gamepadIndex === null) return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this._gamepadIndex];
    if (!gp) return;

    const DEADZONE = 0.15;

    // Left stick → movement
    const lx = Math.abs(gp.axes[0]) > DEADZONE ? gp.axes[0] : 0;
    const ly = Math.abs(gp.axes[1]) > DEADZONE ? gp.axes[1] : 0;
    this._gamepadAxes.lx = lx;
    this._gamepadAxes.ly = ly;

    // Right stick → camera
    const rx = Math.abs(gp.axes[2]) > DEADZONE ? gp.axes[2] : 0;
    const ry = Math.abs(gp.axes[3]) > DEADZONE ? gp.axes[3] : 0;
    this._gamepadAxes.rx = rx;
    this._gamepadAxes.ry = ry;

    // Map sticks to key equivalents (OR with keyboard)
    if (ly < -DEADZONE) this.keys.forward = true;
    if (ly >  DEADZONE) this.keys.backward = true;
    if (lx < -DEADZONE) this.keys.left = true;
    if (lx >  DEADZONE) this.keys.right = true;

    // Buttons (standard mapping)
    // A/Cross = jump, B/Circle = interact, X/Square = enter_vehicle
    // Right trigger = sprint
    if (gp.buttons[0]?.pressed) this.keys.jump = true;
    if (gp.buttons[1]?.pressed) this.keys.interact = true;
    if (gp.buttons[2]?.pressed) this.keys.enter_vehicle = true;
    if (gp.buttons[7]?.pressed) this.keys.sprint = true;

    // Inject right stick as mouse delta for camera orbit
    if (Math.abs(rx) > 0 || Math.abs(ry) > 0) {
      this.mouseDeltaX += rx * 8;
      this.mouseDeltaY += ry * 8;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** True if any movement key is held */
  get isMoving() {
    return this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    window.removeEventListener('gamepadconnected', this._onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }
}
