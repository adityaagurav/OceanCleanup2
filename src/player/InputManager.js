/**
 * InputManager.js — Centralised, frame-rate-independent input state.
 * 
 * Character and camera read from this instead of scattered addEventListener calls.
 * Mouse deltas are accumulated per frame and cleared after each read.
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
      reel: false,          // R (fishing retrieve)
    };

    // Mouse delta — accumulated between frames, consumed each frame
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.scrollDelta = 0;
    this.isPointerLocked = false;
    this._lastClientX = null;
    this._lastClientY = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onBlur = this._onBlur.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup',   this._onKeyUp);
      window.addEventListener('mousemove', this._onMouseMove);
      window.addEventListener('wheel', this._onWheel, { passive: false });
      window.addEventListener('blur', this._onBlur);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerlockchange', this._onPointerLockChange);
    }
  }

  _mapKey(code) {
    switch (code) {
      case 'KeyW': case 'ArrowUp':    return 'forward';
      case 'KeyS': case 'ArrowDown':  return 'backward';
      case 'KeyA': case 'ArrowLeft':  return 'left';
      case 'KeyD': case 'ArrowRight': return 'right';
      case 'Space':                   return 'jump';
      case 'ShiftLeft': case 'ShiftRight': return 'sprint';
      case 'KeyF':                    return 'interact';
      case 'KeyE':                    return 'enter_vehicle';
      case 'KeyR':                    return 'reel';
      default:                        return null;
    }
  }

  _onKeyDown(e) {
    const action = this._mapKey(e.code);
    if (action) {
      // Don't prevent default for browser tools or if target is a text input
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      this.keys[action] = true;
    }
  }

  _onKeyUp(e) {
    const action = this._mapKey(e.code);
    if (action) this.keys[action] = false;
  }

  _onMouseMove(e) {
    let dx = 0;
    let dy = 0;

    if (this.isPointerLocked) {
      dx = e.movementX || 0;
      dy = e.movementY || 0;
    } else {
      const isDragging = (e.buttons & 1) !== 0 || (e.buttons & 2) !== 0;
      if (!isDragging) {
        this._lastClientX = e.clientX;
        this._lastClientY = e.clientY;
        return;
      }
      if (typeof e.movementX === 'number' && e.movementX !== 0) {
        dx = e.movementX;
        dy = e.movementY || 0;
      } else if (this._lastClientX !== null && this._lastClientY !== null) {
        dx = e.clientX - this._lastClientX;
        dy = e.clientY - this._lastClientY;
      }
    }

    this._lastClientX = e.clientX;
    this._lastClientY = e.clientY;

    if (Number.isFinite(dx)) this.mouseDeltaX += dx;
    if (Number.isFinite(dy)) this.mouseDeltaY += dy;
  }

  _onWheel(e) {
    e.preventDefault();
    this.scrollDelta += e.deltaY;
  }

  _onPointerLockChange() {
    this.isPointerLocked = !!document.pointerLockElement;
    this._lastClientX = null;
    this._lastClientY = null;
  }

  _onBlur() {
    this.resetKeys();
  }

  resetKeys() {
    for (const key of Object.keys(this.keys)) {
      this.keys[key] = false;
    }
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.scrollDelta = 0;
    this._lastClientX = null;
    this._lastClientY = null;
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

  /** True if any movement key is held */
  get isMoving() {
    return this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup',   this._onKeyUp);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('wheel', this._onWheel);
      window.removeEventListener('blur', this._onBlur);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    }
  }
}
